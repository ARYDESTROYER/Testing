import { originals, type Attribute, type DropSide, type GameEvent } from '@/lib/types'
import { DIMENSIONS, type Dimension } from '@/lib/prompts'
import type { GameConfig } from '@/lib/config'
import { CHIP_H, CLUSTER_GRID, CLUSTER_SPREAD, ZONE, ZONE_ANCHOR } from './layout'

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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** Fractions of a lattice cell, one per wrap around it. */
const WRAP_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.32, 0.3],
  [-0.3, 0.34],
  [0.28, -0.32],
  [-0.34, -0.28],
]

/**
 * Where one group of chips gathers.
 *
 * Answers to the same prompt share a group, and so does each batch the digital
 * self receives, so they read as belonging together. Centres walk a lattice
 * inside the zone starting from the column nearest the figure, and wrap once the
 * lattice is used up — with a shrinking offset, so a later wrap sits between the
 * earlier centres rather than on top of them.
 */
export function clusterCentre(side: DropSide, group: number): { x: number; y: number } {
  const zone = ZONE[side]
  const { cols, rows } = CLUSTER_GRID
  const cells = cols * rows
  const g = Math.max(0, Math.floor(group))
  const wrap = Math.floor(g / cells)
  const cell = g % cells
  // Once the lattice is used up, later groups sit in the gaps between the
  // earlier centres rather than on top of them.
  const [offX, offY] = WRAP_OFFSETS[wrap % WRAP_OFFSETS.length]

  // Column 0 is the one beside the figure: the participant's zone counts in from
  // its right edge, the digital self's from its left.
  const col = cell % cols
  const row = Math.floor(cell / cols)

  const stepX = (zone.x1 - zone.x0) / cols
  const stepY = (zone.y1 - zone.y0) / rows

  const fromFigure = (col + 0.5 + offX) * stepX
  const x = side === 'ys' ? zone.x1 - fromFigure : zone.x0 + fromFigure
  const y = zone.y0 + (row + 0.5 + offY) * stepY

  return {
    x: clamp(x, zone.x0 + 60, zone.x1 - 60),
    y: clamp(y, zone.y0 + 60, zone.y1 - 60),
  }
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
  options: { group?: number; attempts?: number } = {},
): { x: number; y: number } {
  const { group, attempts = 160 } = options
  const zone = ZONE[side]
  const centre = group == null ? ZONE_ANCHOR[side] : clusterCentre(side, group)
  const w = Math.min(width, zone.x1 - zone.x0)
  const maxX = Math.max(zone.x0, zone.x1 - w)
  const maxY = Math.max(zone.y0, zone.y1 - CHIP_H)
  const gap = 16

  let free: { x: number; y: number } | null = null
  let freeDistance = Infinity
  let crowded: { x: number; y: number } | null = null
  let leastOverlap = Infinity

  for (let i = 0; i < attempts; i++) {
    // Sample around the group's centre, widening as attempts fail so a full
    // cluster spills outward instead of never placing.
    let x: number
    let y: number
    if (group == null) {
      x = zone.x0 + rng() * (maxX - zone.x0)
      y = zone.y0 + rng() * (maxY - zone.y0)
    } else {
      const reach = CLUSTER_SPREAD * (1 + (2.5 * i) / attempts)
      const angle = rng() * Math.PI * 2
      const radius = Math.sqrt(rng()) * reach
      x = clamp(centre.x + Math.cos(angle) * radius - w / 2, zone.x0, maxX)
      y = clamp(centre.y + Math.sin(angle) * radius - CHIP_H / 2, zone.y0, maxY)
    }

    let overlap = 0
    for (const e of existing) {
      const dx = Math.min(x + w, e.x + e.w) - Math.max(x, e.x) + gap
      const dy = Math.min(y + CHIP_H, e.y + e.h) - Math.max(y, e.y) + gap
      if (dx > 0 && dy > 0) overlap += dx * dy
    }

    if (overlap === 0) {
      const dx = x + w / 2 - centre.x
      const dy = y + CHIP_H / 2 - centre.y
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
  // Only what the participant still holds: taking one moves it across, so it
  // cannot be taken twice.
  const held = attributes.filter((a) => a.side === 'ys')
  if (!held.length) return []

  // How many the digital self takes. Left to chance by default: anything from
  // none of them to all of them, drawn fresh each round, so a participant cannot
  // learn the rhythm. The range is there for a run that wants a steadier hand.
  const want = config.fullyRandomTransfer
    ? randInt(rng, 0, held.length)
    : Math.min(randInt(rng, config.transferPerRoundMin, config.transferPerRoundMax), held.length)

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
  const written = originals(attributes).length
  if (!written) return 0
  const received = attributes.filter((a) => a.side === 'ds').length
  // Measured against everything ever written, not everything still in play: an
  // attribute the participant binned is one the digital self can never have, so
  // binning enough puts a full replica out of reach.
  return Math.min(1, received / written)
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


