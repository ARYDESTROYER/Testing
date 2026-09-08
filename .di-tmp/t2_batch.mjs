import { freshClient, init } from './lib.mjs'
const conn = freshClient('/home/user/Testing/.di-tmp/db2')
await init(conn)

const A = (id, over={}) => ({ id, session_id:'S1', text:'t'+id, dimension:'values', prompt:'p', round:0, written_at:1, side:'ys', x:1, y:2, ...over })

function attrStmt(sid, a) {
  return { sql: `INSERT INTO attributes (id, session_id, text, dimension, prompt, round, written_at, side, transferred_at, transferred_by, x, y)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET side=excluded.side, transferred_at=excluded.transferred_at, transferred_by=excluded.transferred_by, x=excluded.x, y=excluded.y`,
    args: [a.id, sid, a.text, a.dimension, a.prompt, a.round, a.written_at, a.side, null, null, a.x, a.y] }
}
function evtStmt(sid, e) {
  return { sql: `INSERT INTO events (session_id, type, at, payload) VALUES (?, ?, ?, ?)`, args: [sid, e.type, e.at, null] }
}

// 1. does the sync route's Promise.all of two batches deadlock/BUSY?
const r = await Promise.allSettled([
  conn.batch([attrStmt('S1', A('a1')), attrStmt('S1', A('a2'))], 'write'),
  conn.batch([evtStmt('S1', {type:'x', at:1}), evtStmt('S1', {type:'y', at:2})], 'write'),
])
console.log('1) Promise.all(two batches):', r.map(x => x.status + (x.status==='rejected'? ' -> '+String(x.reason).slice(0,80) : '')).join(' | '))
console.log('   attributes:', (await conn.execute('SELECT COUNT(*) c FROM attributes')).rows[0].c, 'events:', (await conn.execute('SELECT COUNT(*) c FROM events')).rows[0].c)

// 2. is a batch atomic when one statement fails? (NOT NULL violation mid-batch)
const before = Number((await conn.execute('SELECT COUNT(*) c FROM attributes')).rows[0].c)
try {
  await conn.batch([attrStmt('S1', A('good1')), attrStmt('S1', {...A('bad'), dimension: null}), attrStmt('S1', A('good2'))], 'write')
  console.log('2) batch with bad row: NO ERROR (!)')
} catch (e) { console.log('2) batch with bad row rejected:', String(e).slice(0,120)) }
const after = Number((await conn.execute('SELECT COUNT(*) c FROM attributes')).rows[0].c)
console.log('   rows before', before, 'after', after, after===before ? '-> batch is atomic' : '-> PARTIAL APPLY')

// 3. what does an undefined / NaN numeric bind do? (sync route does not validate round/writtenAt/dimension/prompt)
for (const [label, a] of [['writtenAt undefined -> Math.round -> NaN', {...A('n1'), written_at: Math.round(undefined)}],
                          ['dimension undefined', {...A('n2'), dimension: undefined}],
                          ['round undefined', {...A('n3'), round: undefined}]]) {
  try { await conn.batch([attrStmt('S1', a)], 'write'); console.log('3)', label, '-> accepted') }
  catch (e) { console.log('3)', label, '-> REJECTED', String(e).slice(0,140)) }
}
