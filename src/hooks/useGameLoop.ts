/**
 * useGameLoop — Drives the PLC scan cycle from inside the R3F canvas.
 *
 * Runs at 20Hz (every 50ms) via a frame-time accumulator in useFrame.
 * This is intentional — real PLCs scan at 10–50ms. Running at 60Hz
 * would waste CPU on identical outputs and distort timing mechanics.
 *
 * Data flow each tick:
 *   Zustand tags (Record) → createTagMap (Map) → runScanCycle → setTags (Record)
 *
 * Architecture rules:
 *   - useGameStore.getState() (not hook) inside useFrame — avoids re-render subscription
 *   - Pre-allocated Map reused per tick — no GC pressure
 *   - Skips entirely when phase !== 'active'
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGameStore } from '@/stores/gameStore'
import { worldRunning } from '@/stores/worldClock'
import { runScanCycle, createTagMap } from '@/engine'
import type { IOTag } from '@/engine/types'

const SCAN_INTERVAL = 0.05 // 50ms = 20Hz scan rate

export function useGameLoop() {
  const accRef = useRef(0)

  useFrame((_, delta) => {
    // Read phase without subscription — getState() is synchronous and non-reactive.
    // 'nominal' and 'briefing' scan too: the pre-shift sequence shows the real
    // ladder driving the real cell, which is the only way "here is what it looks
    // like working" stays true when the program changes.
    const phase = useGameStore.getState().phase
    if (phase !== 'active' && phase !== 'nominal' && phase !== 'briefing') return

    // The scan cycle IS the game clock — the shift countdown is ticked from it.
    // Letting it run behind a menu or the title screen meant the job was burning
    // time the player had no way to spend.
    if (!worldRunning()) return

    // Accumulate time — only scan when interval has elapsed
    accRef.current += delta
    if (accRef.current < SCAN_INTERVAL) return
    accRef.current -= SCAN_INTERVAL // subtract, not reset, to avoid drift

    const { tags, rungs, faults, setTags, tickTimer, lotoApplied } = useGameStore.getState()

    // Convert Record → Map for the scan engine
    const tagArray: IOTag[] = Object.values(tags)
    if (tagArray.length === 0) return // No scenario loaded yet

    // ── Isolated ──────────────────────────────────────────────────────────────
    // The main isolator feeds the whole cell, control circuit included. With it
    // open there is no processor, no scan and no 24 V: every output drops out,
    // the lamps go dark and the pushbuttons do nothing.
    //
    // This is the point of locking off, and without it the lock-out was theatre —
    // the padlock appeared, and the line carried on running and could be started
    // again with a fingertip while somebody had their hands inside the guard.
    //
    // Matched on BOTH addressing conventions. 'O' is Allen-Bradley/LogixPro,
    // which is what S02-S06 use ('O:2/00'); 'Q' is Siemens, which is what the
    // MPS-derived stations use ('Q4.0'). A startsWith('O') test silently let
    // every Q-addressed output stay energised with the padlock on — the spindle
    // would keep turning while the player reached into the drilling module,
    // which is precisely the thing lock-out exists to prevent, and it would have
    // failed open rather than closed.
    const isOutput = (id: string): boolean => id.startsWith('O') || id.startsWith('Q')

    if (lotoApplied) {
      const live = tagArray.filter(t => isOutput(t.id) && t.value !== false)
      if (live.length > 0) {
        const dead: Record<string, IOTag> = {}
        for (const t of tagArray) {
          dead[t.id] = isOutput(t.id) ? { ...t, value: false } : t
        }
        setTags(dead)
      }
      // The clock keeps running. Time spent locked off is still time on the job.
      tickTimer(SCAN_INTERVAL)
      return
    }

    const tagMap = createTagMap(tagArray)

    // Run the PLC scan: apply faults → evaluate rungs → update outputs
    runScanCycle(tagMap, rungs, faults)

    // Convert Map → Record and push back to Zustand
    const updated: Record<string, IOTag> = {}
    tagMap.forEach((tag, id) => {
      updated[id] = tag
    })

    setTags(updated)
    tickTimer(SCAN_INTERVAL)

    // Every fault repaired ends the run — including one repaired with the
    // supervisor already halfway across the floor, which calls off the chase.
    // Read fresh: tickTimer may have started one on this very tick.
    //
    // Gated on 'active'. During the pre-shift sequence the faults are dormant by
    // design, and without this check "no active faults" reads as solved — the
    // player won the job before being told what it was.
    const after = useGameStore.getState()
    if (phase === 'active' && after.outcome === 'playing' &&
        !after.faults.some((f) => f.active)) {
      after.winRun()
    }
  })
}

/**
 * GameLoop — thin React component wrapper so useGameLoop() can be
 * placed inside the <Canvas> context where useFrame is valid.
 *
 * Usage in GameCanvas.tsx:
 *   <Canvas>
 *     <GameLoop />
 *     ...rest of scene
 *   </Canvas>
 */
export function GameLoop() {
  useGameLoop()
  return null
}
