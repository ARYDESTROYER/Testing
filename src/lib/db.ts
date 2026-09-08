import 'server-only'
import { createClient, type Client } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { Attribute, EndReason, GameEvent, SessionRecord } from './types'
import { DEFAULT_CONFIG, type GameConfig } from './config'
import { participantCode } from './participants'

/**
 * One code path for local and hosted runs. libsql speaks both a plain file on
 * disk (`file:./data/chi.db`, which is what a laptop session uses) and a remote
 * Turso database over the wire — so the study can be run offline in a room and
 * the same build can be deployed without touching this file.
 */

let client: Client | null = null
let ready: Promise<void> | null = null

function getClient(): Client {
  if (client) return client

  const url = process.env.TWIN_DATABASE_URL
  if (url) {
    client = createClient({ url, authToken: process.env.TWIN_DATABASE_AUTH_TOKEN })
  } else {
    if (process.env.NODE_ENV === 'production') {
      // On a serverless host this file lives on one instance and disappears with
      // it, so a study run against it would lose everything.
      console.warn(
        '[db] TWIN_DATABASE_URL is not set — writing to a local file. That is right ' +
          'for a laptop and wrong for a hosted deployment, where the file is not durable.',
      )
    }
    const dir = path.join(process.cwd(), 'data')
    mkdirSync(dir, { recursive: true })
    client = createClient({ url: `file:${path.join(dir, 'chi.db')}` })
  }
  return client
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sessions (
     id           TEXT PRIMARY KEY,
     code         TEXT NOT NULL,
     name         TEXT NOT NULL,
     created_at   INTEGER NOT NULL,
     started_at   INTEGER,
     ended_at     INTEGER,
     end_reason   TEXT,
     duration_ms  INTEGER,
     config       TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS attributes (
     id             TEXT NOT NULL,
     session_id     TEXT NOT NULL,
     text           TEXT NOT NULL,
     dimension      TEXT NOT NULL,
     prompt         TEXT NOT NULL,
     round          INTEGER NOT NULL,
     written_at     INTEGER NOT NULL,
     side           TEXT NOT NULL,
     -- Historical: sessions recorded while a transfer copied rather than moved
     -- put the original's id here. Nothing writes it now.
     copy_of        TEXT,
     transferred_at INTEGER,
     transferred_by TEXT,
     x              REAL NOT NULL,
     y              REAL NOT NULL,
     -- Scoped to the session. A bare id as the key let one participant's chip
     -- upsert over another's row when two machines shared a database.
     PRIMARY KEY (session_id, id)
   )`,
  `CREATE TABLE IF NOT EXISTS events (
     id         INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id TEXT NOT NULL,
     seq        INTEGER,
     type       TEXT NOT NULL,
     at         INTEGER NOT NULL,
     payload    TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS counters (
     name  TEXT PRIMARY KEY,
     value INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_attributes_session ON attributes(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)`,
  // A retry of a request that actually landed must not append the event twice.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_events_seq ON events(session_id, seq)`,
]

/**
 * Earlier databases keyed attributes on the id alone. Rebuild those in place so
 * an existing study's data survives the change rather than needing a re-import.
 */
async function migrateAttributeKey(db: Client): Promise<void> {
  const existing = await db.execute(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'attributes'`,
  )
  const sql = existing.rows.length ? String(existing.rows[0].sql ?? '') : ''
  if (!sql || /PRIMARY KEY\s*\(\s*session_id/i.test(sql)) return

  console.warn('[db] rebuilding the attributes table on a per-session key')
  await db.execute(`ALTER TABLE attributes RENAME TO attributes_old`)
  await db.execute(SCHEMA[1])
  await db.execute(
    `INSERT OR IGNORE INTO attributes
       (id, session_id, text, dimension, prompt, round, written_at, side,
        transferred_at, transferred_by, x, y)
     SELECT id, session_id, text, dimension, prompt, round, written_at, side,
            transferred_at, transferred_by, x, y
     FROM attributes_old`,
  )
}

/** Adds copy_of, so a table from either era reads the same way. */
async function migrateCopyOf(db: Client): Promise<void> {
  const info = await db.execute(`PRAGMA table_info(attributes)`)
  if (!info.rows.length) return
  if (info.rows.some((r) => String(r.name) === 'copy_of')) return
  console.warn('[db] adding attributes.copy_of')
  await db.execute(`ALTER TABLE attributes ADD COLUMN copy_of TEXT`)
  await db.execute(`DROP TABLE attributes_old`)
}

function init(): Promise<void> {
  if (!ready) {
    const db = getClient()
    ready = (async () => {
      await migrateAttributeKey(db)
      for (const stmt of SCHEMA) await db.execute(stmt)
      await migrateCopyOf(db)
    })().catch((err) => {
      // Let the next call retry rather than caching a rejected promise forever.
      ready = null
      throw err
    })
  }
  return ready
}

async function db(): Promise<Client> {
  await init()
  return getClient()
}

function reset(): void {
  client = null
  ready = null
}

/**
 * A local SQLite file that is replaced or removed while the server is running
 * leaves the cached connection pointing at a file that no longer exists, and
 * every write after that fails with SQLITE_READONLY_DBMOVED. Reopening once
 * recovers, which matters when the study database is restored from a backup or
 * swapped between sessions without restarting.
 */
function isStaleFile(err: unknown): boolean {
  const text = String((err as { code?: string })?.code ?? '') + String(err)
  return /DBMOVED|SQLITE_READONLY|unable to open database|no such file/i.test(text)
}

async function withDb<T>(fn: (conn: Client) => Promise<T>): Promise<T> {
  try {
    return await fn(await db())
  } catch (err) {
    if (!isStaleFile(err)) throw err
    console.warn('[db] the database file moved out from under the connection; reopening')
    reset()
    return fn(await db())
  }
}

/**
 * Participant numbers come from a single counter row, taken under a write
 * transaction so two canvases opened at the same moment cannot both claim one.
 */
async function nextParticipantNumber(attempt = 0): Promise<number> {
  try {
    return await withDb(async (conn) => {
      const tx = await conn.transaction('write')
      try {
        const cur = await tx.execute({
          sql: `SELECT value FROM counters WHERE name = 'participant'`,
          args: [],
        })
        const next = cur.rows.length ? Number(cur.rows[0].value) + 1 : 1
        await tx.execute({
          sql: `INSERT INTO counters (name, value) VALUES ('participant', ?)
                ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
          args: [next],
        })
        await tx.commit()
        return next
      } catch (err) {
        await tx.rollback().catch(() => {})
        throw err
      }
    })
  } catch (err) {
    // SQLite answers contention with a busy error rather than waiting.
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 60 * 2 ** attempt))
      return nextParticipantNumber(attempt + 1)
    }
    throw err
  }
}

