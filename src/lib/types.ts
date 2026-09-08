import type { DimensionId } from './prompts'
import type { GameConfig } from './config'

/**
 * Where an attribute currently lives. "gone" is an attribute the participant
 * let go of rather than handing over — the canvas notes ask for both, and it is
 * what makes "removed" and "received" two different numbers.
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
  /** Set when the attribute leaves the self, either way. */
  transferredAt?: number
  /** How it left — the participant moved it, or the system took it. */
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

/** The five counters in the attribute table. */
export interface Tally {
  totalWritten: number
  removed: number
  left: number
  received: number
  toBeGained: number
}

export function tally(attributes: Attribute[]): Tally {
  const totalWritten = attributes.length
  const received = attributes.filter((a) => a.side === 'ds').length
  const left = attributes.filter((a) => a.side === 'ys').length
  // Removed counts everything that has left the self: handed over, or let go
  // of. When nothing is let go, removed equals received and left equals to be
  // gained, which is the state the comp is drawn in.
  return { totalWritten, removed: totalWritten - left, left, received, toBeGained: left }
}
