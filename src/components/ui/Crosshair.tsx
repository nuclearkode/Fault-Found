'use client'

/**
 * Crosshair — the whole in-world affordance layer.
 *
 * Three jobs, in order of how badly they were missing:
 *
 *  1. Say what you are aiming at. `hoveredInteractable` was write-only until
 *     this rendered it.
 *
 *  2. Say when a thing is aimed at but REFUSED. SiloCell already writes a label
 *     without a `[E]` on it for a control the player may not use yet — the drive
 *     roller with the cell still live reads "DRIVE ROLLER — ISOLATE FIRST". That
 *     distinction was invisible: it was drawn in the same warm orange as an
 *     actionable control, so it read as "press E here". Blocked targets are now
 *     red, and they carry the procedure that unblocks them, which is what makes
 *     lock-off discoverable by looking at the machine instead of by reading the
 *     manual.
 *
 *  3. Say when a press was refused. This is the newcomer-killer. Pressing [E] on
 *     a live drive did nothing on screen at all — the refusal existed only as a
 *     console.warn — so a player who does not know PLC work tries the repair
 *     first, sees silence, and concludes the game is broken.
 *
 *     The refusal is detected here rather than announced from the cell, because
 *     the cell already records it: `penaltyRecord.skipLOTO` is incremented by
 *     that one call site and by nothing else in the codebase, so an increase in
 *     it IS "the player just reached into a live machine". Watching the store
 *     costs no change to SiloCell and cannot drift from it.
 */

import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useUiFocus } from '@/stores/worldClock'

/** Interactable: warmer, brighter, slightly larger, with the target's name. */
const HOT = 'rgba(255, 168, 76, 0.95)'
const COLD = 'rgba(255, 255, 255, 0.6)'
/** Aimed at, understood, and not allowed yet. */
const BLOCKED = 'rgba(255, 92, 92, 0.95)'

/** How long the refusal stays on screen. Long enough to read twice. */
const REFUSAL_MS = 4200

/**
 * SiloCell marks an actionable target by putting `[E]` in its label. A label
 * without one is a target that is understood and refused — there is exactly one
 * today (the drive roller before lock-off) and any future one gets this
 * treatment for free.
 */
function isBlocked(label: string): boolean {
  return !label.includes('[E]')
}

