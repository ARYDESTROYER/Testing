import type { DimensionId } from './prompts'
import type { GameConfig } from './config'

/**
 * Which side of the canvas a chip sits on. "gone" is one the participant put in
 * the bin, from either side.
 *
 * An attribute lives in exactly one place: handing it to the digital self MOVES
 * it, so the participant no longer has it.
 */
export type Side = 'ys' | 'ds' | 'gone'

/** The two sides a chip can be dropped on. */
export type DropSide = 'ys' | 'ds'

export interface Attribute {
  id: string
  /** Exactly what the participant typed, untouched. */
  text: string
  dimension: DimensionId
  /** The prompt that was on screen when it was written. */
  prompt: string
  /** Round index (0-based) it was written in. */
  round: number
  /** ms since the session timer started. */
  writtenAt: number
  side: Side
  /**
   * Historical only. Sessions recorded while a transfer copied rather than moved
   * carry the id of the original here; nothing writes it now. Kept so those
   * sessions still read correctly.
   */
  copyOf?: string
  /** When this chip appeared on the digital self, or went in the bin. */
  transferredAt?: number
  /** Who did it — the participant, or the system at the end of a round. */
  transferredBy?: 'system' | 'participant'
  /** Position on the canvas, in design units, relative to the frame origin. */
  x: number
  y: number
}

export type GameEventType =
  | 'session_start'
  | 'round_start'
  | 'attribute_written'
  | 'attribute_transferred'
  | 'attribute_returned'
  | 'attribute_discarded'
  | 'attribute_moved'
  | 'system_transfer'
  | 'overlay_shown'
  | 'overlay_dismissed'
  | 'game_end'

export interface GameEvent {
  type: GameEventType
  /** ms since the session timer started. */
  at: number
  payload?: Record<string, unknown>
  /**
   * Monotonic within a session. The database treats (session, seq) as unique,
   * so a retry after a request that actually landed cannot duplicate an event.
   */
  seq?: number
}

export type EndReason = 'accepted' | 'rejected' | 'timeout'

export interface SessionRecord {
  id: string
  /** Display code, e.g. "RS-07" — initials plus participant number. */
  code: string
  name: string
  createdAt: number
  startedAt: number | null
  endedAt: number | null
  endReason: EndReason | null
  /** Wall-clock duration of the play phase, ms. */
  durationMs: number | null
  config: GameConfig
  attributes: Attribute[]
  events: GameEvent[]
}

/** The five counters in the attribute table, plus one the end card uses. */
export interface Tally {
  totalWritten: number
  removed: number
  left: number
  received: number
  toBeGained: number
  /** Binned, from either side. Not a table counter; `removed` covers both ways. */
  discarded: number
}

/** Excludes the duplicate rows a copy-era session left behind. */
export function originals(attributes: readonly Attribute[]): Attribute[] {
  return attributes.filter((a) => !a.copyOf)
}

export function tally(attributes: Attribute[]): Tally {
  const totalWritten = originals(attributes).length
  const received = attributes.filter((a) => a.side === 'ds').length
  const left = attributes.filter((a) => a.side === 'ys').length
  const discarded = attributes.filter((a) => a.side === 'gone').length
  // Removed counts everything that has left the self: handed over, or let go
  // of. When nothing is let go, removed equals received and left equals to be
  // gained, which is the state the comp is drawn in. Handing an attribute over
  // moves it, so everything still held is still the digital self's to gain.
  return { totalWritten, removed: totalWritten - left, left, received, toBeGained: left, discarded }
}
