import { NextResponse } from 'next/server'
import { createSession } from '@/lib/db'
import { DEFAULT_CONFIG, type GameConfig } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Clamp facilitator-supplied settings so a bad value cannot wedge a session. */
function sanitize(input: unknown): GameConfig {
  const c = (input ?? {}) as Partial<GameConfig>
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
  }
  const min = num(c.transferPerRoundMin, DEFAULT_CONFIG.transferPerRoundMin, 0, 40)
  const max = num(c.transferPerRoundMax, DEFAULT_CONFIG.transferPerRoundMax, 0, 40)
  return {
    roundSeconds: num(c.roundSeconds, DEFAULT_CONFIG.roundSeconds, 5, 600),
    rounds: num(c.rounds, DEFAULT_CONFIG.rounds, 1, 40),
    transferPerRoundMin: Math.min(min, max),
    transferPerRoundMax: Math.max(min, max),
    transferEveryNRounds: num(c.transferEveryNRounds, DEFAULT_CONFIG.transferEveryNRounds, 1, 10),
    shuffleDimensions: c.shuffleDimensions ?? DEFAULT_CONFIG.shuffleDimensions,
    showCoachOverlays: c.showCoachOverlays ?? DEFAULT_CONFIG.showCoachOverlays,
    allowDiscard: c.allowDiscard ?? DEFAULT_CONFIG.allowDiscard,
  }
}

export async function POST(req: Request) {
  let body: { name?: unknown; config?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
  if (!name) return NextResponse.json({ error: 'a name is required' }, { status: 400 })

  try {
    const session = await createSession(name, sanitize(body.config))
    return NextResponse.json(session, { status: 201 })
  } catch (err) {
    console.error('[session] create failed', err)
    return NextResponse.json({ error: 'could not create the session' }, { status: 500 })
  }
}
