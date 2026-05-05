'use client'

/**
 * MeasuringStation — Analogue/digital signal acquisition.
 * Module sits on 700×700mm profile plate. Proportional to player height.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StationBase } from './StationBase'

const MAT = {
  profile: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  slide: new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.3, metalness: 0.8 }),
  probe: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.3, metalness: 0.5 }),
  sensor: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.4 }),
  mount: new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.4, metalness: 0.6 }),
  workpiece: new THREE.MeshStandardMaterial({ color: '#3b82f6', roughness: 0.5, metalness: 0.1 }),
  passLed: new THREE.MeshStandardMaterial({ color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.2 }),
  failLed: new THREE.MeshStandardMaterial({ color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.1, roughness: 0.4, metalness: 0.2 }),
  valve: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.35, metalness: 0.5 }),
  rail: new THREE.MeshStandardMaterial({ color: '#aaa', roughness: 0.25, metalness: 0.8 }),
} as const

interface Props { stationId: string; label: string }

export function MeasuringStation({ stationId, label }: Props) {
  const slideRef = useRef<THREE.Group>(null)
  const probeRef = useRef<THREE.Mesh>(null)
  const passLedRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const cycle = t % 5

    if (slideRef.current) {
      const travel = cycle < 1.5 ? cycle / 1.5 : cycle < 3 ? 1 : cycle < 4.5 ? (4.5 - cycle) / 1.5 : 0
      slideRef.current.position.x = -0.12 + travel * 0.24
    }

    if (probeRef.current) {
      const probe = cycle < 1.5 ? 0 : cycle < 2.2 ? (cycle - 1.5) / 0.7 : cycle < 3 ? (3 - cycle) / 0.8 : 0
      probeRef.current.position.y = 0.28 - probe * 0.12
    }

    if (passLedRef.current) {
      const on = cycle > 2 && cycle < 3
      ;(passLedRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.8 : 0.05
    }
  })

  return (
    <StationBase stationId={stationId} label={label}>
      {/* Linear guide rail */}
      <mesh position={[0, 0.01, 0]} material={MAT.rail}>
        <boxGeometry args={[0.55, 0.015, 0.04]} />
      </mesh>
      {/* Rail mounting blocks */}
      {[-0.2, 0, 0.2].map((x, i) => (
        <mesh key={i} position={[x, 0.005, 0]} material={MAT.mount}>
          <boxGeometry args={[0.04, 0.01, 0.06]} />
        </mesh>
      ))}

      {/* Sliding platform with workpiece */}
      <group ref={slideRef} position={[-0.12, 0.025, 0]}>
        <mesh material={MAT.slide}>
          <boxGeometry args={[0.1, 0.015, 0.08]} />
        </mesh>
        <mesh position={[0, 0.035, 0]} material={MAT.workpiece}>
          <cylinderGeometry args={[0.028, 0.028, 0.04, 12]} />
        </mesh>
      </group>

      {/* Measurement arch (tall T-slot frame) */}
      <group position={[0.08, 0, 0]}>
        {([-1, 1] as const).map(s => (
          <mesh key={s} position={[0, 0.2, s * 0.08]} material={MAT.profile} castShadow>
            <boxGeometry args={[0.03, 0.4, 0.03]} />
          </mesh>
        ))}
        <mesh position={[0, 0.4, 0]} material={MAT.profile}>
          <boxGeometry args={[0.03, 0.03, 0.19]} />
        </mesh>
        {/* Probe assembly */}
        <mesh ref={probeRef} name={`${stationId}_probe`} position={[0, 0.28, 0]} material={MAT.probe}>
          <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
        </mesh>
        {/* Probe cylinder body */}
        <mesh position={[0, 0.35, 0]} material={MAT.valve}>
          <cylinderGeometry args={[0.02, 0.02, 0.06, 10]} />
        </mesh>
      </group>

      {/* Colour sensor (side-mounted on bracket) */}
      <group position={[-0.06, 0, 0.1]}>
        <mesh material={MAT.mount}>
          <boxGeometry args={[0.04, 0.06, 0.01]} />
        </mesh>
        <mesh position={[0, 0.02, 0.015]} material={MAT.sensor}>
          <boxGeometry args={[0.03, 0.03, 0.02]} />
        </mesh>
      </group>

      {/* Pass/Fail LED indicators */}
      <group position={[0.25, 0.08, 0.15]}>
        <mesh material={MAT.mount}>
          <boxGeometry args={[0.06, 0.12, 0.02]} />
        </mesh>
        <mesh ref={passLedRef} name={`${stationId}_pass_led`} position={[0, 0.03, 0.015]} material={MAT.passLed}>
          <cylinderGeometry args={[0.01, 0.01, 0.015, 8]} />
        </mesh>
        <mesh name={`${stationId}_fail_led`} position={[0, -0.03, 0.015]} material={MAT.failLed}>
          <cylinderGeometry args={[0.01, 0.01, 0.015, 8]} />
        </mesh>
      </group>

      {/* Valve terminal */}
      <mesh position={[0.25, 0.02, -0.2]} material={MAT.valve}>
        <boxGeometry args={[0.06, 0.04, 0.08]} />
      </mesh>
    </StationBase>
  )
}
