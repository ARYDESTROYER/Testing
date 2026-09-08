import { createClient } from '@libsql/client'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

export function freshClient(dir) {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return createClient({ url: `file:${path.join(dir, 'chi.db')}` })
}

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL,
     created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER,
     end_reason TEXT, duration_ms INTEGER, config TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS attributes (
     id TEXT PRIMARY KEY, session_id TEXT NOT NULL, text TEXT NOT NULL,
     dimension TEXT NOT NULL, prompt TEXT NOT NULL, round INTEGER NOT NULL,
     written_at INTEGER NOT NULL, side TEXT NOT NULL, transferred_at INTEGER,
     transferred_by TEXT, x REAL NOT NULL, y REAL NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS events (
     id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL,
     type TEXT NOT NULL, at INTEGER NOT NULL, payload TEXT)`,
  `CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
]

export async function init(db) { for (const s of SCHEMA) await db.execute(s) }

// verbatim port of src/lib/db.ts nextParticipantNumber
export async function nextParticipantNumber(conn) {
  const tx = await conn.transaction('write')
  try {
    const cur = await tx.execute({ sql: `SELECT value FROM counters WHERE name = 'participant'`, args: [] })
    const next = cur.rows.length ? Number(cur.rows[0].value) + 1 : 1
    await tx.execute({
      sql: `INSERT INTO counters (name, value) VALUES ('participant', ?)
            ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
      args: [next],
    })
    await tx.commit()
    return next
  } catch (err) {
    await tx.rollback()
    throw err
  }
}
