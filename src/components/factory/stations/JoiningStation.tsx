'use client'

/**
 * JoiningStation — Rotary indexing table + press-fit + orientation check.
 * Scaled to real proportions.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StationBase } from './StationBase'

const MAT = {
  profile: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  table: new THREE.MeshStandardMaterial({ color: '#708090', roughness: 0.3, metalness: 0.6 }),
  press: new THREE.MeshStandardMaterial({ color: '#3a7bc8', roughness: 0.3, metalness: 0.6 }),
  sensor: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.4 }),
  slide: new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.4, metalness: 0.6 }),
  mount: new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.4, metalness: 0.6 }),
  valve: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.35, metalness: 0.5 }),
} as const

interface Props { stationId: string; label: string }

export function JoiningStation({ stationId, label }: Props) {
  const tableRef = useRef<THREE.Group>(null)
  const pressRef = useRef<THREE.Mesh>(null)
  const slideRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const cycle = t % 5

    if (tableRef.current) {
      const step = Math.floor(cycle / 1.25)
      const frac = (cycle % 1.25) / 1.25
      const ease = frac < 0.3 ? frac / 0.3 : 1
      tableRef.current.rotation.y = (step + ease * (step < 3 ? 1 : 0)) * Math.PI / 2
    }

    if (pressRef.current) {
      const pd = cycle > 1.25 && cycle < 2.5
      const pf = pd ? Math.sin(((cycle - 1.25) / 1.25) * Math.PI) : 0
      pressRef.current.position.y = 0.3 - pf * 0.12
    }

    if (slideRef.current) {
      const sd = cycle > 3.75
      slideRef.current.position.x = sd ? 0.06 + (cycle - 3.75) / 1.25 * 0.1 : 0.06
    }
  })

  return (
    <StationBase stationId={stationId} label={label}>
      {/* Rotary table assembly */}
      <group position={[-0.05, 0, 0]}>
        {/* Table base */}
        <mesh material={MAT.mount}>
          <cylinderGeometry args={[0.06, 0.07, 0.02, 16]} />
        </mesh>
        <group ref={tableRef} position={[0, 0.02, 0]}>
          <mesh name={`${stationId}_table`} material={MAT.table} castShadow>
            <cylinderGeometry args={[0.14, 0.14, 0.02, 20]} />
          </mesh>
          {/* 4 workpiece fixtures on table */}
          {[0, 1, 2, 3].map(i => (
            <group key={i} position={[Math.cos(i * Math.PI / 2) * 0.09, 0.02, Math.sin(i * Math.PI / 2) * 0.09]}>
              <mesh material={MAT.mount}>
                <cylinderGeometry args={[0.025, 0.025, 0.015, 10]} />
              </mesh>
              {/* Locating pin */}
              <mesh position={[0, 0.015, 0]} material={MAT.profile}>
                <cylinderGeometry args={[0.005, 0.005, 0.015, 6]} />
              </mesh>
            </group>
          ))}
        </group>
      </group>

      {/* Press frame (tall T-slot) */}
      <group position={[0.09, 0, 0.09]}>
        {([-1, 1] as const).map(s => (
          <mesh key={s} position={[0, 0.2, s * 0.06]} material={MAT.profile} castShadow>
            <boxGeometry args={[0.03, 0.4, 0.03]} />
          </mesh>
        ))}
        <mesh position={[0, 0.4, 0]} material={MAT.profile}>
          <boxGeometry args={[0.03, 0.03, 0.15]} />
        </mesh>
        {/* Press cylinder body */}
        <mesh position={[0, 0.35, 0]} material={MAT.valve}>
          <cylinderGeometry args={[0.025, 0.025, 0.06, 10]} />
        </mesh>
        {/* Press head */}
        <mesh ref={pressRef} name={`${stationId}_press`} position={[0, 0.3, 0]} material={MAT.press} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.06, 12]} />
        </mesh>
      </group>

      {/* Orientation sensor */}
      <mesh position={[-0.2, 0.06, 0]} material={MAT.sensor} castShadow>
        <boxGeometry args={[0.035, 0.04, 0.025]} />
      </mesh>
      <mesh position={[-0.2, 0.06, 0.025]} material={MAT.sensor}>
        <cylinderGeometry args={[0.008, 0.008, 0.02, 8]} />
      </mesh>

      {/* Transfer slide */}
      <mesh ref={slideRef} name={`${stationId}_slide`} position={[0.06, 0.015, -0.18]} material={MAT.slide}>
        <boxGeometry args={[0.08, 0.012, 0.12]} />
      </mesh>

      {/* Valve terminal */}
      <mesh position={[0.25, 0.02, -0.22]} material={MAT.valve}>
        <boxGeometry args={[0.06, 0.04, 0.08]} />
      </mesh>
    </StationBase>
  )
}
