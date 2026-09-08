/**
 * Session tuning. Every number here is a knob the facilitator can change from
 * the ⚙ panel on the ready screen before a run starts; the values chosen are
 * written into the session row so a run can always be reconstructed from data.
 */

export interface GameConfig {
  /** Seconds per prompt round. */
  roundSeconds: number
  /** How many rounds a full session lasts. One dimension per round. */
  rounds: number
  /**
   * The system transfers a random count of attributes to the digital self at
   * the end of each round. Bounds are inclusive; the actual draw is clamped to
   * however many attributes the participant still holds.
   */
  transferPerRoundMin: number
  transferPerRoundMax: number
  /** Transfer only fires every N rounds. 1 = every round. */
  transferEveryNRounds: number
  /** Rounds are drawn from the dimension pool in a random order when true. */
  shuffleDimensions: boolean
  /** Show the "these were transferred" and "drag and drop" coaching overlays. */
  showCoachOverlays: boolean
}

export const DEFAULT_CONFIG: GameConfig = {
  roundSeconds: 30,
  rounds: 8,
  transferPerRoundMin: 3,
  transferPerRoundMax: 5,
  transferEveryNRounds: 1,
  shuffleDimensions: true,
  showCoachOverlays: true,
}

/**
 * The Figma artboard, in design units. Every coordinate in the UI is expressed
 * in these units and the whole stage is scaled to fit the viewport, so the
 * build is a 1:1 reproduction of the comp at any resolution.
 */
export const FRAME = { width: 4481, height: 2739 } as const

/** Colours lifted from the Figma node tree. */
export const COLORS = {
  bg: '#F1EFF0',
  ink: '#3F3D3E',
  line: '#000000',
  accent: '#498CA7',
  accentLight: '#74ABC2',
  pill: '#D8E8EF',
  greenPill: '#E0EFD8',
  green: '#4EA311',
  redPill: '#EFD9D9',
  red: '#C22C2C',
} as const

/**
 * A session can be pre-configured from the URL, which is how the facilitator
 * sets up a run for a particular participant without opening the panel:
 *   /?seconds=45&rounds=6&min=2&max=4&coach=0
 */
export function configFromSearch(search: string): GameConfig {
  const q = new URLSearchParams(search)
  const num = (key: string, fallback: number, min: number, max: number) => {
    if (!q.has(key)) return fallback
    const n = Number(q.get(key))
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
  }
  const bool = (key: string, fallback: boolean) =>
    q.has(key) ? !['0', 'false', 'no'].includes((q.get(key) ?? '').toLowerCase()) : fallback

  const lo = num('min', DEFAULT_CONFIG.transferPerRoundMin, 0, 40)
  const hi = num('max', DEFAULT_CONFIG.transferPerRoundMax, 0, 40)

  return {
    roundSeconds: num('seconds', DEFAULT_CONFIG.roundSeconds, 5, 600),
    rounds: num('rounds', DEFAULT_CONFIG.rounds, 1, 40),
    transferPerRoundMin: Math.min(lo, hi),
    transferPerRoundMax: Math.max(lo, hi),
    transferEveryNRounds: num('every', DEFAULT_CONFIG.transferEveryNRounds, 1, 10),
    shuffleDimensions: bool('shuffle', DEFAULT_CONFIG.shuffleDimensions),
    showCoachOverlays: bool('coach', DEFAULT_CONFIG.showCoachOverlays),
  }
}
