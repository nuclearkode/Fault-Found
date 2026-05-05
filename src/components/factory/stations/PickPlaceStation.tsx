'use client'

/**
 * PickPlaceStation — 2-axis gantry with vacuum gripper + belt.
 * Scaled to real Festo proportions on 700×700mm plate.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StationBase } from './StationBase'

const MAT = {
  profile: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  gantry: new THREE.MeshStandardMaterial({ color: '#4a90d9', roughness: 0.3, metalness: 0.6 }),
  gripper: new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.5, metalness: 0.4 }),
  belt: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9, metalness: 0.05 }),
  rail: new THREE.MeshStandardMaterial({ color: '#aaa', roughness: 0.25, metalness: 0.8 }),
  valve: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.35, metalness: 0.5 }),
  mount: new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.4, metalness: 0.6 }),
  tubing: new THREE.MeshStandardMaterial({ color: '#1d4ed8', roughness: 0.4, metalness: 0.2 }),
} as const

interface Props { stationId: string; label: string }

export function PickPlaceStation({ stationId, label }: Props) {
  const carriageRef = useRef<THREE.Group>(null)
  const gripperRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const cycle = t % 6

    if (carriageRef.current) {
      const x = cycle < 1.5 ? cycle / 1.5 : cycle < 3 ? 1 : cycle < 4.5 ? 1 - (cycle - 3) / 1.5 : 0
      carriageRef.current.position.x = -0.12 + x * 0.24
    }

    if (gripperRef.current) {
      let z = 0
      if (cycle > 1.5 && cycle < 2.2) z = (cycle - 1.5) / 0.7
      else if (cycle > 2.2 && cycle < 3) z = 1 - (cycle - 2.2) / 0.8
      else if (cycle > 4.5 && cycle < 5.2) z = (cycle - 4.5) / 0.7
      else if (cycle > 5.2 && cycle < 6) z = 1 - (cycle - 5.2) / 0.8
      gripperRef.current.position.y = -z * 0.1
    }
  })

  return (
    <StationBase stationId={stationId} label={label}>
      {/* Gantry frame — tall T-slot uprights */}
      {([-0.25, 0.25] as const).map((x, i) => (
        <mesh key={i} position={[x, 0.25, 0]} material={MAT.profile} castShadow>
          <boxGeometry args={[0.03, 0.5, 0.03]} />
        </mesh>
      ))}
      {/* Top cross beam (X rail) */}
      <mesh position={[0, 0.5, 0]} material={MAT.rail}>
        <boxGeometry args={[0.54, 0.025, 0.03]} />
      </mesh>
      {/* Cross braces */}
      {([-0.25, 0.25] as const).map((x, i) => (
        <mesh key={`b${i}`} position={[x, 0.25, -0.08]} material={MAT.profile}>
          <boxGeometry args={[0.025, 0.025, 0.15]} />
        </mesh>
      ))}

      {/* Moving carriage */}
      <group ref={carriageRef} position={[-0.12, 0.47, 0]}>
        <mesh material={MAT.gantry}>
          <boxGeometry args={[0.06, 0.04, 0.04]} />
        </mesh>
        {/* Vertical guide rod */}
        <mesh position={[0, -0.12, 0]} material={MAT.rail}>
          <boxGeometry args={[0.015, 0.2, 0.015]} />
        </mesh>
        {/* Gripper assembly */}
        <group ref={gripperRef} position={[0, -0.22, 0]}>
          <mesh name={`${stationId}_gripper`} material={MAT.gripper}>
            <boxGeometry args={[0.05, 0.025, 0.05]} />
          </mesh>
          {/* Suction cups (4) */}
          {[[-0.015, -0.015], [0.015, -0.015], [-0.015, 0.015], [0.015, 0.015]].map(([dx, dz], i) => (
            <mesh key={i} position={[dx, -0.02, dz]} material={MAT.gripper}>
              <cylinderGeometry args={[0.006, 0.004, 0.015, 6]} />
            </mesh>
          ))}
          {/* Air line */}
          <mesh position={[0, 0.03, 0]} material={MAT.tubing}>
            <cylinderGeometry args={[0.004, 0.004, 0.04, 6]} />
          </mesh>
        </group>
      </group>

      {/* Belt conveyor at base */}
      <group position={[0.12, 0.01, 0.15]}>
        <mesh material={MAT.belt} receiveShadow>
          <boxGeometry args={[0.25, 0.015, 0.1]} />
        </mesh>
        {([-1, 1] as const).map(s => (
          <mesh key={s} position={[0, 0.015, s * 0.055]} material={MAT.profile}>
            <boxGeometry args={[0.25, 0.02, 0.008]} />
          </mesh>
        ))}
      </group>

      {/* Valve terminal */}
      <mesh position={[0.25, 0.02, -0.2]} material={MAT.valve}>
        <boxGeometry args={[0.06, 0.04, 0.08]} />
      </mesh>
    </StationBase>
  )
}
