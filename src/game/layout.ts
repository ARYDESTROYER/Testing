/**
 * Fixed geometry taken straight from the Figma node tree, in design units on
 * the 4481 x 2739 artboard. Everything that needs a coordinate reads it from
 * here so the comp stays the single source of truth.
 */

export const CX = 2195 // the vertical spine: the axis the whole comp centres on

export const FIGURE = { w: 313, h: 459 }
export const PEDESTAL = { w: 750, h: 750 }

/**
 * Label boxes are widened around the comp's own centres. Figma sized these to
 * their glyphs; a browser needs slack or the two-line label wraps to three.
 */
export const YS = {
  figure: { x: 1638, y: 1027 },
  pedestal: { x: 1431, y: 1133 },
  label: { x: 1793.5 - 400, y: 897, w: 800 },
}

export const DS = {
  figure: { x: 2522, y: 1027 },
  pedestal: { x: 2292, y: 1133 },
  label: { x: 2672 - 400, y: 897, w: 800 },
}

/** Drop targets: the pedestal footprint unioned with the figure above it. */
export const DROP = {
  ys: { x0: 1431, y0: 1027, x1: 2181, y1: 1883 },
  ds: { x0: 2292, y0: 1027, x1: 3042, y1: 1883 },
}

/**
 * The "let go" well. It only appears while a chip is being dragged, so the
 * canvas stays clean until the choice is actually in front of the participant.
 */
export const DISCARD = { x: 420, y: 2250, w: 520, h: 330 }

export const DROP_CENTER = {
  ys: { x: (DROP.ys.x0 + DROP.ys.x1) / 2, y: (DROP.ys.y0 + DROP.ys.y1) / 2 },
  ds: { x: (DROP.ds.x0 + DROP.ds.x1) / 2, y: (DROP.ds.y0 + DROP.ds.y1) / 2 },
}

/**
 * Where loose chips are allowed to land. Kept clear of the spine, the table,
 * the timer and the controls so the canvas stays readable however many
 * attributes accumulate.
 */
export const ZONE = {
  ys: { x0: 220, y0: 620, x1: 1400, y1: 1980 },
  ds: { x0: 3060, y0: 620, x1: 4240, y1: 1980 },
} as const

export const CHIP_H = 95
export const CHIP_MAX_W = 1150

export const TABLE = { x: 1677, y: 254, w: 1036, h: 462, ruleY: 124 }

/**
 * Column offsets inside the table, from its top-left corner. Sora renders a
 * touch wider in a browser than Figma measured it, so the value columns get a
 * few units more room than the comp gives them; without it "to be gained:"
 * runs into its own number.
 */
export const TABLE_GRID = {
  labelCols: [65, 556],
  valueCols: [376, 876],
  rowTops: [169, 262, 355],
  valueOffset: -9,
}

export const SPINE = { x: CX - 1, y: 716, h: 1025 }

export const BRIDGE = { x: 2195.5 - 350, y: 1061, w: 700 }
export const BRIDGE_KNOCKOUT = { x: 2040, y: 1062, w: 314, h: 139 }
export const ARROW = { x: 2062, y: 1133, w: 267 }

export const TITLE = { y: 425, w: 900 }
export const CODE = { y: 318, w: 400 }
export const TIMER = { y: 1859, w: 700 }
/** Session progress, parked under the input bar where nothing else sits. */
export const PIPS = { y: 2412, w: 700 }
export const START = { x: 2098, y: 1695, w: 193, h: 95 }
export const INPUT = { y: 2266, w: 823, h: 95 }
export const PROMPT = { y: 2092, w: 2200 }
export const DIM_TAG = { y: 2036, w: 2200 }

export const VERDICT_ACCEPT = { x: 2679, y: 1800, w: 437, h: 95 }
export const VERDICT_REJECT = { x: 1230, y: 1800, w: 576, h: 95 }

export const NAME_PILL = { x: 1783, y: 1257, w: 823, h: 159 }

export type Box = { x0: number; y0: number; x1: number; y1: number }

export function centerX(width: number): number {
  return CX - width / 2
}
