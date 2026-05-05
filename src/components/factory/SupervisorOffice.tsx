'use client'

/**
 * SupervisorOffice — Elevated mezzanine office overlooking the factory floor.
 *
 * Features:
 * - Raised platform (3m above floor) against the south wall
 * - Metal staircase with railing leading up
 * - Glass-fronted office room with door
 * - Metal railing balcony where the supervisor can watch the floor
 * - Interior: desk, chair, monitor, clipboard (visible through glass)
 *
 * Gameplay: The supervisor will angrily burst out of the office and
 * run down the stairs when the player fails. Physics-enabled stairs
 * allow for a trip-and-fall comedy moment.
 */

import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'

const MAT = {
  steel: new THREE.MeshStandardMaterial({ color: '#555e6b', roughness: 0.4, metalness: 0.7 }),
  floor: new THREE.MeshStandardMaterial({ color: '#666', roughness: 0.6, metalness: 0.3 }),
  wall: new THREE.MeshStandardMaterial({ color: '#b8b0a8', roughness: 0.7, metalness: 0.1 }),
  glass: new THREE.MeshStandardMaterial({
    color: '#88bbdd', roughness: 0.05, metalness: 0.2,
    transparent: true, opacity: 0.3,
  }),
  door: new THREE.MeshStandardMaterial({ color: '#4a4a50', roughness: 0.5, metalness: 0.4 }),
  railing: new THREE.MeshStandardMaterial({ color: '#666', roughness: 0.35, metalness: 0.7 }),
  desk: new THREE.MeshStandardMaterial({ color: '#5a4a3a', roughness: 0.7, metalness: 0.1 }),
  monitor: new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.3, metalness: 0.5 }),
  screen: new THREE.MeshStandardMaterial({
    color: '#1a3a5a', roughness: 0.2, metalness: 0.1,
    emissive: '#1a4a7a', emissiveIntensity: 0.3,
  }),
  stairTread: new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.5, metalness: 0.6 }),
  safety: new THREE.MeshStandardMaterial({ color: '#e6b800', roughness: 0.5, metalness: 0.3 }),
} as const

// ─── Dimensions ──────────────────────────────────────────────────────────────
const PLATFORM_H = 3.0    // platform height above ground
const PLATFORM_W = 6.0    // platform width (along wall)
const PLATFORM_D = 4.0    // platform depth (away from wall)
const OFFICE_W = 4.0      // office room width
const OFFICE_D = 3.0      // office room depth
const OFFICE_H = 2.5      // office room height
const STAIR_W = 1.2       // staircase width
const STEP_COUNT = 12     // number of steps

interface Props {
  position?: [number, number, number]
}

