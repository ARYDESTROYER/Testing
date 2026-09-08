import { NextResponse } from 'next/server'
import { listSessions } from '@/lib/db'
import { authorized } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!authorized(req.url)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ sessions: await listSessions() })
  } catch (err) {
    console.error('[sessions] list failed', err)
    return NextResponse.json({ error: 'could not list sessions' }, { status: 500 })
  }
}