export async function createSession(
  name: string,
  config: GameConfig = DEFAULT_CONFIG,
): Promise<{ id: string; code: string }> {
  const n = await nextParticipantNumber()
  const code = participantCode(name, n)
  const id = `${code}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  await withDb((conn) =>
    conn.execute({
      sql: `INSERT INTO sessions (id, code, name, created_at, config) VALUES (?, ?, ?, ?, ?)`,
      args: [id, code, name.trim(), Date.now(), JSON.stringify(config)],
    }),
  )
  return { id, code }
}

export async function sessionExists(id: string): Promise<boolean> {
  return withDb(async (conn) => {
    const res = await conn.execute({ sql: `SELECT 1 FROM sessions WHERE id = ?`, args: [id] })
    return res.rows.length > 0
  })
}

export async function markStarted(id: string): Promise<void> {
  await withDb((conn) =>
    conn.execute({
      sql: `UPDATE sessions SET started_at = ? WHERE id = ? AND started_at IS NULL`,
      args: [Date.now(), id],
    }),
  )
}

export async function endSession(
  id: string,
  reason: EndReason,
  durationMs: number,
): Promise<void> {
  await withDb((conn) =>
    conn.execute({
      sql: `UPDATE sessions SET ended_at = ?, end_reason = ?, duration_ms = ? WHERE id = ?`,
      args: [Date.now(), reason, Math.round(durationMs), id],
    }),
  )
}

/**
 * Attributes are upserted rather than inserted: the canvas is a live document
 * and a chip's side and position both keep changing until the session ends.
 */
export async function saveAttributes(id: string, attributes: Attribute[]): Promise<void> {
  if (!attributes.length) return
  await withDb((conn) =>
    conn.batch(
    attributes.map((a) => ({
      sql: `INSERT INTO attributes
              (id, session_id, text, dimension, prompt, round, written_at, side, copy_of,
               transferred_at, transferred_by, x, y)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, id) DO UPDATE SET
              side = excluded.side,
              copy_of = excluded.copy_of,
              transferred_at = excluded.transferred_at,
              transferred_by = excluded.transferred_by,
              x = excluded.x,
              y = excluded.y`,
      args: [
        a.id,
        id,
        a.text,
        a.dimension,
        a.prompt,
        a.round,
        Math.round(a.writtenAt),
        a.side,
        a.copyOf ?? null,
        a.transferredAt == null ? null : Math.round(a.transferredAt),
        a.transferredBy ?? null,
        a.x,
        a.y,
      ],
    })),
      'write',
    ),
  )
}

export async function saveEvents(id: string, events: GameEvent[]): Promise<void> {
  if (!events.length) return
  await withDb((conn) =>
    conn.batch(
    events.map((e) => ({
      sql: `INSERT OR IGNORE INTO events (session_id, seq, type, at, payload)
            VALUES (?, ?, ?, ?, ?)`,
      args: [
        id,
        e.seq ?? null,
        e.type,
        Math.round(e.at),
        e.payload ? JSON.stringify(e.payload) : null,
      ],
    })),
      'write',
    ),
  )
}

function rowToSession(row: Record<string, unknown>): Omit<SessionRecord, 'attributes' | 'events'> {
  let config: GameConfig = DEFAULT_CONFIG
  try {
    config = { ...DEFAULT_CONFIG, ...JSON.parse(String(row.config ?? '{}')) }
  } catch {
    /* a malformed config must not take the dashboard down */
  }
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    createdAt: Number(row.created_at),
    startedAt: row.started_at == null ? null : Number(row.started_at),
    endedAt: row.ended_at == null ? null : Number(row.ended_at),
    endReason: (row.end_reason as EndReason | null) ?? null,
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    config,
  }
}

export interface SessionSummary extends Omit<SessionRecord, 'attributes' | 'events'> {
  attributeCount: number
  receivedCount: number
  /** Still on the participant's own side. Counted, not inferred by subtraction:
   *  an attribute they let go of is neither received nor kept. */
  keptCount: number
  discardedCount: number
}

export async function listSessions(): Promise<SessionSummary[]> {
  const res = await withDb((conn) =>
    conn.execute(`
    SELECT s.*,
           (SELECT COUNT(*) FROM attributes a WHERE a.session_id = s.id AND a.copy_of IS NULL) AS attribute_count,
           (SELECT COUNT(*) FROM attributes a WHERE a.session_id = s.id AND a.side = 'ds') AS received_count,
           (SELECT COUNT(*) FROM attributes a WHERE a.session_id = s.id AND a.side = 'ys') AS kept_count,
           (SELECT COUNT(*) FROM attributes a WHERE a.session_id = s.id AND a.side = 'gone') AS discarded_count
    FROM sessions s
    ORDER BY s.created_at DESC
  `),
  )
  return res.rows.map((r) => ({
    ...rowToSession(r as unknown as Record<string, unknown>),
    attributeCount: Number(r.attribute_count ?? 0),
    receivedCount: Number(r.received_count ?? 0),
    keptCount: Number(r.kept_count ?? 0),
    discardedCount: Number(r.discarded_count ?? 0),
  }))
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  const conn = await withDb(async (c) => c)
  const s = await conn.execute({ sql: `SELECT * FROM sessions WHERE id = ?`, args: [id] })
  if (!s.rows.length) return null

  const [attrs, evts] = await Promise.all([
    conn.execute({
      sql: `SELECT * FROM attributes WHERE session_id = ? ORDER BY written_at ASC`,
      args: [id],
    }),
    conn.execute({
      sql: `SELECT * FROM events WHERE session_id = ? ORDER BY at ASC, seq ASC, id ASC`,
      args: [id],
    }),
  ])

  return {
    ...rowToSession(s.rows[0] as unknown as Record<string, unknown>),
    attributes: attrs.rows.map((r) => ({
      id: String(r.id),
      text: String(r.text),
      dimension: r.dimension as Attribute['dimension'],
      prompt: String(r.prompt),
      round: Number(r.round),
      writtenAt: Number(r.written_at),
      side: r.side as Attribute['side'],
      copyOf: r.copy_of == null ? undefined : String(r.copy_of),
      transferredAt: r.transferred_at == null ? undefined : Number(r.transferred_at),
      transferredBy: (r.transferred_by as Attribute['transferredBy']) ?? undefined,
      x: Number(r.x),
      y: Number(r.y),
    })),
    events: evts.rows.map((r) => ({
      type: r.type as GameEvent['type'],
      at: Number(r.at),
      seq: r.seq == null ? undefined : Number(r.seq),
      payload: r.payload ? (JSON.parse(String(r.payload)) as Record<string, unknown>) : undefined,
    })),
  }
}

export async function allAttributeRows(): Promise<Record<string, unknown>[]> {
  const res = await withDb((conn) =>
    conn.execute(`
    SELECT s.code, s.name, s.created_at AS session_created_at, s.end_reason, s.duration_ms,
           a.id AS attribute_id, a.text, a.dimension, a.prompt, a.round,
           a.written_at, a.side, a.copy_of, a.transferred_at, a.transferred_by, a.x, a.y
    FROM attributes a
    JOIN sessions s ON s.id = a.session_id
    ORDER BY s.created_at DESC, a.written_at ASC
  `),
  )
  return res.rows as unknown as Record<string, unknown>[]
}
