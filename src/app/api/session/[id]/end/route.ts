import { NextResponse } from 'next/server'
import { endSession } from '@/lib/db'
import type { EndReason } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REASONS: EndReason[] = ['accepted', 'rejected', 'timeout']

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  let body: { reason?: unknown; durationMs?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const reason = REASONS.includes(body.reason as EndReason) ? (body.reason as EndReason) : 'timeout'
  const durationMs = Number.isFinite(Number(body.durationMs)) ? Number(body.durationMs) : 0

  try {
    await endSession(id, reason, durationMs)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[session] end failed', err)
    return NextResponse.json({ error: 'could not end' }, { status: 500 })
  }
}
