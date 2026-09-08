import { NextResponse } from 'next/server'
import { markStarted } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    await markStarted(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[session] start failed', err)
    return NextResponse.json({ error: 'could not start' }, { status: 500 })
  }
}
