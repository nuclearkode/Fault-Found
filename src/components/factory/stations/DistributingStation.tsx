'use client'

/**
 * DistributingStation — ST10
 *
 * Loads the full station GLB exported from Blender (cabinet, plate, grid,
 * buttons, HMI, magazine, push cylinder, swing arm, belt, etc.).
 *
 * Animated meshes driven by Zustand PLC output tags:
 *   - ST10_Push_Rod  → Q10.0  (linear push along GLB -Z)
 *   - ST10_Arm_Pivot → Q10.2  (rotary swing around GLB Y axis)
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

const GLB_PATH = '/models/stations/st10.glb'

interface Props {
  stationId: string
  label: string
}

export function DistributingStation({ stationId, label }: Props) {
  // --- Load & clone ---
  const { scene } = useGLTF(GLB_PATH)
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  // --- Refs for animated meshes ---
  const pushRodRef = useRef<THREE.Object3D | null>(null)
  const armPivotRef = useRef<THREE.Object3D | null>(null)

  // --- Cache mesh refs on mount ---
  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child.name === 'ST10_Push_Rod') {
        pushRodRef.current = child
      } else if (child.name === 'ST10_Arm_Pivot') {
        armPivotRef.current = child
      }
    })
  }, [clonedScene])

  // --- Animate per frame ---
  useFrame((_, delta) => {
    const q10_0 = useGameStore.getState().tags['Q10.0']?.value
    const q10_2 = useGameStore.getState().tags['Q10.2']?.value

    const speed = 5 * delta

    // Push rod: extends along GLB Z axis
    // Rest = 0, Extended = +0.06
    if (pushRodRef.current) {
      const target = q10_0 ? 0.06 : 0
      pushRodRef.current.position.z = THREE.MathUtils.lerp(
        pushRodRef.current.position.z,
        target,
        speed,
      )
    }

    // Arm pivot: swings around GLB Y axis
    // Rest = 0, Swung = -PI/2
    if (armPivotRef.current) {
      const target = q10_2 ? -Math.PI / 2 : 0
      armPivotRef.current.rotation.y = THREE.MathUtils.lerp(
        armPivotRef.current.rotation.y,
        target,
        speed,
      )
    }
  })

  return (
    <group name={stationId}>
      <primitive object={clonedScene} castShadow receiveShadow />
    </group>
  )
}

useGLTF.preload(GLB_PATH)
