import { NextResponse } from 'next/server'
import { saveAttributes, saveEvents, sessionExists } from '@/lib/db'
import { parseSyncPayload } from '@/lib/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The canvas syncs here every second and a half, and once more via sendBeacon
 * when the tab goes away. Rows are upserted by attribute id, so a replayed or
 * duplicated request is harmless.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { attributes, events, dropped } = parseSyncPayload(body)

  // Rows for a session that does not exist would be accepted and then vanish
  // from every export, which joins on sessions. Better to say so.
  if (!(await sessionExists(id))) {
    return NextResponse.json({ error: 'unknown session' }, { status: 404 })
  }
  if (dropped) {
    console.warn(`[session] ${id}: dropped ${dropped} malformed item(s) from a sync`)
  }

  try {
    await Promise.all([saveAttributes(id, attributes), saveEvents(id, events)])
    return NextResponse.json({
      ok: true,
      attributes: attributes.length,
      events: events.length,
      dropped,
    })
  } catch (err) {
    console.error('[session] sync failed', err)
    return NextResponse.json({ error: 'could not sync' }, { status: 500 })
  }
}
