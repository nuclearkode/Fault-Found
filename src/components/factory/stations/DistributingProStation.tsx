'use client'

/**
 * DistributingProStation — 3 magazines + bidirectional belt.
 * Scaled to real proportions.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StationBase } from './StationBase'

const MAT = {
  profile: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  magazine: new THREE.MeshStandardMaterial({ color: '#b8bcc0', roughness: 0.35, metalness: 0.5 }),
  cylinder: new THREE.MeshStandardMaterial({ color: '#3a7bc8', roughness: 0.3, metalness: 0.6 }),
  belt: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9, metalness: 0.05 }),
  sensor: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.4 }),
  mount: new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.4, metalness: 0.6 }),
  valve: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.35, metalness: 0.5 }),
  btn1: new THREE.MeshStandardMaterial({ color: '#ef4444', roughness: 0.4, metalness: 0.2, emissive: '#ef4444', emissiveIntensity: 0.15 }),
  btn2: new THREE.MeshStandardMaterial({ color: '#3b82f6', roughness: 0.4, metalness: 0.2, emissive: '#3b82f6', emissiveIntensity: 0.15 }),
  btn3: new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.4, metalness: 0.2, emissive: '#22c55e', emissiveIntensity: 0.15 }),
  workpiece: new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.5, metalness: 0.1 }),
} as const

interface Props { stationId: string; label: string }

export function DistributingProStation({ stationId, label }: Props) {
  const push1Ref = useRef<THREE.Mesh>(null)
  const push2Ref = useRef<THREE.Mesh>(null)
  const push3Ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const cycle = t % 6
    const pushRefs = [push1Ref, push2Ref, push3Ref]

    pushRefs.forEach((ref, i) => {
      if (!ref.current) return
      const start = i * 2
      const active = cycle > start && cycle < start + 1
      ref.current.position.x = active ? 0.1 : 0
    })
  })

  return (
    <StationBase stationId={stationId} label={label}>
      {/* 3 Stacking magazines with frame */}
      {[-0.16, 0, 0.16].map((z, i) => (
        <group key={i} position={[-0.18, 0, z]}>
          {/* Magazine body */}
          <mesh material={MAT.magazine} castShadow>
            <boxGeometry args={[0.07, 0.3, 0.07]} />
          </mesh>
          {/* Transparent window */}
          <mesh position={[0, 0, 0.037]}>
            <boxGeometry args={[0.05, 0.22, 0.002]} />
            <meshStandardMaterial color="#aaddff" transparent opacity={0.3} roughness={0.1} metalness={0.2} />
          </mesh>
          {/* Base plate */}
          <mesh position={[0, -0.16, 0]} material={MAT.mount}>
            <boxGeometry args={[0.1, 0.01, 0.1]} />
          </mesh>
          {/* Workpiece stack */}
          {[0, 1, 2].map(j => (
            <mesh key={j} position={[0, -0.1 + j * 0.045, 0]} material={MAT.workpiece}>
              <cylinderGeometry args={[0.024, 0.024, 0.035, 10]} />
            </mesh>
          ))}
          {/* Push cylinder */}
          <mesh
            ref={i === 0 ? push1Ref : i === 1 ? push2Ref : push3Ref}
            name={`${stationId}_push${i + 1}`}
            position={[0, -0.1, 0]}
            rotation={[0, 0, Math.PI / 2]}
            material={MAT.cylinder}
          >
            <cylinderGeometry args={[0.015, 0.015, 0.1, 8]} />
          </mesh>
        </group>
      ))}

      {/* Selector buttons (on a bracket) */}
      <group position={[-0.28, 0.12, 0]}>
        <mesh material={MAT.mount}>
          <boxGeometry args={[0.04, 0.04, 0.5]} />
        </mesh>
        {[
          { z: -0.16, mat: MAT.btn1 },
          { z: 0, mat: MAT.btn2 },
          { z: 0.16, mat: MAT.btn3 },
        ].map(({ z, mat }, i) => (
          <mesh key={i} name={`${stationId}_btn${i + 1}`} position={[0.025, 0, z]} material={mat}>
            <cylinderGeometry args={[0.015, 0.015, 0.012, 10]} />
          </mesh>
        ))}
      </group>

      {/* Bidirectional belt conveyor */}
      <group position={[0.12, 0.01, 0]}>
        <mesh material={MAT.belt} receiveShadow>
          <boxGeometry args={[0.28, 0.015, 0.12]} />
        </mesh>
        {([-1, 1] as const).map(s => (
          <mesh key={s} position={[0, 0.015, s * 0.065]} material={MAT.profile}>
            <boxGeometry args={[0.28, 0.02, 0.008]} />
          </mesh>
        ))}
        {([-1, 1] as const).map(s => (
          <mesh key={`r${s}`} position={[s * 0.14, 0.008, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.mount}>
            <cylinderGeometry args={[0.012, 0.012, 0.12, 8]} />
          </mesh>
        ))}
      </group>

      {/* Sensor array (on belt) */}
      <group position={[0.12, 0.04, 0.08]}>
        <mesh material={MAT.sensor}>
          <boxGeometry args={[0.04, 0.03, 0.02]} />
        </mesh>
        <mesh position={[0, 0, 0.012]} material={MAT.sensor}>
          <cylinderGeometry args={[0.006, 0.006, 0.015, 8]} />
        </mesh>
      </group>

      {/* Valve terminal */}
      <mesh position={[0.25, 0.02, -0.22]} material={MAT.valve}>
        <boxGeometry args={[0.08, 0.04, 0.1]} />
      </mesh>
    </StationBase>
  )
}
