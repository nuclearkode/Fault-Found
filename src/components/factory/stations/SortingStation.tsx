'use client'

/**
 * SortingStation — Belt + 3 deflector gates + sensor bridge + 3 bins.
 * Scaled to real Festo proportions on 700×700mm plate.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StationBase } from './StationBase'

const MAT = {
  profile: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  belt: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9, metalness: 0.05 }),
  gate: new THREE.MeshStandardMaterial({ color: '#3a7bc8', roughness: 0.3, metalness: 0.6 }),
  chute: new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.5, metalness: 0.5 }),
  sensor: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.4 }),
  mount: new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.4, metalness: 0.6 }),
  bin: new THREE.MeshStandardMaterial({ color: '#4a5568', roughness: 0.5, metalness: 0.3 }),
  valve: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.35, metalness: 0.5 }),
} as const

interface Props { stationId: string; label: string }

export function SortingStation({ stationId, label }: Props) {
  const gate1Ref = useRef<THREE.Mesh>(null)
  const gate2Ref = useRef<THREE.Mesh>(null)
  const gate3Ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const cycle = t % 6
    const gates = [gate1Ref, gate2Ref, gate3Ref]

    gates.forEach((ref, i) => {
      if (!ref.current) return
      const gateStart = i * 2
      const open = cycle > gateStart && cycle < gateStart + 1
      ref.current.rotation.y = open ? Math.PI * 0.35 : 0
    })
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
      {/* Belt rollers */}
      {([-1, 1] as const).map(s => (
        <mesh key={`r${s}`} position={[s * 0.27, 0.015, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.mount}>
          <cylinderGeometry args={[0.015, 0.015, 0.1, 8]} />
        </mesh>
      ))}

      {/* Sensor bridge (tall arch) */}
      <group position={[-0.2, 0, 0]}>
        {([-1, 1] as const).map(s => (
          <mesh key={s} position={[0, 0.1, s * 0.07]} material={MAT.sensor} castShadow>
            <boxGeometry args={[0.02, 0.2, 0.02]} />
          </mesh>
        ))}
        <mesh position={[0, 0.2, 0]} material={MAT.sensor}>
          <boxGeometry args={[0.02, 0.02, 0.16]} />
        </mesh>
        {/* Sensor heads (optical + inductive + colour) */}
        <mesh position={[0, 0.14, 0.07]} material={MAT.sensor}>
          <boxGeometry args={[0.025, 0.02, 0.015]} />
        </mesh>
        <mesh position={[0, 0.08, 0.07]} material={MAT.valve}>
          <cylinderGeometry args={[0.008, 0.008, 0.02, 8]} />
        </mesh>
      </group>

      {/* 3 Deflector gates + chutes + bins */}
      {[
        { x: -0.08, ref: gate1Ref },
        { x: 0.08, ref: gate2Ref },
        { x: 0.22, ref: gate3Ref },
      ].map(({ x, ref }, i) => (
        <group key={i} position={[x, 0.03, 0.055]}>
          {/* Gate cylinder mount */}
          <mesh position={[0, 0.02, 0.02]} material={MAT.mount}>
            <boxGeometry args={[0.025, 0.015, 0.025]} />
          </mesh>
          {/* Gate flap */}
          <mesh ref={ref} name={`${stationId}_gate_${i}`} material={MAT.gate}>
            <boxGeometry args={[0.008, 0.04, 0.06]} />
          </mesh>
          {/* Chute (angled slide) */}
          <mesh position={[0, -0.03, 0.1]} rotation={[0.4, 0, 0]} material={MAT.chute}>
            <boxGeometry args={[0.06, 0.006, 0.12]} />
          </mesh>
          {/* Collection bin */}
          <mesh position={[0, -0.06, 0.18]} material={MAT.bin}>
            <boxGeometry args={[0.08, 0.1, 0.06]} />
          </mesh>
        </group>
      ))}

      {/* Valve terminal */}
      <mesh position={[0.22, 0.02, -0.22]} material={MAT.valve}>
        <boxGeometry args={[0.06, 0.04, 0.08]} />
      </mesh>
    </StationBase>
  )
}
