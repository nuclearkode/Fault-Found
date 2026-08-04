'use client'

/**
 * PackagingStation — ST70 Packaging station.
 * Loads the full station GLB (cabinet, plate, grid, buttons, HMI, mechanisms).
 * Animated meshes:
 *   ST70_Lid_Arm    — lid stepper arm, rotates on Y (Q70.1)
 *   ST70_Label_Head — label applicator head, translates on Y (Q70.2)
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

const GLB_PATH = '/models/stations/st70.glb'

interface Props {
  stationId: string
  label: string
}

export function PackagingStation({ stationId, label }: Props) {
  /* ── Load & clone scene ─────────────────────────────────────────── */
  const { scene } = useGLTF(GLB_PATH)
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  /* ── Animated mesh refs ─────────────────────────────────────────── */
  const lidArmRef = useRef<THREE.Object3D | null>(null)
  const labelHeadRef = useRef<THREE.Object3D | null>(null)

  // Rest positions captured once after traversal
  const lidArmRestY = useRef(0)
  const labelHeadRestY = useRef(0)

  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child.name === 'ST70_Lid_Arm') {
        lidArmRef.current = child
        lidArmRestY.current = child.rotation.y
      }
      if (child.name === 'ST70_Label_Head') {
        labelHeadRef.current = child
        labelHeadRestY.current = child.position.y
      }
    })
  }, [clonedScene])

  /* ── Animation driven by PLC tags ───────────────────────────────── */
  useFrame((_, delta) => {
    const speed = 5 * delta

    // Q70.1 → Lid arm rotation.y
    const lidActive = useGameStore.getState().tags['Q70.1']?.value
    if (lidArmRef.current) {
      const target = lidActive ? Math.PI * 0.5 : lidArmRestY.current
      lidArmRef.current.rotation.y = THREE.MathUtils.lerp(
        lidArmRef.current.rotation.y,
        target,
        speed,
      )
    }

    // Q70.2 → Label head position.y
    const labelActive = useGameStore.getState().tags['Q70.2']?.value
    if (labelHeadRef.current) {
      const target = labelActive
        ? labelHeadRestY.current - 0.05
        : labelHeadRestY.current
      labelHeadRef.current.position.y = THREE.MathUtils.lerp(
        labelHeadRef.current.position.y,
        target,
        speed,
      )
    }
  })

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <group name={stationId}>
      <primitive object={clonedScene} castShadow receiveShadow />
    </group>
  )
}

useGLTF.preload(GLB_PATH)
