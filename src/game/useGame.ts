'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Attribute, DropSide, EndReason } from '@/lib/types'
import { tally } from '@/lib/types'
import { DEFAULT_CONFIG, type GameConfig } from '@/lib/config'
import {
  attributeId,
  event,
  makeRng,
  pickSystemTransfer,
  placeChip,
  planRounds,
  reconstruction,
  type Round,
  type Rng,
} from './engine'
import { chipWidth } from './measure'
import { SessionWriter, createSession } from './persist'
import { CHIP_H } from './layout'

export type Phase = 'name' | 'ready' | 'playing' | 'ended'

export type Overlay = { kind: 'transferred'; ids: string[] } | { kind: 'coach-drag' } | null

export interface Session {
  id: string
  code: string
  name: string
}

export interface GameState {
  phase: Phase
  session: Session | null
  config: GameConfig
  rounds: Round[]
  roundIndex: number
  /** True once every planned round has run; the canvas stays live. */
  writingClosed: boolean
  attributes: Attribute[]
  sessionMs: number
  roundMs: number
  overlay: Overlay
  endReason: EndReason | null
  /** 0..1 — how far the digital self has been rebuilt. */
  reveal: number
  /** Bumped every time attributes arrive at the digital self, to drive a pulse. */
  arrivalTick: number
  busy: boolean
  error: string | null
}

export interface GameApi {
  state: GameState
  tally: ReturnType<typeof tally>
  begin: (name: string, config: GameConfig) => Promise<void>
  start: () => void
  submit: (text: string) => void
  moveAttribute: (id: string, x: number, y: number) => void
  setSide: (id: string, side: DropSide, by: 'participant') => void
  discard: (id: string) => void
  dismissOverlay: () => void
  finish: (reason: EndReason) => void
}

const INITIAL: GameState = {
  phase: 'name',
  session: null,
  config: DEFAULT_CONFIG,
  rounds: [],
  roundIndex: 0,
  writingClosed: false,
  attributes: [],
  sessionMs: 0,
  roundMs: 0,
  overlay: null,
  endReason: null,
  reveal: 0,
  arrivalTick: 0,
  busy: false,
  error: null,
}

/**
 * The whole session lives here.
 *
 * State is held in a ref and mirrored into React, rather than being derived
 * inside `setState` updaters: every transition also has to write to the
 * database and fire animations, and an updater that React chooses to invoke
 * twice would duplicate those. This way each transition runs exactly once.
 */
