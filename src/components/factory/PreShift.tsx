'use client'

/**
 * PreShift — what happened before you were called in.
 *
 * Runs between the title screen and the shift. The camera goes to the cell, the
 * line is started and runs a few correct cycles, and then the fault is armed and
 * the machine goes wrong ON CAMERA. Only after that does the operator's account
 * come up and the shift begin.
 *
 * The important part is that none of it is faked. The nominal cycle is the real
 * ladder driving the real cell — the same scan that runs during play — with the
 * faults simply dormant. So "here is what it should look like" is not an
 * animation somebody authored; it is the machine working, which means it stays
 * truthful when the scenario or the ladder changes.
 *
 * Phases: 'nominal' (running well) -> fault armed -> 'briefing' (report shown).
 * The Briefing overlay owns the transition to 'active'.
 *
 * ── What this file no longer does ──────────────────────────────────────────
 *
 * It used to own the sequence: an accumulator of real delta time, a handful of
 * `if (t > SOME_NUMBER)` guards each with its own `already fired` boolean, and a
 * `setTimeout` to release the START button. That worked on a machine that kept
 * up. On one that didn't, the guards were crossed at different points in the
 * cell's own cycle and the timeout could land several frames late, so the order
 * of "sound", "break" and "hand over" was not actually fixed.
 *
 * The sequence now lives in src/engine/cinematic.ts as a timestamped list, and
 * this component's whole job is to advance a FIXED 1/60 clock and fire whatever
 * that step crossed. A 400 ms stall becomes 24 steps on the next frame and every
 * event still fires, once, in order. The camera is a pure function of that clock
 * rather than an integrated lerp, so the same t frames the same thing everywhere.
 *
 * Which makes SKIP fall out for free: skipping is setting the clock to the end
 * and firing what that step crossed. It is not a second code path that has to be
 * kept in agreement with the first — it IS the first, run faster — so "skipped"
 * and "watched" cannot land in different states.
 */

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '@/stores/gameStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { uiFocus, worldRunning } from '@/stores/worldClock'
import { breakdown } from '@/audio/foley'
import {
  CINEMATIC_END,
  MAX_FRAME,
  TICK,
  cameraAt,
  clearCinematicSkip,
  consumeCinematicSkip,
  crossed,
  makePose,
  noteCinematicView,
  requestCinematicSkip,
  shotFor,
  shouldHintSkip,
  type CineEvent,
} from '@/engine/cinematic'

const MONO = '"JetBrains Mono", ui-monospace, monospace'

/** Fade windows for the skip hint, seconds into the sequence. */
const HINT_IN = 0.8
const HINT_FADE = 0.6
const HINT_OUT = CINEMATIC_END - 1.6

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Do what the timeline says.
 *
 * Module level, not a closure: it needs nothing from the component, and the
 * React compiler rules are strict about handlers that capture hook-derived
 * values. Store state is read FRESH inside the loop because these events mutate
 * it — `press_start` and `release_start` in the same step would otherwise both
 * write from the same stale snapshot.
 *
 * `silent` drops the 'audio' events. That is the one and only difference between
 * skipping and watching, and it is a deliberate one: a skip crosses the fault and
 * the hand-over in the same step, and firing a 1.6-second fault stinger at the
 * instant the briefing panel appears would be a bug with a soundtrack.
 */
