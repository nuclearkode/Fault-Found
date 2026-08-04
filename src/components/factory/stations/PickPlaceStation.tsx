'use client'

/**
 * PickPlaceStation — ST30 Pick & Place gantry with vacuum gripper.
 *
 * Loads the full station GLB (cabinet, plate, mechanisms) and animates:
 *   - ST30_Carriage  → X-axis translation  (PLC tag Q30.0)
 *   - ST30_Z_Rod     → Y-axis translation  (PLC tag Q30.1, Blender Z → GLB Y)
 *   - ST30_Gripper   → child of Z_Rod, moves automatically
 */

import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

const MODEL_PATH = '/models/stations/st30.glb'

interface Props {
  stationId: string
  label: string
}

export function PickPlaceStation({ stationId, label }: Props) {
  const { scene } = useGLTF(MODEL_PATH)

  // Clone scene so each instance gets its own object graph
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  // Refs for animated meshes
  const carriageRef = useRef<THREE.Object3D | null>(null)
  const zRodRef = useRef<THREE.Object3D | null>(null)

  // Rest positions (captured once from the GLB)
  const carriageRestX = useRef(0)
  const zRodRestY = useRef(0)

  // Traverse cloned scene and cache refs to animated objects
  useEffect(() => {
    clonedScene.traverse((child) => {
      switch (child.name) {
        case 'ST30_Carriage':
          carriageRef.current = child
          carriageRestX.current = child.position.x
          break
        case 'ST30_Z_Rod':
          zRodRef.current = child
          zRodRestY.current = child.position.y
          break
      }
    })
  }, [clonedScene])

  // Animate from PLC tags every frame
  useFrame((_, delta) => {
    const lerpSpeed = 5 * delta

    // --- Carriage X-axis (Q30.0) ---
    const q30_0 = useGameStore.getState().tags['Q30.0']?.value
    if (carriageRef.current) {
      const targetX = q30_0
        ? carriageRestX.current + 0.25
        : carriageRestX.current
      carriageRef.current.position.x = THREE.MathUtils.lerp(
        carriageRef.current.position.x,
        targetX,
        lerpSpeed,
      )
    }

    // --- Z Rod Y-axis (Q30.1) — Blender Z maps to GLB Y ---
    const q30_1 = useGameStore.getState().tags['Q30.1']?.value
    if (zRodRef.current) {
      const targetY = q30_1
        ? zRodRestY.current - 0.13
        : zRodRestY.current
      zRodRef.current.position.y = THREE.MathUtils.lerp(
        zRodRef.current.position.y,
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
