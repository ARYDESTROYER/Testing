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

interface Pending {
  attributes: Map<string, Attribute>
  events: GameEvent[]
}

export class SessionWriter {
  readonly sessionId: string
  private pending: Pending = { attributes: new Map(), events: [] }
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight = false
  private unloadHandler: (() => void) | null = null

  constructor(sessionId: string) {
    this.sessionId = sessionId
    if (typeof window !== 'undefined') {
      this.unloadHandler = () => this.flushBeacon()
      window.addEventListener('pagehide', this.unloadHandler)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.flushBeacon()
      })
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
    this.pending.events.push(e)
    this.schedule()
  }

  private schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, FLUSH_MS)
  }

  private take(): { attributes: Attribute[]; events: GameEvent[] } | null {
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
      await fetch(`/api/session/${encodeURIComponent(this.sessionId)}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      })
    } catch {
      // Put the work back so the next tick retries it; a dropped request must
      // never silently lose a participant's answers.
      for (const a of payload.attributes) this.pending.attributes.set(a.id, a)
      this.pending.events.unshift(...payload.events)
      this.schedule()
    } finally {
      this.inFlight = false
    }
  }

  private flushBeacon(): void {
    const payload = this.take()
    if (!payload) return
    const url = `/api/session/${encodeURIComponent(this.sessionId)}/sync`
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
    if (!navigator.sendBeacon?.(url, blob)) {
      for (const a of payload.attributes) this.pending.attributes.set(a.id, a)
      this.pending.events.unshift(...payload.events)
    }
  }

  async start(): Promise<void> {
    await fetch(`/api/session/${encodeURIComponent(this.sessionId)}/start`, { method: 'POST' })
  }

  async end(reason: EndReason, durationMs: number): Promise<void> {
    await this.flush()
    await fetch(`/api/session/${encodeURIComponent(this.sessionId)}/end`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason, durationMs }),
      keepalive: true,
    })
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.unloadHandler && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', this.unloadHandler)
    }
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
