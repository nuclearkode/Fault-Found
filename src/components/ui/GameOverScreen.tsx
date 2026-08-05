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
 *
 * ── The glossary ────────────────────────────────────────────────────────────
 *
 * That authored prose is written by and for someone who already does this work:
 * "the prox never makes, so the seal-in holds and the contactor stays in". To a
 * player who has never seen a PLC, a debrief in that language teaches nothing —
 * it just proves they were never going to get it. So the terms actually present
 * in this scenario's text are matched against a plain-English list and the
 * handful that hit are glossed underneath. It is derived from the text rather
 * than authored per scenario, so it stays correct as scenarios are added and
 * costs an author nothing.
 */

import { useEffect, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useSettingsStore } from '@/stores/settingsStore'

/** Blackout before the debrief resolves. */
const HOLD_MS = 1400
/**
 * How long the debrief stays up before it drops back to the title.
 *
 * Was 14 s, which was under half the time it takes to read the three panels and
 * the glossary — the screen that exists to teach the fault was yanking itself
 * away mid-sentence. [R] and [ENTER] are both live throughout, so a player who
 * has finished reading is never waiting on this.
 */
const RETURN_SECONDS = 40

const MONO = '"JetBrains Mono", ui-monospace, monospace'

/**
 * The jargon this game's scenario text is written in, in plain English.
 *
 * Matched case-insensitively against the debrief prose actually on screen, so
 * nothing is explained that was not said. Order is priority order: the first
 * three hits are shown and the rest are dropped, because a wall of definitions
 * is the same failure as a wall of jargon.
 */
const GLOSSARY: Array<{ re: RegExp; term: string; plain: string }> = [
  {
    re: /\bprox\b|\bproximity\b/i,
    term: 'PROX SENSOR',
    plain: 'A switch with no moving parts that turns on when metal comes near it. Here it is how the machine knows a carton has arrived under the spout.',
  },
  {
    re: /photo-?\s?eye|photocell|through-?beam/i,
    term: 'PHOTO-EYE',
    plain: 'A light-beam sensor. Break or bounce the beam and it switches. Here it is how the machine knows the carton is full.',
  },
  {
    re: /seal-?in|\blatch(ed|es|ing)?\b/i,
    term: 'SEAL-IN',
    plain: 'A rung of the program that holds itself on. One press of START energises it and it keeps itself running until STOP breaks it — which is why you do not have to hold the button down.',
  },
  {
    re: /\bcontactor\b|\bcoil\b|\bMCC\b/i,
    term: 'CONTACTOR',
    plain: 'The heavy power relay that actually switches the motor. The PLC energises a small coil; the coil slams the big contacts together. It can be doing that perfectly while the machine still does not move.',
  },
  {
    re: /lock(ed)?[- ]?out|lock[- ]?off|\bLOTO\b|isolat/i,
    term: 'LOCK-OUT',
    plain: 'Kill the power at the isolator and padlock it OFF before your hands go anywhere that can move. In here: cabinet door, then the main isolator, then the repair.',
  },
  {
    re: /\brung\b|\bladder\b|\bprogram\b/i,
    term: 'RUNG',
    plain: 'One line of the PLC program — conditions on the left, the thing they switch on the right. You can read them live on the laptop with [L].',
  },
  {
    re: /lagging|take-?up|\btension/i,
    term: 'LAGGING & TAKE-UP',
    plain: 'The rubber facing on a conveyor drive roller, and the adjuster that keeps the belt tight against it. Worn smooth or slack, the roller spins and the belt does not go anywhere.',
  },
  {
    re: /normally (open|closed)|\bN\.?O\.?\b|\bN\.?C\.?\b/i,
    term: 'NO / NC',
    plain: 'How a contact sits when nobody is touching it: normally open (dead until pressed) or normally closed (made until pressed). A STOP button wired the wrong way round still looks fine and stops nothing.',
  },
  {
    re: /\bscan\b|\bprocessor\b|\bPLC\b/i,
    term: 'SCAN',
    plain: 'The PLC reads every input, solves the whole program, then writes every output, over and over — twenty times a second here. It does exactly what it was told, every time.',
  },
]

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

  // The cursor comes back on its own.
  //
  // This used to call document.exitPointerLock() here, which is the one thing
  // no component is allowed to do: PointerLockWarden is the sole caller, and it
  // releases on the FOCUS change. A debrief is `outcome === 'lost'`, which
  // focusOf() already maps to 'debrief', and LOCKED.debrief is false — so the
  // warden has released the pointer before this component even mounts.
  //
  // Doing it here as well is not merely redundant: a release the focus model did
  // not initiate is exactly the shape of bug that had restarts landing frozen
  // with no menu and dead controls, because drei reports the unlock a tick later
  // and handleUnlock has to decide whether it was a pause.

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

  const wrong = fault ? sentences(fault.effect, 1) : ''
  const shouldHave = fault ? sentences(fault.solution, 2) : ''
  const tell = fault?.clues[0] ?? ''
  // Only gloss words that are actually on this screen.
  const haystack = `${wrong} ${shouldHave} ${tell}`
  const glossed = GLOSSARY.filter(g => g.re.test(haystack)).slice(0, 3)

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
                <Panel title="What was actually wrong">{wrong}</Panel>
                <Panel title="What you should have done">{shouldHave}</Panel>
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
            {tell && <Panel title="The tell you walked past">{tell}</Panel>}
          </div>
        </div>

        {/* The debrief above is written in the trade's own words. This is the
            same debrief for someone who has never been near a control panel. */}
        {glossed.length > 0 && (
          <div style={{
            marginTop: '0.6rem',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            paddingTop: '1rem',
          }}>
            <div style={{
              fontSize: '0.62rem', letterSpacing: '0.18em',
              textTransform: 'uppercase', color: '#8b93a1',
              marginBottom: '0.7rem',
            }}>In plain English</div>
            <div style={{
              display: 'grid', gap: '0.8rem 1.6rem',
              gridTemplateColumns: 'repeat(auto-fit, minmax(17rem, 1fr))',
            }}>
              {glossed.map(g => (
                <div key={g.term}>
                  <div style={{
                    fontSize: '0.68rem', letterSpacing: '0.1em',
                    color: '#e8e4e0', marginBottom: '0.22rem',
                  }}>{g.term}</div>
                  <div style={{
                    fontSize: '0.74rem', lineHeight: 1.6, color: '#8b93a1',
                  }}>{g.plain}</div>
                </div>
              ))}
            </div>
          </div>
        )}

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
