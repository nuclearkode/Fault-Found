'use client'

/**
 * BlenderLine — Loads the Blender-modeled factory line (GLB) and places
 * it as a secondary comparison line parallel to the existing primitives.
 *
 * Position: Z = -7 (3m behind the main line at Z = -4), same X range.
 * This lets the player walk between both lines and compare quality.
 *
 * The GLB contains:
 *   - ST10–ST80 station cabinets with PBR materials
 *   - Mechanical detail (valves, sensors, belts, LED towers)
 *   - Keyframe animations (push cylinders, swing arms, probes)
 *
 * Animations are auto-played in a loop via useFrame + AnimationMixer.
 */

import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// Blender scene was authored in metres — 0.72m station spacing.
// The game's existing line uses 1.3m spacing at 1.5× scale.
// We scale the Blender line to match roughly: scale ~2.0 on each axis
// so the 0.7m cabinets become ~1.4m (close to the 1.05m existing ones).
const BLENDER_SCALE = 2.0

// Position the Blender line 3m behind the main line
const LINE_POSITION: [number, number, number] = [0, 0, -7]

export function BlenderLine() {
  const { scene, animations } = useGLTF('/models/factory_line.glb')
  const groupRef = useRef<THREE.Group>(null)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)

  useEffect(() => {
    if (!scene) return

    // Enable shadows on all meshes
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    // Set up animation mixer if there are animations
    if (animations.length > 0) {
      const mixer = new THREE.AnimationMixer(scene)
      mixerRef.current = mixer

      animations.forEach((clip) => {
        const action = mixer.clipAction(clip)
        action.setLoop(THREE.LoopRepeat, Infinity)
        action.play()
      })

      console.log(`[BlenderLine] Playing ${animations.length} animation(s)`)
    }

    return () => {
      mixerRef.current?.stopAllAction()
      mixerRef.current = null
    }
  }, [scene, animations])

  // Drive the animation mixer each frame
  useFrame((_, delta) => {
    mixerRef.current?.update(delta)
  })

  return (
    <group
      ref={groupRef}
      position={LINE_POSITION}
      scale={[BLENDER_SCALE, BLENDER_SCALE, BLENDER_SCALE]}
      rotation={[0, 0, 0]}
    >
      {/* Label — floating text above the line to distinguish it */}
      <mesh position={[2, 1.2, 0]}>
        <boxGeometry args={[3.5, 0.15, 0.02]} />
        <meshStandardMaterial
          color="#1a1a2e"
          emissive="#e63946"
          emissiveIntensity={0.3}
          roughness={0.5}
          metalness={0.3}
        />
      </mesh>

      {/* The actual Blender scene */}
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload('/models/factory_line.glb')
