'use client'

/**
 * MeasuringStation — ST20
 *
 * Loads the full station GLB exported from Blender (cabinet, plate, grid,
 * buttons, HMI, slide, probe, LEDs, etc.).
 *
 * Animated meshes driven by Zustand PLC output tags:
 *   - ST20_Slide     → Q20.0  (linear slide along GLB X)
 *   - ST20_Probe_Rod → Q20.1  (probe descends along GLB Y)
 *   - ST20_LED_Pass  → Q20.2  (emissive intensity)
 *   - ST20_LED_Fail  → Q20.3  (emissive intensity)
 */

import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

const GLB_PATH = '/models/stations/st20.glb'

// Default rest positions (captured from Blender export → GLB coordinates)
const SLIDE_REST_X = -0.0076
const SLIDE_EXTENDED_X = 0.15

const PROBE_REST_Y = 0.845
const PROBE_TRAVEL = 0.085 // descends by this amount

interface Props {
  stationId: string
  label: string
}

export function MeasuringStation({ stationId, label }: Props) {
  // --- Load & clone ---
  const { scene } = useGLTF(GLB_PATH)
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  // --- Refs for animated meshes ---
  const slideRef = useRef<THREE.Object3D | null>(null)
  const probeRodRef = useRef<THREE.Object3D | null>(null)
  const ledPassRef = useRef<THREE.Mesh | null>(null)
  const ledFailRef = useRef<THREE.Mesh | null>(null)

  // --- Cache mesh refs on mount ---
  useEffect(() => {
    clonedScene.traverse((child) => {
      switch (child.name) {
        case 'ST20_Slide':
          slideRef.current = child
          break
        case 'ST20_Probe_Rod':
          probeRodRef.current = child
          break
        case 'ST20_LED_Pass':
          ledPassRef.current = child as THREE.Mesh
          break
        case 'ST20_LED_Fail':
          ledFailRef.current = child as THREE.Mesh
          break
      }
    })
  }, [clonedScene])

  // --- Animate per frame ---
  useFrame((_, delta) => {
    const tags = useGameStore.getState().tags
    const q20_0 = tags['Q20.0']?.value
    const q20_1 = tags['Q20.1']?.value
    const q20_2 = tags['Q20.2']?.value
    const q20_3 = tags['Q20.3']?.value

    const speed = 5 * delta

    // Slide: travels along X axis
    if (slideRef.current) {
      const target = q20_0 ? SLIDE_EXTENDED_X : SLIDE_REST_X
      slideRef.current.position.x = THREE.MathUtils.lerp(
        slideRef.current.position.x,
        target,
        speed,
      )
    }

    // Probe rod: descends along Y axis
    if (probeRodRef.current) {
      const target = q20_1 ? PROBE_REST_Y - PROBE_TRAVEL : PROBE_REST_Y
      probeRodRef.current.position.y = THREE.MathUtils.lerp(
        probeRodRef.current.position.y,
        target,
        speed,
      )
    }

    // Pass LED: emissive intensity (no lerp)
    if (ledPassRef.current) {
      const mat = ledPassRef.current.material as THREE.MeshStandardMaterial
      if (mat.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = q20_2 ? 1.0 : 0.05
      }
    }

    // Fail LED: emissive intensity (no lerp)
    if (ledFailRef.current) {
      const mat = ledFailRef.current.material as THREE.MeshStandardMaterial
      if (mat.emissiveIntensity !== undefined) {
        mat.emissiveIntensity = q20_3 ? 1.0 : 0.05
      }
    }
  })

  return (
    <group name={stationId}>
      <primitive object={clonedScene} castShadow receiveShadow />
    </group>
  )
}

useGLTF.preload(GLB_PATH)
