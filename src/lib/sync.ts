import type { Attribute, GameEvent, Side } from './types'

/**
 * Validation for the canvas sync payload, kept out of the route so it can be
 * tested without standing up a server.
 *
 * Sides are checked against the union itself rather than an inline list: an
 * earlier version listed 'ys' and 'ds' by hand and silently threw away every
 * attribute a participant had let go of, which is the one measure that makes
 * "removed" and "received" different numbers.
 */
export const SIDES: readonly Side[] = ['ys', 'ds', 'gone']

function isSide(value: unknown): value is Side {
  return typeof value === 'string' && (SIDES as readonly string[]).includes(value)
}

export function isValidAttribute(value: unknown): value is Attribute {
  if (!value || typeof value !== 'object') return false
  const a = value as Partial<Attribute>
  return (
    typeof a.id === 'string' &&
    a.id.length > 0 &&
    typeof a.text === 'string' &&
    typeof a.dimension === 'string' &&
    typeof a.prompt === 'string' &&
    Number.isFinite(a.round) &&
    Number.isFinite(a.writtenAt) &&
    isSide(a.side) &&
    Number.isFinite(a.x) &&
    Number.isFinite(a.y)
  )
}

export function isValidEvent(value: unknown): value is GameEvent {
  if (!value || typeof value !== 'object') return false
  const e = value as Partial<GameEvent>
  return typeof e.type === 'string' && e.type.length > 0 && Number.isFinite(e.at)
}

export interface SyncPayload {
  attributes: Attribute[]
  events: GameEvent[]
}

/** Keeps whatever is well-formed and reports what it had to drop. */
export function parseSyncPayload(body: unknown): SyncPayload & { dropped: number } {
  const b = (body ?? {}) as { attributes?: unknown; events?: unknown }
  const rawAttributes = Array.isArray(b.attributes) ? b.attributes : []
  const rawEvents = Array.isArray(b.events) ? b.events : []

  const attributes = rawAttributes.filter(isValidAttribute)
  const events = rawEvents.filter(isValidEvent)

  return {
    attributes,
    events,
    dropped: rawAttributes.length - attributes.length + (rawEvents.length - events.length),
  }
}
