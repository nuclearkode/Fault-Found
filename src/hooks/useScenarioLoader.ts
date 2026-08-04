/**
 * useScenarioLoader — Loads a scenario JSON and wires it into Zustand.
 *
 * Call once when transitioning to 'briefing'. Populates:
 *   - tags  (initial I/O values from scenario JSON)
 *   - rungs (ladder logic rungs to evaluate)
 *   - faults (active + inactive fault definitions)
 *
 * The scan engine (useGameLoop) can then start running immediately.
 *
 * Architecture: this hook imports engine types only — no Three.js.
 * JSON is imported statically so Next.js bundles it at build time
 * (no runtime fetch needed, works offline on lab machines).
 */

import { useCallback } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { ScenarioConfig, IOTag } from '@/engine/types'

// Static scenario registry — add new scenarios here as they are created.
// Each entry is a dynamic import so unused scenarios are code-split.
const SCENARIO_MAP: Record<string, () => Promise<{ default: ScenarioConfig }>> = {
  S01: () => import('@/scenarios/S01.json') as Promise<{ default: ScenarioConfig }>,
  S02: () => import('@/scenarios/S02.json') as Promise<{ default: ScenarioConfig }>,
  S03: () => import('@/scenarios/S03.json') as Promise<{ default: ScenarioConfig }>,
  S04: () => import('@/scenarios/S04.json') as Promise<{ default: ScenarioConfig }>,
  S05: () => import('@/scenarios/S05.json') as Promise<{ default: ScenarioConfig }>,
  S06: () => import('@/scenarios/S06.json') as Promise<{ default: ScenarioConfig }>,
}

/**
 * Play order, easiest fault first.
 *
 * All five run the same machine and the same ladder — the LogixPro ProSim-II
 * silo: a conveyor indexes a carton under the spout, a prox stops it, a solenoid
 * fills it, a level photo-eye says when it is full. Only the fault changes, which
 * is the point: the player learns one machine well enough that the SYMPTOM is
 * what distinguishes the jobs, not the equipment.
 *
 *   S03  stop button wired NO instead of NC  — nothing starts at all
 *   S02  drive lagging worn, belt slips      — runs, nothing moves
 *   S04  level sensor cable broken           — overfills, never indexes on
 *   S05  prox cable shorted to 24 V          — fills with no box present
 *   S06  level photo-eye failed latched on   — empty boxes straight through
 *
 * S01 is deliberately absent. It predates the rig system, declares no `rig`, and
 * would drop the player into an empty bay with nothing to diagnose. It stays in
 * the registry so it can still be loaded directly.
 */
export const SCENARIO_ORDER = ['S03', 'S02', 'S04', 'S05', 'S06'] as const

/**
 * The job after this one, or null at the end of the list.
 *
 * Null is meaningful: the debrief uses it to offer a replay instead of a "next",
 * so finishing the last scenario doesn't dead-end on a button that does nothing.
 */
export function nextScenarioId(current: string | null): string | null {
  const i = SCENARIO_ORDER.indexOf(current as typeof SCENARIO_ORDER[number])
  if (i < 0 || i + 1 >= SCENARIO_ORDER.length) return null
  return SCENARIO_ORDER[i + 1]
}

export function useScenarioLoader() {
  const setTags    = useGameStore(s => s.setTags)
  const setRungs   = useGameStore(s => s.setRungs)
  const setFaults  = useGameStore(s => s.setFaults)
  const loadScenario = useGameStore(s => s.loadScenario)
  const setPhase   = useGameStore(s => s.setPhase)
  const setActiveRig = useGameStore(s => s.setActiveRig)

  /**
   * Load a scenario by ID and roll the pre-shift sequence.
   *
   * `timeLimit` overrides the scenario's own — S02 allows 900 s, which is the
   * right number for playing it and the wrong one for testing the failure path.
   */
  const load = useCallback(async (id: string, timeLimit?: number) => {
    const loader = SCENARIO_MAP[id]
    if (!loader) {
      console.error(`[ScenarioLoader] Unknown scenario: "${id}"`)
      return
    }

    const { default: scenario } = await loader()

    // Convert tag array → Record<string, IOTag> for Zustand store
    const tagRecord: Record<string, IOTag> = {}
    for (const tag of scenario.tags) {
      tagRecord[tag.id] = { ...tag }
    }

    setTags(tagRecord)
    setRungs(scenario.rungs)
    // Loaded DORMANT. The pre-shift sequence shows the line running correctly
    // before anything breaks, so the faults are armed later, on camera, by
    // PreShift — not here. Arriving already-broken is what made the old flow
    // have to describe the symptom instead of showing it.
    setFaults(scenario.faults.map(f => ({ ...f, active: false })))
    // The scenario owns which machinery is on the floor. Falling back to 'none'
    // rather than leaving the previous rig standing means a scenario that forgets
    // to declare one fails loudly (empty bay) instead of silently inheriting.
    setActiveRig(scenario.rig ?? 'none')
    // Parked, not started. PreShift reads it back and starts the clock when the
    // player takes the shift — the countdown belongs to the job, not the briefing.
    useGameStore.setState({
      timeLimit: timeLimit ?? scenario.timeLimit,
      remainingTime: timeLimit ?? scenario.timeLimit,
      elapsedTime: 0,
      timerRunning: false,
      faultsArmed: false,
      briefing: scenario.briefing,
    })
    loadScenario(id) // sets scenarioId
    setPhase('nominal')  // roll the pre-shift sequence

    console.log(
      `[ScenarioLoader] Loaded ${id}: "${scenario.title}" — ` +
      `${scenario.tags.length} tags, ${scenario.rungs.length} rungs, ` +
      `${scenario.faults.length} dormant fault(s), rig=${scenario.rig ?? 'none'}`
    )
  }, [setTags, setRungs, setFaults, setActiveRig, loadScenario, setPhase])

  return { load }
}
