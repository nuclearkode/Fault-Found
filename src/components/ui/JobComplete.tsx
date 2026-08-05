'use client'

/**
 * JobComplete — the banner that says you fixed it.
 *
 * Winning used to be silent: the countdown stopped, the belt started moving, and
 * nothing told you that was the end of the job. This is deliberately a banner
 * rather than a full-screen debrief — the run is over but the world is still
 * live and walkable, and covering it would throw away the one bit of feedback
 * that actually reads, which is the line running again behind the text.
 *
 * It does carry one line of the debrief. A player who fixed the fault by
 * following the crosshair prompts can very reasonably not know WHAT they just
 * repaired, and the loss screen is the only place the game ever said. Naming it
 * on the win costs a line and is the difference between "it worked" and "I
 * understand why it worked" — which is the entire point of the game.
 *
 * Sits at the top so it doesn't fight the crosshair.
 */

import { useEffect, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { nextScenarioId, SCENARIO_ORDER } from '@/hooks/useScenarioLoader'
import { startJob } from '@/input/keymap'
import { success } from '@/audio/foley'

const MONO = '"JetBrains Mono", ui-monospace, monospace'

function mmss(seconds: number): string {
  const t = Math.max(0, Math.round(seconds))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** First sentence of authored prose — the rest is reference length. */
function firstSentence(text: string): string {
  const m = text.match(/[^.!?]+[.!?]+(\s|$)/)
  return (m ? m[0] : text).trim()
}

/** Mounts only on a win, so its entrance animation and its chime fire once. */
export function JobComplete() {
  const won = useGameStore(s => s.outcome === 'won')
  return won ? <Banner /> : null
}

function Banner() {
  const elapsed = useGameStore(s => s.elapsedTime)
  const scenarioId = useGameStore(s => s.scenarioId)
  // Safe to subscribe: `faults` is replaced by the loader and by clearFault, not
  // per frame. The job's fault is inactive by now — that is what winning means —
  // so take the first authored one rather than looking for an active one.
  const faults = useGameStore(s => s.faults)
  const [shown, setShown] = useState(false)

  // At the end of the list the button wraps to the first job rather than
  // greying out. A dead "NEXT" on the last scenario is a worse answer than
  // sending the player round again, and the label stays honest about which
  // one it is.
  const next = nextScenarioId(scenarioId)
  const target = next ?? SCENARIO_ORDER[0]
  const wrapped = next === null

  const fixed = faults[0] ? firstSentence(faults[0].effect) : ''

  useEffect(() => {
    success()
    const t = setTimeout(() => setShown(true), 40)
    return () => clearTimeout(t)
  }, [])

  // The same function the [N] and [R] keys call — see src/input/keymap.ts. The
  // buttons remain for the states where the cursor is free, but the keys are the
  // real interface: for most of a run the pointer is locked to the camera and a
  // button on screen simply cannot be reached.
  const go = startJob

  return (
    <div style={{
      position: 'fixed', top: 0, left: '50%',
      transform: `translate(-50%, ${shown ? '0' : '-120%'})`,
      transition: 'transform 420ms cubic-bezier(0.2, 0.9, 0.3, 1)',
      zIndex: 150, fontFamily: MONO,
      background: 'rgba(10, 12, 16, 0.94)',
      border: '1px solid rgba(74, 222, 128, 0.35)',
      borderTop: 'none',
      borderRadius: '0 0 6px 6px',
      padding: '0.85rem 1.4rem',
      maxWidth: 'min(46rem, 94vw)',
      boxShadow: '0 6px 28px rgba(0, 0, 0, 0.6)',
      pointerEvents: 'auto',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1.4rem',
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontSize: '1.05rem', fontWeight: 700, letterSpacing: '0.14em',
            color: '#4ade80',
          }}>
            FAULT CLEARED
          </div>
          <div style={{
            fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)',
            letterSpacing: '0.06em', marginTop: '0.2rem',
          }}>
            {scenarioId} · line running · {mmss(elapsed)} on the job
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
          <button onClick={() => go(target)} style={btn(true)}>
            [N] {wrapped ? `FIRST JOB · ${target}` : `NEXT JOB · ${target}`} →
          </button>
          {scenarioId && (
            <button onClick={() => go(scenarioId)} style={btn(false)}>
              [R] RETRY
            </button>
          )}
        </div>
      </div>

      {fixed && (
        <div style={{
          marginTop: '0.7rem', paddingTop: '0.6rem',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          fontSize: '0.72rem', lineHeight: 1.6, color: '#c8ccd4',
        }}>
          <span style={{
            color: 'rgba(74,222,128,0.85)', letterSpacing: '0.12em',
            fontSize: '0.6rem',
          }}>WHAT WAS WRONG&nbsp;&nbsp;</span>
          {fixed}
        </div>
      )}
    </div>
  )
}

function btn(primary: boolean): React.CSSProperties {
  return {
    font: `600 0.72rem/1 ${MONO}`,
    letterSpacing: '0.1em',
    padding: '0.6rem 1rem',
    borderRadius: '3px',
    cursor: 'pointer',
    color: primary ? '#0a0c10' : '#c8ccd4',
    background: primary ? '#4ade80' : 'transparent',
    border: primary ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.2)',
  }
}
