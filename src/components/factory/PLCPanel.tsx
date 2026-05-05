'use client'

/**
 * PLCPanel — Allen-Bradley style PLC cabinet.
 *
 * Performance: LED pulse animation skips when player > 15m away.
 * Will be replaced with a Blender model in Phase 4.
 */

import * as THREE from 'three'
import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import type { Mesh, Group } from 'three'

const CULL_DISTANCE_SQ = 15 * 15 // 15m² — skip animation beyond this

interface PLCPanelProps {
  position?: [number, number, number]
}

export function PLCPanel({ position = [0, 1, -4] }: PLCPanelProps) {
  const indicatorRef = useRef<Mesh>(null)
  const groupRef = useRef<Group>(null)
  const { camera } = useThree()

  // Pulse the power indicator LED — skip when player is far away
  useFrame((state) => {
    if (!indicatorRef.current || !groupRef.current) return

    // Distance culling: skip expensive emissive update when out of range
    const pos = groupRef.current.getWorldPosition(_panelPos)
    const distSq = camera.position.distanceToSquared(pos)
    if (distSq > CULL_DISTANCE_SQ) return

    const mat = indicatorRef.current.material as THREE.MeshStandardMaterial
    const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.5 + 0.5
    mat.emissiveIntensity = 1 + pulse * 2
  })

  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <group ref={groupRef} name="plc_panel">
        {/* Main cabinet body */}
        <mesh name="plc_cabinet_body" castShadow receiveShadow>
          <boxGeometry args={[0.8, 1.6, 0.4]} />
          <meshStandardMaterial
            color="#4a5568"
            roughness={0.6}
            metalness={0.4}
          />
        </mesh>

        {/* Door panel — slightly lighter */}
        <mesh
          name="plc_cabinet_door"
          position={[0, 0, 0.201]}
          castShadow
        >
          <boxGeometry args={[0.74, 1.54, 0.01]} />
          <meshStandardMaterial
            color="#5a6577"
            roughness={0.5}
            metalness={0.3}
          />
        </mesh>

        {/* Allen-Bradley logo area (placeholder stripe) */}
        <mesh
          name="plc_logo_stripe"
          position={[0, 0.65, 0.212]}
        >
          <boxGeometry args={[0.74, 0.08, 0.005]} />
          <meshStandardMaterial
            color="#c62828"
            roughness={0.3}
            metalness={0.1}
            emissive="#c62828"
            emissiveIntensity={0.3}
          />
        </mesh>

        {/* Power indicator LED */}
        <mesh
          ref={indicatorRef}
          name="plc_power_led"
          position={[0.3, 0.72, 0.215]}
        >
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial
            color="#00ff00"
            emissive="#00ff00"
            emissiveIntensity={2}
          />
        </mesh>

        {/* Status LED (amber - fault indicator) */}
        <mesh
          name="plc_status_led"
          position={[0.25, 0.72, 0.215]}
        >
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial
            color="#ff8f00"
            emissive="#ff8f00"
            emissiveIntensity={1.5}
          />
        </mesh>

        {/* Ventilation slots */}
        {[-0.25, -0.15, -0.05, 0.05, 0.15, 0.25].map((x, i) => (
          <mesh
            key={i}
            name={`plc_vent_slot_${i}`}
            position={[x, -0.6, 0.212]}
          >
            <boxGeometry args={[0.06, 0.15, 0.005]} />
            <meshStandardMaterial
              color="#1a1a2e"
              roughness={1}
              metalness={0}
            />
          </mesh>
        ))}

        {/* DIN rail hint (horizontal bar) */}
        <mesh
          name="plc_din_rail"
          position={[0, 0.2, 0.205]}
        >
          <boxGeometry args={[0.7, 0.02, 0.01]} />
          <meshStandardMaterial
            color="#a0a0a0"
            roughness={0.3}
            metalness={0.8}
          />
        </mesh>

        {/* Terminal block strip at bottom */}
        <mesh
          name="plc_terminal_strip"
          position={[0, -0.65, 0.205]}
        >
          <boxGeometry args={[0.7, 0.06, 0.02]} />
          <meshStandardMaterial
            color="#2d3748"
            roughness={0.7}
            metalness={0.2}
          />
        </mesh>
      </group>
    </RigidBody>
  )
}

// Pre-allocated — never new inside useFrame
const _panelPos = new THREE.Vector3()
