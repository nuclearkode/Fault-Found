'use client'

/**
 * SupervisorOffice — Elevated mezzanine office against the south wall.
 *
 * Layout (top-down, looking from above):
 *   ┌─────────────────────────────┐ ← south factory wall
 *   │  [OFFICE with desk/Mac]    │
 *   │  glass front + door        │
 *   ├─────────────────────────────┤
 *   │  [BALCONY with railing]    │ ← overlooks factory floor
 *   └──────────┬──────────────────┘
 *              │ stairs go sideways (west)
 *              └──stairs──┘
 *
 * The back wall of the office IS the factory south wall — no gap.
 * Stairs run along the left (west) side, perpendicular to the wall,
 * going outward from east to west so Derek exits sideways.
 *
 * Interior: L-shaped desk with Mac Studio, Apple Studio Display,
 * portrait/photo on wall, filing cabinet, whiteboard.
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
  desk: new THREE.MeshStandardMaterial({ color: '#ddd', roughness: 0.4, metalness: 0.1 }),
  deskFrame: new THREE.MeshStandardMaterial({ color: '#888', roughness: 0.4, metalness: 0.5 }),
  macStudio: new THREE.MeshStandardMaterial({ color: '#c0c0c0', roughness: 0.15, metalness: 0.8 }),
  monitor: new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.1, metalness: 0.6 }),
  screen: new THREE.MeshStandardMaterial({
    color: '#0a2a4a', roughness: 0.1, metalness: 0.1,
    emissive: '#1a4a7a', emissiveIntensity: 0.35,
  }),
  portrait: new THREE.MeshStandardMaterial({ color: '#2a2520', roughness: 0.7, metalness: 0.1 }),
  portraitImage: new THREE.MeshStandardMaterial({ color: '#8a7a6a', roughness: 0.6, metalness: 0.05 }),
  whiteboard: new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.3, metalness: 0.05 }),
  whiteboardFrame: new THREE.MeshStandardMaterial({ color: '#aaa', roughness: 0.4, metalness: 0.5 }),
  filing: new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.5, metalness: 0.5 }),
  stairTread: new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.5, metalness: 0.6 }),
  safety: new THREE.MeshStandardMaterial({ color: '#e6b800', roughness: 0.5, metalness: 0.3 }),
  chair: new THREE.MeshStandardMaterial({ color: '#1a1a1e', roughness: 0.6, metalness: 0.2 }),
  mug: new THREE.MeshStandardMaterial({ color: '#ddd', roughness: 0.5, metalness: 0.1 }),
  coffee: new THREE.MeshStandardMaterial({ color: '#3a2010', roughness: 0.8, metalness: 0 }),
} as const

// ─── Dimensions ──────────────────────────────────────────────────────────────
const PLATFORM_H = 3.0    // platform height above ground
const PLATFORM_W = 6.0    // platform width (along X, along the wall)
const PLATFORM_D = 4.0    // platform depth (into the room, away from wall)
const OFFICE_W = 4.5      // office room width
const OFFICE_D = 3.0      // office room depth
const OFFICE_H = 2.5      // office room height
const STAIR_W = 1.2       // staircase width
const STEP_COUNT = 12     // number of steps

interface Props {
  position?: [number, number, number]
}

export function SupervisorOffice({ position = [0, 0, 0] }: Props) {
  const stepH = PLATFORM_H / STEP_COUNT
  const stepRun = 0.3  // horizontal run per step (along X)

  return (
    <group name="supervisor_office" position={position}>
      {/* ════════════════════════════════════════════════════════════════
          PLATFORM — reinforced steel decking, pushed against south wall
          ════════════════════════════════════════════════════════════════ */}
      <RigidBody type="fixed" colliders="cuboid">
        <mesh name="mezzanine_floor" position={[0, PLATFORM_H, 0]} material={MAT.floor} receiveShadow castShadow>
          <boxGeometry args={[PLATFORM_W, 0.15, PLATFORM_D]} />
        </mesh>
      </RigidBody>

      {/* Underside ceiling (so it doesn't look open from below) */}
      <mesh position={[0, PLATFORM_H - 0.08, 0]} material={MAT.steel}>
        <boxGeometry args={[PLATFORM_W - 0.1, 0.02, PLATFORM_D - 0.1]} />
      </mesh>

      {/* Support columns (4 steel I-beams) — front pair only visible, back pair against wall */}
      {[
        [-PLATFORM_W / 2 + 0.3, -PLATFORM_D / 2 + 0.3],
        [PLATFORM_W / 2 - 0.3, -PLATFORM_D / 2 + 0.3],
        [-PLATFORM_W / 2 + 0.3, PLATFORM_D / 2 - 0.15],
        [PLATFORM_W / 2 - 0.3, PLATFORM_D / 2 - 0.15],
      ].map(([x, z], i) => (
        <RigidBody key={i} type="fixed" colliders="cuboid">
          <mesh position={[x, PLATFORM_H / 2, z]} material={MAT.steel} castShadow>
            <boxGeometry args={[0.15, PLATFORM_H, 0.15]} />
          </mesh>
        </RigidBody>
      ))}

      {/* Cross bracing (X pattern, front face only — back is against wall) */}
      <mesh position={[0, PLATFORM_H / 2, -PLATFORM_D / 2 + 0.3]}
        rotation={[0, 0, Math.atan2(PLATFORM_H, PLATFORM_W - 0.6)]}
        material={MAT.steel}>
        <boxGeometry args={[0.04, Math.sqrt(PLATFORM_H ** 2 + (PLATFORM_W - 0.6) ** 2), 0.04]} />
      </mesh>
      <mesh position={[0, PLATFORM_H / 2, -PLATFORM_D / 2 + 0.3]}
        rotation={[0, 0, -Math.atan2(PLATFORM_H, PLATFORM_W - 0.6)]}
        material={MAT.steel}>
        <boxGeometry args={[0.04, Math.sqrt(PLATFORM_H ** 2 + (PLATFORM_W - 0.6) ** 2), 0.04]} />
      </mesh>

      {/* ════════════════════════════════════════════════════════════════
          BALCONY RAILING — front edge (overlooks factory)
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
        {/* Kick plate */}
        <mesh position={[0, 0.08, 0]} material={MAT.safety}>
          <boxGeometry args={[PLATFORM_W, 0.15, 0.01]} />
        </mesh>
        {/* Vertical posts — evenly spaced */}
        {Array.from({ length: 7 }, (_, i) => {
          const x = -PLATFORM_W / 2 + 0.15 + i * ((PLATFORM_W - 0.3) / 6)
          return (
            <mesh key={i} position={[x, 0.55, 0]} material={MAT.railing}>
              <boxGeometry args={[0.03, 1.1, 0.03]} />
            </mesh>
          )
        })}
      </group>

      {/* Left side railing (west side — but only the portion NOT occupied by stairs) */}
      <group position={[-PLATFORM_W / 2, PLATFORM_H, PLATFORM_D / 4]}>
        <mesh position={[0, 1.1, 0]} material={MAT.railing}>
          <boxGeometry args={[0.04, 0.04, PLATFORM_D / 2]} />
        </mesh>
        <mesh position={[0, 0.55, 0]} material={MAT.railing}>
          <boxGeometry args={[0.03, 0.03, PLATFORM_D / 2]} />
        </mesh>
      </group>

      {/* ════════════════════════════════════════════════════════════════
          OFFICE ROOM — flush against the south wall (back wall = factory wall)
          ════════════════════════════════════════════════════════════════ */}
      <group position={[PLATFORM_W / 2 - OFFICE_W / 2 - 0.2, PLATFORM_H + 0.075, PLATFORM_D / 2 - OFFICE_D / 2]}>
        {/* Back wall is the factory wall itself — no separate mesh needed.
            Only side walls, ceiling, and glass front. */}

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
        {/* Floor (on top of platform, different colour to mark office) */}
        <mesh position={[0, 0.01, 0]} material={MAT.wall}>
          <boxGeometry args={[OFFICE_W - 0.24, 0.015, OFFICE_D]} />
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
        {/* Transom glass above door */}
        <mesh position={[0, OFFICE_H - 0.3, -OFFICE_D / 2]} material={MAT.glass}>
          <boxGeometry args={[1.0, 0.5, 0.04]} />
        </mesh>

        {/* Door */}
        <mesh name="supervisor_door" position={[0, 1.1, -OFFICE_D / 2 + 0.02]} material={MAT.door}>
          <boxGeometry args={[0.9, 2.1, 0.05]} />
        </mesh>
        {/* Door handle */}
        <mesh position={[0.35, 1.0, -OFFICE_D / 2 - 0.02]} material={MAT.railing}>
          <boxGeometry args={[0.02, 0.1, 0.03]} />
        </mesh>

        {/* ── OFFICE INTERIOR (visible through glass) ── */}

        {/* L-shaped desk (white surface, steel frame — modern style) */}
        {/* Main desk surface (along back wall) */}
        <mesh position={[0.3, 0.38, 0.9]} material={MAT.desk}>
          <boxGeometry args={[1.6, 0.03, 0.6]} />
        </mesh>
        {/* Side extension (L-shape, towards front) */}
        <mesh position={[-0.3, 0.38, 0.4]} material={MAT.desk}>
          <boxGeometry args={[0.5, 0.03, 0.4]} />
        </mesh>
        {/* Desk frame legs */}
        {[[-0.45, 0.65], [-0.45, 1.15], [1.05, 0.65], [1.05, 1.15]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.19, z]} material={MAT.deskFrame}>
            <boxGeometry args={[0.025, 0.36, 0.025]} />
          </mesh>
        ))}
        {/* Frame side rails */}
        <mesh position={[-0.45, 0.03, 0.9]} material={MAT.deskFrame}>
          <boxGeometry args={[0.025, 0.025, 0.5]} />
        </mesh>
        <mesh position={[1.05, 0.03, 0.9]} material={MAT.deskFrame}>
          <boxGeometry args={[0.025, 0.025, 0.5]} />
        </mesh>

        {/* ── MAC STUDIO (silver aluminium box) ── */}
        <mesh position={[0.9, 0.44, 1.05]} material={MAT.macStudio}>
          <boxGeometry args={[0.19, 0.095, 0.19]} />
        </mesh>
        {/* Mac Studio front dots (IO indicators) */}
        <mesh position={[0.9, 0.44, 0.955]} material={MAT.steel}>
          <boxGeometry args={[0.12, 0.003, 0.002]} />
        </mesh>

        {/* ── APPLE STUDIO DISPLAY (thin bezel, aluminium stand) ── */}
        {/* Screen */}
        <mesh position={[0.4, 0.66, 1.0]} material={MAT.monitor}>
          <boxGeometry args={[0.58, 0.36, 0.02]} />
        </mesh>
        {/* Active screen area */}
        <mesh position={[0.4, 0.67, 0.988]} material={MAT.screen}>
          <boxGeometry args={[0.54, 0.32, 0.002]} />
        </mesh>
        {/* Display chin (bezel bottom) */}
        <mesh position={[0.4, 0.47, 1.0]} material={MAT.monitor}>
          <boxGeometry args={[0.58, 0.02, 0.02]} />
        </mesh>
        {/* Stand arm (single aluminium piece) */}
        <mesh position={[0.4, 0.54, 1.1]} material={MAT.macStudio}>
          <boxGeometry args={[0.06, 0.32, 0.015]} />
        </mesh>
        {/* Stand base */}
        <mesh position={[0.4, 0.395, 1.1]} material={MAT.macStudio}>
          <boxGeometry args={[0.2, 0.005, 0.15]} />
        </mesh>

        {/* ── KEYBOARD & MOUSE (on desk) ── */}
        <mesh position={[0.4, 0.40, 0.75]} material={MAT.macStudio}>
          <boxGeometry args={[0.3, 0.008, 0.1]} />
        </mesh>
        {/* Mouse */}
        <mesh position={[0.75, 0.40, 0.75]} material={MAT.macStudio}>
          <boxGeometry args={[0.06, 0.015, 0.1]} />
        </mesh>

        {/* ── COFFEE MUG (essential) ── */}
        <mesh position={[-0.2, 0.42, 0.4]} material={MAT.mug}>
          <cylinderGeometry args={[0.035, 0.03, 0.1, 10]} />
        </mesh>
        {/* Coffee inside */}
        <mesh position={[-0.2, 0.46, 0.4]} material={MAT.coffee}>
          <cylinderGeometry args={[0.03, 0.03, 0.005, 10]} />
        </mesh>

        {/* ── OFFICE CHAIR ── */}
        <mesh position={[0.4, 0.24, 0.5]} material={MAT.chair}>
          <boxGeometry args={[0.45, 0.06, 0.45]} />
        </mesh>
        <mesh position={[0.4, 0.48, 0.73]} material={MAT.chair}>
          <boxGeometry args={[0.45, 0.55, 0.04]} />
        </mesh>
        {/* Chair base (star) */}
        <mesh position={[0.4, 0.08, 0.5]} material={MAT.steel}>
          <cylinderGeometry args={[0.02, 0.02, 0.15, 6]} />
        </mesh>
        {/* Chair casters */}
        {[0, 1, 2, 3, 4].map(i => {
          const angle = (i / 5) * Math.PI * 2
          return (
            <mesh key={i} position={[0.4 + Math.cos(angle) * 0.2, 0.02, 0.5 + Math.sin(angle) * 0.2]} material={MAT.steel}>
              <sphereGeometry args={[0.02, 6, 6]} />
            </mesh>
          )
        })}

        {/* ── PORTRAIT / PHOTO on back wall ── */}
        <mesh position={[-1.0, 1.4, OFFICE_D / 2 - 0.02]} material={MAT.portrait}>
          <boxGeometry args={[0.5, 0.4, 0.03]} />
        </mesh>
        {/* Portrait image (inner rectangle, lighter) */}
        <mesh position={[-1.0, 1.4, OFFICE_D / 2 - 0.04]} material={MAT.portraitImage}>
          <boxGeometry args={[0.42, 0.32, 0.002]} />
        </mesh>

        {/* ── WHITEBOARD on side wall ── */}
        <mesh position={[OFFICE_W / 2 - 0.08, 1.3, 0.2]} material={MAT.whiteboardFrame}>
          <boxGeometry args={[0.04, 0.8, 1.0]} />
        </mesh>
        <mesh position={[OFFICE_W / 2 - 0.1, 1.3, 0.2]} material={MAT.whiteboard}>
          <boxGeometry args={[0.01, 0.7, 0.9]} />
        </mesh>

        {/* ── FILING CABINET (beneath L-desk extension) ── */}
        <mesh position={[-0.8, 0.35, 0.9]} material={MAT.filing}>
          <boxGeometry args={[0.4, 0.7, 0.5]} />
        </mesh>
        {/* Drawer handles */}
        {[0.1, -0.05, -0.2].map((y, i) => (
          <mesh key={i} position={[-0.8, 0.35 + y, 0.645]} material={MAT.railing}>
            <boxGeometry args={[0.08, 0.015, 0.01]} />
          </mesh>
        ))}

        {/* Office light */}
        <pointLight
          position={[0, OFFICE_H - 0.3, 0]}
          intensity={0.6}
          color="#f8f4ec"
          distance={6}
          decay={2}
        />
      </group>

      {/* ════════════════════════════════════════════════════════════════
          STAIRCASE — runs SIDEWAYS along the wall (X-axis),
          going from the left side of the platform outward to the west.
          Steps ascend from west (bottom) to east (top/platform).
          ════════════════════════════════════════════════════════════════ */}
      <group position={[-PLATFORM_W / 2, 0, PLATFORM_D / 4]}>
        {/* Individual steps — each runs along Z (stair width), ascending along -X */}
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <RigidBody key={i} type="fixed" colliders="cuboid">
            <mesh
              name={`stair_step_${i}`}
              position={[-(STEP_COUNT - 1 - i) * stepRun, stepH * (i + 0.5), 0]}
              material={MAT.stairTread}
              castShadow
            >
              <boxGeometry args={[stepRun * 0.95, stepH * 0.8, STAIR_W]} />
            </mesh>
          </RigidBody>
        ))}

        {/* Stair stringers (front and back beams along the stair angle) */}
        {([-1, 1] as const).map(s => {
          const totalRun = STEP_COUNT * stepRun
          const len = Math.sqrt(PLATFORM_H ** 2 + totalRun ** 2)
          const angle = Math.atan2(PLATFORM_H, totalRun)
          return (
            <mesh
              key={s}
              position={[-totalRun / 2, PLATFORM_H / 2, s * (STAIR_W / 2 + 0.03)]}
              rotation={[0, 0, angle]}
              material={MAT.steel}
            >
              <boxGeometry args={[0.05, len, 0.06]} />
            </mesh>
          )
        })}

        {/* Stair railing (outer side — south face, away from wall) */}
        <group position={[0, 0, -STAIR_W / 2 - 0.05]}>
          {/* Top rail follows stair angle */}
          {(() => {
            const totalRun = STEP_COUNT * stepRun
            const len = Math.sqrt(PLATFORM_H ** 2 + totalRun ** 2)
            const angle = Math.atan2(PLATFORM_H, totalRun)
            return (
              <mesh
                position={[-totalRun / 2, PLATFORM_H / 2 + 0.5, 0]}
                rotation={[0, 0, angle]}
                material={MAT.railing}
              >
                <boxGeometry args={[0.04, len + 0.3, 0.04]} />
              </mesh>
            )
          })()}

          {/* Mid rail */}
          {(() => {
            const totalRun = STEP_COUNT * stepRun
            const len = Math.sqrt(PLATFORM_H ** 2 + totalRun ** 2)
            const angle = Math.atan2(PLATFORM_H, totalRun)
            return (
              <mesh
                position={[-totalRun / 2, PLATFORM_H / 2, 0]}
                rotation={[0, 0, angle]}
                material={MAT.railing}
              >
                <boxGeometry args={[0.03, len + 0.3, 0.03]} />
              </mesh>
            )
          })()}

          {/* Railing posts (evenly spaced along stair) */}
          {[0, 3, 6, 9, 11].map(i => (
            <mesh
              key={i}
              position={[-(STEP_COUNT - 1 - i) * stepRun, stepH * (i + 0.5) + 0.5, 0]}
              material={MAT.railing}
            >
              <boxGeometry args={[0.03, 1.0, 0.03]} />
            </mesh>
          ))}
        </group>

        {/* Inner railing (wall side — north face) */}
        <group position={[0, 0, STAIR_W / 2 + 0.05]}>
          {(() => {
            const totalRun = STEP_COUNT * stepRun
            const len = Math.sqrt(PLATFORM_H ** 2 + totalRun ** 2)
            const angle = Math.atan2(PLATFORM_H, totalRun)
            return (
              <mesh
                position={[-totalRun / 2, PLATFORM_H / 2 + 0.5, 0]}
                rotation={[0, 0, angle]}
                material={MAT.railing}
              >
                <boxGeometry args={[0.04, len + 0.3, 0.04]} />
              </mesh>
            )
          })()}
        </group>
      </group>
    </group>
  )
}
