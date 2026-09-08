'use client'

/**
 * The factor the artboard is currently scaled by.
 *
 * Anything reasoning about pointer distance needs it. GSAP Draggable, for one,
 * converts the pointer into the element's local space before applying its
 * movement dead zone, so a threshold that looks like "2 pixels" is really 2
 * design units — about three quarters of a screen pixel at laptop scale.
 */

let current = 1

export function setStageScale(scale: number): void {
  if (Number.isFinite(scale) && scale > 0) current = scale
}

export function stageScale(): number {
  return current
}

/** Screen pixels expressed in design units at the current scale. */
export function screenToDesign(px: number): number {
  return px / current
}
