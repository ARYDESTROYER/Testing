// Drive the REAL SessionWriter from src/game/persist.ts under a fake browser.
type Any = any
const listeners: Record<string, Function[]> = {}
;(globalThis as Any).window = { addEventListener: (k: string, f: Function) => (listeners[k] ??= []).push(f), removeEventListener: () => {} }
;(globalThis as Any).document = { visibilityState: 'visible', addEventListener: (k: string, f: Function) => (listeners[k] ??= []).push(f) }
;(globalThis as Any).Blob = class { parts: Any[]; constructor(p: Any[]) { this.parts = p } }
const beacons: Any[] = []
Object.defineProperty(globalThis, "navigator", { value: { sendBeacon: (url: string, blob: Any) => { beacons.push(JSON.parse(blob.parts[0])); return true } }, configurable: true })

let mode: 'ok' | 'reject' | 'http500' = 'ok'
let hold: null | ((v?: Any) => void) = null
const sent: Any[] = []
;(globalThis as Any).fetch = async (url: string, init: Any) => {
  const body = init?.body ? JSON.parse(init.body) : null
  if (hold) { await new Promise((res) => { const h = hold!; hold = null; (globalThis as Any).__release = res; h(res) }) }
  sent.push({ url, body })
  if (mode === 'reject') throw new Error('network down')
  if (mode === 'http500') return { ok: false, status: 500 }
  return { ok: true, status: 200 }
}

const { SessionWriter } = await import('./persist.ts')
const A = (id: string, x: number, side = 'ys') => ({ id, text: id, dimension: 'values', prompt: 'p', round: 0, writtenAt: 1, side, x, y: 0 }) as Any
const tick = () => new Promise((r) => setTimeout(r, 30))

/* ---- 1. a 500 response ---- */
mode = 'http500'
let w = new SessionWriter('S1')
w.attribute(A('a1', 1))
w.event({ type: 'attribute_written', at: 1 } as Any)
await (w as Any).flush()
await tick()
console.log('1) HTTP 500: requests sent =', sent.length,
  '| still queued after the failure =', JSON.stringify({
    attrs: [...(w as Any).pending.attributes.keys()],
    events: (w as Any).pending.events.length,
  }))
w.dispose()

/* ---- 2. network reject, with a newer state for the same chip written mid-flight ---- */
sent.length = 0
mode = 'reject'
w = new SessionWriter('S2')
w.attribute(A('a1', 100, 'ys'))                      // chip at x=100 on "your self"
const gate = new Promise<Any>((res) => { hold = res })  // stall the request
const p = (w as Any).flush()
await gate                                            // request is now in flight
w.attribute(A('a1', 900, 'ds'))                       // participant drags it to the digital self
;(globalThis as Any).__release()                      // request completes -> throws
await p
console.log('2) after the failed retry, queued state for a1 =',
  JSON.stringify((w as Any).pending.attributes.get('a1')))
w.dispose()

/* ---- 3. sendBeacon on pagehide while a timed flush is in flight ---- */
sent.length = 0; beacons.length = 0
mode = 'ok'
w = new SessionWriter('S3')
w.attribute(A('a1', 100, 'ys'))
const gate2 = new Promise<Any>((res) => { hold = res })
const p2 = (w as Any).flush()
await gate2                                           // flush holding the OLD x=100 / side ys
w.attribute(A('a1', 900, 'ds'))                       // newer state
for (const f of listeners['pagehide'] ?? []) f()      // tab closes -> beacon takes the NEW state
;(globalThis as Any).__release()
await p2
console.log('3) beacon body   =', JSON.stringify(beacons[0]?.attributes?.map((a: Any) => [a.id, a.x, a.side])))
console.log('   fetch body    =', JSON.stringify(sent[0]?.body?.attributes?.map((a: Any) => [a.id, a.x, a.side])))
console.log('   -> two in-flight writes for the same row; last one to reach the DB wins')
w.dispose()

/* ---- 4. end() while a flush is in flight ---- */
sent.length = 0
mode = 'ok'
w = new SessionWriter('S4')
w.attribute(A('a1', 1))
const gate3 = new Promise<Any>((res) => { hold = res })
const p3 = (w as Any).flush()
await gate3
w.event({ type: 'game_end', at: 5000, payload: { reason: 'accepted' } } as Any)  // the outcome measure
const pe = w.end('accepted' as Any, 5000)
;(globalThis as Any).__release()
await p3; await pe
console.log('4) end(): urls hit =', JSON.stringify(sent.map((s) => s.url)))
console.log('   game_end event still sitting in the queue =', (w as Any).pending.events.length)
w.dispose()
