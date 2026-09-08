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
   * Leave how many attributes the digital self takes each round entirely to
   * chance: anything from none of them to all of them. On by default, so a
   * participant cannot learn the rhythm.
   */
  fullyRandomTransfer: boolean
  /**
   * Used instead when the draw is not fully random. Bounds are inclusive and the
   * draw is clamped to however many attributes the participant still holds.
   */
  transferPerRoundMin: number
  transferPerRoundMax: number
  /** Transfer only fires every N rounds. 1 = every round. */
  transferEveryNRounds: number
  /** Rounds are drawn from the dimension pool in a random order when true. */
  shuffleDimensions: boolean
  /** Show the "these were transferred" and "drag and drop" coaching overlays. */
  showCoachOverlays: boolean
  /**
   * Let participants drop an attribute into the "let go" zone to destroy it
   * instead of handing it over. Off makes handing over the only way to shed
   * one, which is the state the comp is drawn in.
   */
  allowDiscard: boolean
}

export const DEFAULT_CONFIG: GameConfig = {
  roundSeconds: 30,
  rounds: 8,
  fullyRandomTransfer: true,
  transferPerRoundMin: 3,
  transferPerRoundMax: 5,
  transferEveryNRounds: 1,
  shuffleDimensions: true,
  showCoachOverlays: true,
  allowDiscard: true,
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
 * Clamp a config from anywhere — the settings panel, the URL, or a request body
 * — to values a session can actually run with. One implementation, so the canvas
 * can never run something different from what gets stored alongside it.
 */
export function sanitizeConfig(input: unknown): GameConfig {
  const c = (input ?? {}) as Partial<GameConfig>
  const num = (v: unknown, fallback: number, min: number, max: number) => {
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
  }

  const rounds = num(c.rounds, DEFAULT_CONFIG.rounds, 1, 40)
  const lo = num(c.transferPerRoundMin, DEFAULT_CONFIG.transferPerRoundMin, 0, 40)
  const hi = num(c.transferPerRoundMax, DEFAULT_CONFIG.transferPerRoundMax, 0, 40)

  return {
    roundSeconds: num(c.roundSeconds, DEFAULT_CONFIG.roundSeconds, 5, 600),
    rounds,
    fullyRandomTransfer: c.fullyRandomTransfer ?? DEFAULT_CONFIG.fullyRandomTransfer,
    transferPerRoundMin: Math.min(lo, hi),
    transferPerRoundMax: Math.max(lo, hi),
    // Taking every N rounds is meaningless past the number of rounds there are.
    transferEveryNRounds: num(c.transferEveryNRounds, DEFAULT_CONFIG.transferEveryNRounds, 1, rounds),
    shuffleDimensions: c.shuffleDimensions ?? DEFAULT_CONFIG.shuffleDimensions,
    showCoachOverlays: c.showCoachOverlays ?? DEFAULT_CONFIG.showCoachOverlays,
    allowDiscard: c.allowDiscard ?? DEFAULT_CONFIG.allowDiscard,
  }
}

/**
 * A session can be pre-configured from the URL, which is how the facilitator
 * sets up a run for a particular participant without opening the panel:
 *   /?seconds=45&rounds=6&min=2&max=4&coach=0
 */
export function configFromSearch(search: string): GameConfig {
  const q = new URLSearchParams(search)
  // A parameter left blank (`?rounds=`) means "not set", not zero — otherwise a
  // half-typed URL silently runs a one-round session.
  const raw = (key: string): string | null => {
    const v = q.get(key)
    return v == null || v.trim() === '' ? null : v.trim()
  }
  const num = (key: string, fallback: number, min: number, max: number) => {
    const v = raw(key)
    if (v == null) return fallback
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback
  }
  const bool = (key: string, fallback: boolean) => {
    const v = raw(key)
    return v == null ? fallback : !['0', 'false', 'no', 'off'].includes(v.toLowerCase())
  }

  return sanitizeConfig({
    roundSeconds: num('seconds', DEFAULT_CONFIG.roundSeconds, 5, 600),
    rounds: num('rounds', DEFAULT_CONFIG.rounds, 1, 40),
    transferPerRoundMin: num('min', DEFAULT_CONFIG.transferPerRoundMin, 0, 40),
    transferPerRoundMax: num('max', DEFAULT_CONFIG.transferPerRoundMax, 0, 40),
    transferEveryNRounds: num('every', DEFAULT_CONFIG.transferEveryNRounds, 1, 40),
    fullyRandomTransfer: bool('random', DEFAULT_CONFIG.fullyRandomTransfer),
    shuffleDimensions: bool('shuffle', DEFAULT_CONFIG.shuffleDimensions),
    showCoachOverlays: bool('coach', DEFAULT_CONFIG.showCoachOverlays),
    allowDiscard: bool('discard', DEFAULT_CONFIG.allowDiscard),
  })
}
