'use client'

/**
 * DistributingProStation — ST90
 *
 * Loads the station GLB exported from blender_source/st90_st100_stations.blend:
 * cabinet, profile plate, three stacking magazines with pucks, three push
 * cylinders, the bidirectional belt and the sensor bridge.
 *
 * Stroke lengths are not hard-coded here. Each push cylinder carries its axis
 * and travel in the GLB node `userData`, written from the Blender custom
 * properties — see ./glbAnimation.ts.
 *
 *   ST90_push1 → Q90.0   (translate X, 0 → 0.16)
 *   ST90_push2 → Q90.1
 *   ST90_push3 → Q90.2
 *
 * The belt motors (Q90.3 forward, Q90.4 reverse) drive no visual motion yet,
 * matching ST40/ST50 — belt surfaces are static across all stations.
 */

import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useGameStore } from '@/stores/gameStore'
import { collectAnimSpecs, isEnergised, applyAnimSpec } from './glbAnimation'

const MODEL_PATH = '/models/stations/st90.glb'

interface Props {
  stationId: string
  label: string
}

export function DistributingProStation({ stationId, label }: Props) {
  const { scene } = useGLTF(MODEL_PATH)

  // Clone so each placement gets its own object graph
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  // Every driven actuator described by the Blender metadata
  const animSpecs = useMemo(() => collectAnimSpecs(clonedScene), [clonedScene])

  useFrame((_, delta) => {
    const lerpSpeed = 8 * delta
    const tags = useGameStore.getState().tags

    for (const spec of animSpecs) {
      applyAnimSpec(spec, isEnergised(tags[spec.tag]?.value), lerpSpeed)
    }
  })

  return (
    <group name={stationId}>
      <primitive object={clonedScene} castShadow receiveShadow />
    </group>
  )
}

useGLTF.preload(MODEL_PATH)
