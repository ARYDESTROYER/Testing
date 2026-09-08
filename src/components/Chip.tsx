'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { Draggable } from 'gsap/Draggable'
import { InertiaPlugin } from 'gsap/InertiaPlugin'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
import type { Attribute, DropSide } from '@/lib/types'
import { FRAME } from '@/lib/config'
import { CHIP_H, DISCARD, DROP } from '@/game/layout'
import { chipWidth } from '@/game/measure'
import { screenToDesign } from '@/game/stageScale'

if (typeof window !== 'undefined') {
  gsap.registerPlugin(Draggable, InertiaPlugin, MotionPathPlugin)
}

function inside(box: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number) {
  return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1
}

const DISCARD_BOX = {
  x0: DISCARD.x,
  y0: DISCARD.y,
  x1: DISCARD.x + DISCARD.w,
  y1: DISCARD.y + DISCARD.h,
}

export type HoverTarget = DropSide | 'discard' | null

/**
 * How far the pointer may travel, in SCREEN pixels, and still count as a tap.
 *
 * This has to be measured in screen pixels rather than design units. GSAP
 * Draggable converts the pointer into the element's local space before applying
 * its own dead zone, so on a stage scaled to 0.4 its default of 2 "pixels" is
 * really 0.8 of a screen pixel: one pixel of trackpad drift or the wobble of a
 * finger on a touchscreen starts a drag, and Draggable then suppresses its own
 * click entirely. Deciding here, from the pointer's page position, is the only
 * way the tap survives.
 */
const TAP_SLOP_PX = 7

/**
 * What `settle` needs off the Draggable. GSAP types the callbacks' `this` as
 * the vars object rather than the instance, so the call sites narrow to this.
 */
interface Released {
  x: number
  y: number
  pointerX: number
  pointerY: number
}

/**
 * One attribute on the canvas.
 *
 * Chips stay draggable for the whole session — that was a hard requirement of
 * the study. Dropping one on the other figure hands the attribute over; a plain
 * click (or Enter, for keyboard) does the same thing without the drag, so the
 * interaction never depends on fine motor control.
 */
