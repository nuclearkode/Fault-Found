'use client'

/**
 * JoiningStation — ST60: Rotary indexing table + press-fit cylinder.
 * Loads full station geometry from GLB exported from Blender.
 * Animated via Zustand PLC output tags Q60.0 (table rotation) and Q60.1 (press).
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

const GLB_PATH = '/models/stations/st60.glb'

interface Props {
  stationId: string
  label: string
}

export function JoiningStation({ stationId, label }: Props) {
  const { scene } = useGLTF(GLB_PATH)
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  // Refs to animated meshes
  const tableRotRef = useRef<THREE.Object3D | null>(null)
  const pressRodRef = useRef<THREE.Object3D | null>(null)

  // Rest positions captured from Blender (after GLTF coordinate conversion)
  const pressRodRestY = useRef(0)

  // Traverse cloned scene once to cache refs
  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child.name === 'ST60_Table_Rot') {
        tableRotRef.current = child
      }
      if (child.name === 'ST60_Press_Rod') {
        pressRodRef.current = child
        pressRodRestY.current = child.position.y
      }
      // ST60_Press_Head is a child of ST60_Press_Rod; it moves with the rod
      // automatically via the scene graph — no separate ref needed.
    })
  }, [clonedScene])

  // Animate per frame using Zustand selectors (no destructuring)
  useFrame((_, delta) => {
    const q60_0 = useGameStore.getState().tags['Q60.0']?.value
    const q60_1 = useGameStore.getState().tags['Q60.1']?.value

    // ST60_Table_Rot: continuously rotate when Q60.0 is true, hold when false
    if (tableRotRef.current && q60_0) {
      tableRotRef.current.rotation.y += delta * 0.5
    }

    // ST60_Press_Rod: translate Y down by -0.08 when Q60.1 is true (press down)
    // ST60_Press_Head is a child and follows automatically
    if (pressRodRef.current) {
      const lerpSpeed = 4 * delta
      const targetY = q60_1
        ? pressRodRestY.current - 0.08
        : pressRodRestY.current
      pressRodRef.current.position.y = THREE.MathUtils.lerp(
        pressRodRef.current.position.y,
        targetY,
        lerpSpeed
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
