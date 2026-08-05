'use client'

/**
 * FactoryProps — workbench, shelving, pipe runs, cable trays, and the set
 * dressing that makes the shed read as a shed people work in.
 *
 * The dressing is deliberately restrained. Everything below is either a thing a
 * real building needs to be legal (fire point, first aid, drains' worth of
 * services, containment for the cables feeding the panels) or a thing that
 * accumulates where work happens (pallets by the wall, a bin at the end of the
 * line). Nothing is here to fill space, and nothing stands in a marked route,
 * on the silo cell (x −5.1..3.0, z −4.4..−2.4) or on the office (x 9.6..15,
 * z 5.6..10) — those clearances are checked in the comments at each placement.
 */

import { RigidBody, CuboidCollider } from '@react-three/rapier'
import { useMemo } from 'react'
import * as THREE from 'three'
import { FACTORY } from './FactoryFloor'

export function Workbench({
  position = [-10, 0, 6] as [number, number, number],
  rotation = [0, 0, 0] as [number, number, number],
}) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position} rotation={rotation}>
      <group name="workbench">
        {/* Table top */}
        <mesh name="workbench_top" position={[0, 0.9, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.06, 0.8]} />
          <meshStandardMaterial color="#5c4a3a" roughness={0.8} metalness={0.1} />
        </mesh>
        {/* Legs */}
        {[[-1.1, 0, -0.35], [-1.1, 0, 0.35], [1.1, 0, -0.35], [1.1, 0, 0.35]].map((p, i) => (
          <mesh key={i} name={`bench_leg_${i}`} position={[p[0], 0.45, p[2]]} castShadow>
            <boxGeometry args={[0.05, 0.9, 0.05]} />
            <meshStandardMaterial color="#4a4a50" roughness={0.5} metalness={0.6} />
          </mesh>
        ))}
        {/* Backboard / pegboard */}
        <mesh name="workbench_pegboard" position={[0, 1.5, -0.38]} castShadow>
          <boxGeometry args={[2.4, 1.2, 0.04]} />
          <meshStandardMaterial color="#6b6b5a" roughness={0.9} metalness={0.05} />
        </mesh>
        {/* Vise */}
        <mesh name="workbench_vise" position={[0.8, 0.98, 0]} castShadow>
          <boxGeometry args={[0.15, 0.12, 0.2]} />
          <meshStandardMaterial color="#4a5568" roughness={0.4} metalness={0.7} />
        </mesh>
      </group>
    </RigidBody>
  )
}

export function IndustrialShelving({
  position = [13, 0, -5] as [number, number, number],
  rotation = [0, 0, 0] as [number, number, number],
}) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position} rotation={rotation}>
      <group name="shelving">
        {/* Uprights */}
        {[-1.2, 1.2].map((x, i) => (
          <mesh key={i} name={`shelf_upright_${i}`} position={[x, 1.2, 0]} castShadow>
            <boxGeometry args={[0.05, 2.4, 0.5]} />
            <meshStandardMaterial color="#5a6370" roughness={0.4} metalness={0.7} />
          </mesh>
        ))}
        {/* Shelves (3 levels) */}
        {[0.5, 1.2, 1.9].map((y, i) => (
          <mesh key={i} name={`shelf_${i}`} position={[0, y, 0]} receiveShadow>
            <boxGeometry args={[2.5, 0.04, 0.5]} />
            <meshStandardMaterial color="#4a5060" roughness={0.5} metalness={0.5} />
          </mesh>
        ))}
        {/* Some boxes on shelves */}
        <mesh name="shelf_box_1" position={[-0.5, 0.62, 0]} castShadow>
          <boxGeometry args={[0.3, 0.2, 0.25]} />
          <meshStandardMaterial color="#8B6914" roughness={0.9} metalness={0} />
        </mesh>
        <mesh name="shelf_box_2" position={[0.3, 1.32, 0.05]} castShadow>
          <boxGeometry args={[0.4, 0.2, 0.3]} />
          <meshStandardMaterial color="#8B6914" roughness={0.9} metalness={0} />
        </mesh>
      </group>
    </RigidBody>
  )
}

