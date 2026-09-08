import { listSessions } from '@/lib/db'
import { dashboardKey } from '@/lib/auth'
import './dashboard.css'

export const dynamic = 'force-dynamic'

function when(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function duration(ms: number | null): string {
  if (!ms) return '—'
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
}

/** The facilitator's view of everything the study has collected so far. */
export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const required = dashboardKey()
  const key = typeof params.key === 'string' ? params.key : ''

  if (required && key !== required) {
    return (
      <main className="dash">
        <h1>Digital twin sessions</h1>
        <p className="muted">
          This dashboard is protected. Append <code>?key=…</code> to the URL.
        </p>
      </main>
    )
  }

  const sessions = await listSessions()
  const suffix = required ? `?key=${encodeURIComponent(key)}` : ''
  const exportSuffix = required ? `&key=${encodeURIComponent(key)}` : ''

  const totalAttributes = sessions.reduce((n, s) => n + s.attributeCount, 0)
  const completed = sessions.filter((s) => s.endedAt).length

  return (
    <main className="dash">
      <header>
        <div>
          <h1>Digital twin sessions</h1>
          <p className="muted">
            {sessions.length} participant{sessions.length === 1 ? '' : 's'} · {completed} completed ·{' '}
            {totalAttributes} attributes written
          </p>
        </div>
        <nav>
          <a className="btn" href={`/api/export?format=csv${exportSuffix}`}>
            attributes.csv
          </a>
          <a className="btn" href={`/api/export?format=json${exportSuffix}`}>
            full export.json
          </a>
          <a className="btn ghost" href={`/${suffix}`}>
            ← the canvas
          </a>
        </nav>
      </header>

      {sessions.length === 0 ? (
        <p className="empty">
          No sessions yet. Open the canvas, enter a participant name, and this fills in.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>code</th>
              <th>name</th>
              <th>started</th>
              <th className="num">written</th>
              <th className="num">transferred</th>
              <th className="num">kept</th>
              <th>duration</th>
              <th>ended</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="code">#{s.code}</td>
                <td>{s.name}</td>
                <td className="muted">{when(s.createdAt)}</td>
                <td className="num">{s.attributeCount}</td>
                <td className="num">{s.receivedCount}</td>
                <td className="num">{s.attributeCount - s.receivedCount}</td>
                <td className="muted">{duration(s.durationMs)}</td>
                <td>
                  {s.endReason ? (
                    <span className={`tag tag-${s.endReason}`}>
                      {s.endReason === 'accepted'
                        ? 'my DS is me'
                        : s.endReason === 'rejected'
                          ? 'not myself'
                          : 'timed out'}
                    </span>
                  ) : (
                    <span className="tag tag-open">in progress</span>
                  )}
                </td>
                <td>
                  <a
                    className="link"
                    href={`/api/export?session=${encodeURIComponent(s.id)}${exportSuffix}`}
                  >
                    json
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
