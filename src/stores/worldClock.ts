'use client'

import { useGameStore } from './gameStore'
import { useSettingsStore } from './settingsStore'
import type { Overlay } from './settingsStore'
import type { GamePhase } from '@/engine/types'

/**
 * Who owns the screen right now.
 *
 * Everything that needs to know "is the pointer captured", "does the world
 * simulate" and "which keys are live" reads this one derived value, and it is
 * derived from exactly one piece of new state (`overlay`) plus things that
 * already existed. That is the point: the previous design had several booleans
 * that all had to agree — started, isPaused, outcome, the pointer-lock state —
 * and they kept disagreeing. A deliberate unlock landing a tick after a restart
 * would re-pause the fresh run, leaving it frozen with no menu on screen and the
 * controls dead. With focus derived rather than stored, that class of bug cannot
 * be written.
 */
export type UiFocus =
  | 'title'      // no run in progress — pre-start, or between jobs
  | 'cinematic'  // PreShift is driving the camera; the player has no control
  | 'briefing'   // the operator's account, waiting on TAKE THE SHIFT
  | 'world'      // the shift itself: pointer locked, this is the game
  | 'laptop'     // ladder editor — cursor free, MACHINE STILL RUNNING
  | 'book'       // reference manual — cursor free, world frozen
  | 'pause'      // pause menu
  | 'debrief'    // GAME//OVER

/**
 * Does the world simulate? Read by worldRunning() and by <Physics paused>.
 *
 * 'laptop' is deliberately true: the player is diagnosing a LIVE machine, and
 * the shift clock going on burning while they read the ladder is the cost of
 * looking. 'book' is false — the manual is not on the machine.
 */
export const SIMULATES: Record<UiFocus, boolean> = {
  title: false,
  cinematic: true,
  briefing: true,
  world: true,
  laptop: true,
  book: false,
  pause: false,
  debrief: false,
}

/** Is the pointer captured? Read by the warden and by the Canvas. */
export const LOCKED: Record<UiFocus, boolean> = {
  title: false,
  cinematic: false,
  briefing: false,
  world: true,
  laptop: false,
  book: false,
  pause: false,
  debrief: false,
}

/**
 * Pure, and the single definition of focus. The order of these tests matters:
 *
 * - a lost run outranks everything, because the debrief owns the frame;
 * - an overlay outranks the phase, so you can pause during a briefing;
 * - phase 'menu' is 'title', which is what stops the NEXT JOB path from pausing
 *   the run it just started — resetRun sets phase 'menu', the unlock lands a
 *   tick later, and the old code found `outcome === 'playing'` and paused.
 */
export function focusOf(
  started: boolean,
  overlay: Overlay,
  phase: GamePhase,
  lost: boolean,
): UiFocus {
  if (!started) return 'title'
  if (lost) return 'debrief'
  if (overlay !== 'none') return overlay
  if (phase === 'menu') return 'title'
  if (phase === 'nominal') return 'cinematic'
  if (phase === 'briefing') return 'briefing'
  return 'world'
}

/** Non-reactive — safe inside useFrame and event handlers. */
export function uiFocus(): UiFocus {
  const { started, overlay } = useSettingsStore.getState()
  const g = useGameStore.getState()
  return focusOf(started, overlay, g.phase, g.outcome === 'lost')
}

/** Reactive twin. Same function underneath, so the two cannot drift. */
export function useUiFocus(): UiFocus {
  const started = useSettingsStore(s => s.started)
  const overlay = useSettingsStore(s => s.overlay)
  const phase = useGameStore(s => s.phase)
  const lost = useGameStore(s => s.outcome === 'lost')
  return focusOf(started, overlay, phase, lost)
}

/**
 * May the world simulate this frame?
 *
 * Called from inside useFrame by the scan cycle, the silo cell, the supervisor
 * and the office door — hence a plain function, not a hook: a subscription here
 * would be a re-render per frame.
 */
export function worldRunning(): boolean {
  return SIMULATES[uiFocus()]
}

/**
 * May a world key act right now? The one gate for WASD and for every E handler.
 *
 * Without this, typing "was" into the ladder editor latches the movement keys
 * and pressing E toggles whatever the frozen crosshair happens to be aimed at.
 */
export function worldInputEnabled(): boolean {
  return uiFocus() === 'world' && useGameStore.getState().phase === 'active'
}
