'use client'

/**
 * AssemblyRobotStation — ST100
 *
 * Loads the station GLB exported from blender_source/mps_stations.blend:
 * cabinet, profile plate, 4-axis articulated robot on its pedestal, part
 * fixture and controller.
 *
 * Joint angles are not hard-coded here. Each joint carries its axis and its
 * home→driven angle in the GLB node `userData`, written from the Blender custom
 * properties — see ./glbAnimation.ts.
 *
 *   ST100_joint1 → Q100.0  (rotate Y — base slew)
 *   ST100_joint2 → Q100.1  (rotate Z — shoulder)
 *   ST100_joint3 → Q100.2  (rotate Z — elbow)
 *   ST100_joint4 → Q100.3  (rotate Z — wrist)
 *   ST100_Jaw_L/R      → Q100.4  (guide fingers, see GRIPPER_STROKE below)
 */

import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'
import { collectAnimSpecs, isEnergised, applyAnimSpec } from './glbAnimation'

const MODEL_PATH = '/models/stations/st100.glb'

const JAW_TAG = 'Q100.4'

/**
 * Half-stroke of each guide finger, from ST100_gripper's `anim_range` in the GLB.
 *
 * The fingers move *outward*. They rest 20 mm apart with the 20 mm suction cup
 * between them, so closing them would drive the geometry through the cup — the
 * fingers spread to clear it while the vacuum seats onto the part.
 */
const GRIPPER_STROKE = 0.012

interface Props {
  stationId: string
  label: string
}

export function AssemblyRobotStation({ stationId, label }: Props) {
  const { scene } = useGLTF(MODEL_PATH)

  // Clone so each placement gets its own object graph
  const clonedScene = useMemo(() => scene.clone(true), [scene])

  // The four servo joints, described by the Blender metadata
  const animSpecs = useMemo(() => collectAnimSpecs(clonedScene), [clonedScene])

  // Guide fingers need bespoke handling — they move as a mirrored pair
  const jawLeftRef = useRef<THREE.Object3D | null>(null)
  const jawRightRef = useRef<THREE.Object3D | null>(null)
  const jawHomeX = useRef<{ left: number; right: number }>({ left: 0, right: 0 })

  useEffect(() => {
    clonedScene.traverse((child) => {
      if (child.name === 'ST100_Jaw_L') {
        jawLeftRef.current = child
        jawHomeX.current.left = child.position.x
      } else if (child.name === 'ST100_Jaw_R') {
        jawRightRef.current = child
        jawHomeX.current.right = child.position.x
      }
    })
  }, [clonedScene])

  useFrame((_, delta) => {
    const lerpSpeed = 8 * delta
    const tags = useGameStore.getState().tags

    for (const spec of animSpecs) {
      applyAnimSpec(spec, isEnergised(tags[spec.tag]?.value), lerpSpeed)
    }

    // Guide fingers spread symmetrically about the gripper centreline
    const offset = isEnergised(tags[JAW_TAG]?.value) ? GRIPPER_STROKE : 0
    if (jawLeftRef.current) {
      jawLeftRef.current.position.x = THREE.MathUtils.lerp(
        jawLeftRef.current.position.x,
        jawHomeX.current.left - offset,
        lerpSpeed,
      )
    }
    if (jawRightRef.current) {
      jawRightRef.current.position.x = THREE.MathUtils.lerp(
        jawRightRef.current.position.x,
        jawHomeX.current.right + offset,
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
