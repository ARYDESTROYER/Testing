'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FRAME } from '@/lib/config'

/**
 * Scales the 4481 x 2739 artboard to fit the viewport with one transform, so
 * every child can be positioned in the comp's own units and still land in the
 * right place on any display. `scaleRef` is handed back up so pointer maths
 * (dragging) can convert screen pixels into design units.
 */
export function Stage({
  children,
  scaleRef,
}: {
  children: React.ReactNode
  scaleRef?: React.MutableRefObject<number>
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const apply = () => {
      const s = Math.min(window.innerWidth / FRAME.width, window.innerHeight / FRAME.height)
      host.style.setProperty('--s', String(s))
      if (scaleRef) scaleRef.current = s
    }

    apply()
    setReady(true)

    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    const ro = new ResizeObserver(apply)
    ro.observe(document.documentElement)
    return () => {
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
      ro.disconnect()
    }
  }, [scaleRef])

  // Fonts settle after first paint; chip widths are measured against them, so
  // hold the canvas back for the tick it takes rather than reflowing visibly.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let alive = true
    const done = () => alive && setFontsReady(true)
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(done).catch(done)
    } else {
      done()
    }
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="viewport" ref={hostRef}>
      <div
        className="stage"
        style={{ opacity: ready && fontsReady ? 1 : 0, transition: 'opacity .5s ease' }}
      >
        {children}
      </div>
    </div>
  )
}
