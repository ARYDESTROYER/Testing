import { freshClient, init, nextParticipantNumber } from './lib.mjs'
import { readdirSync } from 'node:fs'
const conn = freshClient('/home/user/Testing/.di-tmp/db7')
await init(conn)
const fds = () => readdirSync('/proc/self/fd').length
console.log('open fds at start:', fds())
for (let i = 0; i < 40; i++) {
  await nextParticipantNumber(conn)             // one per createSession()
  await conn.execute({ sql: `INSERT INTO sessions (id,code,name,created_at,config) VALUES (?,?,?,?,?)`, args: ['S'+i,'C','n',1,'{}'] })
}
global.gc?.()
console.log('open fds after 40 sessions:', fds())
console.log('counter =', String((await conn.execute(`SELECT value FROM counters`)).rows[0].value))
