'use client'

import type { Attribute, EndReason, GameEvent } from '@/lib/types'
import type { GameConfig } from '@/lib/config'

/**
 * Writes the canvas back to the server without ever making the participant wait
 * for it. Changes accumulate in a queue and flush on a short timer; the queue is
 * keyed by attribute id so repeated moves of the same chip collapse into one
 * write. A final flush goes out via sendBeacon so closing the tab mid-session
 * still lands the data.
 */

const FLUSH_MS = 1500
/** How hard to try to land the ending, which is the study's primary outcome. */
const END_ATTEMPTS = 5

interface Pending {
  attributes: Map<string, Attribute>
  events: NumberedEvent[]
}

/**
 * Events carry a per-session sequence number so a retry after a request that
 * actually landed cannot duplicate them; the database treats (session, seq) as
 * unique and ignores a second insert of the same one.
 */
type NumberedEvent = GameEvent & { seq: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class SessionWriter {
  readonly sessionId: string
  private pending: Pending = { attributes: new Map(), events: [] }
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight = false
  private seq = 0
  private onHide: (() => void) | null = null
  private onVisibility: (() => void) | null = null

  constructor(sessionId: string) {
    this.sessionId = sessionId
    if (typeof window !== 'undefined') {
      this.onHide = () => this.flushBeacon()
      this.onVisibility = () => {
        if (document.visibilityState === 'hidden') this.flushBeacon()
      }
      window.addEventListener('pagehide', this.onHide)
      document.addEventListener('visibilitychange', this.onVisibility)
    }
  }

  attribute(a: Attribute): void {
    this.pending.attributes.set(a.id, { ...a })
    this.schedule()
  }

  attributes(list: readonly Attribute[]): void {
    for (const a of list) this.pending.attributes.set(a.id, { ...a })
    this.schedule()
  }

  event(e: GameEvent): void {
    this.pending.events.push({ ...e, seq: this.seq++ })
    this.schedule()
  }

  private schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, FLUSH_MS)
  }

  private take(): { attributes: Attribute[]; events: NumberedEvent[] } | null {
    if (!this.pending.attributes.size && !this.pending.events.length) return null
    const payload = {
      attributes: [...this.pending.attributes.values()],
      events: this.pending.events,
    }
    this.pending = { attributes: new Map(), events: [] }
    return payload
  }

  async flush(): Promise<void> {
    if (this.inFlight) {
      this.schedule()
      return
    }
    const payload = this.take()
    if (!payload) return

    this.inFlight = true
    try {
      // No `keepalive` here: it caps the body at 64 KiB, which a busy canvas can
      // exceed. Unload is covered by sendBeacon instead.
      const res = await fetch(`/api/session/${encodeURIComponent(this.sessionId)}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      // fetch only rejects on a network failure, so a 500 would otherwise look
      // like a successful write and the batch would be thrown away.
      if (!res.ok) throw new Error(`sync responded ${res.status}`)
    } catch (err) {
      // Put the work back so the next tick retries it; a dropped request must
      // never silently lose a participant's answers.
      this.restore(payload)
      this.schedule()
      if (process.env.NODE_ENV !== 'production') console.warn('[sync] retrying', err)
    } finally {
      this.inFlight = false
    }
  }

  /**
   * Return a failed batch to the queue without undoing anything that happened
   * while it was in flight: a chip moved again during the request has a newer
   * state queued already, and the stale one must not overwrite it.
   */
  private restore(payload: { attributes: Attribute[]; events: NumberedEvent[] }): void {
    for (const a of payload.attributes) {
      if (!this.pending.attributes.has(a.id)) this.pending.attributes.set(a.id, a)
    }
    this.pending.events.unshift(...payload.events)
    this.pending.events.sort((x, y) => x.seq - y.seq)
  }

  private flushBeacon(): void {
    const payload = this.take()
    if (!payload) return
    const url = `/api/session/${encodeURIComponent(this.sessionId)}/sync`
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    if (!navigator.sendBeacon?.(url, blob)) this.restore(payload)
  }

  async start(): Promise<void> {
    try {
      await fetch(`/api/session/${encodeURIComponent(this.sessionId)}/start`, { method: 'POST' })
    } catch {
      // Only stamps started_at; the ending and the attributes are what matter.
    }
  }

  /**
   * How the session ended is the study's primary outcome, so this keeps trying
   * rather than firing once and hoping. The same fact is also in the event log,
   * so even total failure here is recoverable from the export.
   */
  async end(reason: EndReason, durationMs: number): Promise<boolean> {
    await this.flush()
    for (let attempt = 0; attempt < END_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`/api/session/${encodeURIComponent(this.sessionId)}/end`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason, durationMs }),
        })
        if (res.ok) return true
      } catch {
        /* retried below */
      }
      await sleep(400 * 2 ** attempt)
    }
    console.error('[session] the ending could not be recorded; it is in the event log')
    return false
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    if (typeof window === 'undefined') return
    if (this.onHide) window.removeEventListener('pagehide', this.onHide)
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility)
  }
}

export async function createSession(
  name: string,
  config: GameConfig,
): Promise<{ id: string; code: string }> {
  const res = await fetch('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, config }),
  })
  if (!res.ok) throw new Error(`could not start a session (${res.status})`)
  return (await res.json()) as { id: string; code: string }
}
