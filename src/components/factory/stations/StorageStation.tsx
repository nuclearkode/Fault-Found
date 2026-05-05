'use client'

/**
 * StorageStation — Multi-level high-bay rack + X-Z gantry.
 * Matches real Festo storage station reference: tall rack frame with
 * aluminum T-slot profiles, multiple shelf levels, X-Z servo gantry.
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StationBase } from './StationBase'

const MAT = {
  profile: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  shelf: new THREE.MeshStandardMaterial({ color: '#4a5568', roughness: 0.5, metalness: 0.4 }),
  gantry: new THREE.MeshStandardMaterial({ color: '#3a7bc8', roughness: 0.3, metalness: 0.6 }),
  extractor: new THREE.MeshStandardMaterial({ color: '#555e6b', roughness: 0.4, metalness: 0.5 }),
  rail: new THREE.MeshStandardMaterial({ color: '#aaa', roughness: 0.25, metalness: 0.8 }),
  mount: new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.4, metalness: 0.6 }),
  valve: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.35, metalness: 0.5 }),
} as const

interface Props { stationId: string; label: string }

export function StorageStation({ stationId, label }: Props) {
  const gantryXRef = useRef<THREE.Group>(null)
  const gantryZRef = useRef<THREE.Group>(null)
  const extractorRef = useRef<THREE.Mesh>(null)

  const cells = useMemo(() => {
    const arr: [number, number][] = []
    for (let col = 0; col < 3; col++)
      for (let row = 0; row < 5; row++)
        arr.push([col, row])
    return arr
  }, [])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const cycle = t % 10
    const cellIndex = Math.floor(cycle / (10 / 15)) % 15
    const [col, row] = cells[cellIndex]

    if (gantryXRef.current) {
      const targetX = -0.1 + col * 0.1
      gantryXRef.current.position.x += (targetX - gantryXRef.current.position.x) * 0.05
    }

    if (gantryZRef.current) {
      const targetY = 0.08 + row * 0.1
      gantryZRef.current.position.y += (targetY - gantryZRef.current.position.y) * 0.05
    }

    if (extractorRef.current) {
      const cellFrac = (cycle % (10 / 15)) / (10 / 15)
      const extend = cellFrac > 0.3 && cellFrac < 0.7
      extractorRef.current.position.z = extend ? 0.06 : 0
    }
  })

  return (
    <StationBase stationId={stationId} label={label}>
      {/* High-bay rack frame — T-slot aluminum profiles */}
      {/* 4 vertical corner uprights */}
      {[
        [-0.18, -0.1], [0.18, -0.1],
        [-0.18, 0.1], [0.18, 0.1],
      ].map(([x, z], i) => (
        <mesh key={`up_${i}`} position={[x, 0.3, z]} material={MAT.profile} castShadow>
          <boxGeometry args={[0.025, 0.6, 0.025]} />
        </mesh>
      ))}

      {/* Top frame */}
      <mesh position={[0, 0.6, 0]} material={MAT.profile}>
        <boxGeometry args={[0.41, 0.025, 0.025]} />
      </mesh>
      {([-0.18, 0.18] as const).map((x, i) => (
        <mesh key={`tf_${i}`} position={[x, 0.6, 0]} material={MAT.profile}>
          <boxGeometry args={[0.025, 0.025, 0.225]} />
        </mesh>
      ))}

      {/* Shelf levels (5 rows) */}
      {[0, 1, 2, 3, 4].map(row => (
        <mesh key={row} position={[0, 0.06 + row * 0.1, 0.1]} material={MAT.shelf}>
          <boxGeometry args={[0.38, 0.006, 0.18]} />
        </mesh>
      ))}

      {/* Cell dividers (2 vertical dividers per level) */}
      {[0, 1, 2, 3, 4].map(row =>
        [-0.06, 0.06].map((x, i) => (
          <mesh key={`div_${row}_${i}`} position={[x, 0.085 + row * 0.1, 0.1]} material={MAT.shelf}>
            <boxGeometry args={[0.005, 0.085, 0.16]} />
          </mesh>
        ))
      )}

      {/* X-axis rail (horizontal, in front of rack) */}
      <mesh position={[0, 0.02, -0.14]} material={MAT.rail}>
        <boxGeometry args={[0.4, 0.012, 0.012]} />
      </mesh>

      {/* Gantry assembly */}
      <group ref={gantryXRef} position={[0, 0, -0.14]}>
        {/* Vertical rail (Z axis) */}
        <mesh material={MAT.gantry}>
          <boxGeometry args={[0.015, 0.6, 0.015]} />
        </mesh>

        {/* Moving carriage on Z rail */}
        <group ref={gantryZRef} position={[0, 0.08, 0]}>
          <mesh material={MAT.gantry}>
            <boxGeometry args={[0.03, 0.03, 0.02]} />
          </mesh>

          {/* Extractor arm */}
          <mesh ref={extractorRef} name={`${stationId}_extractor`} position={[0, 0, 0]} material={MAT.extractor}>
            <boxGeometry args={[0.08, 0.01, 0.1]} />
          </mesh>
        </group>
      </group>

      {/* Valve terminal */}
      <mesh position={[0.22, 0.02, -0.22]} material={MAT.valve}>
        <boxGeometry args={[0.06, 0.04, 0.08]} />
      </mesh>
    </StationBase>
  )
}