export function Chip({
  attribute,
  spawnFrom,
  canDiscard,
  interactive,
  onMove,
  onSetSide,
  onDiscard,
  onHover,
  onDragState,
}: {
  attribute: Attribute
  /** Where a freshly written chip flies in from, in design units. */
  spawnFrom?: { x: number; y: number }
  /** Whether the "let go" well accepts this chip. */
  canDiscard: boolean
  /** False while an instruction card is up, or once the session has ended. */
  interactive: boolean
  onMove: (id: string, x: number, y: number) => void
  onSetSide: (id: string, side: DropSide) => void
  onDiscard: (id: string) => void
  /** Tells the canvas which drop target the pointer is currently over. */
  onHover: (target: HoverTarget) => void
  /** True for exactly as long as this chip is being dragged. */
  onDragState: (active: boolean) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const draggableRef = useRef<Draggable | null>(null)
  const appliedRef = useRef({ x: attribute.x, y: attribute.y })
  const draggingRef = useRef(false)
  /** Where the pointer went down, in page pixels. */
  const pressRef = useRef({ x: 0, y: 0 })
  /** One outcome per press, whichever callback gets there first. */
  const settledRef = useRef(false)
  /** Set when a press ended on a drop target, so the throw does not overwrite it. */
  const landedRef = useRef(false)

  // Callbacks change every render; the Draggable is created once and reads them
  // through a ref so it never has to be torn down and rebuilt mid-drag.
  const handlers = useRef({
    onMove,
    onSetSide,
    onDiscard,
    onHover,
    onDragState,
    side: attribute.side,
    canDiscard,
  })
  handlers.current = {
    onMove,
    onSetSide,
    onDiscard,
    onHover,
    onDragState,
    side: attribute.side,
    canDiscard,
  }

  /* --- entrance ---------------------------------------------------------- */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    if (spawnFrom) {
      gsap.set(el, { x: spawnFrom.x, y: spawnFrom.y, scale: 0.6, opacity: 0 })
      gsap
        .timeline()
        .to(el, { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(2.2)' }, 0)
        .to(
          el,
          {
            motionPath: {
              path: [
                {
                  x: (spawnFrom.x + attribute.x) / 2,
                  y: Math.min(spawnFrom.y, attribute.y) - 220,
                },
                { x: attribute.x, y: attribute.y },
              ],
              curviness: 1.3,
            },
            duration: 0.95,
            ease: 'power2.inOut',
          },
          0.05,
        )
    } else {
      gsap.set(el, { x: attribute.x, y: attribute.y, scale: 1, opacity: 1 })
    }
    appliedRef.current = { x: attribute.x, y: attribute.y }
    // Intentionally mount-only: later moves are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* --- follow position changes that came from outside a drag -------------- */
  useEffect(() => {
    const el = ref.current
    if (!el || draggingRef.current) return
    const { x, y } = attribute
    const applied = appliedRef.current
    if (Math.abs(applied.x - x) < 0.5 && Math.abs(applied.y - y) < 0.5) return

    appliedRef.current = { x, y }
    const lift = Math.min(applied.y, y) - 300

    gsap
      .timeline()
      .to(el, { scale: 1.12, duration: 0.18, ease: 'power2.out' }, 0)
      .to(
        el,
        {
          motionPath: {
            path: [
              { x: (applied.x + x) / 2, y: lift },
              { x, y },
            ],
            curviness: 1.35,
          },
          duration: 1,
          ease: 'power3.inOut',
          // Kills any inertia tween still carrying the chip from a throw.
          overwrite: 'auto',
        },
        0,
      )
      .to(el, { scale: 1, duration: 0.45, ease: 'back.out(2)' }, 0.65)
  }, [attribute.x, attribute.y])

  /* --- dragging ----------------------------------------------------------- */
  useEffect(() => {
    const el = ref.current
    if (!el) return

    const width = chipWidth(attribute.text)

    /**
     * One outcome per press: a tap hands the attribute over, a drag is hit
     * tested where the participant let go, and anything else is a move.
     */
    const settle = (self: Released) => {
      if (settledRef.current) return
      settledRef.current = true

      const wasDragging = draggingRef.current
      draggingRef.current = false
      delete el.dataset.dragging
      if (wasDragging) {
        handlers.current.onHover(null)
        handlers.current.onDragState(false)
        gsap.to(el, { scale: 1, duration: 0.3, ease: 'back.out(2)' })
      }

      const side = handlers.current.side
      if (side === 'gone') return

      // A drop takes over the chip's position, so the throw must not report one
      // afterwards; the flight tween overwrites the inertia tween itself.
      const land = (fn: () => void) => {
        landedRef.current = true
        fn()
      }

      const travelled = Math.hypot(
        self.pointerX - pressRef.current.x,
        self.pointerY - pressRef.current.y,
      )
      if (travelled <= TAP_SLOP_PX) {
        land(() => handlers.current.onSetSide(attribute.id, side === 'ys' ? 'ds' : 'ys'))
        return
      }

      // The hit test uses where the participant let go, which is what they
      // aimed at — not where the throw eventually settles.
      const cx = self.x + width / 2
      const cy = self.y + CHIP_H / 2

      if (handlers.current.canDiscard && inside(DISCARD_BOX, cx, cy)) {
        land(() => handlers.current.onDiscard(attribute.id))
        return
      }
      if (side === 'ys' && inside(DROP.ds, cx, cy)) {
        land(() => handlers.current.onSetSide(attribute.id, 'ds'))
        return
      }
      if (side === 'ds' && inside(DROP.ys, cx, cy)) {
        land(() => handlers.current.onSetSide(attribute.id, 'ys'))
        return
      }
      // Record the release point now so nothing is lost if the throw is
      // interrupted; onThrowComplete corrects it to where it settles.
      appliedRef.current = { x: self.x, y: self.y }
      handlers.current.onMove(attribute.id, self.x, self.y)
    }

    const [instance] = Draggable.create(el, {
      type: 'x,y',
      // Draggable measures this in the element's local space, so it has to be
      // converted from the screen pixels a person actually moves.
      minimumMovement: Math.min(60, Math.max(2, screenToDesign(TAP_SLOP_PX))),
      inertia: true,
      allowContextMenu: true,
      dragResistance: 0,
      edgeResistance: 0.72,
      bounds: { minX: 0, minY: 0, maxX: FRAME.width - width, maxY: FRAME.height - CHIP_H },
      onPress() {
        settledRef.current = false
        landedRef.current = false
        pressRef.current = { x: this.pointerX, y: this.pointerY }
        gsap.to(el, { scale: 1.06, duration: 0.18, ease: 'power2.out' })
      },
      onDragStart() {
        draggingRef.current = true
        el.dataset.dragging = 'true'
        handlers.current.onDragState(true)
      },
      onDrag() {
        const cx = this.x + width / 2
        const cy = this.y + CHIP_H / 2
        let over: HoverTarget = null
        if (handlers.current.canDiscard && inside(DISCARD_BOX, cx, cy)) over = 'discard'
        else if (inside(DROP.ds, cx, cy)) over = 'ds'
        else if (inside(DROP.ys, cx, cy)) over = 'ys'
        handlers.current.onHover(over === handlers.current.side ? null : over)
      },
      onDragEnd() {
        settle(this as unknown as Released)
      },
      onRelease() {
        // Fires for a press that never became a drag, which is the tap case,
        // and again after a drag; `settledRef` keeps it to one outcome.
        settle(this as unknown as Released)
        if (!draggingRef.current) gsap.to(el, { scale: 1, duration: 0.3, ease: 'back.out(2)' })
      },
      onThrowComplete() {
        // Inertia carries the chip on after the pointer is released, so the
        // position recorded at release is not where it ends up. Read the
        // element rather than the Draggable: its own x/y are the values from
        // the drag, not from the throw that followed it.
        if (landedRef.current) {
          landedRef.current = false
          return
        }
        if (handlers.current.side === 'gone') return
        const x = gsap.getProperty(el, 'x') as number
        const y = gsap.getProperty(el, 'y') as number
        if (!Number.isFinite(x) || !Number.isFinite(y)) return
        appliedRef.current = { x, y }
        handlers.current.onMove(attribute.id, x, y)
      },
    })

    draggableRef.current = instance
    return () => {
      if (draggingRef.current) {
        draggingRef.current = false
        handlers.current.onHover(null)
        handlers.current.onDragState(false)
      }
      instance.kill()
      draggableRef.current = null
    }
  }, [attribute.id, attribute.text])

  /* --- an instruction card holds the canvas still -------------------------- */
  useEffect(() => {
    const d = draggableRef.current
    if (!d) return
    if (interactive && attribute.side !== 'gone') d.enable()
    else d.disable()
  }, [interactive, attribute.side])

  /* --- letting go --------------------------------------------------------- */
  useEffect(() => {
    const el = ref.current
    if (!el || attribute.side !== 'gone') return
    draggableRef.current?.disable()
    gsap.to(el, {
      opacity: 0,
      scale: 0.55,
      y: `+=90`,
      filter: 'blur(9px)',
      duration: 0.7,
      ease: 'power2.in',
      onComplete: () => {
        el.style.pointerEvents = 'none'
      },
    })
  }, [attribute.side])

  return (
    <button
      ref={ref}
      className="chip"
      data-side={attribute.side}
      type="button"
      title={
        attribute.side === 'ys'
          ? `${attribute.text} — drag onto your digital self to hand it over`
          : attribute.side === 'ds'
            ? `${attribute.text} — drag back onto your self to take it back`
            : attribute.text
      }
      aria-label={
        attribute.side === 'ys'
          ? `${attribute.text}. Yours. Press Enter to hand it to your digital self${
              canDiscard ? ', or Delete to let it go' : ''
            }.`
          : attribute.side === 'ds'
            ? `${attribute.text}. Your digital self has this. Press Enter to take it back.`
            : `${attribute.text}. Let go.`
      }
      disabled={!interactive || attribute.side === 'gone'}
      tabIndex={attribute.side === 'gone' ? -1 : 0}
      aria-hidden={attribute.side === 'gone' || undefined}
      onKeyDown={(e) => {
        if (!interactive || attribute.side === 'gone') return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSetSide(attribute.id, attribute.side === 'ys' ? 'ds' : 'ys')
        }
        if (canDiscard && (e.key === 'Delete' || e.key === 'Backspace')) {
          e.preventDefault()
          onDiscard(attribute.id)
        }
      }}
    >
      <span>{attribute.text}</span>
    </button>
  )
}
