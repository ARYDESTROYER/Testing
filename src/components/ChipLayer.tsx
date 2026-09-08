'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import type { Attribute, Side } from '@/lib/types'
import { Chip } from './Chip'
import { DROP, DROP_CENTER, INPUT, PEDESTAL, YS, DS } from '@/game/layout'
import { CX } from '@/game/layout'

/**
 * Every attribute on the canvas, plus the halos that light up the figure a chip
 * is about to be dropped on.
 */
export function ChipLayer({
  attributes,
  onMove,
  onSetSide,
}: {
  attributes: Attribute[]
  onMove: (id: string, x: number, y: number) => void
  onSetSide: (id: string, side: Side) => void
}) {
  const seen = useRef<Set<string>>(new Set())
  const mounted = useRef(false)
  const [hover, setHover] = useState<Side | null>(null)
  const ysHalo = useRef<HTMLDivElement>(null)
  const dsHalo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    mounted.current = true
  }, [])

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
  }, [hover])

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

      {attributes.map((a) => {
        const isNew = mounted.current && !seen.current.has(a.id)
        seen.current.add(a.id)
        return (
          <Chip
            key={a.id}
            attribute={a}
            spawnFrom={isNew ? spawn : undefined}
            onMove={onMove}
            onSetSide={onSetSide}
            onHover={setHover}
          />
        )
      })}
    </div>
  )
}

/** Exported for the end card, which draws the same two clusters at rest. */
export const CLUSTER_CENTERS = {
  ys: DROP_CENTER.ys,
  ds: DROP_CENTER.ds,
  pedestal: PEDESTAL,
  figures: { YS, DS },
}