export function SupervisorOffice({ position = [0, 0, 0] }: Props) {
  const stepH = PLATFORM_H / STEP_COUNT
  const stepD = 0.3

  return (
    <group name="supervisor_office" position={position}>
      {/* ════════════════════════════════════════════════════════════════
          PLATFORM — reinforced steel decking
          ════════════════════════════════════════════════════════════════ */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh name="mezzanine_floor" position={[0, PLATFORM_H, 0]} material={MAT.floor} receiveShadow castShadow>
          <boxGeometry args={[PLATFORM_W, 0.15, PLATFORM_D]} />
        </mesh>
      </RigidBody>

      {/* Support columns (4 steel I-beams) */}
      {[
        [-PLATFORM_W / 2 + 0.3, -PLATFORM_D / 2 + 0.3],
        [PLATFORM_W / 2 - 0.3, -PLATFORM_D / 2 + 0.3],
        [-PLATFORM_W / 2 + 0.3, PLATFORM_D / 2 - 0.3],
        [PLATFORM_W / 2 - 0.3, PLATFORM_D / 2 - 0.3],
      ].map(([x, z], i) => (
        <RigidBody key={i} type="fixed" colliders="cuboid">
          <mesh position={[x, PLATFORM_H / 2, z]} material={MAT.steel} castShadow>
            <boxGeometry args={[0.15, PLATFORM_H, 0.15]} />
          </mesh>
        </RigidBody>
      ))}

      {/* Cross bracing (X pattern between columns) */}
      {[-PLATFORM_D / 2 + 0.3, PLATFORM_D / 2 - 0.3].map((z, i) => (
        <mesh key={`brace_${i}`} position={[0, PLATFORM_H / 2, z]}
          rotation={[0, 0, Math.atan2(PLATFORM_H, PLATFORM_W - 0.6)]}
          material={MAT.steel}>
          <boxGeometry args={[0.05, Math.sqrt(PLATFORM_H ** 2 + (PLATFORM_W - 0.6) ** 2), 0.05]} />
        </mesh>
      ))}

      {/* ════════════════════════════════════════════════════════════════
          BALCONY RAILING — metal railing along the front edge
          ════════════════════════════════════════════════════════════════ */}
      <group position={[0, PLATFORM_H, -PLATFORM_D / 2]}>
        {/* Top rail */}
        <mesh position={[0, 1.1, 0]} material={MAT.railing}>
          <boxGeometry args={[PLATFORM_W, 0.04, 0.04]} />
        </mesh>
        {/* Middle rail */}
        <mesh position={[0, 0.55, 0]} material={MAT.railing}>
          <boxGeometry args={[PLATFORM_W, 0.03, 0.03]} />
        </mesh>
        {/* Kick plate (bottom) */}
        <mesh position={[0, 0.08, 0]} material={MAT.safety}>
          <boxGeometry args={[PLATFORM_W, 0.15, 0.01]} />
        </mesh>
        {/* Vertical posts */}
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[-PLATFORM_W / 2 + 0.1 + i * (PLATFORM_W - 0.2) / 6, 0.55, 0]} material={MAT.railing}>
            <boxGeometry args={[0.03, 1.1, 0.03]} />
          </mesh>
        ))}
      </group>

      {/* Side railing (left side) */}
      <group position={[-PLATFORM_W / 2, PLATFORM_H, 0]}>
        <mesh position={[0, 1.1, 0]} material={MAT.railing}>
          <boxGeometry args={[0.04, 0.04, PLATFORM_D]} />
        </mesh>
        <mesh position={[0, 0.55, 0]} material={MAT.railing}>
          <boxGeometry args={[0.03, 0.03, PLATFORM_D]} />
        </mesh>
      </group>

      {/* ════════════════════════════════════════════════════════════════
          OFFICE ROOM — glass-fronted, against back wall
          ════════════════════════════════════════════════════════════════ */}
      <group position={[PLATFORM_W / 2 - OFFICE_W / 2 - 0.3, PLATFORM_H + 0.075, PLATFORM_D / 2 - OFFICE_D / 2 - 0.15]}>
        {/* Back wall */}
        <mesh position={[0, OFFICE_H / 2, OFFICE_D / 2]} material={MAT.wall} castShadow>
          <boxGeometry args={[OFFICE_W, OFFICE_H, 0.12]} />
        </mesh>
        {/* Side walls */}
        {([-1, 1] as const).map(s => (
          <mesh key={s} position={[s * OFFICE_W / 2, OFFICE_H / 2, 0]} material={MAT.wall} castShadow>
            <boxGeometry args={[0.12, OFFICE_H, OFFICE_D]} />
          </mesh>
        ))}
        {/* Ceiling */}
        <mesh position={[0, OFFICE_H, 0]} material={MAT.wall}>
          <boxGeometry args={[OFFICE_W, 0.1, OFFICE_D]} />
        </mesh>

        {/* Glass front wall (with door gap) */}
        {/* Left glass panel */}
        <mesh position={[-OFFICE_W / 4 - 0.3, OFFICE_H / 2, -OFFICE_D / 2]} material={MAT.glass}>
          <boxGeometry args={[OFFICE_W / 2 - 0.6, OFFICE_H, 0.04]} />
        </mesh>
        {/* Right glass panel */}
        <mesh position={[OFFICE_W / 4 + 0.3, OFFICE_H / 2, -OFFICE_D / 2]} material={MAT.glass}>
          <boxGeometry args={[OFFICE_W / 2 - 0.6, OFFICE_H, 0.04]} />
        </mesh>
        {/* Glass above door */}
        <mesh position={[0, OFFICE_H - 0.3, -OFFICE_D / 2]} material={MAT.glass}>
          <boxGeometry args={[1.0, 0.5, 0.04]} />
        </mesh>

        {/* Door frame */}
        <mesh name="supervisor_door" position={[0, 1.1, -OFFICE_D / 2 + 0.02]} material={MAT.door}>
          <boxGeometry args={[0.9, 2.1, 0.05]} />
        </mesh>
        {/* Door handle */}
        <mesh position={[0.35, 1.0, -OFFICE_D / 2 - 0.02]} material={MAT.railing}>
          <boxGeometry args={[0.02, 0.1, 0.03]} />
        </mesh>

        {/* Office interior — visible through glass */}
        {/* Desk */}
        <mesh position={[0.5, 0.38, 0.5]} material={MAT.desk}>
          <boxGeometry args={[1.2, 0.04, 0.6]} />
        </mesh>
        {/* Desk legs */}
        {[[-0.1, -0.15], [-0.1, 0.15], [1.1, -0.15], [1.1, 0.15]].map(([dx, dz], i) => (
          <mesh key={i} position={[dx, 0.19, 0.5 + dz]} material={MAT.steel}>
            <boxGeometry args={[0.03, 0.36, 0.03]} />
          </mesh>
        ))}
        {/* Monitor */}
        <mesh position={[0.5, 0.6, 0.65]} material={MAT.monitor}>
          <boxGeometry args={[0.4, 0.28, 0.03]} />
        </mesh>
        <mesh position={[0.5, 0.6, 0.635]} material={MAT.screen}>
          <boxGeometry args={[0.36, 0.24, 0.002]} />
        </mesh>
        {/* Monitor stand */}
        <mesh position={[0.5, 0.42, 0.65]} material={MAT.monitor}>
          <boxGeometry args={[0.06, 0.04, 0.06]} />
        </mesh>

        {/* Office light (ceiling-mounted) */}
        <pointLight
          position={[0, OFFICE_H - 0.3, 0]}
          intensity={0.5}
          color="#f8f4ec"
          distance={6}
          decay={2}
        />
      </group>

      {/* ════════════════════════════════════════════════════════════════
          STAIRCASE — metal stairs with railing on the left side
          ════════════════════════════════════════════════════════════════ */}
      <group position={[-PLATFORM_W / 2 - STAIR_W / 2 - 0.1, 0, 0]}>
        {/* Individual steps (each is a physics body for the trip mechanic) */}
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <RigidBody key={i} type="fixed" colliders="cuboid">
            <mesh
              name={`stair_step_${i}`}
              position={[0, stepH * (i + 0.5), -PLATFORM_D / 2 + 0.3 + i * stepD]}
              material={MAT.stairTread}
              castShadow
            >
              <boxGeometry args={[STAIR_W, stepH * 0.8, stepD * 0.95]} />
            </mesh>
          </RigidBody>
        ))}

        {/* Stair stringers (side beams) */}
        {([-1, 1] as const).map(s => (
          <mesh
            key={s}
            position={[s * (STAIR_W / 2 + 0.03), PLATFORM_H / 2, -PLATFORM_D / 2 + 0.3 + (STEP_COUNT / 2) * stepD]}
            rotation={[Math.atan2(PLATFORM_H, STEP_COUNT * stepD), 0, 0]}
            material={MAT.steel}
          >
            <boxGeometry args={[0.05, Math.sqrt(PLATFORM_H ** 2 + (STEP_COUNT * stepD) ** 2), 0.08]} />
          </mesh>
        ))}

        {/* Stair railing (outer side) */}
        <group position={[STAIR_W / 2 + 0.05, 0, 0]}>
          {/* Top rail follows stair angle */}
          <mesh
            position={[0, PLATFORM_H / 2 + 0.5, -PLATFORM_D / 2 + 0.3 + (STEP_COUNT / 2) * stepD]}
            rotation={[Math.atan2(PLATFORM_H, STEP_COUNT * stepD), 0, 0]}
            material={MAT.railing}
          >
            <boxGeometry args={[0.04, Math.sqrt(PLATFORM_H ** 2 + (STEP_COUNT * stepD) ** 2) + 0.5, 0.04]} />
          </mesh>
          {/* Railing posts */}
          {[0, 3, 6, 9, 11].map(i => (
            <mesh
              key={i}
              position={[0, stepH * (i + 0.5) + 0.5, -PLATFORM_D / 2 + 0.3 + i * stepD]}
              material={MAT.railing}
            >
              <boxGeometry args={[0.03, 1.0, 0.03]} />
            </mesh>
          ))}
        </group>

        {/* Landing at top of stairs */}
        <RigidBody type="fixed" colliders="cuboid">
          <mesh
            position={[STAIR_W / 2 + 0.1, PLATFORM_H, -PLATFORM_D / 2 + 0.3 + STEP_COUNT * stepD]}
            material={MAT.floor}
          >
            <boxGeometry args={[STAIR_W + 0.5, 0.15, 1.2]} />
          </mesh>
        </RigidBody>
      </group>
    </group>
  )
}
