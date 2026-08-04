'use client'

/**
 * BlenderEnvironment — Loads the complete factory environment from Blender.
 * Replaces the procedural primitive-based FactoryFloor and props.
 *
 * Includes:
 *   - Floor, walls, ceiling
 *   - Ceiling beams, pipes, cable trays
 *   - PLC panels, MCC, Breaker Panel
 *   - Supervisor office, stairs, railings
 *   - Workbench, shelving
 */

import { useRef, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'

export function BlenderEnvironment() {
  const { scene } = useGLTF('/models/factory_env.glb')

  useEffect(() => {
    if (!scene) return

    // Enable shadows on all meshes
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
  }, [scene])

  return (
    <group name="blender_environment">
      {/* We use a single trimesh collider for the static environment.
          This handles the floor, walls, stairs, and all props accurately. */}
      <RigidBody type="fixed" colliders="trimesh">
        <primitive object={scene} />
      </RigidBody>
    </group>
  )
}

useGLTF.preload('/models/factory_env.glb')
