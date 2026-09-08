'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { Stage } from './Stage'
import { Twin } from './Twin'
import { AttributeTable } from './AttributeTable'
import { ChipLayer } from './ChipLayer'
import { InputBar } from './InputBar'
import { CoachModal, EndCard, NameGate } from './Overlays'
import { Settings } from './Settings'
import { useGame } from '@/game/useGame'
import { DEFAULT_CONFIG, configFromSearch, type GameConfig } from '@/lib/config'
import {
  ARROW,
  BRIDGE,
  BRIDGE_KNOCKOUT,
  CODE,
  DIM_TAG,
  DS,
  PIPS,
  PROMPT,
  SPINE,
  START,
  TIMER,
  TITLE,
  VERDICT_ACCEPT,
  VERDICT_REJECT,
  YS,
  centerX,
} from '@/game/layout'

function clock(ms: number): string {
  const total = Math.floor(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function Experience() {
  const game = useGame()
  const { state } = game
  const scaleRef = useRef(1)
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG)

  // The facilitator can pre-set a run from the URL, e.g. /?seconds=45&rounds=6.
  useEffect(() => {
    setConfig(configFromSearch(window.location.search))
  }, [])

  const playing = state.phase === 'playing' || state.phase === 'ended'
  const ready = state.phase === 'ready'

  const titleRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<HTMLDivElement>(null)
  const startRef = useRef<HTMLButtonElement>(null)
  const promptRef = useRef<HTMLDivElement>(null)
  const dimRef = useRef<HTMLDivElement>(null)

  const round = state.rounds[Math.min(state.roundIndex, Math.max(0, state.rounds.length - 1))]

  /* --- ready screen entrance --------------------------------------------- */
  useEffect(() => {
    if (!ready) return
    const targets = [codeRef.current, titleRef.current, startRef.current].filter(Boolean)
    if (!targets.length) return
    const ctx = gsap.context(() => {
      gsap
        .timeline()
        .fromTo(codeRef.current, { y: -22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }, 0)
        .fromTo(titleRef.current, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out' }, 0.08)
        .fromTo(
          startRef.current,
          { scale: 0.8, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.7, ease: 'back.out(2)' },
          0.4,
        )
    })
    return () => ctx.revert()
  }, [ready])

  /* --- ready -> playing ---------------------------------------------------
     The heading and START stay mounted and fade out, rather than being pulled
     from the tree mid-tween. */
  useEffect(() => {
    if (state.phase !== 'playing') return
    const targets = [titleRef.current, startRef.current].filter(Boolean)
    if (!targets.length) return
    gsap.to(targets, {
      opacity: 0,
      y: -26,
      duration: 0.5,
      ease: 'power2.in',
      stagger: 0.05,
      pointerEvents: 'none',
    })
  }, [state.phase])

  /* --- a new prompt arrives ---------------------------------------------- */
  useEffect(() => {
    if (state.phase !== 'playing') return
    const targets = [dimRef.current, promptRef.current].filter(Boolean)
    if (!targets.length) return
    gsap.fromTo(
      targets,
      { y: 18, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.06, overwrite: true },
    )
  }, [state.roundIndex, state.phase])

  // The two endings are the only irreversible action on the canvas, so they are
  // inert — to the pointer and to the keyboard — until a session is actually
  // running and no instruction card is holding it.
  const verdictsLive = state.phase === 'playing' && !state.overlay

  const roundProgress = state.config.roundSeconds
    ? Math.min(1, state.roundMs / (state.config.roundSeconds * 1000))
    : 0

  const transferredChips = useMemo(() => {
    if (state.overlay?.kind !== 'transferred') return []
    const ids = new Set(state.overlay.ids)
    return state.attributes.filter((a) => ids.has(a.id))
  }, [state.overlay, state.attributes])

  const promptText = state.writingClosed
    ? 'the canvas is yours: move what is left, then decide'
    : (round?.prompt ?? '')

  const hint = state.writingClosed ? '' : (round?.dimension.hint ?? '')

  return (
    <Stage scaleRef={scaleRef}>
      {/* ---- the spine and the bridge between the two selves --------------- */}
      <div
        className="abs spine"
        style={{ left: SPINE.x, top: SPINE.y, width: 2, height: SPINE.h }}
      />
      <div
        className="abs bridge-knockout"
        style={{
          left: BRIDGE_KNOCKOUT.x,
          top: BRIDGE_KNOCKOUT.y,
          width: BRIDGE_KNOCKOUT.w,
          height: BRIDGE_KNOCKOUT.h,
        }}
      />
      <svg
        className="abs"
        style={{ left: ARROW.x, top: ARROW.y - 8, width: ARROW.w, height: 16 }}
        viewBox={`0 0 ${ARROW.w} 16`}
        aria-hidden
      >
        <path
          d={`M0 8 H${ARROW.w - 2}`}
          stroke="#000"
          strokeWidth="2"
        />
        <path
          d={`M${ARROW.w - 12} 3 L${ARROW.w - 1} 8 L${ARROW.w - 12} 13`}
          stroke="#000"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div
        className="abs t-bridge"
        style={{ left: BRIDGE.x, top: BRIDGE.y, width: BRIDGE.w }}
      >
        {'constructed \nafter a year'}
      </div>

      {/* ---- the two selves ------------------------------------------------ */}
      <Twin reveal={state.reveal} arrivalTick={state.arrivalTick} active={playing} />

      <div
        className="abs t-selflabel"
        style={{ left: YS.label.x, top: YS.label.y, width: YS.label.w, color: 'var(--ink)' }}
      >
        {'your self \n(YS)'}
      </div>
      <div
        className="abs t-selflabel"
        style={{
          left: DS.label.x,
          top: DS.label.y,
          width: DS.label.w,
          color: 'var(--accent-light)',
        }}
      >
        {'digital self \n(DS)'}
      </div>

      {/* ---- ready screen -------------------------------------------------- */}
      {state.session && (
        <div
          ref={codeRef}
          className="abs t-code"
          style={{
            left: playing ? 120 : centerX(CODE.w),
            top: playing ? 96 : CODE.y,
            width: CODE.w,
            textAlign: playing ? 'left' : 'center',
            fontSize: playing ? 40 : 64,
            opacity: playing ? 0.5 : 1,
          }}
        >
          #{state.session.code}
        </div>
      )}

      {state.phase !== 'ended' && (
        <div
          ref={titleRef}
          className="abs t-title"
          style={{ left: centerX(TITLE.w), top: TITLE.y, width: TITLE.w }}
        >
          {'Construct your\ndigital twin!'}
        </div>
      )}

      {state.phase !== 'ended' && (
        <button
          ref={startRef}
          className="abs pill pill-start glass"
          style={{
            left: START.x,
            top: START.y,
            width: START.w,
            height: START.h,
            opacity: ready ? 1 : 0,
            pointerEvents: ready ? 'auto' : 'none',
          }}
          onClick={game.start}
          type="button"
          tabIndex={ready ? 0 : -1}
        >
          START
        </button>
      )}

      {/* ---- attribute table ---------------------------------------------- */}
      <AttributeTable tally={game.tally} visible={playing} />

      {/* ---- timer --------------------------------------------------------- */}
      {(ready || playing) && (
        <div
          className="abs t-timer"
          style={{ left: centerX(TIMER.w), top: TIMER.y, width: TIMER.w }}
          aria-label="session time"
        >
          {clock(state.sessionMs)}
        </div>
      )}

      {/* ---- round pips ---------------------------------------------------- */}
      {playing && state.rounds.length > 1 && (
        <div
          className="abs"
          style={{
            left: centerX(PIPS.w),
            top: PIPS.y,
            width: PIPS.w,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <div className="round-pips" aria-hidden>
            {state.rounds.map((_, i) => (
              <i
                key={i}
                data-on={i <= state.roundIndex}
                data-now={i === state.roundIndex && !state.writingClosed}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---- verdicts ------------------------------------------------------ */}
      <button
        className="abs verdict verdict-reject"
        data-live={verdictsLive}
        disabled={!verdictsLive}
        style={{
          left: VERDICT_REJECT.x,
          top: VERDICT_REJECT.y,
          width: VERDICT_REJECT.w,
          height: VERDICT_REJECT.h,
        }}
        onClick={() => game.finish('rejected')}
        type="button"
      >
        I don&rsquo;t feel like myself anymore
      </button>
      <button
        className="abs verdict verdict-accept"
        data-live={verdictsLive}
        disabled={!verdictsLive}
        style={{
          left: VERDICT_ACCEPT.x,
          top: VERDICT_ACCEPT.y,
          width: VERDICT_ACCEPT.w,
          height: VERDICT_ACCEPT.h,
        }}
        onClick={() => game.finish('accepted')}
        type="button"
      >
        yes my DS is me!
      </button>

      {/* ---- prompt and input ---------------------------------------------- */}
      {playing && (
        <>
          {!state.writingClosed && round && (
            <div
              ref={dimRef}
              className="abs dimension-tag"
              style={{ left: centerX(DIM_TAG.w), top: DIM_TAG.y, width: DIM_TAG.w }}
            >
              {round.dimension.label}
            </div>
          )}
          <div
            ref={promptRef}
            className="abs t-prompt"
            style={{ left: centerX(PROMPT.w), top: PROMPT.y, width: PROMPT.w }}
          >
            {promptText}
            {hint && (
              <>
                <br />
                {hint}
              </>
            )}
          </div>
          <InputBar
            disabled={state.phase !== 'playing' || state.writingClosed || !!state.overlay}
            onSubmit={game.submit}
            roundProgress={roundProgress}
          />
        </>
      )}

      {/* ---- chips ---------------------------------------------------------- */}
      {playing && (
        <ChipLayer
          attributes={state.attributes}
          allowDiscard={state.config.allowDiscard && state.phase === 'playing'}
          interactive={state.phase === 'playing' && !state.overlay}
          onMove={game.moveAttribute}
          onSetSide={(id, side) => game.setSide(id, side, 'participant')}
          onDiscard={game.discard}
        />
      )}

      {/* ---- overlays -------------------------------------------------------- */}
      {state.phase === 'name' && (
        <NameGate
          onSubmit={(name) => void game.begin(name, config)}
          busy={state.busy}
          error={state.error}
        />
      )}

      {state.overlay && (
        <CoachModal
          key={state.overlay.kind}
          kind={state.overlay.kind}
          chips={transferredChips}
          onDismiss={game.dismissOverlay}
        />
      )}

      {state.phase === 'ended' && state.endReason && state.session && (
        <EndCard
          reason={state.endReason}
          tally={game.tally}
          code={state.session.code}
          durationMs={state.sessionMs}
          onRestart={() => window.location.reload()}
        />
      )}

      {/* ---- facilitator ------------------------------------------------------ */}
      {state.phase !== 'ended' && (
        <Settings
          config={config}
          onChange={setConfig}
          locked={state.phase !== 'name'}
        />
      )}
    </Stage>
  )
}
