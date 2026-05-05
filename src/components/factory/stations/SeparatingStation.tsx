'use client'

/**
 * SeparatingStation — Belt + stopper gate + sensor bridge + diverter.
 * Scaled to real proportions.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StationBase } from './StationBase'

const MAT = {
  profile: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  belt: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9, metalness: 0.05 }),
  stopper: new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.4, metalness: 0.3 }),
  sensor: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.4 }),
  diverter: new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.4, metalness: 0.6 }),
  mount: new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.4, metalness: 0.6 }),
  valve: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.35, metalness: 0.5 }),
  chute: new THREE.MeshStandardMaterial({ color: '#555e6b', roughness: 0.5, metalness: 0.5 }),
} as const

interface Props { stationId: string; label: string }

export function SeparatingStation({ stationId, label }: Props) {
  const stopperRef = useRef<THREE.Mesh>(null)
  const diverterRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const cycle = t % 4

    if (stopperRef.current) {
      const up = cycle < 2 ? 1 : 0
      stopperRef.current.position.y = 0.03 + up * 0.04
    }

    if (diverterRef.current) {
      const active = cycle > 2.5 && cycle < 3.5
      diverterRef.current.rotation.y = active ? Math.PI * 0.3 : 0
    }
  })

  return (
    <StationBase stationId={stationId} label={label}>
      {/* Main belt conveyor */}
      <mesh position={[0, 0.015, 0]} material={MAT.belt} receiveShadow>
        <boxGeometry args={[0.55, 0.015, 0.1]} />
      </mesh>
      {([-1, 1] as const).map(s => (
        <mesh key={s} position={[0, 0.03, s * 0.055]} material={MAT.profile}>
          <boxGeometry args={[0.55, 0.025, 0.008]} />
        </mesh>
      ))}
      {([-1, 1] as const).map(s => (
        <mesh key={`r${s}`} position={[s * 0.27, 0.015, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.mount}>
          <cylinderGeometry args={[0.015, 0.015, 0.1, 8]} />
        </mesh>
      ))}

      {/* Sensor bridge */}
      <group position={[-0.15, 0, 0]}>
        {([-1, 1] as const).map(s => (
          <mesh key={s} position={[0, 0.09, s * 0.07]} material={MAT.sensor} castShadow>
            <boxGeometry args={[0.018, 0.18, 0.018]} />
          </mesh>
        ))}
        <mesh position={[0, 0.18, 0]} material={MAT.sensor}>
          <boxGeometry args={[0.018, 0.018, 0.16]} />
        </mesh>
        <mesh position={[0, 0.12, 0.07]} material={MAT.sensor}>
          <boxGeometry args={[0.025, 0.02, 0.015]} />
        </mesh>
      </group>

      {/* Stopper gate */}
      <group position={[0.06, 0, 0]}>
        <mesh position={[0, 0.01, -0.06]} material={MAT.mount}>
          <boxGeometry args={[0.03, 0.02, 0.03]} />
        </mesh>
        <mesh ref={stopperRef} name={`${stationId}_stopper`} position={[0, 0.03, 0]} material={MAT.stopper}>
          <boxGeometry args={[0.01, 0.05, 0.09]} />
        </mesh>
      </group>

      {/* Diverter flap with cylinder */}
      <group position={[0.18, 0, 0.055]}>
        <mesh position={[0, 0.02, 0.04]} material={MAT.mount}>
          <boxGeometry args={[0.025, 0.015, 0.025]} />
        </mesh>
        <mesh ref={diverterRef} name={`${stationId}_diverter`} position={[0, 0.03, 0]} material={MAT.diverter}>
          <boxGeometry args={[0.008, 0.04, 0.07]} />
        </mesh>
      </group>

      {/* Diversion chute */}
      <mesh position={[0.18, -0.02, 0.16]} rotation={[0.35, 0, 0]} material={MAT.chute}>
        <boxGeometry args={[0.08, 0.006, 0.12]} />
      </mesh>

      {/* Valve terminal */}
      <mesh position={[0.22, 0.02, -0.22]} material={MAT.valve}>
        <boxGeometry args={[0.06, 0.04, 0.08]} />
      </mesh>
    </StationBase>
  )
}
