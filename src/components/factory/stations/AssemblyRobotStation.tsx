'use client'

/**
 * AssemblyRobotStation — 4-joint articulated robot arm + fixture.
 * Scaled to real proportions — robot arm stands ~0.5m tall on the plate.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StationBase } from './StationBase'

const MAT = {
  base: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.6 }),
  arm: new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.35, metalness: 0.5 }),
  joint: new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.4, metalness: 0.7 }),
  gripper: new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.4, metalness: 0.5 }),
  fixture: new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.4, metalness: 0.6 }),
  safety: new THREE.MeshStandardMaterial({
    color: '#ef4444', roughness: 0.4, metalness: 0.2,
    emissive: '#ef4444', emissiveIntensity: 0.2, transparent: true, opacity: 0.25,
  }),
  profile: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  mount: new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.4, metalness: 0.6 }),
  sensor: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.4 }),
} as const

interface Props { stationId: string; label: string }

export function AssemblyRobotStation({ stationId, label }: Props) {
  const j1Ref = useRef<THREE.Group>(null)
  const j2Ref = useRef<THREE.Group>(null)
  const j3Ref = useRef<THREE.Group>(null)
  const j4Ref = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (j1Ref.current) j1Ref.current.rotation.y = Math.sin(t * 0.8) * 1.2
    if (j2Ref.current) j2Ref.current.rotation.z = -0.3 + Math.sin(t * 0.6 + 1) * 0.4
    if (j3Ref.current) j3Ref.current.rotation.z = Math.sin(t * 1.0 + 2) * 0.5
    if (j4Ref.current) j4Ref.current.rotation.z = Math.sin(t * 1.4 + 3) * 0.3
  })

  return (
    <StationBase stationId={stationId} label={label}>
      {/* Robot base (heavy pedestal) */}
      <mesh name={`${stationId}_base`} position={[-0.05, 0.04, -0.05]} material={MAT.base} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.08, 16]} />
      </mesh>

      {/* Joint 1 — base rotation */}
      <group ref={j1Ref} position={[-0.05, 0.08, -0.05]}>
        <mesh material={MAT.joint}>
          <cylinderGeometry args={[0.04, 0.04, 0.03, 12]} />
        </mesh>

        {/* Joint 2 — shoulder */}
        <group ref={j2Ref} position={[0, 0.02, 0]}>
          <mesh position={[0, 0.015, 0]} material={MAT.joint}>
            <sphereGeometry args={[0.03, 10, 10]} />
          </mesh>
          {/* Upper arm */}
          <mesh name={`${stationId}_joint2`} position={[0, 0.1, 0]} material={MAT.arm} castShadow>
            <boxGeometry args={[0.04, 0.16, 0.04]} />
          </mesh>

          {/* Joint 3 — elbow */}
          <group ref={j3Ref} position={[0, 0.18, 0]}>
            <mesh material={MAT.joint}>
              <sphereGeometry args={[0.025, 10, 10]} />
            </mesh>
            {/* Forearm */}
            <mesh name={`${stationId}_joint3`} position={[0, 0.07, 0]} material={MAT.arm} castShadow>
              <boxGeometry args={[0.03, 0.12, 0.03]} />
            </mesh>

            {/* Joint 4 — wrist */}
            <group ref={j4Ref} position={[0, 0.13, 0]}>
              <mesh material={MAT.joint}>
                <sphereGeometry args={[0.02, 8, 8]} />
              </mesh>
              {/* Gripper */}
              <group name={`${stationId}_gripper`}>
                <mesh position={[0, 0.03, 0]} material={MAT.gripper}>
                  <boxGeometry args={[0.025, 0.04, 0.025]} />
                </mesh>
                {([-1, 1] as const).map(s => (
                  <mesh key={s} position={[s * 0.018, 0.055, 0]} material={MAT.gripper}>
                    <boxGeometry args={[0.008, 0.025, 0.015]} />
                  </mesh>
                ))}
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* Part fixture (on the plate beside robot) */}
      <group position={[0.2, 0, 0.1]}>
        <mesh name={`${stationId}_fixture`} material={MAT.fixture} castShadow>
          <boxGeometry args={[0.1, 0.02, 0.1]} />
        </mesh>
        {([-1, 1] as const).map(s => (
          <mesh key={s} position={[s * 0.04, 0.025, 0]} material={MAT.mount}>
            <boxGeometry args={[0.01, 0.04, 0.01]} />
          </mesh>
        ))}
        {/* V-block locator */}
        <mesh position={[0, 0.015, -0.04]} material={MAT.mount}>
          <boxGeometry args={[0.06, 0.015, 0.01]} />
        </mesh>
      </group>

      {/* Safety light curtain posts */}
      {([-0.3, 0.3] as const).map((z, i) => (
        <mesh key={i} position={[-0.28, 0.15, z]} material={MAT.sensor} castShadow>
          <boxGeometry args={[0.015, 0.3, 0.015]} />
        </mesh>
      ))}
      {/* Light curtain beam (semi-transparent) */}
      <mesh name={`${stationId}_safety_light`} position={[-0.28, 0.15, 0]} material={MAT.safety}>
        <planeGeometry args={[0.005, 0.3]} />
      </mesh>

      {/* Controller box */}
      <mesh position={[0.28, 0.06, -0.2]} material={MAT.sensor} castShadow>
        <boxGeometry args={[0.06, 0.1, 0.08]} />
      </mesh>
    </StationBase>
  )
}
