'use client'

import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { INPUT, centerX } from '@/game/layout'

/**
 * The one place a participant writes.
 *
 * Fixed height, single line, never grows — the study asked for a bar that takes
 * a whole phrase like "I can game pretty well" without pushing the canvas
 * around. There are deliberately no suggestions or autocomplete: the answers
 * have to be the participant's own words.
 */
export function InputBar({
  disabled,
  onSubmit,
  roundProgress,
}: {
  disabled: boolean
  onSubmit: (text: string) => void
  /** 0..1 through the current round; drawn as a thread around the bar. */
  roundProgress: number
}) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<SVGRectElement>(null)

  const left = centerX(INPUT.w)

  useEffect(() => {
    if (!disabled) inputRef.current?.focus()
  }, [disabled])

  useEffect(() => {
    const ring = ringRef.current
    if (!ring) return
    const total = ring.getTotalLength?.() ?? 0
    if (!total) return
    ring.style.strokeDasharray = String(total)
    gsap.to(ring, {
      strokeDashoffset: total * (1 - roundProgress),
      duration: 0.3,
      ease: 'none',
      overwrite: true,
    })
  }, [roundProgress])

  const send = () => {
    const text = value.trim()
    if (!text || disabled) return
    onSubmit(text)
    setValue('')
    gsap.fromTo(
      barRef.current,
      { scale: 1 },
      { scale: 1.02, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out' },
    )
    inputRef.current?.focus()
  }

  return (
    <div
      ref={barRef}
      className="abs inputbar glass"
      style={{
        left,
        top: INPUT.y,
        width: INPUT.w,
        height: INPUT.h,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <svg
        className="round-ring"
        style={{ left: -6, top: -6, width: INPUT.w + 12, height: INPUT.h + 12 }}
        viewBox={`0 0 ${INPUT.w + 12} ${INPUT.h + 12}`}
        aria-hidden
      >
        <rect
          ref={ringRef}
          x={1.5}
          y={1.5}
          width={INPUT.w + 9}
          height={INPUT.h + 9}
          rx={(INPUT.h + 9) / 2}
          pathLength={1000}
          strokeDasharray={1000}
          strokeDashoffset={1000}
        />
      </svg>

      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        placeholder="type a word or phrase"
        aria-label="Type a word or phrase"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            send()
          }
        }}
      />
      <button
        className="inputbar-send"
        style={{ right: 20, top: 18 }}
        onClick={send}
        disabled={disabled || !value.trim()}
        aria-label="Add this attribute"
        type="button"
      >
        <svg width="15" height="20" viewBox="0 0 15 20" fill="none" aria-hidden>
          <path
            d="M1.6 1.4 L13 8.6"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            d="M13 8.6 L1.2 18.6"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}
