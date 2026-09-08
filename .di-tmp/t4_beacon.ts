type Any = any
let listeners: Record<string, Function[]> = {}
;(globalThis as Any).window = { addEventListener: (k: string, f: Function) => (listeners[k] ??= []).push(f), removeEventListener: (k: string, f: Function) => { listeners[k] = (listeners[k] ?? []).filter((g) => g !== f) } }
;(globalThis as Any).document = { visibilityState: 'visible', addEventListener: (k: string, f: Function) => (listeners[k] ??= []).push(f) }
;(globalThis as Any).Blob = class { parts: Any[]; constructor(p: Any[]) { this.parts = p } }
const beacons: Any[] = []
Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: (u: string, b: Any) => { beacons.push(JSON.parse(b.parts[0])); return true } }, configurable: true })

let hold: null | ((v?: Any) => void) = null
const sent: Any[] = []
;(globalThis as Any).fetch = async (url: string, init: Any) => {
  const body = init?.body ? JSON.parse(init.body) : null
  if (hold) { await new Promise((res) => { const h = hold!; hold = null; (globalThis as Any).__release = res; h(res) }) }
  sent.push({ url, body }); return { ok: true, status: 200 }
}
const { SessionWriter } = await import('./persist.ts')
const A = (id: string, x: number, side = 'ys') => ({ id, text: id, dimension: 'values', prompt: 'p', round: 0, writtenAt: 1, side, x, y: 0 }) as Any

/* beacon vs in-flight timer flush, clean slate */
listeners = {}
const w = new SessionWriter('S3')
w.attribute(A('a1', 100, 'ys'))
const gate = new Promise<Any>((res) => { hold = res })
const p = (w as Any).flush()          // takes {a1: x=100, ys} and stalls
await gate
w.attribute(A('a1', 900, 'ds'))       // participant hands the chip over
for (const f of listeners['pagehide'] ?? []) f()   // tab closes
;(globalThis as Any).__release()
await p
console.log('beacon carries :', JSON.stringify(beacons.at(-1)?.attributes?.map((a: Any) => [a.id, a.x, a.side])))
console.log('fetch  carries :', JSON.stringify(sent.at(-1)?.body?.attributes?.map((a: Any) => [a.id, a.x, a.side])))
console.log('-> both upsert the same row; whichever the server commits LAST wins\n')

/* dispose() drops whatever is still queued, and leaves the visibilitychange listener behind */
listeners = {}
sent.length = 0; beacons.length = 0
const w2 = new SessionWriter('S5')
w2.attribute(A('lost', 1))
w2.event({ type: 'attribute_written', at: 1, payload: { text: 'my last answer' } } as Any)
w2.dispose()
console.log('after dispose(): queued attrs =', (w2 as Any).pending.attributes.size, 'queued events =', (w2 as Any).pending.events.length, '(never sent)')
console.log('listeners left after dispose():', Object.fromEntries(Object.entries(listeners).map(([k, v]) => [k, (v as Any).length])))
;(globalThis as Any).document.visibilityState = 'hidden'
for (const f of listeners['visibilitychange'] ?? []) f()
console.log('a disposed writer still beacons on visibilitychange:', beacons.length > 0)
