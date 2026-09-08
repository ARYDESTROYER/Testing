import type { Attribute, DropSide, GameEvent } from '@/lib/types'
import { DIMENSIONS, type Dimension } from '@/lib/prompts'
import type { GameConfig } from '@/lib/config'
import { CHIP_H, ZONE } from './layout'

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
 * Scatter a chip into its side's zone, keeping it inside the zone and, where
 * possible, clear of the chips already there. Falls back to the least-crowded
 * of the sampled candidates once the canvas fills up, rather than refusing to
 * place — the study lets participants write as many attributes as they like.
 */
export function placeChip(
  rng: Rng,
  side: DropSide,
  width: number,
  existing: readonly Placed[],
  attempts = 120,
): { x: number; y: number } {
  const zone = ZONE[side]
  const w = Math.min(width, zone.x1 - zone.x0)
  const maxX = Math.max(zone.x0, zone.x1 - w)
  const maxY = Math.max(zone.y0, zone.y1 - CHIP_H)
  const gap = 16

  let best: { x: number; y: number } | null = null
  let bestOverlap = Infinity

  for (let i = 0; i < attempts; i++) {
    const x = zone.x0 + rng() * (maxX - zone.x0)
    const y = zone.y0 + rng() * (maxY - zone.y0)

    let overlap = 0
    for (const e of existing) {
      const dx = Math.min(x + w, e.x + e.w) - Math.max(x, e.x) + gap
      const dy = Math.min(y + CHIP_H, e.y + e.h) - Math.max(y, e.y) + gap
      if (dx > 0 && dy > 0) overlap += dx * dy
    }

    if (overlap === 0) return { x, y }
    if (overlap < bestOverlap) {
      bestOverlap = overlap
      best = { x, y }
    }
  }

  return best ?? { x: zone.x0, y: zone.y0 }
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

  const want = randInt(rng, config.transferPerRoundMin, config.transferPerRoundMax)
  // Never take everything at once — the participant should always be left with
  // something to decide about while rounds remain.
  const cap = Math.max(1, Math.min(want, held.length))
  return shuffle(rng, held)
    .slice(0, cap)
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

export function attributeId(): string {
  seq += 1
  return `a${Date.now().toString(36)}${seq.toString(36)}`
}

export function event(
  type: GameEvent['type'],
  at: number,
  payload?: Record<string, unknown>,
): GameEvent {
  return { type, at: Math.round(at), payload }
}


