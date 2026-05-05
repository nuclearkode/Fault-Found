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
}

export function useScenarioLoader() {
  const setTags    = useGameStore(s => s.setTags)
  const setRungs   = useGameStore(s => s.setRungs)
  const setFaults  = useGameStore(s => s.setFaults)
  const loadScenario = useGameStore(s => s.loadScenario)
  const setPhase   = useGameStore(s => s.setPhase)
  const resetTimer = useGameStore(s => s.resetTimer)

  /**
   * Load a scenario by ID (e.g. 'S01').
   * Transitions to 'briefing' phase after populating the store.
   */
  const load = useCallback(async (id: string) => {
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
    setFaults(scenario.faults)
    resetTimer()
    loadScenario(id) // sets scenarioId + transitions to 'briefing'

    const activeFaults = scenario.faults.filter(f => f.active).length
    console.log(
      `[ScenarioLoader] Loaded ${id}: "${scenario.title}" — ` +
      `${scenario.tags.length} tags, ${scenario.rungs.length} rungs, ` +
      `${activeFaults} active fault(s)`
    )
  }, [setTags, setRungs, setFaults, loadScenario, resetTimer])

  /**
   * Dev shortcut: load and immediately skip to 'active' phase.
   * Bypasses the briefing text and nominal-state video sequence.
   * Remove from production game flow.
   */
  const loadDev = useCallback(async (id: string) => {
    await load(id)
    setPhase('active')
  }, [load, setPhase])

  return { load, loadDev }
}