function fire(events: readonly CineEvent[], silent: boolean) {
  for (const e of events) {
    if (silent && e.kind === 'audio') continue
    const g = useGameStore.getState()
    switch (e.name) {
      // Press START for the operator. The ladder does the rest — this is the
      // same seal-in the player will use, not a scripted animation.
      case 'press_start':
        g.setTag('I:1/00', true)
        break
      case 'release_start':
        g.setTag('I:1/00', false)
        break

      // Break it, on camera — and audibly. The sound is the first clue the
      // player gets, and it is a real one: a belt losing grip and a conductor
      // letting go do not sound remotely alike.
      case 'breakdown':
        breakdown(g.faults[0]?.type === 'mechanical_jam' ? 'mechanical' : 'electrical')
        break
      case 'arm_faults':
        g.armFaults()
        break

      // Held belt squeal under the symptom. foley currently has no squeal-only
      // voice — the squeal is baked into breakdown('mechanical') along with the
      // stinger — and re-firing the whole cue every few seconds would be worse
      // than silence. The timeline entries are here because the SEQUENCE is the
      // thing being specified; see the integration note for the one-line foley
      // export that gives them a voice.
      case 'squeal':
        break

      // Hand over to the report once the symptom has had time to read.
      case 'briefing':
        if (g.phase === 'nominal') g.setPhase('briefing')
        break
    }
  }
}

