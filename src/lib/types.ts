import type { DimensionId } from './prompts'
import type { GameConfig } from './config'

/** Where an attribute currently lives. */
export type Side = 'ys' | 'ds'

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
  /** Set when the attribute moves to the digital self. */
  transferredAt?: number
  /** How it got there — the participant dragged it, or the system took it. */
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
  const left = totalWritten - received
  // An attribute leaving "your self" is exactly an attribute arriving at the
  // digital self, which is why the comp shows removed === received and
  // left === to be gained.
  return { totalWritten, removed: received, left, received, toBeGained: left }
}
