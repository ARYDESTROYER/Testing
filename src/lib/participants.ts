/**
 * Participant codes look like the comp's "#V01": initials plus a monotonic
 * participant number. There is no login by design — this exists only so a canvas
 * can be tied back to the person who sat in front of it.
 */

/** Initials from a display name: "Ruchira Sharma" -> "RS", "vidhi" -> "V". */
export function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
  const letters = parts
    .map((p) => [...p].find((ch) => /\p{L}/u.test(ch)) ?? '')
    .filter(Boolean)
    .slice(0, 3)
    .join('')
  return (letters || 'P').toUpperCase()
}

export function participantCode(name: string, n: number): string {
  return `${initialsOf(name)}${String(n).padStart(2, '0')}`
}
