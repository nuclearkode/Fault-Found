'use client'

/**
 * NominalCycle — replays the nominal (fault-free) machine cycle for the two
 * experimental stations by writing their PLC tags.
 *
 * It drives *tags*, never meshes. The station components already lerp toward
 * whatever their tags command, so this exercises the exact same path a real
 * scenario would — it just supplies the commands. That makes it a genuine
 * "here is what correct operation looks like" reference, which is what
 * ScenarioConfig.nominalVideo is reserved for.
 *
 * The choreography is not duplicated here. Every actuator authored in Blender
 * carries `cycle_frame_in` / `cycle_frame_out` on a 120-frame @ 24 fps master
 * timeline, and those survive into the GLB as node userData. Re-time the cycle
 * in Blender, re-export, and this follows — no code change.
 *
 * ST90 and ST100 belong to no scenario, so nothing else writes their tags and
 * this cannot fight the scan cycle in useGameLoop.
 */

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useGameStore } from '@/stores/gameStore'
import { collectAnimSpecs } from './stations/glbAnimation'

const MODELS = ['/models/stations/st90.glb', '/models/stations/st100.glb'] as const

/** Blender master timeline: 120 frames at 24 fps. */
const CYCLE_FRAMES = 120
const CYCLE_FPS = 24
const CYCLE_SECONDS = CYCLE_FRAMES / CYCLE_FPS

/**
 * Actuators with no `cycle_frame_*` metadata — motors, vacuum and lamps, which
 * have no stroke to key in Blender. Windows are derived from the actuators that
 * do: the belt runs while a puck is in transit, the gripper holds while the arm
 * is slewing, and the light curtain is live whenever the robot is moving.
 */
const SUPPLEMENTARY: Array<{ tag: string; from: number; to: number }> = [
  { tag: 'Q90.3',  from: 16, to: 112 },  // belt forward, first push to last delivery
  { tag: 'Q100.4', from: 30, to: 60 },   // gripper holding the part
]

export function NominalCycle() {
  // useGLTF caches per URL, so these are the same objects the stations loaded
  const st90 = useGLTF(MODELS[0])
  const st100 = useGLTF(MODELS[1])

  // Tag → active frame window, read straight out of the Blender metadata
  const windows = useMemo(() => {
    const out: Array<{ tag: string; from: number; to: number }> = []
    for (const gltf of [st90, st100]) {
      for (const spec of collectAnimSpecs(gltf.scene)) {
        if (spec.cycleIn === undefined || spec.cycleOut === undefined) continue
        out.push({ tag: spec.tag, from: spec.cycleIn, to: spec.cycleOut })
      }
    }
    return [...out, ...SUPPLEMENTARY]
  }, [st90, st100])

  const elapsed = useRef(0)
  const lastWritten = useRef<Record<string, boolean>>({})

  useFrame((_, delta) => {
    elapsed.current = (elapsed.current + delta) % CYCLE_SECONDS
    const frame = elapsed.current * CYCLE_FPS

    const setTag = useGameStore.getState().setTag
    for (const w of windows) {
      const on = frame >= w.from && frame <= w.to
      // Only write on transitions — setTag replaces the tags object and would
      // otherwise churn a new Record every frame for every actuator
      if (lastWritten.current[w.tag] === on) continue
      lastWritten.current[w.tag] = on
      setTag(w.tag, on)
    }
  })

  return null
}

for (const m of MODELS) useGLTF.preload(m)
