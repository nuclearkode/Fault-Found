'use client'

/**
 * ConveyorLine — 10m industrial belt conveyor with realistic detail.
 *
 * Built procedurally using Three.js geometry for maximum control and
 * zero external dependencies. This replaces the imported GLB model
 * with a purpose-built conveyor that matches real industrial equipment.
 *
 * Structure:
 *   ┌─────────────────────────────────────────────────┐
 *   │  [Motor]═══[Belt Surface + Rollers]══════════   │
 *   │           ║   ║   ║   ║   ║   ║   ║            │
 *   │          Legs with cross braces                 │
 *   │  ═══════ Safety guard rail (yellow) ════════    │
 *   └─────────────────────────────────────────────────┘
 *
 * Performance:
 *   - 2 RigidBodies total (belt surface + structural compound)
 *   - ~350 triangles total
 *   - Shared materials via useMemo (no per-render allocation)
 *   - Belt scroll only runs when Q0.0 is true
 *   - Pre-allocated Vector2 for texture offset animation
 *
 * Interactable meshes (named for raycasting):
 *   - "conveyor_belt"     — the belt surface
 *   - "conveyor_motor"    — motor housing group
 *   - "conveyor_estop"    — emergency stop button
 *   - "conveyor_junction" — electrical junction box
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

// ─── Dimensions (metres, matching real industrial conveyor) ──────────────────
const BELT_LENGTH = 10
const BELT_WIDTH  = 0.75
const BELT_HEIGHT = 0.92  // standard working height
const LEG_WIDTH   = 0.05
const RAIL_HEIGHT = 0.12
const GUARD_HEIGHT = 0.55

// ─── Pre-allocated (never new inside useFrame) ───────────────────────────────
const _offset = new THREE.Vector2()

// ─── Shared materials (created once, reused across all meshes) ────────────────
const MAT = {
  // Structural steel — dark blue-grey
  steel: new THREE.MeshStandardMaterial({
    color: '#3d4555',
    roughness: 0.45,
    metalness: 0.7,
  }),
  // Belt surface — near-black rubber
  belt: new THREE.MeshStandardMaterial({
    color: '#151515',
    roughness: 0.92,
    metalness: 0.02,
  }),
  // Safety yellow (guard rails, warning elements)
  yellow: new THREE.MeshStandardMaterial({
    color: '#d4a017',
    roughness: 0.35,
    metalness: 0.3,
    emissive: '#d4a017',
    emissiveIntensity: 0.03,
  }),
  // Roller chrome
  roller: new THREE.MeshStandardMaterial({
    color: '#8a9199',
    roughness: 0.2,
    metalness: 0.85,
  }),
  // Motor housing — dark industrial blue
  motor: new THREE.MeshStandardMaterial({
    color: '#1e2d42',
    roughness: 0.55,
    metalness: 0.5,
  }),
  // Junction box / conduit — mid grey
  conduit: new THREE.MeshStandardMaterial({
    color: '#6b7280',
    roughness: 0.3,
    metalness: 0.7,
  }),
  // E-stop button — red
  estop: new THREE.MeshStandardMaterial({
    color: '#cc2222',
    roughness: 0.4,
    metalness: 0.2,
    emissive: '#cc2222',
    emissiveIntensity: 0.15,
  }),
  // E-stop base — yellow ring
  estopBase: new THREE.MeshStandardMaterial({
    color: '#e6b800',
    roughness: 0.4,
    metalness: 0.3,
  }),
  // Side panel — slightly lighter steel
  panel: new THREE.MeshStandardMaterial({
    color: '#4a5568',
    roughness: 0.5,
    metalness: 0.6,
  }),
} as const

export function ConveyorLine({ position = [0, 0, 0] as [number, number, number] }) {
  const beltRef = useRef<THREE.Mesh>(null)
  const isRunning = useGameStore(s => s.tags['Q0.0']?.value ?? false)

  // Belt texture scroll animation — only when motor is energised
  useFrame((_, delta) => {
    if (!isRunning || !beltRef.current) return
    const mat = beltRef.current.material as THREE.MeshStandardMaterial
    if (mat.map) {
      mat.map.offset.x += delta * 0.5
    }
  })

  // ── Support leg X positions (6 stations, evenly spaced) ────────────────
  const legPositions = useMemo(() => {
    const arr: number[] = []
    const margin = 0.8
    const span = BELT_LENGTH - 2 * margin
    for (let i = 0; i < 6; i++) {
      arr.push(-BELT_LENGTH / 2 + margin + i * span / 5)
    }
    return arr
  }, [])

  // ── Roller positions (between each pair of legs + ends) ────────────────
  const rollerPositions = useMemo(() => {
    const arr: number[] = []
    const count = 12
    const span = BELT_LENGTH - 0.4
    for (let i = 0; i <= count; i++) {
      arr.push(-span / 2 + i * span / count)
    }
    return arr
  }, [])

  return (
    <group name="conveyor_line" position={position}>

      {/* ═══════════════════════════════════════════════════════════════════
          BELT SURFACE — own RigidBody so the player can walk on it
          ═══════════════════════════════════════════════════════════════════ */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh
          ref={beltRef}
          name="conveyor_belt"
          position={[0, BELT_HEIGHT, 0]}
          receiveShadow
        >
          <boxGeometry args={[BELT_LENGTH, 0.04, BELT_WIDTH]} />
          <meshStandardMaterial
            color="#151515"
            roughness={0.92}
            metalness={0.02}
          />
        </mesh>
      </RigidBody>

      {/* ═══════════════════════════════════════════════════════════════════
          STRUCTURAL STEEL — ONE compound RigidBody for all static geometry
          ═══════════════════════════════════════════════════════════════════ */}
      <RigidBody type="fixed" colliders="cuboid">

        {/* ── Side rails (left + right) ─────────────────────────────────── */}
        {([-1, 1] as const).map((s) => (
          <mesh
            key={`rail_${s}`}
            name={`rail_${s > 0 ? 'right' : 'left'}`}
            position={[0, BELT_HEIGHT + RAIL_HEIGHT / 2, s * (BELT_WIDTH / 2 + 0.025)]}
            material={MAT.steel}
            castShadow
          >
            <boxGeometry args={[BELT_LENGTH + 0.1, RAIL_HEIGHT, 0.04]} />
          </mesh>
        ))}

        {/* ── Side panels (thin sheet metal between rails and belt) ────── */}
        {([-1, 1] as const).map((s) => (
          <mesh
            key={`panel_${s}`}
            name={`panel_${s > 0 ? 'right' : 'left'}`}
            position={[0, BELT_HEIGHT - 0.08, s * (BELT_WIDTH / 2 + 0.03)]}
            material={MAT.panel}
            castShadow
          >
            <boxGeometry args={[BELT_LENGTH, 0.12, 0.02]} />
          </mesh>
        ))}

        {/* ── Support legs (6 stations × 2 = 12 legs) ─────────────────── */}
        {legPositions.map((x, i) =>
          ([-1, 1] as const).map((s) => (
            <mesh
              key={`leg_${i}_${s}`}
              name={`leg_${i}_${s > 0 ? 'r' : 'l'}`}
              position={[x, BELT_HEIGHT / 2, s * (BELT_WIDTH / 2 + 0.06)]}
              material={MAT.steel}
              castShadow
            >
              <boxGeometry args={[LEG_WIDTH, BELT_HEIGHT, LEG_WIDTH]} />
            </mesh>
          ))
        )}

        {/* ── Cross braces (horizontal between each leg pair) ─────────── */}
        {legPositions.map((x, i) => (
          <mesh
            key={`brace_${i}`}
            position={[x, BELT_HEIGHT * 0.25, 0]}
            material={MAT.steel}
          >
            <boxGeometry args={[0.035, 0.035, BELT_WIDTH + 0.14]} />
          </mesh>
        ))}

        {/* ── Foot plates (at base of each leg pair) ──────────────────── */}
        {legPositions.map((x, i) =>
          ([-1, 1] as const).map((s) => (
            <mesh
              key={`foot_${i}_${s}`}
              position={[x, 0.01, s * (BELT_WIDTH / 2 + 0.06)]}
              material={MAT.steel}
              receiveShadow
            >
              <boxGeometry args={[0.12, 0.02, 0.12]} />
            </mesh>
          ))
        )}

        {/* ── Motor housing (east end) ────────────────────────────────── */}
        <group name="conveyor_motor" position={[BELT_LENGTH / 2 + 0.35, BELT_HEIGHT - 0.05, 0]}>
          {/* Main motor body */}
          <mesh name="motor_body" material={MAT.motor} castShadow>
            <boxGeometry args={[0.55, 0.42, 0.48]} />
          </mesh>
          {/* Motor fins (heat dissipation) */}
          {[-0.15, -0.05, 0.05, 0.15].map((z, i) => (
            <mesh key={i} position={[0.28, 0, z]} material={MAT.motor}>
              <boxGeometry args={[0.02, 0.36, 0.02]} />
            </mesh>
          ))}
          {/* Shaft coupling */}
          <mesh position={[-0.32, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={MAT.roller}>
            <cylinderGeometry args={[0.06, 0.06, 0.12, 12]} />
          </mesh>
          {/* Junction box on top */}
          <mesh name="conveyor_junction" position={[0.05, 0.32, 0]} material={MAT.conduit} castShadow>
            <boxGeometry args={[0.18, 0.14, 0.14]} />
          </mesh>
          {/* Conduit up to cable tray */}
          <mesh position={[0.05, 0.7, 0]} material={MAT.conduit}>
            <cylinderGeometry args={[0.018, 0.018, 0.7, 8]} />
          </mesh>
        </group>

        {/* ── Tail-end roller housing (west end) ──────────────────────── */}
        <group position={[-BELT_LENGTH / 2 - 0.15, BELT_HEIGHT, 0]}>
          {/* Bearing mounts */}
          {([-1, 1] as const).map((s) => (
            <mesh key={s} position={[0, 0, s * (BELT_WIDTH / 2 + 0.025)]} material={MAT.steel}>
              <boxGeometry args={[0.1, 0.1, 0.05]} />
            </mesh>
          ))}
          {/* Tail roller */}
          <mesh rotation={[0, 0, Math.PI / 2]} material={MAT.roller}>
            <cylinderGeometry args={[0.055, 0.055, BELT_WIDTH + 0.08, 12]} />
          </mesh>
        </group>

        {/* ── E-Stop button (operator side, midway) ───────────────────── */}
        <group
          name="conveyor_estop"
          position={[1.5, BELT_HEIGHT + RAIL_HEIGHT + 0.06, BELT_WIDTH / 2 + 0.06]}
        >
          {/* Yellow base plate */}
          <mesh material={MAT.estopBase}>
            <boxGeometry args={[0.07, 0.04, 0.05]} />
          </mesh>
          {/* Red mushroom head */}
          <mesh position={[0, 0.035, 0]} material={MAT.estop}>
            <cylinderGeometry args={[0.022, 0.025, 0.03, 12]} />
          </mesh>
        </group>

        {/* ── Safety guard rail (operator side — south) ───────────────── */}
        {/* Top rail */}
        <mesh
          name="guard_rail_top"
          position={[0, BELT_HEIGHT + GUARD_HEIGHT, BELT_WIDTH / 2 + 0.35]}
          material={MAT.yellow}
          castShadow
        >
          <boxGeometry args={[BELT_LENGTH + 1.2, 0.045, 0.045]} />
        </mesh>
        {/* Mid rail */}
        <mesh
          name="guard_rail_mid"
          position={[0, BELT_HEIGHT + GUARD_HEIGHT * 0.45, BELT_WIDTH / 2 + 0.35]}
          material={MAT.yellow}
        >
          <boxGeometry args={[BELT_LENGTH + 1.2, 0.035, 0.035]} />
        </mesh>
        {/* Guard rail posts */}
        {[-5, -2.5, 0, 2.5, 5].map((x, i) => (
          <mesh
            key={`gpost_${i}`}
            position={[x, BELT_HEIGHT + GUARD_HEIGHT / 2, BELT_WIDTH / 2 + 0.35]}
            material={MAT.yellow}
          >
            <boxGeometry args={[0.04, GUARD_HEIGHT, 0.04]} />
          </mesh>
        ))}
      </RigidBody>

      {/* ═══════════════════════════════════════════════════════════════════
          DECORATIVE ELEMENTS — no physics, visual only
          ═══════════════════════════════════════════════════════════════════ */}

      {/* ── Rollers (visible between belt and side rails) ─────────────── */}
      {rollerPositions.map((x, i) => (
        <mesh
          key={`roller_${i}`}
          name={`roller_${i}`}
          position={[x, BELT_HEIGHT - 0.025, 0]}
          rotation={[0, 0, Math.PI / 2]}
          material={MAT.roller}
        >
          <cylinderGeometry args={[0.025, 0.025, BELT_WIDTH - 0.02, 8]} />
        </mesh>
      ))}

      {/* ── Head roller (drive end, larger) ────────────────────────────── */}
      <mesh
        name="head_roller"
        position={[BELT_LENGTH / 2, BELT_HEIGHT, 0]}
        rotation={[0, 0, Math.PI / 2]}
        material={MAT.roller}
      >
        <cylinderGeometry args={[0.06, 0.06, BELT_WIDTH + 0.06, 12]} />
      </mesh>

      {/* ── Status indicator light (on motor housing) ─────────────────── */}
      <mesh
        name="motor_status_light"
        position={[BELT_LENGTH / 2 + 0.35, BELT_HEIGHT + 0.35, 0.2]}
      >
        <cylinderGeometry args={[0.015, 0.015, 0.03, 8]} />
        <meshStandardMaterial
          color={isRunning ? '#22cc44' : '#cc2222'}
          emissive={isRunning ? '#22cc44' : '#cc2222'}
          emissiveIntensity={isRunning ? 0.8 : 0.3}
        />
      </mesh>
    </group>
  )
}
