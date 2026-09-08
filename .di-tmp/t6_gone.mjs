import { freshClient, init } from './lib.mjs'
const conn = freshClient('/home/user/Testing/.di-tmp/db6')
await init(conn)

// ---- verbatim from src/app/api/session/[id]/sync/route.ts ----
function syncFilter(attributes) {
  return attributes.filter(a =>
    !!a && typeof a.id === 'string' && typeof a.text === 'string' &&
    (a.side === 'ys' || a.side === 'ds') &&
    Number.isFinite(a.x) && Number.isFinite(a.y))
}
// ---- verbatim from src/lib/db.ts saveAttributes ----
async function saveAttributes(id, attributes) {
  if (!attributes.length) return
  await conn.batch(attributes.map(a => ({
    sql: `INSERT INTO attributes (id, session_id, text, dimension, prompt, round, written_at, side, transferred_at, transferred_by, x, y)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET side=excluded.side, transferred_at=excluded.transferred_at, transferred_by=excluded.transferred_by, x=excluded.x, y=excluded.y`,
    args: [a.id, id, a.text, a.dimension, a.prompt, a.round, Math.round(a.writtenAt), a.side,
           a.transferredAt == null ? null : Math.round(a.transferredAt), a.transferredBy ?? null, a.x, a.y],
  })), 'write')
}

await conn.execute({ sql: `INSERT INTO sessions (id,code,name,created_at,config) VALUES (?,?,?,?,?)`, args: ['S1','V01','Vidhi',1,'{}'] })
const mk = (id, text, side, extra={}) => ({ id, text, dimension:'values', prompt:'p', round:0, writtenAt:100, side, x:10, y:20, ...extra })

// A: a chip written, synced, then dropped in the "let go" well
await saveAttributes('S1', syncFilter([mk('A','loyalty','ys')]))
await saveAttributes('S1', syncFilter([mk('A','loyalty','gone',{transferredAt:200,transferredBy:'participant'})]))
// B: written and let go inside the same 1.5s flush window (the queue is keyed by id,
//    so only the final 'gone' state is ever sent)
await saveAttributes('S1', syncFilter([mk('B','being needed','gone',{transferredAt:300,transferredBy:'participant'})]))

const rows = (await conn.execute(`SELECT id, text, side, transferred_by FROM attributes ORDER BY id`)).rows
console.log('stored rows:', JSON.stringify(rows.map(r => ({id:r.id, text:r.text, side:r.side, by:r.transferred_by}))))
console.log("-> 'A' is recorded as still on your-self; 'B' (\"being needed\") does not exist at all\n")

// dashboard / export counters vs what actually happened
const s = (await conn.execute(`SELECT (SELECT COUNT(*) FROM attributes WHERE session_id='S1') w,
                                      (SELECT COUNT(*) FROM attributes WHERE session_id='S1' AND side='ds') d`)).rows[0]
console.log('dashboard shows written=', String(s.w), 'transferred=', String(s.d), 'kept=', Number(s.w)-Number(s.d),
            ' | truth: written=2 transferred=0 let-go=2 kept=0')

// orphan rows: sync accepts any session id in the path and the CSV export INNER JOINs sessions
await saveAttributes('TYPO-SESSION', syncFilter([mk('C','a whole session of answers','ys')]))
const csvRows = await conn.execute(`SELECT a.id FROM attributes a JOIN sessions s ON s.id = a.session_id`)
const allRows = await conn.execute(`SELECT id FROM attributes`)
console.log('\nrows in the table:', allRows.rows.length, '| rows the CSV export emits:', csvRows.rows.length,
            '-> orphan rows are accepted with 200 OK and then silently excluded from every export')
