'use client'

/**
 * Briefing — the operator's account, over the live machine.
 *
 * Shown once the pre-shift sequence has run the line correctly and then broken
 * it in front of the player. The panel is deliberately narrow and offset: the
 * cell is still running behind it with the fault live, and the symptom the text
 * describes is visible over the player's shoulder while they read it.
 *
 * Most of it is scenario data. The account is `ScenarioConfig.briefing`, written
 * in the voice of whoever was standing at the machine when it went wrong, so a
 * new scenario needs no code.
 *
 * ── Why the job statement and the controls are hard-coded here ───────────────
 *
 * This is the last screen before the pointer is captured and the player is alone
 * in a warehouse, and it is the only one they are guaranteed to read. Playtested
 * cold, the two things a stranger did not know were (a) that they are the
 * maintenance technician and the goal is to FIND AND REPAIR a fault rather than
 * to operate the machine, and (b) that anything exists beyond WASD — the old
 * hint listed four bindings and two of them were wrong by then.
 *
 * Both are true of every scenario, which is exactly why they belong in the
 * component rather than in the JSON: a per-scenario copy of them is five copies
 * to keep honest. What is specific to THIS call stays data.
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

const DIM = '#8b93a1'
const INK = '#c8ccd4'
const BRIGHT = '#e8e4e0'
const RED = '#e63946'

function mmss(seconds: number): string {
  const t = Math.max(0, Math.round(seconds))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export function Briefing() {
  const phase = useGameStore(s => s.phase)
  const started = useSettingsStore(s => s.started)
  return started && phase === 'briefing' ? <Panel /> : null
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.58rem', letterSpacing: '0.18em', color: DIM,
      marginBottom: '0.45rem',
    }}>{children}</div>
  )
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
      // `alignItems: center` was the bug the overflowY below was added to fix
      // and could not: a centred flex item taller than its container overflows
      // in BOTH directions, and the top overflow is unreachable — you cannot
      // scroll up past a flex container's start edge. On a 720p laptop that
      // silently ate the TAKE THE SHIFT button. `auto` margins centre it while
      // it fits and collapse to a normal top-aligned scroll when it does not.
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
      // Left-aligned so the machine stays visible on the right of frame
      paddingLeft: 'min(6vw, 5rem)',
      paddingRight: '1rem',
      // The panel grew when the job statement and the real key list went in, and
      // a 720p laptop is a machine somebody will open this link on. Scroll rather
      // than crop the TAKE THE SHIFT button off the bottom of the screen.
      paddingTop: '2vh', paddingBottom: '2vh',
      overflowY: 'auto',
      fontFamily: MONO,
      background: 'linear-gradient(90deg, rgba(6,8,11,0.94) 0%, rgba(6,8,11,0.88) 46%, rgba(6,8,11,0) 82%)',
      opacity: shown ? 1 : 0,
      transition: 'opacity 700ms ease',
    }}>
      <div style={{ maxWidth: '560px', width: '100%', marginTop: 'auto', marginBottom: 'auto' }}>
        <div style={{
          fontSize: '0.62rem', letterSpacing: '0.22em', color: RED,
          marginBottom: '0.5rem',
        }}>
          {scenarioId} · CALL-OUT · MAINTENANCE
        </div>

        <div style={{
          fontSize: '1.45rem', fontWeight: 700, letterSpacing: '0.04em',
          color: BRIGHT, marginBottom: '0.3rem', lineHeight: 1.25,
        }}>
          {rig?.name ?? 'Unknown cell'}
        </div>
        <div style={{
          fontSize: '0.78rem', color: DIM, marginBottom: '1.3rem',
        }}>
          {rig?.purpose}
        </div>

        {/* How the cell works, what each sensor does and how to read the boards
            all used to sit here, and it made the call-out screen a wall of text
            you skim once and never again. It is reference material, so it lives
            in the manual — [B] — where it can be re-read mid-shift. What stays
            is the one thing that is specific to THIS call: what was witnessed. */}

        <Label>WHAT THE OPERATOR SAW</Label>
        <div style={{
          fontSize: '0.84rem', lineHeight: 1.7, color: INK,
          borderLeft: `2px solid ${'rgba(230,57,70,0.4)'}`, paddingLeft: '1rem',
          marginBottom: '1.3rem', fontStyle: 'italic',
        }}>
          {briefing || 'No report was left.'}
        </div>

        {/* The thing a stranger did not know. Stated flatly, once. */}
        <Label>YOUR JOB</Label>
        <div style={{
          fontSize: '0.82rem', lineHeight: 1.7, color: INK,
          marginBottom: '1.3rem',
        }}>
          You are the maintenance technician, not the operator.{' '}
          <span style={{ color: BRIGHT }}>
            Something on this cell has failed. Work out what, repair it, and have
            the line running again before the shift clock reaches zero.
          </span>{' '}
          The fault may be in the program, in the wiring, or in the ironwork —
          part of the job is telling which. Pressing START at it will not fix it.
        </div>

        {/* Lock-off is the one procedure the game will physically refuse you for
            skipping, so it is the one procedure that gets stated up front. */}
        <div style={{
          border: '1px solid rgba(230,57,70,0.28)',
          background: 'rgba(230,57,70,0.05)',
          borderRadius: '3px', padding: '0.75rem 0.9rem',
          marginBottom: '1.4rem',
        }}>
          <Label>BEFORE YOUR HANDS GO INSIDE THE GUARD</Label>
          <div style={{ fontSize: '0.78rem', lineHeight: 1.75, color: INK }}>
            Lock off first, or the repair will be refused:{' '}
            <span style={{ color: BRIGHT }}>
              open the CABINET DOOR, throw the MAIN ISOLATOR
            </span>{' '}
            until it reads LOCKED OFF, then work. Unlock it again to prove the
            line runs.
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '1.1rem',
          flexWrap: 'wrap', marginBottom: '1rem',
        }}>
          <button onClick={takeShift} style={{
            font: `600 0.78rem/1 ${MONO}`, letterSpacing: '0.12em',
            padding: '0.85rem 1.6rem', borderRadius: '3px', cursor: 'pointer',
            color: '#0a0c10', background: RED, border: `1px solid ${RED}`,
          }}>
            [ENTER] TAKE THE SHIFT →
          </button>
          <span style={{
            fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)',
            letterSpacing: '0.06em',
          }}>
            {mmss(timeLimit)} on the clock — it starts when you do
          </span>
        </div>

        {/* The real key map, from src/input/keymap.ts. The title screen's four-key
            hint predated the laptop, the manual and the zoom, and a control the
            player never learns about may as well not be bound. */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.85rem',
          display: 'grid', gap: '0.3rem 1.4rem',
          gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))',
          fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5,
        }}>
          <div><span style={{ color: BRIGHT }}>WASD</span> walk · <span style={{ color: BRIGHT }}>MOUSE</span> look</div>
          <div><span style={{ color: BRIGHT }}>[E]</span> use whatever the crosshair names</div>
          <div><span style={{ color: BRIGHT }}>[L]</span> laptop — the live ladder program</div>
          <div><span style={{ color: BRIGHT }}>[B]</span> manual — how this cell works</div>
          <div><span style={{ color: BRIGHT }}>HOLD RIGHT-MOUSE</span> zoom in on a detail</div>
          <div><span style={{ color: BRIGHT }}>[ESC]</span> pause and settings</div>
        </div>
      </div>
    </div>
  )
}
