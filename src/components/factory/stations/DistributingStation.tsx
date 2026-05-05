'use client'

/**
 * DistributingStation — Feeds workpieces into the production line.
 *
 * Real Festo reference: stacking magazine with gravity feed, double-acting
 * push cylinder, rotary swing arm with vacuum suction cup, belt module.
 *
 * Module sits on top of the 700×700mm profile plate.
 * All geometry scaled to match real proportions relative to the cabinet.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StationBase } from './StationBase'

const MAT = {
  profile: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  cylinder: new THREE.MeshStandardMaterial({ color: '#3a7bc8', roughness: 0.3, metalness: 0.6 }),
  magazine: new THREE.MeshStandardMaterial({ color: '#b8bcc0', roughness: 0.35, metalness: 0.5 }),
  belt: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9, metalness: 0.05 }),
  suction: new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.6, metalness: 0.3 }),
  valve: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.35, metalness: 0.5 }),
  tubing: new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.4, metalness: 0.2 }),
  mount: new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.4, metalness: 0.6 }),
  glass: new THREE.MeshStandardMaterial({ color: '#aaddff', transparent: true, opacity: 0.3, roughness: 0.1, metalness: 0.2 }),
  sensor: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.4 }),
} as const

interface Props { stationId: string; label: string }

export function DistributingStation({ stationId, label }: Props) {
  const cylinderRef = useRef<THREE.Mesh>(null)
  const armRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const cycle = t % 4

    if (cylinderRef.current) {
      const extend = cycle < 1 ? cycle : cycle < 2 ? 2 - cycle : 0
      cylinderRef.current.position.x = 0.08 + extend * 0.12
    }

    if (armRef.current) {
      const swing = cycle < 2 ? 0 : cycle < 3.5 ? (cycle - 2) / 1.5 : 1
      armRef.current.rotation.y = -swing * Math.PI * 0.5
    }
  })

  return (
    <StationBase stationId={stationId} label={label}>
      {/* Vertical profile uprights (T-slot aluminum frame) */}
      {[
        [-0.28, 0, -0.28], [0.28, 0, -0.28],
        [-0.28, 0, 0.28], [0.28, 0, 0.28],
      ].map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.2, pos[2]]} material={MAT.profile} castShadow>
          <boxGeometry args={[0.03, 0.4, 0.03]} />
        </mesh>
      ))}

      {/* Stacking magazine (tall vertical tube) */}
      <group position={[-0.18, 0.02, 0]}>
        {/* Magazine body — rectangular tube */}
        <mesh material={MAT.magazine} castShadow>
          <boxGeometry args={[0.08, 0.35, 0.08]} />
        </mesh>
        {/* Transparent front window */}
        <mesh position={[0, 0, 0.042]} material={MAT.glass}>
          <boxGeometry args={[0.06, 0.28, 0.002]} />
        </mesh>
        {/* Magazine top cap */}
        <mesh position={[0, 0.18, 0]} material={MAT.mount}>
          <boxGeometry args={[0.09, 0.01, 0.09]} />
        </mesh>
        {/* Base plate */}
        <mesh position={[0, -0.18, 0]} material={MAT.mount}>
          <boxGeometry args={[0.12, 0.01, 0.12]} />
        </mesh>
        {/* Magazine sensor (detects empty) */}
        <mesh position={[0.045, -0.1, 0]} material={MAT.sensor}>
          <boxGeometry args={[0.015, 0.02, 0.015]} />
        </mesh>
      </group>

      {/* Push cylinder (double-acting) */}
      <group position={[-0.18, 0.02, 0.15]}>
        <mesh position={[0, -0.14, 0]} material={MAT.mount}>
          <boxGeometry args={[0.06, 0.01, 0.04]} />
        </mesh>
        <mesh ref={cylinderRef} name={`${stationId}_cylinder`}
          position={[0.08, -0.12, 0]} rotation={[0, 0, Math.PI / 2]}
          material={MAT.cylinder} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.15, 10]} />
        </mesh>
        {/* Cylinder end fittings */}
        <mesh position={[0, -0.12, 0]} material={MAT.valve}>
          <boxGeometry args={[0.03, 0.03, 0.03]} />
        </mesh>
      </group>

      {/* Rotary swing arm assembly */}
      <group position={[0.05, 0.04, 0]}>
        {/* Pivot base */}
        <mesh material={MAT.mount}>
          <cylinderGeometry args={[0.035, 0.04, 0.02, 12]} />
        </mesh>
        <group ref={armRef} position={[0, 0.02, 0]}>
          {/* Arm beam */}
          <mesh material={MAT.profile} castShadow>
            <boxGeometry args={[0.25, 0.025, 0.03]} />
          </mesh>
          {/* Suction cup holder at end */}
          <mesh position={[0.12, -0.015, 0]} material={MAT.suction}>
            <cylinderGeometry args={[0.02, 0.015, 0.03, 10]} />
          </mesh>
          {/* Air tubing */}
          <mesh position={[0.06, 0.02, 0]} material={MAT.tubing}>
            <cylinderGeometry args={[0.004, 0.004, 0.15, 6]} />
          </mesh>
        </group>
      </group>

      {/* Valve terminal (pneumatic manifold) */}
      <group position={[0.22, 0.02, -0.2]}>
        <mesh material={MAT.valve}>
          <boxGeometry args={[0.06, 0.04, 0.1]} />
        </mesh>
        {[0, 1, 2].map(i => (
          <mesh key={i} position={[0.035, 0, -0.03 + i * 0.03]} material={MAT.tubing}>
            <cylinderGeometry args={[0.004, 0.004, 0.03, 6]} />
          </mesh>
        ))}
      </group>

      {/* Short belt module */}
      <group position={[0.2, 0, 0.1]}>
        <mesh material={MAT.belt} receiveShadow>
          <boxGeometry args={[0.2, 0.015, 0.1]} />
        </mesh>
        {([-1, 1] as const).map(s => (
          <mesh key={s} position={[0, 0.015, s * 0.055]} material={MAT.profile}>
            <boxGeometry args={[0.2, 0.02, 0.008]} />
          </mesh>
        ))}
        {/* Belt rollers visible at ends */}
        {([-1, 1] as const).map(s => (
          <mesh key={`r${s}`} position={[s * 0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.mount}>
            <cylinderGeometry args={[0.012, 0.012, 0.1, 8]} />
          </mesh>
        ))}
        {/* Belt motor housing */}
        <mesh position={[-0.12, -0.02, 0]} material={MAT.mount}>
          <boxGeometry args={[0.04, 0.04, 0.06]} />
        </mesh>
        {/* Belt entry sensor */}
        <mesh position={[-0.08, 0.03, 0.06]} material={MAT.sensor}>
          <boxGeometry args={[0.02, 0.025, 0.012]} />
        </mesh>
        <mesh position={[-0.08, 0.03, -0.06]} material={MAT.sensor}>
          <boxGeometry args={[0.02, 0.025, 0.012]} />
        </mesh>
      </group>

      {/* Pneumatic tubing runs (connecting cylinder + valve + arm) */}
      <mesh position={[0, 0.04, -0.1]} material={MAT.tubing}>
        <cylinderGeometry args={[0.003, 0.003, 0.3, 6]} />
      </mesh>
      <mesh position={[0.1, 0.04, -0.15]} rotation={[0, 0, Math.PI / 2]} material={MAT.tubing}>
        <cylinderGeometry args={[0.003, 0.003, 0.15, 6]} />
      </mesh>
    </StationBase>
  )
}
