'use client'

/**
 * SortingStation — ST40 Sorting with 3 deflector gates.
 *
 * Loads the full station GLB (cabinet, plate, conveyor, chutes) and animates:
 *   - ST40_DivPivot_0 → gate 0 rotation.y (PLC tag Q40.1)
 *   - ST40_DivPivot_1 → gate 1 rotation.y (PLC tag Q40.2)
 *   - ST40_DivPivot_2 → gate 2 rotation.y (PLC tag Q40.3)
 *
 * Blender Z rotation → GLB Y rotation (standard glTF axis swap).
 * Gates lerp to PI*0.25 when active, 0 when inactive.
 */

import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

const MODEL_PATH = '/models/stations/st40.glb'

/** Map each gate mesh name to its PLC output tag */
const GATE_CONFIG = [
  { meshName: 'ST40_DivPivot_0', tag: 'Q40.1' },
  { meshName: 'ST40_DivPivot_1', tag: 'Q40.2' },
  { meshName: 'ST40_DivPivot_2', tag: 'Q40.3' },
] as const

const DEFLECTED_ANGLE = Math.PI * 0.25

interface Props {
  stationId: string
  label: string
}

export function SortingStation({ stationId, label }: Props) {
  const { scene } = useGLTF(MODEL_PATH)

  // Clone scene so each instance gets its own object graph
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  // Refs for the 3 gate pivots
  const gateRefs = useRef<(THREE.Object3D | null)[]>([null, null, null])

  // Traverse cloned scene and cache refs to gate pivots
  useEffect(() => {
    clonedScene.traverse((child) => {
      const idx = GATE_CONFIG.findIndex((g) => g.meshName === child.name)
      if (idx !== -1) {
        gateRefs.current[idx] = child
      }
    })
  }, [clonedScene])

  // Animate gate rotations from PLC tags every frame
  useFrame((_, delta) => {
    const lerpSpeed = 8 * delta
    const tags = useGameStore.getState().tags

    for (let i = 0; i < GATE_CONFIG.length; i++) {
      const gate = gateRefs.current[i]
      if (!gate) continue

      const active = tags[GATE_CONFIG[i].tag]?.value
      const targetY = active ? DEFLECTED_ANGLE : 0

      gate.rotation.y = THREE.MathUtils.lerp(
        gate.rotation.y,
        targetY,
        lerpSpeed,
      )
    }
  })

  return (
    <group name={stationId}>
      <primitive object={clonedScene} castShadow receiveShadow />
    </group>
  )
}

useGLTF.preload(MODEL_PATH)
