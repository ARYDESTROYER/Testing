'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { DS, FIGURE, PEDESTAL, YS } from '@/game/layout'

/**
 * The pair of figures.
 *
 * The self on the left never changes — it is the reference the study is asking
 * people to measure against. The digital self on the right starts dark and
 * deformed and rebuilds itself as attributes arrive: a mask wipes the real
 * figure upward over the dark one, an SVG displacement warp relaxes to nothing,
 * and each arrival lands with a pulse.
 */

const DEFORM_MAX = 15

export function Twin({
  reveal,
  arrivalTick,
  active,
}: {
  /** 0..1 — the share of written attributes the digital self now holds. */
  reveal: number
  /** Increments whenever attributes arrive, to trigger the pulse. */
  arrivalTick: number
  /** False before the session starts; keeps the figure calm on the ready screen. */
  active: boolean
}) {
  const dsRef = useRef<HTMLDivElement>(null)
  const revealRef = useRef<HTMLDivElement>(null)
  const turbulenceRef = useRef<SVGFETurbulenceElement>(null)
  const displaceRef = useRef<SVGFEDisplacementMapElement>(null)
  const haloRef = useRef<HTMLDivElement>(null)
  const ysRef = useRef<HTMLDivElement>(null)
  /**
   * The reveal is animated, not rendered. React writing --reveal in its commit
   * would land the final value before the tween ever sampled a start, so the
   * 1.5s wipe would happen in one frame; this ref is the only thing that knows
   * where the tween is starting from.
   */
  const revealValueRef = useRef(0)

  /* Ambient life: a slow, offset bob on each figure. Skipped outright when the
     viewer asks for reduced motion, and torn down if they ask for it mid-session
     — the global timeline runs fast in that mode, which would turn an endless
     loop into a strobe. */
  useEffect(() => {
    const mq =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null

    let ctx: gsap.Context | null = null

    const sync = () => {
      if (mq?.matches) {
        ctx?.revert()
        ctx = null
        gsap.set([ysRef.current, dsRef.current].filter(Boolean), { y: 0 })
        return
      }
      if (ctx) return
      ctx = start()
    }

    mq?.addEventListener('change', sync)
    sync()
    return () => {
      mq?.removeEventListener('change', sync)
      ctx?.revert()
    }

    function start() {
      return gsap.context(() => {
      gsap.to(ysRef.current, {
        y: -9,
        duration: 3.4,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
      })
      gsap.to(dsRef.current, {
        y: -9,
        duration: 3.9,
        ease: 'sine.inOut',
        repeat: -1,
        yoyo: true,
        delay: 0.7,
      })
      })
    }
  }, [])

  /* Reconstruction: mask height, warp amount and colour all follow `reveal`. */
  useEffect(() => {
    const proxy = { v: revealValueRef.current }

    const tween = gsap.to(proxy, {
      v: reveal,
      duration: 1.5,
      ease: 'power3.out',
      onUpdate: () => {
        const v = proxy.v
        revealValueRef.current = v
        revealRef.current?.style.setProperty('--reveal', String(v))
        if (displaceRef.current) {
          displaceRef.current.setAttribute('scale', String(DEFORM_MAX * (1 - v)))
        }
        if (dsRef.current) {
          // The dark base loses its murk as the real figure comes through. The
          // warp wraps both layers, so the reveal never cuts a hard edge across
          // a displaced one.
          dsRef.current.style.setProperty(
            '--ds-filter',
            `url(#twin-deform) saturate(${0.55 + 0.45 * v}) brightness(${0.86 + 0.14 * v})`,
          )
        }
      },
    })

    return () => {
      tween.kill()
    }
  }, [reveal])

  // Seeded once, then owned by the tween above.
  useEffect(() => {
    revealRef.current?.style.setProperty('--reveal', '0')
  }, [])

  /* Arrival: a pulse through the figure and a ripple of extra warp. */
  useEffect(() => {
    if (!arrivalTick) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        dsRef.current,
        { scale: 1 },
        { scale: 1.055, duration: 0.28, ease: 'power2.out', yoyo: true, repeat: 1 },
      )
      gsap.fromTo(
        haloRef.current,
        { opacity: 0, scale: 0.72 },
        { opacity: 1, scale: 1.12, duration: 0.5, ease: 'power2.out' },
      )
      gsap.to(haloRef.current, { opacity: 0, duration: 0.7, delay: 0.45, ease: 'power2.in' })

      if (turbulenceRef.current) {
        const t = { f: 0.011 }
        gsap.to(t, {
          f: 0.03,
          duration: 0.32,
          ease: 'power2.out',
          yoyo: true,
          repeat: 1,
          onUpdate: () =>
            turbulenceRef.current?.setAttribute('baseFrequency', `${t.f} ${t.f * 1.65}`),
        })
      }
    })
    return () => ctx.revert()
  }, [arrivalTick])

  return (
    <>
      {/* --- the filter that deforms the unreconstructed digital self -------- */}
      <svg width="0" height="0" aria-hidden style={{ position: 'absolute' }}>
        <defs>
          <filter id="twin-deform" x="-25%" y="-25%" width="150%" height="150%">
            <feTurbulence
              ref={turbulenceRef}
              type="fractalNoise"
              baseFrequency="0.011 0.018"
              numOctaves={2}
              seed={7}
              result="noise"
            />
            <feDisplacementMap
              ref={displaceRef}
              in="SourceGraphic"
              in2="noise"
              scale={DEFORM_MAX}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* --- your self: static, by design ----------------------------------- */}
      <div
        className="pedestal"
        style={{
          left: YS.pedestal.x,
          top: YS.pedestal.y,
          width: PEDESTAL.w,
          height: PEDESTAL.h,
        }}
      >
        <img src="/assets/pedestal.png" alt="" />
      </div>
      <div
        ref={ysRef}
        className="figure-wrap"
        style={{ left: YS.figure.x, top: YS.figure.y, width: FIGURE.w, height: FIGURE.h }}
      >
        <img src="/assets/figure-light.png" alt="Your self" />
      </div>

      {/* --- digital self ---------------------------------------------------- */}
      <div
        ref={haloRef}
        className="drop-halo"
        style={{
          left: DS.pedestal.x - 110,
          top: DS.figure.y - 150,
          width: PEDESTAL.w + 220,
          height: PEDESTAL.h + 260,
        }}
      />
      <div
        className="pedestal"
        style={{
          left: DS.pedestal.x,
          top: DS.pedestal.y,
          width: PEDESTAL.w,
          height: PEDESTAL.h,
        }}
      >
        <img src="/assets/pedestal.png" alt="" />
      </div>
      <div
        ref={dsRef}
        className="figure-wrap"
        style={{
          left: DS.figure.x,
          top: DS.figure.y,
          width: FIGURE.w,
          height: FIGURE.h,
          filter: 'var(--ds-filter, url(#twin-deform) saturate(.55) brightness(.86))',
          opacity: active ? 1 : 0.92,
        }}
      >
        <div className="twin-base">
          <img src="/assets/figure-dark.png" alt="Your digital self" />
        </div>
        <div ref={revealRef} className="twin-reveal">
          <img src="/assets/figure-light.png" alt="" />
        </div>
      </div>
    </>
  )
}
