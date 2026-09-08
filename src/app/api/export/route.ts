import { NextResponse } from 'next/server'
import { allAttributeRows, getSession, listSessions } from '@/lib/db'
import { authorized } from '@/lib/auth'
import { toCsv } from '@/lib/csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/export?format=csv           every attribute of every session
 * GET /api/export?format=json          full sessions with events
 * GET /api/export?session=<id>         one session, as JSON
 */
export async function GET(req: Request) {
  if (!authorized(req.url)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const format = url.searchParams.get('format') ?? 'csv'
  const sessionId = url.searchParams.get('session')

  try {
    if (sessionId) {
      const session = await getSession(sessionId)
      if (!session) return NextResponse.json({ error: 'not found' }, { status: 404 })
      return NextResponse.json(session)
    }

    if (format === 'json') {
      const sessions = await listSessions()
      const full = await Promise.all(sessions.map((s) => getSession(s.id)))
      return NextResponse.json({ exportedAt: new Date().toISOString(), sessions: full.filter(Boolean) })
    }

    const rows = await allAttributeRows()
    return new NextResponse(toCsv(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="digital-twin-attributes.csv"`,
      },
    })
  } catch (err) {
    console.error('[export] failed', err)
    return NextResponse.json({ error: 'could not export' }, { status: 500 })
  }
}
