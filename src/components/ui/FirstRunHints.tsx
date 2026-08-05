'use client'

/**
 * FirstRunHints — the shift card, on your first shift only.
 *
 * ── Why this exists at all ──────────────────────────────────────────────────
 *
 * The briefing states the job and lists the keys, and then it closes, the
 * pointer is captured, and the player is alone in a dark warehouse with a
 * fifteen-minute clock. Everything they were told is now gone, and the two
 * questions a stranger asks in the first minute — "what am I actually meant to
 * do" and "which key was the manual" — have no answer anywhere on screen. They
 * cannot even alt-tab to look it up without dropping pointer lock.
 *
 * ── Why it is not a tutorial ────────────────────────────────────────────────
 *
 * It appears on the first shift a browser ever plays and never again. It is a
 * corner card, not a modal; it never takes input, never blocks a click, never
 * asks to be dismissed and never interrupts anything. There is no step tracking,
 * no "great job!", no second page. An experienced player sees it once, ignores
 * it, and it is gone for good.
 *
 * ── How it retires ──────────────────────────────────────────────────────────
 *
 * Not on a timer, and not on a keypress. A timer is an arbitrary number that is
 * wrong for somebody, and a keypress would need a binding, which would mean an
 * entry in src/input/keymap.ts — the file that deliberately owns every
 * non-movement key, and not one this component may add to. So the rule is the
 * simplest one that cannot nag: it is on screen for the whole of your first
 * shift, and it retires the moment that shift ends, win or lose.
 *
 * The decision is a module-level latch rather than component state, because it
 * has to outlive the component: the card unmounts every time the laptop or the
 * manual is opened and must come back unchanged, and it must NOT come back on
 * the second run of the same page load. Storage that throws — private mode,
 * embedded webviews — reads as "already seen", because a card that reappears on
 * every single run is a far worse outcome than one that never appears.
 */

import { useEffect, useRef } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useUiFocus } from '@/stores/worldClock'

const MONO = '"JetBrains Mono", ui-monospace, monospace'
const KEY = 'ff.firstShift.seen'

const DIM = 'rgba(255,255,255,0.46)'
const INK = 'rgba(255,255,255,0.72)'
const BRIGHT = '#e8e4e0'

/**
 * null = not yet asked. Memoising the ANSWER rather than the stored value is
 * what makes `retire()` a one-line operation with no re-read.
 */
let allowed: boolean | null = null

/** Cached, idempotent, and a read — safe to call while rendering. */
function firstShiftEver(): boolean {
  if (allowed !== null) return allowed
  if (typeof window === 'undefined') return false   // never render this on the server
  let seen = true
  try { seen = localStorage.getItem(KEY) === '1' } catch { seen = true }
  allowed = !seen
  return allowed
}

/** Spend it. Called once, when the first shift ends. */
function retire(): void {
  allowed = false
  try { localStorage.setItem(KEY, '1') } catch { /* private mode */ }
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.55rem', lineHeight: 1.55 }}>
      <span style={{
        color: BRIGHT, flex: '0 0 6.2rem', letterSpacing: '0.04em',
      }}>{k}</span>
      <span style={{ color: DIM }}>{children}</span>
    </div>
  )
}

export function FirstRunHints() {
  const focus = useUiFocus()
  const phase = useGameStore(s => s.phase)
  const playing = useGameStore(s => s.outcome === 'playing')

  // Only over the world. Under the laptop or the manual it would be furniture
  // sitting on top of the thing it is telling you to open.
  const onShift = focus === 'world' && phase === 'active' && playing
  // Won, lost, or reset back to the menu — the shift is over either way.
  const runOver = !playing || phase === 'menu'

  // Was the card ever actually on screen this run? Without this, a scenario that
  // ends before the player takes the shift would burn the one showing.
  const used = useRef(false)

  useEffect(() => {
    if (onShift) used.current = true
  }, [onShift])

  useEffect(() => {
    if (!runOver || !used.current) return
    used.current = false
    retire()
  }, [runOver])

  if (!onShift || !firstShiftEver()) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', left: 'clamp(0.9rem, 2vw, 1.8rem)',
        bottom: 'clamp(0.9rem, 2vw, 1.8rem)',
        zIndex: 60, pointerEvents: 'none', userSelect: 'none',
        width: 'min(21rem, 46vw)',
        fontFamily: MONO, fontSize: '0.64rem',
        background: 'rgba(6, 8, 11, 0.72)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderLeft: '2px solid rgba(230,57,70,0.5)',
        borderRadius: '3px',
        padding: '0.8rem 0.95rem',
      }}
    >
      <div style={{
        fontSize: '0.56rem', letterSpacing: '0.2em', color: '#e63946',
        marginBottom: '0.6rem',
      }}>
        SHIFT CARD · FIRST SHIFT ONLY
      </div>

      <div style={{ color: INK, lineHeight: 1.6, marginBottom: '0.75rem' }}>
        Find what has physically failed on this cell, repair it, and get the line
        moving again.{' '}
        <span style={{ color: DIM }}>You are not here to run the machine.</span>
      </div>

      <div style={{
        color: BRIGHT, letterSpacing: '0.04em', marginBottom: '0.3rem',
      }}>
        LOCK OFF BEFORE REACHING IN
      </div>
      <div style={{ color: DIM, lineHeight: 1.6, marginBottom: '0.75rem' }}>
        1 · CABINET DOOR&nbsp;&nbsp;[E]<br />
        2 · MAIN ISOLATOR&nbsp;&nbsp;[E] → LOCKED OFF<br />
        3 · then the failed part&nbsp;&nbsp;[E]<br />
        {/* Step 4 is load-bearing, not a flourish. winRun() refuses to score a
            win while the isolator is still locked off, so a first-time player
            who follows 1-3 and stops has done the job correctly and is left
            staring at a dead line with the clock running. The crosshair's
            refusal panel carries the same fourth step for the same reason. */}
        4 · MAIN ISOLATOR&nbsp;&nbsp;[E] → back on, to test
      </div>

      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.6rem',
        display: 'grid', gap: '0.1rem',
      }}>
        <Row k="WASD / MOUSE">walk and look</Row>
        <Row k="[E]">use what the crosshair names</Row>
        <Row k="[L]">laptop — the live ladder</Row>
        <Row k="[B]">manual — how the cell works</Row>
        <Row k="RIGHT-MOUSE">hold to zoom</Row>
        <Row k="[ESC]">pause</Row>
      </div>
    </div>
  )
}
