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
      // Fetched a few at a time rather than all at once: each session is three
      // queries, and a study with a hundred participants would otherwise open
      // three hundred at the same moment.
      const full = []
      const BATCH = 8
      for (let i = 0; i < sessions.length; i += BATCH) {
        const page = await Promise.all(
          sessions.slice(i, i + BATCH).map((s) => getSession(s.id)),
        )
        full.push(...page.filter(Boolean))
      }
      return NextResponse.json({ exportedAt: new Date().toISOString(), sessions: full })
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
