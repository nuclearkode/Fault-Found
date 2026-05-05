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
import { runScanCycle, createTagMap } from '@/engine'
import type { IOTag } from '@/engine/types'

const SCAN_INTERVAL = 0.05 // 50ms = 20Hz scan rate

export function useGameLoop() {
  const accRef = useRef(0)

  useFrame((_, delta) => {
    // Read phase without subscription — getState() is synchronous and non-reactive
    const phase = useGameStore.getState().phase
    if (phase !== 'active') return

    // Accumulate time — only scan when interval has elapsed
    accRef.current += delta
    if (accRef.current < SCAN_INTERVAL) return
    accRef.current -= SCAN_INTERVAL // subtract, not reset, to avoid drift

    const { tags, rungs, faults, setTags, tickTimer } = useGameStore.getState()

    // Convert Record → Map for the scan engine
    const tagArray: IOTag[] = Object.values(tags)
    if (tagArray.length === 0) return // No scenario loaded yet

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
