/**
 * Checks the whole persistence path against a running server: that an attribute
 * on each side is stored, that a malformed one is rejected rather than crashing
 * the write, and that the exports and the dashboard count them separately.
 *
 *   node scripts/check-persistence.mjs [baseUrl]
 *
 * Worth running against a deployment before a session. It writes ONE throwaway
 * session named "Sync Check", so point it at a scratch database, not a study one.
 */
const BASE = process.argv[2] ?? 'http://localhost:3000'
const j = async (r) => { if (!r.ok) throw new Error(`${r.url} -> ${r.status}`); return r.json() }

const { id, code } = await j(await fetch(`${BASE}/api/session`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Sync Check', config: { rounds: 2, roundSeconds: 30 } }),
}))
console.log('session', code, id)

// Fresh ids per run: reusing them across sessions is exactly what showed the
// attributes table needed a per-session key.
const run = Math.random().toString(36).slice(2, 8)
const base = { dimension: 'physical', prompt: 'p', round: 0, writtenAt: 100 }
const sync = await j(await fetch(`${BASE}/api/session/${id}/sync`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    attributes: [
      { ...base, id: `k1-${run}`, text: 'kept one', side: 'ys', x: 100, y: 100 },
      { ...base, id: `t1-${run}`, text: 'handed over', side: 'ds', x: 200, y: 200, transferredAt: 300, transferredBy: 'participant' },
      { ...base, id: `g1-${run}`, text: 'let go of', side: 'gone', x: 300, y: 300, transferredAt: 400, transferredBy: 'participant' },
      { ...base, id: `bad-${run}`, text: 'nowhere', side: 'elsewhere', x: 0, y: 0 },
    ],
    events: [{ type: 'attribute_discarded', at: 400, payload: { id: `g1-${run}` } }],
  }),
}))
console.log('sync ->', JSON.stringify(sync))

const one = await j(await fetch(`${BASE}/api/export?session=${encodeURIComponent(id)}`))
const sides = Object.fromEntries(one.attributes.map((a) => [a.id.split('-')[0], a.side]))
console.log('stored sides ->', JSON.stringify(sides))

const csv = await (await fetch(`${BASE}/api/export?format=csv`)).text()
const rows = csv.split('\r\n').filter((l) => l.includes(`g1-${run}`))
console.log('csv rows for the destroyed attribute ->', rows.length, rows[0]?.slice(0, 120))

const list = await j(await fetch(`${BASE}/api/sessions`))
const row = list.sessions.find((s) => s.id === id)
console.log('dashboard counts ->', JSON.stringify({
  written: row.attributeCount, transferred: row.receivedCount,
  letGo: row.discardedCount, kept: row.keptCount,
}))

const ok =
  sides.g1 === 'gone' && sides.k1 === 'ys' && sides.t1 === 'ds' && !('bad' in sides) &&
  sync.dropped === 1 && rows.length === 1 &&
  row.attributeCount === 3 && row.receivedCount === 1 && row.discardedCount === 1 && row.keptCount === 1
console.log(ok ? '\nPASS: a destroyed attribute is stored, exported and counted separately' : '\nFAIL')
process.exit(ok ? 0 : 1)