export function Crosshair() {
  // The crosshair belongs to the locked world view and nowhere else — it is
  // meaningless over the laptop, the manual, a menu or the debrief.
  const focus = useUiFocus()
  const hovered = useGameStore(s => s.hoveredInteractable)
  // The one signal in the store that means "a repair was refused as unsafe".
  const skips = useGameStore(s => s.penaltyRecord.skipLOTO)

  const [refusal, setRefusal] = useState(false)
  // Compared rather than merely watched: resetRun() zeroes the penalty record,
  // so a NEW job would otherwise fire the warning it just cleared.
  const prevSkips = useRef(skips)

  useEffect(() => {
    const rose = skips > prevSkips.current
    prevSkips.current = skips
    if (!rose) return
    setRefusal(true)
    const t = setTimeout(() => setRefusal(false), REFUSAL_MS)
    return () => clearTimeout(t)
  }, [skips])

  if (focus !== 'world') return null

  const active = hovered !== null
  const blocked = active && isBlocked(hovered)
  const arm = active ? 26 : 20
  const colour = blocked ? BLOCKED : active ? HOT : COLD

  return (
    <>
      {refusal && (
        <>
          <style>{
            '@keyframes ff-refuse{0%{opacity:0}10%{opacity:1}72%{opacity:1}100%{opacity:0}}'
          }</style>
          {/* A red edge pulse, so the refusal registers even if the player was
              looking at the roller rather than at the middle of the screen. */}
          <div
            aria-hidden
            style={{
              position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 118,
              boxShadow: 'inset 0 0 20vh rgba(230, 57, 70, 0.5)',
              animation: `ff-refuse ${REFUSAL_MS}ms ease forwards`,
            }}
          />
          <div
            role="status"
            style={{
              // Clear of the crosshair's own sub-line, which sits at 50% plus
              // the 26px label offset plus two wrapped lines of procedure. At
              // 58% this panel landed on top of the very text it reinforces.
              position: 'fixed', top: '66%', left: '50%',
              transform: 'translateX(-50%)',
              pointerEvents: 'none', zIndex: 120,
              width: 'min(30rem, 84vw)', textAlign: 'center',
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              background: 'rgba(10, 12, 16, 0.92)',
              border: '1px solid rgba(230, 57, 70, 0.55)',
              borderRadius: '3px', padding: '0.8rem 1rem',
              animation: `ff-refuse ${REFUSAL_MS}ms ease forwards`,
            }}
          >
            <div style={{
              font: '700 0.72rem/1.2 inherit', letterSpacing: '0.16em',
              color: '#ff5c5c', marginBottom: '0.45rem',
            }}>
              YOU DID NOT TOUCH IT — THE MACHINE IS STILL LIVE
            </div>
            <div style={{
              font: '400 0.72rem/1.65 inherit', color: '#c8ccd4',
            }}>
              That drive can start on its own while the isolator is on. Lock it
              off first:
            </div>
            <div style={{
              font: '600 0.72rem/1.75 inherit', color: '#e8e4e0',
              marginTop: '0.4rem', letterSpacing: '0.03em',
            }}>
              1 · CABINET DOOR&nbsp;&nbsp;[E]<br />
              2 · MAIN ISOLATOR&nbsp;&nbsp;[E] &nbsp;→&nbsp; LOCKED OFF<br />
              3 · then the repair&nbsp;&nbsp;[E]<br />
              {/* Step 4 is not optional padding. winRun() refuses to score a
                  win while the isolator is locked off, so a player who follows
                  steps 1-3 and stops has done everything right and watches a
                  dead line — the exact dead end this panel exists to prevent. */}
              4 · MAIN ISOLATOR&nbsp;&nbsp;[E] &nbsp;→&nbsp; back on, to prove it runs
            </div>
          </div>
        </>
      )}

      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none', zIndex: 10,
      }}>
        <div style={{
          position: 'absolute', width: `${arm}px`, height: '2px',
          background: colour,
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 4px rgba(0, 0, 0, 0.8)',
          transition: 'width 90ms ease, background 90ms ease',
        }} />
        <div style={{
          position: 'absolute', width: '2px', height: `${arm}px`,
          background: colour,
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 4px rgba(0, 0, 0, 0.8)',
          transition: 'height 90ms ease, background 90ms ease',
        }} />
        <div style={{
          position: 'absolute', width: active ? '5px' : '3px',
          height: active ? '5px' : '3px', borderRadius: '50%',
          background: blocked ? '#ff5c5c' : 'rgba(255, 107, 53, 0.9)',
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          transition: 'width 90ms ease, height 90ms ease',
        }} />
        {active && (
          <div style={{
            position: 'absolute', top: '26px', left: '50%',
            transform: 'translateX(-50%)', textAlign: 'center',
            font: '500 12px/1.5 ui-monospace, monospace', letterSpacing: '0.08em',
            color: blocked ? BLOCKED : HOT,
            textShadow: '0 0 6px rgba(0, 0, 0, 0.9)',
          }}>
            <div style={{ whiteSpace: 'nowrap' }}>{hovered}</div>
            {/* The one thing a newcomer cannot guess: WHY it is refused, and the
                order of operations that clears it. Attached to the target rather
                than buried in the manual, so the machine teaches its own
                procedure. */}
            {blocked && (
              <div style={{
                marginTop: '0.3rem', font: '400 11px/1.6 ui-monospace, monospace',
                color: 'rgba(255, 255, 255, 0.72)', letterSpacing: '0.02em',
                width: 'min(26rem, 76vw)',
              }}>
                Open the CABINET DOOR, throw the MAIN ISOLATOR to lock off,
                then come back.
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