export function CeilingPipes() {
  const pipes = useMemo(() => [
    { pos: [-8, FACTORY.HEIGHT - 0.5, 0] as [number, number, number], len: FACTORY.DEPTH - 1, axis: 'z' as const, r: 0.06, color: '#6b7280' },
    { pos: [-8.3, FACTORY.HEIGHT - 0.7, 0] as [number, number, number], len: FACTORY.DEPTH - 1, axis: 'z' as const, r: 0.04, color: '#d97706' },
    { pos: [8, FACTORY.HEIGHT - 0.5, 0] as [number, number, number], len: FACTORY.DEPTH - 1, axis: 'z' as const, r: 0.05, color: '#6b7280' },
    { pos: [0, FACTORY.HEIGHT - 0.4, -FACTORY.DEPTH / 2 + 1] as [number, number, number], len: FACTORY.WIDTH - 4, axis: 'x' as const, r: 0.07, color: '#4a5568' },
  ], [])

  return (
    <group name="ceiling_pipes">
      {pipes.map((pipe, i) => (
        <mesh
          key={i}
          name={`pipe_${i}`}
          position={pipe.pos}
          rotation={pipe.axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[pipe.r, pipe.r, pipe.len, 12]} />
          <meshStandardMaterial color={pipe.color} roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

export function CableTray({ position = [4, FACTORY.HEIGHT - 0.8, 0] as [number, number, number] }) {
  return (
    <group name="cable_tray" position={position}>
      {/* Tray bottom */}
      <mesh name="tray_bottom" position={[0, 0, 0]}>
        <boxGeometry args={[0.4, 0.02, FACTORY.DEPTH - 2]} />
        <meshStandardMaterial color="#5a6370" roughness={0.5} metalness={0.6} />
      </mesh>
      {/* Tray sides */}
      {[-1, 1].map((s) => (
        <mesh key={s} name={`tray_side_${s}`} position={[s * 0.2, 0.04, 0]}>
          <boxGeometry args={[0.02, 0.08, FACTORY.DEPTH - 2]} />
          <meshStandardMaterial color="#5a6370" roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      {/* Cable bundles — round, and three of them.
          They were one flat slab at #1a1a2e, which from the floor read as a
          black hole in the ceiling rather than cables: a matte near-black plane
          returns almost nothing, and the tray it sits in is directly under a
          light row, so the metal around it blew out white and framed the void.
          Cylinders catch a highlight along their length, which is the whole
          reason a bundle of cable looks like cable. */}
      {([
        [-0.1, '#2f333c'],
        [0.0, '#4a4f59'],
        [0.1, '#6b3a34'],
      ] as const).map(([x, colour], i) => (
        <mesh
          key={i}
          name={`cables_bundle_${i}`}
          position={[x, 0.06, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[0.045, 0.045, FACTORY.DEPTH - 3, 8]} />
          <meshStandardMaterial color={colour} roughness={0.75} metalness={0.05} />
        </mesh>
      ))}
    </group>
  )
}

export function MotorControlCenter({ position = [13, 0, 5] as [number, number, number] }) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <group name="mcc">
        {/* Main cabinet */}
        <mesh name="mcc_cabinet" position={[0, 1.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[2, 2.4, 0.6]} />
          <meshStandardMaterial color="#3a4050" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Door panels (3 buckets) */}
        {[-0.65, 0, 0.65].map((x, i) => (
          <mesh key={i} name={`mcc_door_${i}`} position={[x, 1.2, 0.305]}>
            <boxGeometry args={[0.6, 2.3, 0.01]} />
            <meshStandardMaterial color="#4a5568" roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
        {/* Handle per door */}
        {[-0.65, 0, 0.65].map((x, i) => (
          <mesh key={i} name={`mcc_handle_${i}`} position={[x + 0.2, 1.2, 0.32]}>
            <boxGeometry args={[0.03, 0.12, 0.03]} />
            <meshStandardMaterial color="#9ca3af" roughness={0.3} metalness={0.8} />
          </mesh>
        ))}
        {/* Danger label */}
        <mesh name="mcc_danger_label" position={[0, 2.2, 0.31]}>
          <boxGeometry args={[0.6, 0.12, 0.005]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} emissive="#dc2626" emissiveIntensity={0.1} />
        </mesh>
      </group>
    </RigidBody>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
//  SET DRESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Shared dressing materials.
 *
 * Module-level singletons, referenced by every dressing mesh via the `material`
 * prop. The dressing below is roughly ninety small boxes; declaring
 * `<meshStandardMaterial>` inline would mean ninety distinct materials for about
 * ten distinct surfaces, and ninety chances for one of them to drift in colour.
 */
const DRESS = {
  galv: new THREE.MeshStandardMaterial({ color: '#9aa1a8', roughness: 0.45, metalness: 0.75 }),
  conduit: new THREE.MeshStandardMaterial({ color: '#7c838b', roughness: 0.5, metalness: 0.6 }),
  greyBox: new THREE.MeshStandardMaterial({ color: '#6f7680', roughness: 0.55, metalness: 0.35 }),
  red: new THREE.MeshStandardMaterial({ color: '#a4241f', roughness: 0.55, metalness: 0.1 }),
  redGloss: new THREE.MeshStandardMaterial({ color: '#c62b22', roughness: 0.3, metalness: 0.25 }),
  green: new THREE.MeshStandardMaterial({ color: '#1f6b3c', roughness: 0.5, metalness: 0.1 }),
  white: new THREE.MeshStandardMaterial({ color: '#eceff1', roughness: 0.6, metalness: 0.02 }),
  black: new THREE.MeshStandardMaterial({ color: '#26292d', roughness: 0.6, metalness: 0.3 }),
  timber: new THREE.MeshStandardMaterial({ color: '#a98a5e', roughness: 0.95, metalness: 0 }),
  card: new THREE.MeshStandardMaterial({ color: '#9c7a4f', roughness: 0.95, metalness: 0 }),
  binBody: new THREE.MeshStandardMaterial({ color: '#3f5a86', roughness: 0.6, metalness: 0.05 }),
  binLid: new THREE.MeshStandardMaterial({ color: '#2f4568', roughness: 0.55, metalness: 0.05 }),
} as const

/** Inner faces of the shell, so wall-mounted kit sits ON the wall. */
const WALL_N = -FACTORY.DEPTH / 2
const WALL_S = FACTORY.DEPTH / 2
const WALL_W = -FACTORY.WIDTH / 2
const WALL_E = FACTORY.WIDTH / 2

// ── Containment: trunking and conduit feeding the panels ────────────────────

/** Height of the horizontal trunking runs. Above head height, below the beams. */
const TRUNK_Y = 3.2
const TRUNK_H = 0.13
const TRUNK_D = 0.14
/** Centre line of a run sitting flat against a wall face. */
const TRUNK_N_Z = WALL_N + TRUNK_D / 2
const TRUNK_W_X = WALL_W + TRUNK_D / 2
const TRUNK_E_X = WALL_E - TRUNK_D / 2
/** Top of the conduit drops — they leave the underside of the trunking. */
const DROP_TOP = TRUNK_Y - TRUNK_H / 2
const CONDUIT_R = 0.035

interface Drop {
  /** Where the drop hangs on the floor plan, [x, z]. */
  pos: [number, number]
  /** How far down it goes — the top of the enclosure it terminates in. */
  bottom: number
  name: string
}

/**
 * Every conduit drop, and the piece of switchgear it feeds.
 *
 * Bottoms are the tops of the actual enclosures: the PLC cabinets are 1.6 m tall
 * centred at y = 1, so y = 1.8; the MCC is 2.4 m from the floor; the breaker
 * panel is 0.9 m centred at 1.6, so y = 2.05.
 */
const DROPS: Drop[] = [
  { pos: [6.0, TRUNK_N_Z], bottom: 1.80, name: 'plc_a' },
  { pos: [7.4, TRUNK_N_Z], bottom: 1.80, name: 'plc_b' },
  { pos: [10.2, TRUNK_N_Z], bottom: 2.40, name: 'mcc' },
  { pos: [TRUNK_W_X, -5.0], bottom: 2.05, name: 'breaker' },
  // Bench supply. Kept at z = 1.6 rather than over the bench itself: the
  // workbench pegboard, once turned to back onto the east wall, occupies
  // x 14.91..14.95 / z −1.4..1.0 — exactly where this drop would land.
  { pos: [TRUNK_E_X, 1.6], bottom: 1.75, name: 'bench' },
]

/**
 * Wall trunking and the drops off it.
 *
 * A shed's cables have to get from somewhere to the panels, and if they don't
 * the panels read as props sitting against a wall. This is the cheapest possible
 * honest answer: one galvanised run per wall at 3.2 m, and a conduit drop into
 * the top of every enclosure the building has. It also does real visual work —
 * a long horizontal at 3.2 m gives the 30 m north elevation a line to read
 * against, which a flat painted wall does not have.
 */
function WallTrunking() {
  return (
    <group name="wall_trunking">
      {/* North wall: from the west corner across to past the MCC */}
      <mesh name="trunk_north" position={[(WALL_W + 0.07 + 12.2) / 2, TRUNK_Y, TRUNK_N_Z]}
            material={DRESS.galv} castShadow>
        <boxGeometry args={[12.2 - (WALL_W + 0.07), TRUNK_H, TRUNK_D]} />
      </mesh>
      {/* West wall: corner down to the breaker panel */}
      <mesh name="trunk_west" position={[TRUNK_W_X, TRUNK_Y, (WALL_N + 0.07 + -5.0) / 2]}
            material={DRESS.galv} castShadow>
        <boxGeometry args={[TRUNK_D, TRUNK_H, -5.0 - (WALL_N + 0.07)]} />
      </mesh>
      {/* East wall: stores and bench supply. Stops well short of the office,
          whose side wall is coplanar with the building wall from z = 5.6. */}
      <mesh name="trunk_east" position={[TRUNK_E_X, TRUNK_Y, (-8.0 + 1.7) / 2]}
            material={DRESS.galv} castShadow>
        <boxGeometry args={[TRUNK_D, TRUNK_H, 1.7 - (-8.0)]} />
      </mesh>

      {DROPS.map((d) => {
        const [x, z] = d.pos
        const len = DROP_TOP - d.bottom
        return (
          <group key={d.name} name={`conduit_${d.name}`} position={[x, 0, z]}>
            {/* gland box where the conduit leaves the trunking */}
            <mesh name={`conduit_gland_${d.name}`} position={[0, DROP_TOP - 0.05, 0]}
                  material={DRESS.greyBox}>
              <boxGeometry args={[0.11, 0.11, 0.11]} />
            </mesh>
            <mesh name={`conduit_drop_${d.name}`} position={[0, d.bottom + len / 2, 0]}
                  material={DRESS.conduit} castShadow>
              <cylinderGeometry args={[CONDUIT_R, CONDUIT_R, len, 8]} />
            </mesh>
          </group>
        )
      })}

      {/* Local isolator over the bench, which is what the east drop terminates in */}
      <mesh name="bench_isolator" position={[WALL_E - 0.09, 1.62, 1.6]} material={DRESS.greyBox} castShadow>
        <boxGeometry args={[0.16, 0.26, 0.2]} />
      </mesh>
      <mesh name="bench_isolator_handle" position={[WALL_E - 0.19, 1.62, 1.6]} material={DRESS.redGloss}>
        <boxGeometry args={[0.03, 0.07, 0.07]} />
      </mesh>
    </group>
  )
}

// ── Fire point ──────────────────────────────────────────────────────────────

/**
 * A fire point: red backboard, two extinguishers on a shelf, a break-glass call
 * point. Local +Z is the direction it faces, so a wall-mounted instance is
 * placed on the wall face and turned to look into the room.
 */
function FirePoint({ position, rotation = 0, id }: {
  position: [number, number, number]
  rotation?: number
  id: string
}) {
  return (
    <group name={`fire_point_${id}`} position={position} rotation={[0, rotation, 0]}>
      <mesh name={`fire_board_${id}`} position={[0, 0.92, 0.015]} material={DRESS.red} receiveShadow>
        <boxGeometry args={[0.95, 1.15, 0.03]} />
      </mesh>
      {/* shelf the bottles stand on */}
      <mesh name={`fire_shelf_${id}`} position={[0, 0.32, 0.13]} material={DRESS.black} castShadow>
        <boxGeometry args={[0.9, 0.04, 0.24]} />
      </mesh>
      {([-0.24, 0.24] as const).map((x, i) => (
        <group key={i} position={[x, 0, 0.14]}>
          <mesh name={`extinguisher_${id}_${i}`} position={[0, 0.62, 0]} material={DRESS.redGloss} castShadow>
            <cylinderGeometry args={[0.085, 0.085, 0.55, 12]} />
          </mesh>
          <mesh name={`extinguisher_head_${id}_${i}`} position={[0, 0.93, 0]} material={DRESS.black}>
            <cylinderGeometry args={[0.045, 0.045, 0.09, 10]} />
          </mesh>
        </group>
      ))}
      {/* break-glass call point */}
      <mesh name={`call_point_${id}`} position={[0.3, 1.38, 0.04]} material={DRESS.redGloss}>
        <boxGeometry args={[0.13, 0.13, 0.05]} />
      </mesh>
      {/* FIRE POINT sign */}
      <mesh name={`fire_sign_${id}`} position={[-0.18, 1.38, 0.035]} material={DRESS.white}>
        <boxGeometry args={[0.42, 0.16, 0.02]} />
      </mesh>
    </group>
  )
}

// ── First aid ───────────────────────────────────────────────────────────────

function FirstAidStation({ position, rotation = 0 }: {
  position: [number, number, number]
  rotation?: number
}) {
  return (
    <group name="first_aid_station" position={position} rotation={[0, rotation, 0]}>
      <mesh name="first_aid_cabinet" position={[0, 1.35, 0.1]} material={DRESS.green} castShadow>
        <boxGeometry args={[0.5, 0.62, 0.2]} />
      </mesh>
      {/* white cross */}
      <mesh name="first_aid_cross_v" position={[0, 1.35, 0.205]} material={DRESS.white}>
        <boxGeometry args={[0.1, 0.32, 0.01]} />
      </mesh>
      <mesh name="first_aid_cross_h" position={[0, 1.35, 0.205]} material={DRESS.white}>
        <boxGeometry args={[0.32, 0.1, 0.01]} />
      </mesh>
      {/* eyewash bottles on a small shelf below */}
      <mesh name="first_aid_shelf" position={[0, 0.94, 0.1]} material={DRESS.white} castShadow>
        <boxGeometry args={[0.5, 0.03, 0.2]} />
      </mesh>
      {([-0.12, 0.12] as const).map((x, i) => (
        <mesh key={i} name={`eyewash_${i}`} position={[x, 1.06, 0.1]} material={DRESS.green}>
          <cylinderGeometry args={[0.045, 0.045, 0.21, 10]} />
        </mesh>
      ))}
    </group>
  )
}

// ── Pallets ─────────────────────────────────────────────────────────────────

const PALLET_X = 0.8      // across
const PALLET_Z = 1.2      // along
const PALLET_H = 0.144

/** One euro-ish pallet: three deck boards, three bearers, a bottom board. */
function Pallet({ y = 0, name }: { y?: number; name: string }) {
  return (
    <group name={name} position={[0, y, 0]}>
      {([-0.48, 0, 0.48] as const).map((z, i) => (
        <mesh key={i} name={`${name}_deck_${i}`} position={[0, 0.130, z]} material={DRESS.timber} castShadow receiveShadow>
          <boxGeometry args={[PALLET_X, 0.028, 0.24]} />
        </mesh>
      ))}
      {([-0.48, 0, 0.48] as const).map((z, i) => (
        <mesh key={i} name={`${name}_bearer_${i}`} position={[0, 0.072, z]} material={DRESS.timber} castShadow>
          <boxGeometry args={[PALLET_X, 0.088, 0.12]} />
        </mesh>
      ))}
      <mesh name={`${name}_base`} position={[0, 0.011, 0]} material={DRESS.timber} receiveShadow>
        <boxGeometry args={[PALLET_X, 0.022, PALLET_Z]} />
      </mesh>
    </group>
  )
}

/**
 * Pallets against the west wall, in the one large bay with nothing else in it.
 *
 * x −14.85..−14.05 — 150 mm off the wall, west of everything: the breaker panel
 * is at z = −5 and these start at z = 3.6, the main walkway is x ±1.4 and the
 * cross aisle stops at z = −1.0. A stack of empties and two made-up loads is
 * what a bay like this actually accumulates.
 */
const PALLET_X_POS = -14.45

function Pallets() {
  return (
    <group name="pallets">
      {/* stack of three empties */}
      <group position={[PALLET_X_POS, 0, 7.2]}>
        {[0, 1, 2].map((i) => (
          <Pallet key={i} y={i * PALLET_H} name={`pallet_stack_${i}`} />
        ))}
      </group>
      <RigidBody type="fixed" colliders={false} position={[PALLET_X_POS, 0, 7.2]}>
        <CuboidCollider args={[PALLET_X / 2, (PALLET_H * 3) / 2, PALLET_Z / 2]}
                        position={[0, (PALLET_H * 3) / 2, 0]} />
      </RigidBody>

      {/* two loaded pallets */}
      {([5.6, 3.6] as const).map((z, p) => (
        <group key={p} position={[PALLET_X_POS, 0, z]}>
          <Pallet name={`pallet_load_${p}`} />
          {([[-0.19, -0.3], [0.19, -0.3], [-0.19, 0.3], [0.19, 0.3]] as const).map(([bx, bz], i) => (
            <mesh key={i} name={`pallet_box_${p}_${i}`}
                  position={[bx, PALLET_H + 0.19, bz]} material={DRESS.card} castShadow receiveShadow>
              <boxGeometry args={[0.36, 0.38, 0.54]} />
            </mesh>
          ))}
        </group>
      ))}
      {([5.6, 3.6] as const).map((z, p) => (
        <RigidBody key={p} type="fixed" colliders={false} position={[PALLET_X_POS, 0, z]}>
          <CuboidCollider args={[PALLET_X / 2, 0.27, PALLET_Z / 2]} position={[0, 0.27, 0]} />
        </RigidBody>
      ))}
    </group>
  )
}

// ── Waste ───────────────────────────────────────────────────────────────────

const BIN_W = 1.2
const BIN_H = 0.88
const BIN_D = 0.78

/** A 1100 L wheeled bin. Long axis along X. */
function WasteBin({ position, name }: { position: [number, number, number]; name: string }) {
  return (
    <>
      <group name={name} position={position}>
        <mesh name={`${name}_body`} position={[0, 0.19 + BIN_H / 2, 0]} material={DRESS.binBody} castShadow receiveShadow>
          <boxGeometry args={[BIN_W, BIN_H, BIN_D]} />
        </mesh>
        <mesh name={`${name}_lid`} position={[0, 0.19 + BIN_H + 0.03, 0]} material={DRESS.binLid} castShadow>
          <boxGeometry args={[BIN_W + 0.04, 0.06, BIN_D + 0.04]} />
        </mesh>
        <mesh name={`${name}_bar`} position={[0, 0.19 + BIN_H - 0.06, -BIN_D / 2 - 0.05]} material={DRESS.black}>
          <boxGeometry args={[BIN_W - 0.2, 0.045, 0.045]} />
        </mesh>
        {([[-0.46, -0.3], [0.46, -0.3], [-0.46, 0.3], [0.46, 0.3]] as const).map(([x, z], i) => (
          <mesh key={i} name={`${name}_castor_${i}`} position={[x, 0.095, z]}
                rotation={[0, 0, Math.PI / 2]} material={DRESS.black}>
            <cylinderGeometry args={[0.095, 0.095, 0.07, 10]} />
          </mesh>
        ))}
      </group>
      <RigidBody type="fixed" colliders={false} position={position}>
        <CuboidCollider args={[BIN_W / 2, (BIN_H + 0.25) / 2, BIN_D / 2]}
                        position={[0, (BIN_H + 0.25) / 2, 0]} />
      </RigidBody>
    </>
  )
}

// ── The lot ─────────────────────────────────────────────────────────────────

/**
 * FactoryDressing — every piece of set dressing, in one mountable group.
 *
 * Placements and the clearance each one respects:
 *   fire point (south)  x = −3.6 on the entry wall, 2.2 m clear of the main
 *                       walkway edge at x = −1.4 and 6 m clear of the office.
 *   fire point (north)  x = 12.8, east of the MCC (which ends at x = 11.2) and
 *                       outside the red switchgear clearance (ends x = 11.6).
 *                       Electrical fires happen at the switchgear.
 *   first aid           x = 3.2 on the entry wall, flanking the way in opposite
 *                       the fire point, clear of the walkway and of the office
 *                       slab (starts x = 9.35).
 *   pallets             west wall, z = 3.6..7.8.
 *   bin (line)          x 5.8..7.0 / z −6.0..−5.2 — east of the production bay
 *                       (ends x ≈ 5.15), west of the north spur walkway (starts
 *                       x = 8.7), south of the switchgear clearance (z = −8.4).
 *   bin (bench)         x 13.6..14.8 / z 2.2..3.0 — behind the stores aisle
 *                       line at x = 13.6, past the end of the bench run (z = 1.0)
 *                       and clear of the bench conduit drop at z = 1.6.
 */
export function FactoryDressing() {
  return (
    <group name="factory_dressing">
      <WallTrunking />

      {/* Held 50 mm off the wall face: the painted dado band in FactoryFloor is
          40 mm proud of it, and a backboard mounted flush would sit inside it. */}
      <FirePoint id="entry" position={[-3.6, 0, WALL_S - 0.05]} rotation={Math.PI} />
      <FirePoint id="switchgear" position={[12.8, 0, WALL_N + 0.05]} />
      <FirstAidStation position={[3.2, 0, WALL_S - 0.05]} rotation={Math.PI} />

      <Pallets />

      <WasteBin name="bin_line" position={[6.4, 0, -5.6]} />
      <WasteBin name="bin_bench" position={[14.2, 0, 2.6]} />
    </group>
  )
}
