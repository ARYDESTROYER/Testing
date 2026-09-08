'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { FRAME } from '@/lib/config'
import { refreshChipFont } from '@/game/measure'
import { setStageScale } from '@/game/stageScale'

/**
 * Scales the 4481 x 2739 artboard to fit the viewport with one transform, so
 * every child can be positioned in the comp's own units and still land in the
 * right place on any display. `scaleRef` is handed back up so pointer maths
 * (dragging) can convert screen pixels into design units.
 */
/**
 * The comp is a wide artboard, and the canvas is meant for a laptop or a kiosk
 * screen. Below this scale it still works, but the chips and the input become
 * too small to use, so the facilitator gets told rather than the participant
 * getting a broken session. Measured on the scale rather than the width, so a
 * short window is caught as well as a narrow one.
 */
const MIN_USABLE_SCALE = 0.2

export function Stage({
  children,
  scaleRef,
}: {
  children: React.ReactNode
  scaleRef?: React.MutableRefObject<number>
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [tooNarrow, setTooNarrow] = useState(false)

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return

    const apply = () => {
      const s = Math.min(window.innerWidth / FRAME.width, window.innerHeight / FRAME.height)
      host.style.setProperty('--s', String(s))
      setStageScale(s)
      if (scaleRef) scaleRef.current = s
      setTooNarrow(s < MIN_USABLE_SCALE)
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

  // Everything on the canvas is animated with GSAP rather than CSS, so the
  // reduced-motion preference has to be honoured here: running the global
  // timeline far ahead of real time lands every tween on its final value
  // without the movement in between.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => gsap.globalTimeline.timeScale(mq.matches ? 120 : 1)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Fonts settle after first paint; chip widths are measured against them, so
  // hold the canvas back for the tick it takes rather than reflowing visibly.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let alive = true
    const done = () => {
      if (!alive) return
      refreshChipFont()
      setFontsReady(true)
    }
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
      {tooNarrow && (
        <div className="narrow-notice" role="status">
          This canvas is built for a laptop or a larger screen. Open it on a bigger
          display before running a session.
        </div>
      )}
    </div>
  )
}
