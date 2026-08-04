'use client'

/**
 * SeparatingStation — ST50: Belt + stopper gate + diverter flap.
 * Loads full station geometry from GLB exported from Blender.
 * Animated via Zustand PLC output tags Q50.1 (stopper) and Q50.2 (flap).
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

const GLB_PATH = '/models/stations/st50.glb'

interface Props {
  stationId: string
  label: string
}

export function SeparatingStation({ stationId, label }: Props) {
  const { scene } = useGLTF(GLB_PATH)
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  // Refs to animated meshes
  const stopperRef = useRef<THREE.Object3D | null>(null)
  const flapPivotRef = useRef<THREE.Object3D | null>(null)

  // Rest positions captured from Blender (after GLTF coordinate conversion)
  const stopperRestY = useRef(0)

  // Traverse cloned scene once to cache refs
  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child.name === 'ST50_Stopper') {
        stopperRef.current = child
        stopperRestY.current = child.position.y
      }
      if (child.name === 'ST50_Flap_Pivot') {
        flapPivotRef.current = child
      }
    })
  }, [clonedScene])

  // Animate per frame using Zustand selectors (no destructuring)
  useFrame((_, delta) => {
    const q50_1 = useGameStore.getState().tags['Q50.1']?.value
    const q50_2 = useGameStore.getState().tags['Q50.2']?.value

    const lerpSpeed = 6 * delta

    // ST50_Stopper: translate Y up by +0.03 when Q50.1 is true (retracted/raised)
    if (stopperRef.current) {
      const targetY = q50_1
        ? stopperRestY.current + 0.03
        : stopperRestY.current
      stopperRef.current.position.y = THREE.MathUtils.lerp(
        stopperRef.current.position.y,
        targetY,
        lerpSpeed
      )
    }

    // ST50_Flap_Pivot: rotate Y toward PI*0.4 when Q50.2 is true (deflect)
    if (flapPivotRef.current) {
      const targetRot = q50_2 ? Math.PI * 0.4 : 0
      flapPivotRef.current.rotation.y = THREE.MathUtils.lerp(
        flapPivotRef.current.rotation.y,
        targetRot,
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
