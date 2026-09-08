import type { Attribute, DropSide, GameEvent } from '@/lib/types'
import { DIMENSIONS, type Dimension } from '@/lib/prompts'
import type { GameConfig } from '@/lib/config'
import { CHIP_H, ZONE, ZONE_ANCHOR } from './layout'

/* -----------------------------------------------------------------------------
   Deterministic randomness
   -----------------------------------------------------------------------------
   A session seeds its own generator so a run can be replayed exactly from the
   stored seed — useful when a participant's canvas needs to be reconstructed
   during analysis.
   -------------------------------------------------------------------------- */

export type Rng = () => number

export function makeRng(seed: number): Rng {
  // mulberry32
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/* -----------------------------------------------------------------------------
   Round plan
   -------------------------------------------------------------------------- */

export interface Round {
  dimension: Dimension
  prompt: string
}

/**
 * One round per dimension, in a random order, with one prompt drawn at random
 * from that dimension's pool. If a session is configured for more rounds than
 * there are dimensions, the sequence wraps and draws a fresh prompt each time.
 */
export function planRounds(rng: Rng, config: GameConfig): Round[] {
  const order = config.shuffleDimensions ? shuffle(rng, DIMENSIONS) : [...DIMENSIONS]
  const rounds: Round[] = []
  for (let i = 0; i < config.rounds; i++) {
    const dimension = order[i % order.length]
    rounds.push({
      dimension,
      prompt: dimension.prompts[randInt(rng, 0, dimension.prompts.length - 1)],
    })
  }
  return rounds
}

/* -----------------------------------------------------------------------------
   Chip placement
   -------------------------------------------------------------------------- */

interface Placed {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Scatter a chip into its side's zone.
 *
 * Candidates are sampled across the zone and scored: anything overlapping a chip
 * already there is rejected, and among what is left the one nearest the figure
 * wins. That gathers chips around their figure the way the comp does while still
 * spreading outward as the space fills. If every candidate overlaps — which only
 * happens once the canvas is genuinely full — the least-crowded one is used,
 * because the study lets participants write as many attributes as they like.
 */
export function placeChip(
  rng: Rng,
  side: DropSide,
  width: number,
  existing: readonly Placed[],
  attempts = 120,
): { x: number; y: number } {
  const zone = ZONE[side]
  const anchor = ZONE_ANCHOR[side]
  const w = Math.min(width, zone.x1 - zone.x0)
  const maxX = Math.max(zone.x0, zone.x1 - w)
  const maxY = Math.max(zone.y0, zone.y1 - CHIP_H)
  const gap = 16

  let free: { x: number; y: number } | null = null
  let freeDistance = Infinity
  let crowded: { x: number; y: number } | null = null
  let leastOverlap = Infinity

  for (let i = 0; i < attempts; i++) {
    const x = zone.x0 + rng() * (maxX - zone.x0)
    const y = zone.y0 + rng() * (maxY - zone.y0)

    let overlap = 0
    for (const e of existing) {
      const dx = Math.min(x + w, e.x + e.w) - Math.max(x, e.x) + gap
      const dy = Math.min(y + CHIP_H, e.y + e.h) - Math.max(y, e.y) + gap
      if (dx > 0 && dy > 0) overlap += dx * dy
    }

    if (overlap === 0) {
      const dx = x + w / 2 - anchor.x
      const dy = y + CHIP_H / 2 - anchor.y
      const distance = dx * dx + dy * dy
      if (distance < freeDistance) {
        freeDistance = distance
        free = { x, y }
      }
    } else if (overlap < leastOverlap) {
      leastOverlap = overlap
      crowded = { x, y }
    }
  }

  return free ?? crowded ?? { x: zone.x0, y: zone.y0 }
}

/* -----------------------------------------------------------------------------
   System transfers
   -----------------------------------------------------------------------------
   The study decided against fixed per-participant quotas: people write at very
   different speeds in 30 seconds, so the number of attributes the digital self
   takes is drawn by the system each round and clamped to what is actually
   available.
   -------------------------------------------------------------------------- */

export function pickSystemTransfer(
  rng: Rng,
  attributes: readonly Attribute[],
  config: GameConfig,
): string[] {
  const held = attributes.filter((a) => a.side === 'ys')
  if (!held.length) return []

  // Exactly what was drawn, clamped to what the participant actually holds. A
  // configured minimum of 0 means some rounds legitimately take nothing.
  const want = Math.min(
    randInt(rng, config.transferPerRoundMin, config.transferPerRoundMax),
    held.length,
  )
  if (want <= 0) return []
  return shuffle(rng, held)
    .slice(0, want)
    .map((a) => a.id)
}

/* -----------------------------------------------------------------------------
   Reconstruction progress
   -------------------------------------------------------------------------- */

/**
 * How far the digital self has been rebuilt: the share of everything written
 * that now lives on its side. 0 keeps the figure dark and deformed, 1 makes it
 * a replica of the static self on the left.
 */
export function reconstruction(attributes: readonly Attribute[]): number {
  if (!attributes.length) return 0
  const received = attributes.filter((a) => a.side === 'ds').length
  // Deliberately over everything written, not everything still in play: an
  // attribute the participant let go of is one the digital self can never have,
  // so destroying enough of yourself puts a full replica out of reach.
  return received / attributes.length
}

/* -----------------------------------------------------------------------------
   Ids and events
   -------------------------------------------------------------------------- */

let seq = 0

/**
 * Attribute ids are the table's primary key, which is global rather than
 * per-session, so a timestamp and a per-tab counter are not enough: two
 * participants running on two machines against one database could mint the same
 * id in the same millisecond and one answer would overwrite the other.
 */
export function attributeId(): string {
  seq += 1
  const entropy =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `a${Date.now().toString(36)}${seq.toString(36)}-${entropy}`
}

export function event(
  type: GameEvent['type'],
  at: number,
  payload?: Record<string, unknown>,
): GameEvent {
  return { type, at: Math.round(at), payload }
}


