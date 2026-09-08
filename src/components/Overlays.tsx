'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { NAME_PILL, centerX } from '@/game/layout'
import type { Attribute, EndReason, Tally } from '@/lib/types'

/* -----------------------------------------------------------------------------
   Name gate
   -----------------------------------------------------------------------------
   No login, by design. The name only exists to mint a participant code —
   initials plus a number, like the "#V01" in the comp — so a canvas can be
   traced back to the person who sat in front of it.
   -------------------------------------------------------------------------- */

export function NameGate({
  onSubmit,
  busy,
  error,
}: {
  onSubmit: (name: string) => void
  busy: boolean
  error: string | null
}) {
  const [name, setName] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const ctx = gsap.context(() => {
      gsap
        .timeline()
        .from('.scrim', { opacity: 0, duration: 0.7, ease: 'power2.out' }, 0)
        .from(pillRef.current, { y: 40, opacity: 0, scale: 0.94, duration: 0.9, ease: 'power3.out' }, 0.15)
        .from('.name-hint', { y: 16, opacity: 0, duration: 0.7, ease: 'power2.out' }, 0.5)
    }, rootRef)
    return () => ctx.revert()
  }, [])

  const submit = () => {
    if (!name.trim() || busy) return
    gsap.to(rootRef.current, {
      opacity: 0,
      duration: 0.55,
      ease: 'power2.inOut',
      onComplete: () => onSubmit(name),
    })
  }

  return (
    <div className="overlay-root" ref={rootRef}>
      <div className="scrim" />
      <div
        ref={pillRef}
        className="abs name-pill glass"
        style={{
          left: NAME_PILL.x,
          top: NAME_PILL.y,
          width: NAME_PILL.w,
          height: NAME_PILL.h,
        }}
      >
        <input
          ref={inputRef}
          value={name}
          placeholder="Enter your name"
          aria-label="Enter your name"
          autoComplete="off"
          spellCheck={false}
          maxLength={60}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              submit()
            }
          }}
        />
      </div>
      <div
        className="abs name-hint"
        style={{ left: centerX(1400), top: NAME_PILL.y + NAME_PILL.h + 46, width: 1400 }}
      >
        {error ? error : busy ? 'setting up your canvas…' : 'press enter to begin'}
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------------
   Coaching overlays
   -----------------------------------------------------------------------------
   The instructions are operational states rather than a static screen: the
   facilitator talks through them, and they appear only at the moment they mean
   something.
   -------------------------------------------------------------------------- */

/** Measured off the exported layer: x=1650, y=1229, 1089 x 526. */
const MODAL = { x: 1650, y: 1229, w: 1089, h: 526 }

