/**
 * The researcher dashboard is gated only if TWIN_DASHBOARD_PASSWORD is set.
 * The study runs on a laptop in a room, so the default is open; deployments
 * that put it on the public internet can set the variable and pass ?key=.
 */
export function dashboardKey(): string | null {
  const key = process.env.TWIN_DASHBOARD_PASSWORD
  return key && key.length ? key : null
}

export function authorized(url: string): boolean {
  const required = dashboardKey()
  if (!required) return true
  try {
    return new URL(url).searchParams.get('key') === required
  } catch {
    return false
  }
}