export function PreShift() {
  const { camera } = useThree()
  // `hintA` is the last opacity written to the hint. Kept so the common case —
  // nothing changed — costs a float compare rather than a style recalculation
  // sixty times a second on the title screen.
  const run = useRef({ t: 0, acc: 0, lastPhase: '', counted: false, hintA: -1 })
  const pose = useRef(makePose())
  const hint = useRef<HTMLDivElement | null>(null)

  /**
   * ESC to skip.
   *
   * A local listener rather than a case in src/input/keymap.ts, and the choice is
   * close enough to be worth writing down. keymap is the right long-term home —
   * it is the one place bindings are meant to be findable, and its `default:`
   * arm currently says in as many words that cinematic has nothing bound. What
   * keymap does not have is any way to reach the clock: the timeline lives in a
   * ref inside useFrame, and wiring a store field through Zustand for a bit that
   * nothing renders from is a lot of machinery for one keystroke.
   *
   * So the request goes through a latch in the engine module that OWNS the
   * timeline, and this listener is simply one caller of it. Moving the binding
   * into keymap is then a two-line change with no flag day, because the latch is
   * idempotent — if both handlers fire on the same keystroke, the second call
   * sets a flag that is already set and the frame consumes it once. The
   * integration note has the exact diff.
   *
   * Nothing here releases the pointer, and nothing needs to: LOCKED.cinematic is
   * false, so during this sequence there is no lock for Escape to break.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' || e.repeat) return
      // Only while the sequence actually owns the screen. Escape means something
      // different in every other focus and those owners must keep it.
      if (uiFocus() !== 'cinematic') return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      requestCinematicSkip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /**
   * The "[ESC] SKIP" hint, as a plain DOM node on `document.body`.
   *
   * Not a drei `<Html>`: this component lives inside the Canvas, and the house
   * rule — earned the hard way — is that overlays are plain DOM OUTSIDE it,
   * because drei's PointerLockControls binds click-to-lock to `selector="canvas"`
   * and anything portalled over the canvas becomes a re-lock target. Not a React
   * subtree either, because its opacity is driven from the timeline clock inside
   * useFrame and subscribing React to a per-frame value is the one thing the
   * codebase is most careful never to do.
   *
   * Built once, torn down on unmount, and thereafter written imperatively — the
   * same pattern the tag readouts use for the 20 Hz scan.
   */
  useEffect(() => {
    const el = document.createElement('div')
    el.textContent = '[ESC]  SKIP'
    el.setAttribute('aria-hidden', 'true')
    const style: Array<[string, string]> = [
      ['position', 'fixed'],
      ['right', 'clamp(1.2rem, 3vw, 2.6rem)'],
      ['bottom', 'clamp(1.2rem, 3vw, 2.4rem)'],
      ['z-index', '130'],
      ['font', `600 0.62rem/1 ${MONO}`],
      ['letter-spacing', '0.22em'],
      ['color', 'rgba(232,228,224,0.72)'],
      ['padding', '0.55rem 0.9rem'],
      ['border', '1px solid rgba(232,228,224,0.18)'],
      ['border-radius', '3px'],
      ['background', 'rgba(6,8,11,0.55)'],
      ['opacity', '0'],
      ['transition', 'opacity 260ms linear'],
      // Never a click target. The cinematic has no cursor and the canvas below
      // is a lock target; an invisible box over it would be a trap.
      ['pointer-events', 'none'],
      ['user-select', 'none'],
    ]
    for (const [k, v] of style) el.style.setProperty(k, v)
    document.body.appendChild(el)
    hint.current = el
    return () => {
      hint.current = null
      el.remove()
    }
  }, [])

  useFrame((_, delta) => {
    const s = useGameStore.getState()
    const phase = s.phase
    const r = run.current

    // Re-arm whenever a new job rolls round, so the second briefing plays like
    // the first rather than inheriting the last one's progress.
    if (phase !== r.lastPhase) {
      r.lastPhase = phase
      if (phase === 'nominal') {
        r.t = 0
        r.acc = 0
        r.counted = false
        clearCinematicSkip()
      }
    }

    const live = phase === 'nominal' || phase === 'briefing'
    if (!live) {
      if (r.hintA !== 0) {
        r.hintA = 0
        hint.current?.style.setProperty('opacity', '0')
      }
      return
    }
    if (!useSettingsStore.getState().started) return
    // Freezing the world must freeze the sequence too. Without this, a pause
    // taken during the cinematic would leave the timeline running behind the
    // menu and the machine standing still — which is precisely the desync the
    // fixed clock exists to prevent.
    if (!worldRunning()) return

    // Counted here rather than on the phase change, so a scenario that loads
    // before the player has pressed START does not burn a viewing nobody saw.
    if (phase === 'nominal' && !r.counted) {
      r.counted = true
      noteCinematicView()
    }

    // ── Skip ────────────────────────────────────────────────────────────────
    // Not a special case. Jump the clock to the end and fire what that step
    // crossed — the same call the normal path makes, with the same function,
    // over a bigger window. Faults armed, phase briefing, camera settled, by
    // construction rather than by a second list that has to be kept in step.
    if (consumeCinematicSkip() && r.t < CINEMATIC_END) {
      const prev = r.t
      r.t = CINEMATIC_END
      r.acc = 0
      fire(crossed(prev, CINEMATIC_END), true)
    }

    // ── The fixed clock ─────────────────────────────────────────────────────
    // Real time goes in, whole 1/60 ticks come out. The remainder is carried,
    // never dropped, so the sequence neither drifts nor gains on a display that
    // is not 60 Hz. A stalled frame simply takes several ticks at once and every
    // event inside that window still fires, once, in timeline order.
    r.acc += Math.min(delta, MAX_FRAME)
    const steps = Math.floor(r.acc / TICK)
    if (steps > 0) {
      r.acc -= steps * TICK
      const prev = r.t
      r.t = prev + steps * TICK
      fire(crossed(prev, r.t), false)
    }

    // ── The shot ────────────────────────────────────────────────────────────
    // A pure function of the clock — see cameraAt. `.set()` and `.lookAt()`
    // rather than writing .x/.y/.z, which keeps the React compiler rules happy
    // about mutating a hook-derived object.
    const p = cameraAt(shotFor(s.activeRig), r.t, pose.current)
    camera.position.set(p.px, p.py, p.pz)
    camera.lookAt(p.lx, p.ly, p.lz)

    // ── The hint ────────────────────────────────────────────────────────────
    // From the second viewing onward only. The first time through, the sequence
    // is the thing the player is meant to be watching and a control prompt in
    // the corner of it is furniture; by the second, they have seen it and the
    // question is how to get out.
    const show = phase === 'nominal' && shouldHintSkip() && r.t < CINEMATIC_END
    const fadeIn = (r.t - HINT_IN) / HINT_FADE
    const fadeOut = (HINT_OUT + HINT_FADE - r.t) / HINT_FADE
    const a = show ? clamp01(Math.min(fadeIn, fadeOut)) : 0
    if (a !== r.hintA) {
      r.hintA = a
      hint.current?.style.setProperty('opacity', a.toFixed(3))
    }
  })

  return null
}
