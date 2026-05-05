'use client'

/**
 * PackagingStation — Tray conveyor + lid closure + label applicator.
 * Scaled to real proportions.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StationBase } from './StationBase'

const MAT = {
  profile: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  tray: new THREE.MeshStandardMaterial({ color: '#8b6914', roughness: 0.6, metalness: 0.1 }),
  lid: new THREE.MeshStandardMaterial({ color: '#4a5568', roughness: 0.5, metalness: 0.4 }),
  belt: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9, metalness: 0.05 }),
  labelArm: new THREE.MeshStandardMaterial({ color: '#3a7bc8', roughness: 0.3, metalness: 0.6 }),
  label: new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.7, metalness: 0.05 }),
  mount: new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.4, metalness: 0.6 }),
  valve: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.35, metalness: 0.5 }),
} as const

interface Props { stationId: string; label: string }

export function PackagingStation({ stationId, label }: Props) {
  const trayRef = useRef<THREE.Group>(null)
  const lidRef = useRef<THREE.Mesh>(null)
  const labelArmRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const cycle = t % 5

    if (trayRef.current) {
      const advance = cycle < 1.5 ? cycle / 1.5 : 1
      trayRef.current.position.x = -0.18 + advance * 0.18
    }

    if (lidRef.current) {
      const close = cycle < 1.5 ? 0 : cycle < 3 ? (cycle - 1.5) / 1.5 : 1
      lidRef.current.rotation.z = -close * Math.PI * 0.5
    }

    if (labelArmRef.current) {
      const swing = cycle < 3 ? 0 : cycle < 4 ? (cycle - 3) : cycle < 4.5 ? 1 - (cycle - 4) * 2 : 0
      labelArmRef.current.rotation.y = -swing * Math.PI * 0.4
    }
  })

  return (
    <StationBase stationId={stationId} label={label}>
      {/* Tray conveyor belt */}
      <mesh position={[0, 0.015, 0]} material={MAT.belt} receiveShadow>
        <boxGeometry args={[0.5, 0.015, 0.14]} />
      </mesh>
      {([-1, 1] as const).map(s => (
        <mesh key={s} position={[0, 0.028, s * 0.075]} material={MAT.profile}>
          <boxGeometry args={[0.5, 0.02, 0.008]} />
        </mesh>
      ))}

      {/* Tray (moving) */}
      <group ref={trayRef} position={[-0.18, 0.03, 0]}>
        <mesh material={MAT.tray}>
          <boxGeometry args={[0.08, 0.03, 0.08]} />
        </mesh>
        {[[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dz], i) => (
          <mesh key={i} position={[dx * 0.035, 0.025, dz * 0.035]} material={MAT.tray}>
            <boxGeometry args={[dx ? 0.006 : 0.08, 0.025, dz ? 0.006 : 0.08]} />
          </mesh>
        ))}
      </group>

      {/* Lid closure mechanism frame */}
      <group position={[0.06, 0, 0]}>
        {([-1, 1] as const).map(s => (
          <mesh key={s} position={[0, 0.12, s * 0.08]} material={MAT.profile} castShadow>
            <boxGeometry args={[0.025, 0.24, 0.025]} />
          </mesh>
        ))}
        <mesh position={[0, 0.14, 0]} material={MAT.mount}>
          <boxGeometry args={[0.02, 0.02, 0.12]} />
        </mesh>
        <mesh ref={lidRef} name={`${stationId}_lid`} position={[0.04, 0.1, 0]} material={MAT.lid}>
          <boxGeometry args={[0.08, 0.005, 0.08]} />
        </mesh>
      </group>

      {/* Label applicator arm */}
      <group ref={labelArmRef} position={[0.2, 0.04, -0.12]}>
        {/* Arm pivot base */}
        <mesh material={MAT.mount}>
          <cylinderGeometry args={[0.02, 0.025, 0.015, 10]} />
        </mesh>
        <mesh name={`${stationId}_label_arm`} position={[0, 0.01, 0.08]} material={MAT.labelArm} castShadow>
          <boxGeometry args={[0.02, 0.02, 0.16]} />
        </mesh>
        <mesh position={[0, 0.005, 0.16]} material={MAT.label}>
          <boxGeometry args={[0.035, 0.006, 0.04]} />
        </mesh>
      </group>

      {/* Valve terminal */}
      <mesh position={[0.25, 0.02, -0.22]} material={MAT.valve}>
        <boxGeometry args={[0.06, 0.04, 0.08]} />
      </mesh>
    </StationBase>
  )
}
