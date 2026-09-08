import { NextResponse } from 'next/server'
import { saveAttributes, saveEvents } from '@/lib/db'
import type { Attribute, GameEvent } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The canvas syncs here every second and a half, and once more via sendBeacon
 * when the tab goes away. Rows are upserted by attribute id, so a replayed or
 * duplicated request is harmless.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  let body: { attributes?: unknown; events?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const attributes = Array.isArray(body.attributes) ? (body.attributes as Attribute[]) : []
  const events = Array.isArray(body.events) ? (body.events as GameEvent[]) : []

  const clean = attributes.filter(
    (a): a is Attribute =>
      !!a &&
      typeof a.id === 'string' &&
      typeof a.text === 'string' &&
      (a.side === 'ys' || a.side === 'ds') &&
      Number.isFinite(a.x) &&
      Number.isFinite(a.y),
  )
  const cleanEvents = events.filter(
    (e): e is GameEvent => !!e && typeof e.type === 'string' && Number.isFinite(e.at),
  )

  try {
    await Promise.all([saveAttributes(id, clean), saveEvents(id, cleanEvents)])
    return NextResponse.json({ ok: true, attributes: clean.length, events: cleanEvents.length })
  } catch (err) {
    console.error('[session] sync failed', err)
    return NextResponse.json({ error: 'could not sync' }, { status: 500 })
  }
}
