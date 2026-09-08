'use client'

import { CHIP_H, CHIP_MAX_W } from './layout'

/**
 * Chips are laid out before they exist in the DOM, so their width is measured
 * off-screen with the same font the chip will render in. Padding and border
 * match the `.chip` rule in globals.css.
 */

const CHIP_PADDING_X = 40
const CHIP_BORDER = 1
/** The comp sets -1.28 at 32px; canvas measureText cannot apply it, so it is
 *  subtracted per character afterwards. */
const CHIP_LETTER_SPACING = -1.28

let ctx: CanvasRenderingContext2D | null | undefined

/**
 * next/font gives the family a generated name, so measuring against a literal
 * "Sora" silently falls through to a system font and every width comes out
 * wrong. Read the name the page is actually using.
 */
function chipFont(): string {
  const family =
    getComputedStyle(document.documentElement).getPropertyValue('--font-sora').trim() ||
    'Sora'
  return `300 32px ${family}, ui-sans-serif, system-ui, sans-serif`
}

function context(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx
  if (typeof document === 'undefined') return (ctx = null)
  ctx = document.createElement('canvas').getContext('2d')
  if (ctx) ctx.font = chipFont()
  return ctx
}

/** Called once the webfont has loaded, so the cached context re-reads it. */
export function refreshChipFont(): void {
  if (ctx) ctx.font = chipFont()
}

export function chipWidth(text: string): number {
  const c = context()
  // 17.4px per character is Sora Light 32px measured over the study's own
  // example phrases; it is only ever the fallback for a server render.
  const textW =
    (c ? c.measureText(text).width : text.length * 17.4) + text.length * CHIP_LETTER_SPACING
  return Math.min(CHIP_MAX_W, Math.ceil(textW) + CHIP_PADDING_X * 2 + CHIP_BORDER * 2)
}

export function chipBox(text: string, x: number, y: number) {
  return { x, y, w: chipWidth(text), h: CHIP_H }
}