export function useGame(): GameApi {
  const ref = useRef<GameState>(INITIAL)
  const [state, setState] = useState<GameState>(INITIAL)

  const commit = useCallback((next: GameState) => {
    ref.current = next
    setState(next)
  }, [])

  const rngRef = useRef<Rng>(makeRng(1))
  const writerRef = useRef<SessionWriter | null>(null)
  const coachShownRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  useEffect(() => () => writerRef.current?.dispose(), [])

  /* ---------------------------------------------------------------------------
     Session bootstrap
     ------------------------------------------------------------------------ */

  const begin = useCallback(
    async (name: string, config: GameConfig) => {
      commit({ ...ref.current, busy: true, error: null })
      try {
        const session = await createSession(name, config)
        const seed = Math.floor(Math.random() * 2 ** 31)
        const rng = makeRng(seed)
        rngRef.current = rng

        const writer = new SessionWriter(session.id)
        writerRef.current = writer
        writer.event(event('session_start', 0, { code: session.code, seed, config }))

        commit({
          ...ref.current,
          phase: 'ready',
          session: { ...session, name: name.trim() },
          config,
          rounds: planRounds(rng, config),
          busy: false,
        })
      } catch (err) {
        commit({
          ...ref.current,
          busy: false,
          error: err instanceof Error ? err.message : 'could not start a session',
        })
      }
    },
    [commit],
  )

  const start = useCallback(() => {
    const s = ref.current
    if (s.phase !== 'ready') return
    lastTsRef.current = null
    void writerRef.current?.start()
    writerRef.current?.event(event('round_start', 0, { round: 0 }))
    commit({ ...s, phase: 'playing', sessionMs: 0, roundMs: 0, roundIndex: 0 })
  }, [commit])

  /* ---------------------------------------------------------------------------
     Writing
     ------------------------------------------------------------------------ */

  const submit = useCallback(
    (raw: string) => {
      const s = ref.current
      if (s.phase !== 'playing' || s.writingClosed) return

      const text = raw.trim().replace(/\s+/g, ' ')
      if (!text) return

      const round = s.rounds[Math.min(s.roundIndex, s.rounds.length - 1)]
      if (!round) return

      const boxes = s.attributes
        .filter((a) => a.side === 'ys')
        .map((a) => ({ x: a.x, y: a.y, w: chipWidth(a.text), h: CHIP_H }))
      const { x, y } = placeChip(rngRef.current, 'ys', chipWidth(text), boxes)

      const attribute: Attribute = {
        id: attributeId(),
        text,
        dimension: round.dimension.id,
        prompt: round.prompt,
        round: s.roundIndex,
        writtenAt: s.sessionMs,
        side: 'ys',
        x,
        y,
      }

      writerRef.current?.attribute(attribute)
      writerRef.current?.event(
        event('attribute_written', s.sessionMs, {
          id: attribute.id,
          text,
          dimension: attribute.dimension,
          prompt: attribute.prompt,
          round: attribute.round,
        }),
      )

      const attributes = [...s.attributes, attribute]
      commit({ ...s, attributes, reveal: reconstruction(attributes) })
    },
    [commit],
  )

  const moveAttribute = useCallback(
    (id: string, x: number, y: number) => {
      const s = ref.current
      const current = s.attributes.find((a) => a.id === id)
      if (!current) return

      const moved: Attribute = { ...current, x, y }
      writerRef.current?.attribute(moved)
      writerRef.current?.event(
        event('attribute_moved', s.sessionMs, { id, x: Math.round(x), y: Math.round(y) }),
      )
      commit({ ...s, attributes: s.attributes.map((a) => (a.id === id ? moved : a)) })
    },
    [commit],
  )

  /** A chip dropped on the other figure changes hands. */
  const setSide = useCallback(
    (id: string, side: DropSide, by: 'participant') => {
      const s = ref.current
      const current = s.attributes.find((a) => a.id === id)
      if (!current || current.side === side) return

      const boxes = s.attributes
        .filter((a) => a.side === side && a.id !== id)
        .map((a) => ({ x: a.x, y: a.y, w: chipWidth(a.text), h: CHIP_H }))
      const { x, y } = placeChip(rngRef.current, side, chipWidth(current.text), boxes)

      const next: Attribute = {
        ...current,
        side,
        x,
        y,
        transferredAt: side === 'ds' ? s.sessionMs : undefined,
        transferredBy: side === 'ds' ? by : undefined,
      }

      writerRef.current?.attribute(next)
      writerRef.current?.event(
        event(side === 'ds' ? 'attribute_transferred' : 'attribute_returned', s.sessionMs, {
          id,
          text: next.text,
          by,
        }),
      )

      const attributes = s.attributes.map((a) => (a.id === id ? next : a))
      commit({
        ...s,
        attributes,
        reveal: reconstruction(attributes),
        arrivalTick: side === 'ds' ? s.arrivalTick + 1 : s.arrivalTick,
      })
    },
    [commit],
  )

  /** Letting an attribute go: removed from the self, never received. */
  const discard = useCallback(
    (id: string) => {
      const s = ref.current
      const current = s.attributes.find((a) => a.id === id)
      if (!current || current.side === 'gone' || !s.config.allowDiscard) return

      const next: Attribute = {
        ...current,
        side: 'gone',
        transferredAt: s.sessionMs,
        transferredBy: 'participant',
      }
      writerRef.current?.attribute(next)
      writerRef.current?.event(
        event('attribute_discarded', s.sessionMs, { id, text: next.text, from: current.side }),
      )

      const attributes = s.attributes.map((a) => (a.id === id ? next : a))
      commit({ ...s, attributes, reveal: reconstruction(attributes) })
    },
    [commit],
  )

  const dismissOverlay = useCallback(() => {
    const s = ref.current
    if (!s.overlay) return
    writerRef.current?.event(event('overlay_dismissed', s.sessionMs, { kind: s.overlay.kind }))

    // The two coaching cards are shown back to back the first time the system
    // takes attributes, exactly as the comp sequences them.
    if (s.overlay.kind === 'transferred' && s.config.showCoachOverlays && !coachShownRef.current) {
      coachShownRef.current = true
      writerRef.current?.event(event('overlay_shown', s.sessionMs, { kind: 'coach-drag' }))
      commit({ ...s, overlay: { kind: 'coach-drag' } })
      return
    }
    commit({ ...s, overlay: null })
  }, [commit])

  const finish = useCallback(
    (reason: EndReason) => {
      const s = ref.current
      if (s.phase === 'ended') return
      const t = tally(s.attributes)
      writerRef.current?.event(event('game_end', s.sessionMs, { reason, ...t, reveal: s.reveal }))
      void writerRef.current?.end(reason, s.sessionMs)
      commit({ ...s, phase: 'ended', endReason: reason, overlay: null })
    },
    [commit],
  )

  /* ---------------------------------------------------------------------------
     Clock
     -----------------------------------------------------------------------
     The big timer counts real session time, so the recorded duration is honest.
     Round time is a separate accumulator that holds while a coaching card is up
     — a participant should never lose writing time to an instruction.
     ------------------------------------------------------------------------ */

  useEffect(() => {
    if (state.phase !== 'playing') return

    const tick = (ts: number) => {
      rafRef.current = requestAnimationFrame(tick)

      const last = lastTsRef.current
      lastTsRef.current = ts
      if (last == null) return
      const dt = Math.min(ts - last, 250) // a backgrounded tab must not jump rounds

      const s = ref.current
      if (s.phase !== 'playing') return

      const sessionMs = s.sessionMs + dt
      if (s.overlay || s.writingClosed) {
        commit({ ...s, sessionMs })
        return
      }

      const roundLength = s.config.roundSeconds * 1000
      const roundMs = s.roundMs + dt
      if (roundMs < roundLength) {
        commit({ ...s, sessionMs, roundMs })
        return
      }

      /* --- the round is over -------------------------------------------- */
      const completed = s.roundIndex + 1
      const rng = rngRef.current
      let attributes = s.attributes
      let overlay: Overlay = null
      let arrivalTick = s.arrivalTick

      const due = completed % s.config.transferEveryNRounds === 0
      const takenIds = due ? pickSystemTransfer(rng, attributes, s.config) : []

      if (takenIds.length) {
        const taken = new Set(takenIds)
        const landed: Attribute[] = []
        const occupied = attributes
          .filter((a) => a.side === 'ds')
          .map((a) => ({ x: a.x, y: a.y, w: chipWidth(a.text), h: CHIP_H }))

        attributes = attributes.map((a) => {
          if (!taken.has(a.id)) return a
          const { x, y } = placeChip(rng, 'ds', chipWidth(a.text), occupied)
          occupied.push({ x, y, w: chipWidth(a.text), h: CHIP_H })
          const next: Attribute = {
            ...a,
            side: 'ds',
            x,
            y,
            transferredAt: sessionMs,
            transferredBy: 'system',
          }
          landed.push(next)
          return next
        })

        writerRef.current?.attributes(landed)
        writerRef.current?.event(
          event('system_transfer', sessionMs, {
            round: s.roundIndex,
            ids: takenIds,
            texts: landed.map((a) => a.text),
          }),
        )
        arrivalTick += 1

        if (s.config.showCoachOverlays) {
          overlay = { kind: 'transferred', ids: takenIds }
          writerRef.current?.event(
            event('overlay_shown', sessionMs, { kind: 'transferred', count: takenIds.length }),
          )
        }
      }

      const writingClosed = completed >= s.config.rounds
      const roundIndex = writingClosed ? s.roundIndex : completed
      if (!writingClosed) {
        writerRef.current?.event(event('round_start', sessionMs, { round: roundIndex }))
      }

      commit({
        ...s,
        sessionMs,
        roundMs: 0,
        roundIndex,
        writingClosed,
        attributes,
        overlay,
        arrivalTick,
        reveal: reconstruction(attributes),
      })
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
    }
  }, [state.phase, commit])

  const counters = useMemo(() => tally(state.attributes), [state.attributes])

  return {
    state,
    tally: counters,
    begin,
    start,
    submit,
    moveAttribute,
    setSide,
    discard,
    dismissOverlay,
    finish,
  }
}
