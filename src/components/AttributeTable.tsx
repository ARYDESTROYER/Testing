'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { TABLE, TABLE_GRID } from '@/game/layout'
import type { Tally } from '@/lib/types'

/** A counter that rolls to its new value instead of snapping. */
function Value({ value, style }: { value: number; style: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const shown = useRef(value)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const proxy = { v: shown.current }
    const tween = gsap.to(proxy, {
      v: value,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = String(Math.round(proxy.v))
      },
      onComplete: () => {
        shown.current = value
      },
    })
    if (value !== shown.current) {
      gsap.fromTo(
        el,
        { scale: 1.28, color: '#74ABC2' },
        { scale: 1, color: '#498CA7', duration: 0.55, ease: 'back.out(2)' },
      )
    }
    return () => {
      tween.kill()
    }
  }, [value])

  return (
    <div ref={ref} className="abs table-value" style={style}>
      {value}
    </div>
  )
}

/**
 * The five counters, laid out on the comp's grid. An attribute leaving the self
 * is the same attribute arriving at the digital self, which is why removed
 * mirrors received and left mirrors to-be-gained — until something is let go of,
 * which removes it from the self without giving it to anyone.
 */
export function AttributeTable({ tally, visible }: { tally: Tally; visible: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gsap.to(ref.current, {
      opacity: visible ? 1 : 0,
      y: visible ? 0 : -18,
      duration: 0.7,
      ease: 'power3.out',
      pointerEvents: visible ? 'auto' : 'none',
    })
  }, [visible])

  const [L1, L2] = TABLE_GRID.labelCols
  const [V1, V2] = TABLE_GRID.valueCols
  const ROWS = TABLE_GRID.rowTops
  const VALUE_OFFSET = TABLE_GRID.valueOffset

  const label = (left: number, top: number) => ({ left, top }) as React.CSSProperties
  const value = (left: number, top: number) =>
    ({ left, top: top + VALUE_OFFSET, width: 114 }) as React.CSSProperties

  return (
    <div
      ref={ref}
      className="abs table"
      style={{
        left: TABLE.x,
        top: TABLE.y,
        width: TABLE.w,
        height: TABLE.h,
        opacity: 0,
      }}
      aria-live="polite"
    >
      <div className="abs table-title" style={{ left: 0, right: 0, top: 32, width: TABLE.w - 4 }}>
        attribute table
      </div>
      <div className="table-rule" style={{ top: TABLE.ruleY }} />

      <div className="abs table-label" style={label(L1, ROWS[0])}>
        total written:
      </div>
      <Value value={tally.totalWritten} style={value(V1, ROWS[0])} />

      <div className="abs table-label" style={label(L1, ROWS[1])}>
        removed:
      </div>
      <Value value={tally.removed} style={value(V1, ROWS[1])} />

      <div className="abs table-label" style={label(L1, ROWS[2])}>
        left:
      </div>
      <Value value={tally.left} style={value(V1, ROWS[2])} />

      <div className="abs table-label" style={label(L2, ROWS[0])}>
        received:
      </div>
      <Value value={tally.received} style={value(V2, ROWS[0])} />

      <div className="abs table-label" style={label(L2, ROWS[1])}>
        to be gained:
      </div>
      <Value value={tally.toBeGained} style={value(V2, ROWS[1])} />
    </div>
  )
}
