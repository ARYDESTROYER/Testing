import { NextResponse } from 'next/server'
import { createSession } from '@/lib/db'
import { sanitizeConfig } from '@/lib/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    const session = await createSession(name, sanitizeConfig(body.config))
    return NextResponse.json(session, { status: 201 })
  } catch (err) {
    console.error('[session] create failed', err)
    return NextResponse.json({ error: 'could not create the session' }, { status: 500 })
  }
}
