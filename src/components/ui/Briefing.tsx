'use client'

/**
 * Briefing — the operator's account, over the live machine.
 *
 * Shown once the pre-shift sequence has run the line correctly and then broken
 * it in front of the player. The panel is deliberately narrow and offset: the
 * cell is still running behind it with the fault live, and the symptom the text
 * describes is visible over the player's shoulder while they read it.
 *
 * Everything here is scenario data. The account is `ScenarioConfig.briefing`,
 * written in the voice of whoever was standing at the machine when it went
 * wrong, so a new scenario needs no code.
 */

import { useEffect, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useSettingsStore } from '@/stores/settingsStore'
import RIGS from '@/scenarios/rigs.json'

interface RigInfo {
  name: string
  purpose: string
  sequence: string
  panel: string
}

const MONO = '"JetBrains Mono", ui-monospace, monospace'

function mmss(seconds: number): string {
  const t = Math.max(0, Math.round(seconds))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export function Briefing() {
  const phase = useGameStore(s => s.phase)
  const started = useSettingsStore(s => s.started)
  return started && phase === 'briefing' ? <Panel /> : null
}

function Panel() {
  const briefing = useGameStore(s => s.briefing)
  const scenarioId = useGameStore(s => s.scenarioId)
  const timeLimit = useGameStore(s => s.timeLimit)
  // Keyed on the RIG, not the scenario: all five silo jobs run the same machine,
  // so the description of what it is for belongs to the machine and is written
  // once. A missing entry hides the block rather than rendering 'undefined'.
  const activeRig = useGameStore(s => s.activeRig)
  const rig = (RIGS as Record<string, RigInfo | undefined>)[activeRig]
  const setPhase = useGameStore(s => s.setPhase)
  const startTimer = useGameStore(s => s.startTimer)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 60)
    return () => clearTimeout(t)
  }, [])

  const takeShift = () => {
    // Clock starts here and nowhere else. The countdown belongs to the job, not
    // to the time spent reading about it.
    startTimer(timeLimit)
    setPhase('active')
    // Pointer lock needs a user gesture, and this click is one. Requesting it
    // any earlier — on the title screen, say — is what left the player looking
    // around behind an overlay they could not click.
    useSettingsStore.getState().requestPointerLock()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 140,
      display: 'flex', alignItems: 'center',
      // Left-aligned so the machine stays visible on the right of frame
      paddingLeft: 'min(6vw, 5rem)',
      fontFamily: MONO,
      background: 'linear-gradient(90deg, rgba(6,8,11,0.94) 0%, rgba(6,8,11,0.86) 42%, rgba(6,8,11,0) 78%)',
      opacity: shown ? 1 : 0,
      transition: 'opacity 700ms ease',
    }}>
      <div style={{ maxWidth: '540px' }}>
        <div style={{
          fontSize: '0.62rem', letterSpacing: '0.22em', color: '#e63946',
          marginBottom: '0.5rem',
        }}>
          {scenarioId} · CALL-OUT
        </div>

        <div style={{
          fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.04em',
          color: '#e8e4e0', marginBottom: '0.35rem', lineHeight: 1.25,
        }}>
          {rig?.name ?? 'Unknown cell'}
        </div>
        <div style={{
          fontSize: '0.8rem', color: '#8b93a1', marginBottom: '1.6rem',
        }}>
          {rig?.purpose}
        </div>

        {/* How the cell works, what each sensor does and how to read the boards
            all used to sit here, and it made the call-out screen a wall of text
            you skim once and never again. It is reference material, so it lives
            in the manual — [B] — where it can be re-read mid-shift. What stays
            is the one thing that is specific to THIS call: what was witnessed. */}

        <div style={{
          fontSize: '0.6rem', letterSpacing: '0.18em', color: '#8b93a1',
          marginBottom: '0.55rem',
        }}>
          WHAT THE OPERATOR SAW
        </div>
        <div style={{
          fontSize: '0.88rem', lineHeight: 1.72, color: '#c8ccd4',
          borderLeft: '2px solid rgba(230,57,70,0.4)', paddingLeft: '1rem',
          marginBottom: '1.6rem', fontStyle: 'italic',
        }}>
          {briefing || 'No report was left.'}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '1.1rem',
        }}>
          <button onClick={takeShift} style={{
            font: `600 0.78rem/1 ${MONO}`, letterSpacing: '0.12em',
            padding: '0.85rem 1.6rem', borderRadius: '3px', cursor: 'pointer',
            color: '#0a0c10', background: '#e63946', border: '1px solid #e63946',
          }}>
            [ENTER] TAKE THE SHIFT →
          </button>
          <span style={{
            fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.08em',
          }}>
            {mmss(timeLimit)} on the clock · WASD move · E interact · [B] manual · [L] laptop
          </span>
        </div>
      </div>
    </div>
  )
}