export function CoachModal({
  kind,
  chips,
  onDismiss,
}: {
  kind: 'transferred' | 'coach-drag'
  chips: Attribute[]
  onDismiss: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // A previous card may have faded this root out on its way to being replaced.
    gsap.set(rootRef.current, { opacity: 1 })
    const ctx = gsap.context(() => {
      gsap
        .timeline()
        .from('.scrim', { opacity: 0, duration: 0.45, ease: 'power2.out' }, 0)
        .from(panelRef.current, { y: 44, opacity: 0, scale: 0.94, duration: 0.7, ease: 'power3.out' }, 0.08)
        .from('.modal-chip', { y: 26, opacity: 0, duration: 0.55, stagger: 0.07, ease: 'back.out(1.7)' }, 0.32)
        .from('.pill-done', { opacity: 0, duration: 0.4, ease: 'power2.out' }, 0.6)
    }, rootRef)

    // The transfer notice reads itself out and steps aside; the drag
    // instruction waits for the participant to say they are ready.
    let timer: ReturnType<typeof setTimeout> | null = null
    if (kind === 'transferred') timer = setTimeout(close, 4200)

    function close() {
      gsap.to(rootRef.current, {
        opacity: 0,
        duration: 0.4,
        ease: 'power2.in',
        onComplete: onDismiss,
      })
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)

    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      ctx.revert()
    }
  }, [kind, onDismiss])

  const close = () => {
    gsap.to(rootRef.current, { opacity: 0, duration: 0.4, ease: 'power2.in', onComplete: onDismiss })
  }

  const heading =
    kind === 'transferred'
      ? 'These attributes have\nbeen transferred to your\ndigital self:'
      : 'Drag and drop (y) attributes\nfrom the canvas to transfer\nto your digital self:'

  const shown =
    kind === 'transferred'
      ? chips.slice(0, 6)
      : ([] as Attribute[])

  return (
    <div className="overlay-root" ref={rootRef} role="dialog" aria-modal="true">
      <div className="scrim" style={{ opacity: 0.55 }} onClick={close} />
      <div
        ref={panelRef}
        className="abs modal"
        style={{ left: MODAL.x, top: MODAL.y, width: MODAL.w, minHeight: MODAL.h }}
      >
        <div className="modal-heading" style={{ whiteSpace: 'pre-line' }}>
          {heading}
        </div>

        <div className="modal-chips">
          {kind === 'transferred'
            ? shown.map((c) => (
                <div className="modal-chip" key={c.id}>
                  {c.text}
                </div>
              ))
            : ['example', 'example', 'example'].map((t, i) => (
                <div className="modal-chip" key={i}>
                  {t}
                </div>
              ))}
        </div>

        {kind === 'coach-drag' && (
          <button className="pill-done" onClick={close} type="button">
            done
          </button>
        )}
      </div>
    </div>
  )
}

/* -----------------------------------------------------------------------------
   End card
   -------------------------------------------------------------------------- */

export function EndCard({
  reason,
  tally,
  code,
  durationMs,
  onRestart,
}: {
  reason: EndReason
  tally: Tally
  code: string
  durationMs: number
  onRestart: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap
        .timeline()
        .from('.scrim', { opacity: 0, duration: 0.6, ease: 'power2.out' }, 0)
        .from('.endcard', { y: 60, opacity: 0, scale: 0.95, duration: 0.9, ease: 'power3.out' }, 0.1)
        .from('.endcard .stat', { y: 24, opacity: 0, duration: 0.6, stagger: 0.09, ease: 'power2.out' }, 0.5)
    }, rootRef)
    return () => ctx.revert()
  }, [])

  const mm = Math.floor(durationMs / 60000)
  const ss = Math.floor((durationMs % 60000) / 1000)

  const headline =
    reason === 'accepted'
      ? 'your digital self is you'
      : reason === 'rejected'
        ? "you didn't feel like yourself anymore"
        : 'the session ended'

  const line =
    reason === 'accepted'
      ? 'yes my DS is me!'
      : reason === 'rejected'
        ? "I don't feel like myself anymore"
        : ''

  return (
    <div className="overlay-root" ref={rootRef}>
      <div className="scrim" style={{ opacity: 0.62 }} />
      <div className="abs endcard-center">
        <div className="endcard">
        <h1>{headline}</h1>
        {line && (
          <div
            className="verdict-line"
            style={{ color: reason === 'accepted' ? 'var(--green)' : 'var(--red)' }}
          >
            {line}
          </div>
        )}
        <div className="stats">
          <div className="stat">
            <b>{tally.totalWritten}</b>
            <span>written</span>
          </div>
          <div className="stat">
            <b>{tally.received}</b>
            <span>transferred</span>
          </div>
          <div className="stat">
            <b>{tally.left}</b>
            <span>kept</span>
          </div>
          <div className="stat">
            <b>{`${mm}:${String(ss).padStart(2, '0')}`}</b>
            <span>on the canvas</span>
          </div>
        </div>
        <div className="code">saved as #{code}</div>
          <button className="pill-done" onClick={onRestart} type="button" style={{ marginTop: 12 }}>
            next participant
          </button>
        </div>
      </div>
    </div>
  )
}
