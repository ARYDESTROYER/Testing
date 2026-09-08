'use client'

import { useState } from 'react'
import { sanitizeConfig, type GameConfig } from '@/lib/config'

/**
 * Facilitator controls. Deliberately quiet — a nearly invisible gear in the
 * corner — because the participant should never be reading it. The values a
 * session ran with are written into its row, so a run can always be
 * reconstructed from the data.
 */
export function Settings({
  config,
  onChange,
  locked,
}: {
  config: GameConfig
  onChange: (next: GameConfig) => void
  /** True once the config has been fixed for this participant. */
  locked: boolean
}) {
  const [open, setOpen] = useState(false)

  // Everything goes through the same clamp the server applies, so the canvas
  // can never run a config different from the one stored beside it.
  const num = (key: keyof GameConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    if (Number.isFinite(v)) onChange(sanitizeConfig({ ...config, [key]: v }))
  }
  const bool = (key: keyof GameConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange(sanitizeConfig({ ...config, [key]: e.target.checked }))

  const total = config.rounds * config.roundSeconds

  return (
    <>
      <button
        className="settings-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-label="Session settings"
        aria-expanded={open}
        type="button"
      >
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path
            d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      </button>

      {open && (
        <div className="settings-panel">
          <h2>Session settings</h2>

          <div className="settings-row">
            <label htmlFor="roundSeconds">seconds per prompt</label>
            <input
              id="roundSeconds"
              type="number"
              min={5}
              max={600}
              value={config.roundSeconds}
              disabled={locked}
              onChange={num('roundSeconds')}
            />
          </div>

          <div className="settings-row">
            <label htmlFor="rounds">number of prompts</label>
            <input
              id="rounds"
              type="number"
              min={1}
              max={40}
              value={config.rounds}
              disabled={locked}
              onChange={num('rounds')}
            />
          </div>

          <div className="settings-row">
            <label htmlFor="tmin">attributes taken per round</label>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <input
                id="tmin"
                type="number"
                min={0}
                max={40}
                value={config.transferPerRoundMin}
                disabled={locked}
                onChange={num('transferPerRoundMin')}
              />
              <span style={{ opacity: 0.5 }}>to</span>
              <input
                type="number"
                min={0}
                max={40}
                value={config.transferPerRoundMax}
                disabled={locked}
                onChange={num('transferPerRoundMax')}
                aria-label="maximum attributes taken per round"
              />
            </span>
          </div>

          <div className="settings-row">
            <label htmlFor="every">take every N rounds</label>
            <input
              id="every"
              type="number"
              min={1}
              max={10}
              value={config.transferEveryNRounds}
              disabled={locked}
              onChange={num('transferEveryNRounds')}
            />
          </div>

          <div className="settings-row">
            <label htmlFor="shuffle">shuffle the dimensions</label>
            <input
              id="shuffle"
              type="checkbox"
              checked={config.shuffleDimensions}
              disabled={locked}
              onChange={bool('shuffleDimensions')}
            />
          </div>

          <div className="settings-row">
            <label htmlFor="discard">allow letting attributes go</label>
            <input
              id="discard"
              type="checkbox"
              checked={config.allowDiscard}
              disabled={locked}
              onChange={bool('allowDiscard')}
            />
          </div>

          <div className="settings-row">
            <label htmlFor="coach">show the instruction cards</label>
            <input
              id="coach"
              type="checkbox"
              checked={config.showCoachOverlays}
              disabled={locked}
              onChange={bool('showCoachOverlays')}
            />
          </div>

          <div className="settings-note">
            {locked
              ? 'This participant\u2019s settings are already fixed. Changes here apply to the next one, from the name screen.'
              : `Writing runs for ${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s. The canvas stays live afterwards until the participant decides.`}
          </div>
          <div className="settings-note">
            <a href="/data" style={{ color: 'var(--accent)' }}>
              open the data dashboard →
            </a>
          </div>
        </div>
      )}
    </>
  )
}
