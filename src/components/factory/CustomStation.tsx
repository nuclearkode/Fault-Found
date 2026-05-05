/**
 * CustomStation — A bespoke work station built from parts of the AssemblyLine GLB.
 *
 * Rather than duplicating geometry, this component references the same cached
 * GLB nodes that AssemblyLine uses. Three.js deduplicates geometry automatically
 * when useGLTF() is called with the same URL — so there is zero extra VRAM cost.
 *
 * This station represents a short inspection/rework section at the end of the
 * main line. It uses:
 *   - The structural frame (Material_12) as the table/base
 *   - The guard rail section (Material_11) as a side shield
 *   - The base plate (Material_19) as the mounting foot
 *
 * To add more parts: import additional nodes from GLTFResult and render them
 * with their own ref/material overrides.
 *
 * Customisation ideas:
 *   - Override materials with new colours/roughness to distinguish from main line
 *   - Scale individual meshes differently (e.g., shorter frame)
 *   - Swap materials to give the station a "damaged" or "repaired" look
 */

'use client'

import * as THREE from 'three'
import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { RigidBody } from '@react-three/rapier'
import type { GLTF } from 'three-stdlib'

// Uses the same cached GLB — no extra network request or VRAM cost
const MODEL_PATH = '/models/assembly_line.glb'

type GLTFResult = GLTF & {
  nodes: {
    ['assembly_Material_#12_0']: THREE.Mesh
    ['assembly_Material_#11_0']: THREE.Mesh
    ['assembly_Material_#19_0']: THREE.Mesh
  }
  materials: {
    Material_12: THREE.MeshStandardMaterial
    Material_11: THREE.MeshStandardMaterial
    Material_19: THREE.MeshStandardMaterial
  }
}

interface CustomStationProps {
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** Scale relative to the base model (default 0.6 = slightly smaller than main line) */
  scale?: number
  /** Override colour for the frame. Undefined = use original model material */
  frameColor?: string
  /** Name shown in interaction prompts */
  stationId?: string
}

export function CustomStation({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 0.6,
  frameColor,
  stationId = 'custom_station',
}: CustomStationProps) {
  const { nodes, materials } = useGLTF(MODEL_PATH) as GLTFResult

  // Optionally override the frame material colour without mutating the shared material
  const frameMaterial = useMemo(() => {
    if (!frameColor) return materials.Material_12
    const mat = materials.Material_12.clone()
    mat.color.set(frameColor)
    return mat
  }, [materials.Material_12, frameColor])

  return (
    <RigidBody type="fixed" colliders="cuboid" position={position} rotation={rotation}>
      <group name={stationId} scale={[scale * 0.025, scale * 0.025, scale * 0.025]}>
        <group position={[0, 35.662, 0]}>
          {/* Structural frame — primary visual element */}
          <mesh
            name={`${stationId}_frame`}
            geometry={nodes['assembly_Material_#12_0'].geometry}
            material={frameMaterial}
            castShadow
            receiveShadow
          />
          {/* Side guard / shield */}
          <mesh
            name={`${stationId}_guard`}
            geometry={nodes['assembly_Material_#11_0'].geometry}
            material={materials.Material_11}
            castShadow
          />
          {/* Base plate / foot */}
          <mesh
            name={`${stationId}_base`}
            geometry={nodes['assembly_Material_#19_0'].geometry}
            material={materials.Material_19}
            receiveShadow
          />
        </group>
      </group>
    </RigidBody>
  )
}

// Preloaded by AssemblyLine — no duplicate fetch
// useGLTF.preload(MODEL_PATH)  ← already called in AssemblyLine.tsx
