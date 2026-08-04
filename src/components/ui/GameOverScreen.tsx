'use client'

/**
 * GameOverScreen — the debrief after the supervisor catches you.
 *
 * Two jobs, in order: land the scare, then teach the fault. The blackout holds
 * for a beat before any text appears, because a debrief that fades up instantly
 * reads as a menu rather than a consequence.
 *
 * The content is not written here. `Fault.effect`, `Fault.clues` and
 * `Fault.solution` are already authored per scenario in the JSON and until now
 * nothing rendered them — so the answer to "what did I miss" is data, and every
 * new scenario gets its own debrief for free.
 */

import { useEffect, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useSettingsStore } from '@/stores/settingsStore'

/** Blackout before the debrief resolves. */
const HOLD_MS = 1400
/** How long the debrief stays up before it drops back to the title. */
const RETURN_SECONDS = 14

const MONO = '"JetBrains Mono", ui-monospace, monospace'

/**
 * First `n` sentences of a block of authored prose.
 *
 * The scenario text is written at reference length — the full `effect` for S02
 * runs to three sentences of PLC reasoning. That belongs in a manual, not on a
 * screen someone reads for ten seconds with their heart going. One sentence on
 * what broke and two on what to do about it is the whole debrief.
 */
function sentences(text: string, n: number): string {
  const parts = text.match(/[^.!?]+[.!?]+(\s|$)/g)
  if (!parts) return text
  return parts.slice(0, n).join('').trim()
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.15rem' }}>
      <div style={{
        fontSize: '0.62rem', letterSpacing: '0.18em', textTransform: 'uppercase',
        color: '#e63946', marginBottom: '0.4rem',
        borderBottom: '1px solid rgba(230,57,70,0.22)', paddingBottom: '0.28rem',
      }}>{title}</div>
      <div style={{ fontSize: '0.82rem', lineHeight: 1.62, color: '#c8ccd4' }}>
        {children}
      </div>
    </div>
  )
}

/**
 * Mounts only while the run is lost, which is what keeps the timers honest:
 * every piece of state below starts fresh because the component is new, so
 * nothing has to be reset on the way in or out.
 */
export function GameOverScreen() {
  const lost = useGameStore(s => s.outcome === 'lost')
  return lost ? <Debrief /> : null
}

function Debrief() {
  const failReason = useGameStore(s => s.failReason)
  const failShot = useGameStore(s => s.failShot)
  const faults = useGameStore(s => s.faults)
  const resetRun = useGameStore(s => s.resetRun)
  const setStarted = useSettingsStore(s => s.setStarted)

  const [revealed, setRevealed] = useState(false)
  const [left, setLeft] = useState(RETURN_SECONDS)

  // Hold on black, then bring the debrief up
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), HOLD_MS)
    return () => clearTimeout(t)
  }, [])

  // Release the mouse — the run is over and the player needs the cursor back
  useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock()
  }, [])

  // Count down to the title screen. Cleared on unmount so a stray timer can't
  // yank the player out of the next run.
  useEffect(() => {
    if (!revealed) return
    const id = setInterval(() => setLeft((n) => n - 1), 1000)
    return () => clearInterval(id)
  }, [revealed])

  useEffect(() => {
    if (left > 0) return
    setStarted(false)   // brings the title overlay back
    resetRun()          // wipes the run and bumps runNonce, reloading the job
  }, [left, setStarted, resetRun])

  // The fault they were sent to find. Still active is the normal case — if it
  // weren't, they'd have won — but read the active one first regardless.
  const fault = faults.find(f => f.active) ?? faults[0]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: MONO, padding: '2rem',
      opacity: revealed ? 1 : 0,
      transition: 'opacity 900ms ease',
      pointerEvents: revealed ? 'auto' : 'none',
      overflowY: 'auto',
    }}>
      <div style={{ maxWidth: '980px', width: '100%' }}>
        <div style={{
          fontSize: '2.6rem', fontWeight: 700, letterSpacing: '0.14em',
          marginBottom: '0.35rem',
        }}>
          <span style={{ color: '#e8e4e0' }}>GAME</span>
          <span style={{ color: '#e63946' }}>{'//'}</span>
          <span style={{ color: '#e8e4e0' }}>OVER</span>
        </div>
        <div style={{
          fontSize: '0.9rem', color: '#e63946', letterSpacing: '0.05em',
          marginBottom: '1.9rem',
        }}>
          {failReason ?? 'The line never restarted.'}
        </div>

        <div style={{
          display: 'grid', gap: '1.8rem',
          gridTemplateColumns: failShot ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
          alignItems: 'start',
        }}>
          <div>
            {fault && (
              <>
                <Panel title="What was actually wrong">
                  {sentences(fault.effect, 1)}
                </Panel>
                <Panel title="What you should have done">
                  {sentences(fault.solution, 2)}
                </Panel>
              </>
            )}
          </div>

          <div>
            {failShot && (
              <>
                <div style={{
                  fontSize: '0.62rem', letterSpacing: '0.18em',
                  textTransform: 'uppercase', color: '#e63946',
                  marginBottom: '0.4rem',
                  borderBottom: '1px solid rgba(230,57,70,0.22)',
                  paddingBottom: '0.28rem',
                }}>The repair you never made</div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={failShot}
                  alt="The equipment that needed the repair"
                  style={{
                    width: '100%', display: 'block', marginBottom: '1.15rem',
                    border: '1px solid rgba(255,255,255,0.14)', borderRadius: '2px',
                  }}
                />
              </>
            )}
            {/* One clue, not the list. The full set is a study aid; on a loss
                screen it turns the point into a paragraph nobody finishes. */}
            {fault && fault.clues.length > 0 && (
              <Panel title="The tell you walked past">{fault.clues[0]}</Panel>
            )}
          </div>
        </div>

        <div style={{
          marginTop: '1.6rem', fontSize: '0.7rem', letterSpacing: '0.12em',
          color: 'rgba(255,255,255,0.35)',
        }}>
          [R] RETRY THIS JOB · [ENTER] MAIN MENU · RETURNING IN {Math.max(0, left)}s
        </div>
      </div>
    </div>
  )
}
