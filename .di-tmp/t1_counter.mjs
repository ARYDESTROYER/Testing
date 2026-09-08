import { freshClient, init, nextParticipantNumber } from './lib.mjs'
const D = '/home/user/Testing/.di-tmp/db1'
const conn = freshClient(D)
await init(conn)

// two "tabs" hitting POST /api/session at the same time, same process
const t0 = Date.now()
const res = await Promise.allSettled([nextParticipantNumber(conn), nextParticipantNumber(conn)])
console.log('elapsed ms', Date.now() - t0)
for (const r of res) console.log(r.status, r.status === 'fulfilled' ? r.value : String(r.reason).slice(0, 200))
const c = await conn.execute(`SELECT * FROM counters`)
console.log('counter rows', JSON.stringify(c.rows.map(r => ({ name: r.name, value: String(r.value) }))))
