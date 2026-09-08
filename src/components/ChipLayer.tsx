'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import type { Attribute, DropSide } from '@/lib/types'
import { Chip, type HoverTarget } from './Chip'
import { CX, DISCARD, DROP, INPUT } from '@/game/layout'

/**
 * Every attribute on the canvas, the halos that light up whichever figure a
 * chip is about to be dropped on, and the well a participant can let an
 * attribute go into.
 */
export function ChipLayer({
  attributes,
  allowDiscard,
  interactive,
  onMove,
  onHandToDigitalSelf,
  onDiscard,
  onDragging,
}: {
  attributes: Attribute[]
  allowDiscard: boolean
  interactive: boolean
  onMove: (id: string, x: number, y: number) => void
  onHandToDigitalSelf: (id: string) => void
  onDiscard: (id: string) => void
  /** The id of the chip in hand, or null. */
  onDragging: (id: string | null) => void
}) {
  const seen = useRef<Set<string>>(new Set())
  const mounted = useRef(false)
  // Which ids are new *this* render. Computed here and recorded in an effect,
  // because a render that React discards must not mark a chip as already seen —
  // that is what suppresses the fly-in under StrictMode.
  const fresh = new Set(
    mounted.current ? attributes.filter((a) => !seen.current.has(a.id)).map((a) => a.id) : [],
  )
  const [hover, setHover] = useState<HoverTarget>(null)
  const [dragging, setDragging] = useState(false)

  const ysHalo = useRef<HTMLDivElement>(null)
  const dsHalo = useRef<HTMLDivElement>(null)
  const wellRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    for (const a of attributes) seen.current.add(a.id)
    mounted.current = true
  })

  useEffect(() => {
    if (!interactive) {
      setHover(null)
      setDragging(false)
    }
  }, [interactive])

  useEffect(() => {
    gsap.to(ysHalo.current, {
      opacity: hover === 'ys' ? 1 : 0,
      scale: hover === 'ys' ? 1.06 : 0.9,
      duration: 0.35,
      ease: 'power2.out',
    })
    gsap.to(dsHalo.current, {
      opacity: hover === 'ds' ? 1 : 0,
      scale: hover === 'ds' ? 1.06 : 0.9,
      duration: 0.35,
      ease: 'power2.out',
    })
    gsap.to(wellRef.current, {
      opacity: dragging ? 1 : 0,
      scale: hover === 'discard' ? 1.05 : 1,
      duration: 0.35,
      ease: 'power2.out',
    })
  }, [hover, dragging])

  const spawn = { x: CX - 120, y: INPUT.y - 30 }

  return (
    <div className="chip-layer">
      <div
        ref={ysHalo}
        className="drop-halo"
        style={{
          left: DROP.ys.x0 - 90,
          top: DROP.ys.y0 - 90,
          width: DROP.ys.x1 - DROP.ys.x0 + 180,
          height: DROP.ys.y1 - DROP.ys.y0 + 180,
        }}
      />
      <div
        ref={dsHalo}
        className="drop-halo"
        style={{
          left: DROP.ds.x0 - 90,
          top: DROP.ds.y0 - 90,
          width: DROP.ds.x1 - DROP.ds.x0 + 180,
          height: DROP.ds.y1 - DROP.ds.y0 + 180,
        }}
      />

      {allowDiscard && (
        <div
          ref={wellRef}
          className="discard-well"
          data-armed={hover === 'discard'}
          style={{ left: DISCARD.x, top: DISCARD.y, width: DISCARD.w, height: DISCARD.h }}
          aria-hidden
        >
          <span>let go of it</span>
        </div>
      )}

      {attributes.map((a) => {
        const isNew = fresh.has(a.id)
        return (
          <Chip
            key={a.id}
            attribute={a}
            spawnFrom={isNew ? spawn : undefined}
            canDiscard={allowDiscard && a.side !== 'gone'}
            interactive={interactive}
            onMove={onMove}
            onHandToDigitalSelf={onHandToDigitalSelf}
            onDiscard={onDiscard}
            onHover={setHover}
            onDragState={(active) => {
              setDragging(active)
              onDragging(active ? a.id : null)
            }}
          />
        )
      })}
    </div>
  )
}
