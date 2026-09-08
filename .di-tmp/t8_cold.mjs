import { createClient } from '@libsql/client'
import { mkdirSync, mkdtempSync, chmodSync } from 'node:fs'
import path from 'node:path'
// simulate a read-only deployment bundle (Vercel/Lambda: only /tmp is writable)
const root = mkdtempSync('/tmp/ro-')
chmodSync(root, 0o555)
try {
  const dir = path.join(root, 'data')     // == path.join(process.cwd(), 'data')
  mkdirSync(dir, { recursive: true })
  const c = createClient({ url: `file:${path.join(dir, 'chi.db')}` })
  await c.execute('SELECT 1')
  console.log('opened fine')
} catch (e) {
  console.log('cold start on a read-only fs ->', e.code ?? '', String(e).split('\n')[0])
}
// and when cwd IS writable but ephemeral, every cold start begins from an empty file:
const a = mkdtempSync('/tmp/inst-a-'), b = mkdtempSync('/tmp/inst-b-')
for (const [label, d] of [['instance A', a], ['instance B', b]]) {
  const c = createClient({ url: `file:${path.join(d, 'chi.db')}` })
  await c.execute(`CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)`)
  await c.execute(`INSERT INTO counters (name,value) VALUES ('participant',1) ON CONFLICT(name) DO UPDATE SET value=excluded.value`)
  console.log(label, 'first participant number =', String((await c.execute(`SELECT value FROM counters`)).rows[0].value), '-> both participants get code #V01')
}
