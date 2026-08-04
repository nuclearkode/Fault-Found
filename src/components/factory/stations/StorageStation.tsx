'use client'

/**
 * StorageStation — ST80 Storage / high-bay rack station.
 * Loads the full station GLB (cabinet, plate, grid, buttons, HMI, mechanisms).
 * Animated meshes:
 *   ST80_Car_X    — X-axis gantry carriage, translates on X (Q80.0)
 *   ST80_Car_Z    — Z-axis mast carriage, translates on Y / GLB Y = Blender Z (Q80.1)
 *   ST80_Extractor — extractor arm, translates on Z / forward (Q80.2)
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

const GLB_PATH = '/models/stations/st80.glb'

interface Props {
  stationId: string
  label: string
}

export function StorageStation({ stationId, label }: Props) {
  /* ── Load & clone scene ─────────────────────────────────────────── */
  const { scene } = useGLTF(GLB_PATH)
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  /* ── Animated mesh refs ─────────────────────────────────────────── */
  const carXRef = useRef<THREE.Object3D | null>(null)
  const carZRef = useRef<THREE.Object3D | null>(null)
  const extractorRef = useRef<THREE.Object3D | null>(null)

  // Rest positions captured once after traversal
  const carXRestX = useRef(0)
  const carZRestY = useRef(0)
  const extractorRestZ = useRef(0)

  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child.name === 'ST80_Car_X') {
        carXRef.current = child
        carXRestX.current = child.position.x
      }
      if (child.name === 'ST80_Car_Z') {
        carZRef.current = child
        carZRestY.current = child.position.y
      }
      if (child.name === 'ST80_Extractor') {
        extractorRef.current = child
        extractorRestZ.current = child.position.z
      }
    })
  }, [clonedScene])

  /* ── Animation driven by PLC tags ───────────────────────────────── */
  useFrame((_, delta) => {
    const speed = 4 * delta

    // Q80.0 → Car_X position.x
    const xActive = useGameStore.getState().tags['Q80.0']?.value
    if (carXRef.current) {
      const target = xActive
        ? carXRestX.current + 0.15
        : carXRestX.current
      carXRef.current.position.x = THREE.MathUtils.lerp(
        carXRef.current.position.x,
        target,
        speed,
      )
    }

    // Q80.1 → Car_Z position.y (GLB Y = Blender Z)
    const zActive = useGameStore.getState().tags['Q80.1']?.value
    if (carZRef.current) {
      const target = zActive
        ? carZRestY.current - 0.1
        : carZRestY.current
      carZRef.current.position.y = THREE.MathUtils.lerp(
        carZRef.current.position.y,
        target,
        speed,
      )
    }

    // Q80.2 → Extractor position.z (forward)
    const extActive = useGameStore.getState().tags['Q80.2']?.value
    if (extractorRef.current) {
      const target = extActive
        ? extractorRestZ.current + 0.05
        : extractorRestZ.current
      extractorRef.current.position.z = THREE.MathUtils.lerp(
        extractorRef.current.position.z,
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
