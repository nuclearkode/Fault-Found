'use client'

/**
 * FactoryFloor — the warehouse shell: slab, walls, roof structure, floor paint.
 *
 * 30 m × 20 m × 5 m. Inner faces of the shell are therefore x = ±15, z = ±10 and
 * y = 0..5; every number below is measured off those.
 *
 * THE RULE FOR THIS FILE: nothing painted on the floor is placed by eye. Every
 * epoxy bay and every safety line is DERIVED from the footprint of the equipment
 * it belongs to, so moving a machine moves its paint. The previous version broke
 * that rule and it showed — the production bay sat at [0,·,-4] 12 × 3 while the
 * silo cell occupied x −5.1..3.0 / z −4.4..−2.4, the office bay sat at [8,·,7]
 * while the office itself is at [12.3,0,7.8] and draws its own slab, and the
 * result was a set of coloured rectangles that aligned with nothing on the floor.
 */

import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { DEFAULT_LAYOUT, type StationPlacement } from '@/config/factoryLayout'

// Factory dimensions
export const FACTORY = {
  WIDTH: 30,
  DEPTH: 20,
  HEIGHT: 5,
  WALL: 0.3,
} as const

/** Inner faces of the shell — everything on the floor is measured off these. */
const X_MIN = -FACTORY.WIDTH / 2
const X_MAX = FACTORY.WIDTH / 2
const Z_MIN = -FACTORY.DEPTH / 2
const Z_MAX = FACTORY.DEPTH / 2

// ── Palette ─────────────────────────────────────────────────────────────────
// Realistic production floor colours. One material per finish, shared by every
// mesh that uses it — a factory this size is mostly repeated boxes, and a fresh
// meshStandardMaterial per box is a fresh shader program binding per box.
const FLOOR_COLOR = '#8a8a8a'      // Light gray sealed concrete
const WALL_COLOR = '#b0aaa0'       // Off-white / beige painted CMU block
const CEILING_COLOR = '#9a9a9a'    // Light gray painted steel deck
const EPOXY_COLOR = '#7a8a70'      // Sage green epoxy (common in manufacturing)

/**
 * The north wall used to be #404048 — near-black.
 *
 * That is not a colour a wall in a lit shed can be. Against the light concrete
 * slab and the #9a9a9a deck it returned almost nothing at every Lighting tier
 * (on 'low' there is no directional at all, just ambient 0.5 + hemisphere 0.5),
 * so the end of the building read as an open void with cabinets floating in it.
 * It is now a wall colour, kept a shade cooler and darker than the other three so
 * the switchgear run in front of it still separates.
 */
const WALL_NORTH_COLOR = '#a3a09a'

/**
 * Painted dado, 1.15 m, on all four walls.
 *
 * Standard workshop practice — the bottom metre of a shed wall takes the scuffs,
 * so it is painted in something dark that hides them. It also does the visual
 * work the north wall needed: it puts a horizontal line at eye level on every
 * elevation, which is what makes a large blank wall read as a surface with a
 * near edge rather than as distance.
 */
const DADO_H = 1.15
const DADO_COLOR = '#5f6a70'

const MAT = {
  floor: new THREE.MeshStandardMaterial({ color: FLOOR_COLOR, roughness: 0.85, metalness: 0.05 }),
  wall: new THREE.MeshStandardMaterial({ color: WALL_COLOR, roughness: 0.8, metalness: 0.3 }),
  wallNorth: new THREE.MeshStandardMaterial({ color: WALL_NORTH_COLOR, roughness: 0.82, metalness: 0.25 }),
  dado: new THREE.MeshStandardMaterial({ color: DADO_COLOR, roughness: 0.75, metalness: 0.12 }),
  ceiling: new THREE.MeshStandardMaterial({ color: CEILING_COLOR, roughness: 0.9, metalness: 0.1 }),
  epoxy: new THREE.MeshStandardMaterial({ color: EPOXY_COLOR, roughness: 0.7, metalness: 0.05 }),
  esd: new THREE.MeshStandardMaterial({ color: '#3a3a4a', roughness: 0.7, metalness: 0.05 }),
  paintYellow: new THREE.MeshStandardMaterial({
    color: '#c4a818', roughness: 0.6, metalness: 0.1,
    emissive: '#c4a818', emissiveIntensity: 0.05,
  }),
  paintRed: new THREE.MeshStandardMaterial({
    color: '#cc3333', roughness: 0.6, metalness: 0.1,
    emissive: '#cc3333', emissiveIntensity: 0.05,
  }),
  beam: new THREE.MeshStandardMaterial({ color: '#5a5a60', roughness: 0.4, metalness: 0.7 }),
  column: new THREE.MeshStandardMaterial({ color: '#555560', roughness: 0.5, metalness: 0.6 }),
  drainFrame: new THREE.MeshStandardMaterial({ color: '#8d949b', roughness: 0.5, metalness: 0.7 }),
  drainSump: new THREE.MeshStandardMaterial({ color: '#22242a', roughness: 0.95, metalness: 0.05 }),
} as const

// ── Footprint arithmetic ────────────────────────────────────────────────────
// A Box is an axis-aligned floor footprint in world metres. Zones are built by
// taking the union of the equipment footprints in a bay and growing it by the
// working margin — never by typing a rectangle.

interface Box { x0: number; x1: number; z0: number; z1: number }

const unite = (a: Box, b: Box): Box => ({
  x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1),
  z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1),
})
const grow = (b: Box, m: number): Box => ({
  x0: b.x0 - m, x1: b.x1 + m, z0: b.z0 - m, z1: b.z1 + m,
})

/** Flat slab props for a Box, so a zone mesh cannot disagree with its own maths. */
function slab(b: Box, y: number, t = 0.005) {
  return {
    position: [(b.x0 + b.x1) / 2, y, (b.z0 + b.z1) / 2] as [number, number, number],
    args: [b.x1 - b.x0, t, b.z1 - b.z0] as [number, number, number],
  }
}

/**
 * One placed station's floor footprint.
 *
 * Width is the pitch documented in factoryLayout.ts (0.717 m cabinet × 1.5).
 * Depth is not published there, so 0.80 m is used: the 1.5×-scaled profile plate
 * plus the operator panel that hangs off the front. It is deliberately generous —
 * being wrong here only ever makes the painted bay slightly larger than it needs
 * to be, never smaller than the machine standing in it.
 */
const STATION_W = 1.0755
const STATION_D = 0.80

function footprint(s: StationPlacement): Box {
  const turned = Math.abs((((s.rotation % 180) + 180) % 180) - 90) < 1
  const w = turned ? STATION_D : STATION_W
  const d = turned ? STATION_W : STATION_D
  return {
    x0: s.position[0] - w / 2, x1: s.position[0] + w / 2,
    z0: s.position[2] - d / 2, z1: s.position[2] + d / 2,
  }
}

function boundsOf(rows: StationPlacement[]): Box | null {
  let b: Box | null = null
  for (const s of rows) b = b ? unite(b, footprint(s)) : footprint(s)
  return b
}

// ── Aisles ──────────────────────────────────────────────────────────────────
// Aisle paint marks the EDGES of a route, never its centre.

/** Half-width of the main pedestrian route: a 2.8 m through-aisle. */
const AISLE_HALF = 1.4
/**
 * The operator aisle across the front of the production bay. Narrower than the
 * through-route on purpose — it is a place to stand at the machine, not a route
 * to somewhere. Its north edge is also the south edge of the epoxy bay, so the
 * two are the same number and cannot drift.
 */
const OPERATOR_N = -2.4
const OPERATOR_S = -1.0
/** East end of the cross aisle, which is also the east edge of the north spur. */
const CROSS_X = 11.5
const CROSS_X_W = -11.5

// ── Equipment footprints the paint is derived from ──────────────────────────

/**
 * Silo cell, measured off silo_cell.glb as placed by SiloCellRig at [0,0,-4]:
 * the control cabinet's isolator reaches x = −5.1 and the drive roller x = 3.0,
 * with the operator panel face at z = −2.4 and the frame back at z = −4.4.
 */
const SILO: Box = { x0: -5.1, x1: 3.0, z0: -4.4, z1: -2.4 }

/** Clear working margin painted around a machine — room to stand and to work. */
const BAY_MARGIN = 0.85

/** The two rigs share one bay, so the paint has to cover whichever is loaded. */
const MAIN_LINE = DEFAULT_LAYOUT.filter((s) => s.position[2] <= -1)
const STANDALONE = DEFAULT_LAYOUT.filter((s) => s.position[2] > -1)

const lineBounds = boundsOf(MAIN_LINE)

/**
 * PRODUCTION BAY — green epoxy under the main line.
 *
 * Union of the MPS line (x −4.30..4.30 from DEFAULT_LAYOUT) and the silo cell
 * (x −5.1..3.0), grown by the working margin, with the south edge cut back to
 * the operator aisle so the epoxy stops exactly where the yellow paint starts.
 * Result: x ≈ −5.95..5.15, z ≈ −5.25..−2.40.
 */
const grownLine = grow(lineBounds ? unite(lineBounds, SILO) : SILO, BAY_MARGIN)
const PRODUCTION_BAY: Box = { ...grownLine, z1: Math.min(grownLine.z1, OPERATOR_N) }

/**
 * SOUTH BAY — green epoxy under the two standalone stations.
 *
 * Derived from the same layout config that places them (ST90/ST100 at z = 1.5),
 * which is what the old [0,·,3] 8 × 3 rectangle failed to do: it started at the
 * stations' centre line and ran 3 m further south into empty floor. It is a
 * permanently marked bay, so it is painted even when the silo rig is loaded and
 * the bay is standing empty — that is what floor paint is for.
 */
const standaloneBounds = boundsOf(STANDALONE)
const SOUTH_BAY: Box | null = standaloneBounds ? grow(standaloneBounds, BAY_MARGIN) : null

/**
 * SWITCHGEAR RUN on the north wall, from the placements in GameCanvas: two
 * 0.8 × 0.4 PLC cabinets at x = 6.0 and 7.4 and the 2.0 × 0.6 MCC at x = 10.2,
 * all backed onto the wall face at z = −10.
 */
const SWITCHGEAR: Box = { x0: 6.0 - 0.4, x1: 10.2 + 1.0, z0: Z_MIN, z1: Z_MIN + 0.6 }
/** Working clearance in front of live switchgear. This is what the red paint is. */
const SWITCHGEAR_CLEARANCE = 1.0

/**
 * CONTROL BAY — dark anti-static epoxy, and the red clearance line around it.
 *
 * One box drives both, so the ESD floor and the red boundary are by construction
 * the same rectangle. It used to be a 9 × 5 slab at [10,·,−7.5] reaching x = 14.5,
 * i.e. 3 m past the last cabinet and straight through the east-wall stores aisle.
 * x ≈ 5.0..11.6, z = −10.0..−8.4.
 */
const CONTROL_BAY: Box = {
  x0: SWITCHGEAR.x0 - 0.6,
  x1: SWITCHGEAR.x1 + 0.4,
  z0: SWITCHGEAR.z0,
  z1: SWITCHGEAR.z1 + SWITCHGEAR_CLEARANCE,
}

/**
 * BREAKER PANEL working space on the west wall — the 0.6 × 0.9 × 0.18 enclosure
 * at [−14.5, 1.6, −5], plus reach clearance. Painted as a boundary (three lines)
 * rather than the solid 2 × 2 red slab it was, which read as a spill.
 */
const BREAKER: Box = { x0: X_MIN, x1: X_MIN + 0.18, z0: -5 - 0.3, z1: -5 + 0.3 }
const BREAKER_BAY: Box = { x0: BREAKER.x0, x1: BREAKER.x1 + 1.2, z0: BREAKER.z0 - 0.45, z1: BREAKER.z1 + 0.45 }

/**
 * EAST-WALL STORES RUN — two 2.5 m shelving bays at z = −6.6 / −3.4 and the
 * 2.4 m bench at z = −0.2, all turned to back onto the wall (see GameCanvas).
 * Only its aisle edge is painted; a stores aisle is bare concrete.
 */
const STORES: Box = { x0: 14.15, x1: X_MAX, z0: -6.6 - 1.25, z1: -0.2 + 1.2 }
/** Aisle edge, set west of the run and clear of the x = 13 column line. */
const STORES_EDGE_X = 13.6

/**
 * The supervisor's office has NO zone here. It draws its own slab — a
 * (W + 0.5) × (D + 0.5) pad with a yellow edge strip, in SupervisorOffice.tsx —
 * so the old `floor_zone_office` was a second, differently-sized, differently-
 * placed grey rectangle 3 m to the west of it. Deleted rather than re-derived:
 * the thing that owns the office floor is the office.
 */

// ── Floor paint ─────────────────────────────────────────────────────────────

/** 100 mm safety paint, sitting proud of both the slab and the epoxy bays. */
const PAINT = 0.1
const PAINT_Y = 0.008
const ZONE_Y = 0.003

interface Stripe { pos: [number, number, number]; args: [number, number, number]; red?: boolean }

/** A line of paint running east-west at a given z. */
const alongX = (z: number, x0: number, x1: number, red = false): Stripe => ({
  pos: [(x0 + x1) / 2, PAINT_Y, z], args: [x1 - x0, 0.01, PAINT], red,
})
/** A line of paint running north-south at a given x. */
const alongZ = (x: number, z0: number, z1: number, red = false): Stripe => ({
  pos: [x, PAINT_Y, (z0 + z1) / 2], args: [PAINT, 0.01, z1 - z0], red,
})

/**
 * Every line on the floor, and the route or hazard each one bounds.
 *
 * Module scope, not useMemo: none of it depends on props or state, so it is built
 * once for the process rather than once per mount.
 */
const STRIPES: Stripe[] = [
  // ── MAIN WALKWAY — 2.8 m through-route, south wall up to the operator aisle.
  // It used to run the full 20 m depth, which took it straight under the silo
  // cell: 18 m of yellow paint disappearing beneath a machine. A walkway ends
  // where you can no longer walk.
  ...([-AISLE_HALF, AISLE_HALF] as const).map((x) => alongZ(x, OPERATOR_S, Z_MAX - 0.3)),

  // ── OPERATOR AISLE — across the front of the production bay. Its north edge
  // is PRODUCTION_BAY.z1 by construction, so paint and epoxy share an edge.
  alongX(OPERATOR_N, CROSS_X_W, CROSS_X),
  alongX(OPERATOR_S, CROSS_X_W, CROSS_X),

  // ── NORTH SPUR — the route from the cross aisle up to the control corner.
  // Without it the walkway system stopped at the line and the switchgear was
  // reached across unmarked floor. Threaded between the production bay (ends
  // x ≈ 5.15) and the stores aisle edge (x = 13.6), and it stops on the red
  // clearance line rather than crossing it.
  ...([CROSS_X - 2.8, CROSS_X] as const).map((x) => alongZ(x, CONTROL_BAY.z1, OPERATOR_N)),

  // ── SWITCHGEAR CLEARANCE (red) — the front edge of CONTROL_BAY plus return
  // legs to the wall, so it reads as an enclosed zone and not a stray line.
  alongX(CONTROL_BAY.z1, CONTROL_BAY.x0, CONTROL_BAY.x1, true),
  alongZ(CONTROL_BAY.x0, CONTROL_BAY.z0, CONTROL_BAY.z1, true),
  alongZ(CONTROL_BAY.x1, CONTROL_BAY.z0, CONTROL_BAY.z1, true),

  // ── BREAKER PANEL working space (red), same three-line treatment.
  alongZ(BREAKER_BAY.x1, BREAKER_BAY.z0, BREAKER_BAY.z1, true),
  alongX(BREAKER_BAY.z0, BREAKER_BAY.x0, BREAKER_BAY.x1, true),
  alongX(BREAKER_BAY.z1, BREAKER_BAY.x0, BREAKER_BAY.x1, true),

  // ── STORES AISLE EDGE — as long as the run it serves, and no longer.
  alongZ(STORES_EDGE_X, STORES.z0 - 0.05, STORES.z1 + 0.05),
]

function FloorPaint() {
  return (
    <group name="floor_markings">
      {STRIPES.map((s, i) => (
        <mesh
          key={i}
          name={`floor_line_${i}`}
          position={s.pos}
          material={s.red ? MAT.paintRed : MAT.paintYellow}
          receiveShadow
        >
          <boxGeometry args={s.args} />
        </mesh>
      ))}
    </group>
  )
}

// ── Floor drains ────────────────────────────────────────────────────────────

/**
 * Gully drains.
 *
 * Placed where a shed actually needs them: two flanking the production bay,
 * which is the only thing on this floor that ever gets hosed down, and one in
 * the middle of each of the two large open bays so a wash of the slab has
 * somewhere to go. All four sit clear of the marked routes and clear of every
 * epoxy bay, because a drain in a walkway is a trip hazard and a drain under a
 * coated bay is a hole in the coating.
 */
const DRAINS: Array<[number, number]> = [
  [PRODUCTION_BAY.x0 - 0.6, -3.9],   // west end of the line
  [PRODUCTION_BAY.x1 + 0.6, -3.9],   // east end of the line
  [-9.5, 4.0],                       // west open bay
  [7.0, 3.5],                        // east open bay, clear of the office slab
]

const DRAIN_W = 0.5
const DRAIN_SUMP = 0.40
const DRAIN_BARS = [-0.15, -0.075, 0, 0.075, 0.15]

function FloorDrains() {
  return (
    <group name="floor_drains">
      {DRAINS.map(([x, z], i) => (
        <group key={i} name={`floor_drain_${i}`} position={[x, 0, z]}>
          {/* Frame, proud of the screed as a cast frame is */}
          <mesh name={`drain_frame_${i}`} position={[0, 0.008, 0]} material={MAT.drainFrame} receiveShadow>
            <boxGeometry args={[DRAIN_W, 0.016, DRAIN_W]} />
          </mesh>
          {/* Sump, sitting below the frame lip so the grate reads as recessed */}
          <mesh name={`drain_sump_${i}`} position={[0, 0.006, 0]} material={MAT.drainSump}>
            <boxGeometry args={[DRAIN_SUMP, 0.012, DRAIN_SUMP]} />
          </mesh>
          {DRAIN_BARS.map((bz, j) => (
            <mesh key={j} name={`drain_bar_${i}_${j}`} position={[0, 0.014, bz]} material={MAT.drainFrame}>
              <boxGeometry args={[DRAIN_SUMP, 0.006, 0.03]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

// ── Structure ───────────────────────────────────────────────────────────────

/**
 * East-west roof beams every 5 m, plus a north-south beam over each column line.
 *
 * Lighting.tsx rebuilds these z positions with the same expression to work out
 * where the roof bays are, so if this loop changes the luminaire rows follow.
 */
export const BEAM_Z: number[] = []
for (let z = Z_MIN + 2.5; z <= Z_MAX; z += 5) BEAM_Z.push(z)
/** Column / north-south beam lines. */
export const COLUMN_X = [X_MIN + 2, X_MAX - 2] as const

function CeilingBeams() {
  return (
    <group name="ceiling_beams">
      {BEAM_Z.map((z, i) => (
        <mesh key={`x${i}`} name={`ceiling_beam_x_${i}`}
              position={[0, FACTORY.HEIGHT - 0.15, z]} material={MAT.beam} castShadow>
          <boxGeometry args={[FACTORY.WIDTH, 0.3, 0.15]} />
        </mesh>
      ))}
      {COLUMN_X.map((x, i) => (
        <mesh key={`z${i}`} name={`ceiling_beam_z_${i}`}
              position={[x, FACTORY.HEIGHT - 0.15, 0]} material={MAT.beam} castShadow>
          <boxGeometry args={[0.15, 0.3, FACTORY.DEPTH]} />
        </mesh>
      ))}
    </group>
  )
}

const COLUMNS: [number, number, number][] = []
for (const x of COLUMN_X) {
  for (let z = Z_MIN + 2.5; z <= Z_MAX - 2; z += 5) {
    COLUMNS.push([x, FACTORY.HEIGHT / 2, z])
  }
}

function Columns() {
  return (
    // Single compound RigidBody — Rapier auto-merges all child cuboid colliders.
    // 8 separate physics bodies → 1 body with 8 sub-shapes.
    <RigidBody type="fixed" colliders="cuboid">
      <group name="columns">
        {COLUMNS.map((pos, i) => (
          <mesh key={i} name={`column_${i}`} position={pos} material={MAT.column} castShadow receiveShadow>
            <boxGeometry args={[0.3, FACTORY.HEIGHT, 0.3]} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  )
}

interface WallSegmentProps {
  position: [number, number, number]
  args: [number, number, number]
  material?: THREE.Material
  name: string
}

function WallSegment({ position, args, material = MAT.wall, name }: WallSegmentProps) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <mesh name={name} material={material} receiveShadow castShadow>
        <boxGeometry args={args} />
      </mesh>
    </RigidBody>
  )
}

/**
 * The dado band, inset 20 mm inside each wall's inner face.
 *
 * The south and east runs stop short of the supervisor's office: its back and
 * side walls are coplanar with the building at z = 10 and x = 15, so a band
 * running the full length would drive straight through the cabin.
 */
const OFFICE_X0 = 9.55
const OFFICE_Z0 = 5.55
const DADO_T = 0.04
const DADO_INSET = 0.02

function Dado() {
  const y = DADO_H / 2
  return (
    <group name="wall_dado">
      <mesh name="dado_north" position={[0, y, Z_MIN + DADO_INSET]} material={MAT.dado} receiveShadow>
        <boxGeometry args={[FACTORY.WIDTH, DADO_H, DADO_T]} />
      </mesh>
      <mesh name="dado_south"
            position={[(X_MIN + OFFICE_X0) / 2, y, Z_MAX - DADO_INSET]} material={MAT.dado} receiveShadow>
        <boxGeometry args={[OFFICE_X0 - X_MIN, DADO_H, DADO_T]} />
      </mesh>
      <mesh name="dado_west" position={[X_MIN + DADO_INSET, y, 0]} material={MAT.dado} receiveShadow>
        <boxGeometry args={[DADO_T, DADO_H, FACTORY.DEPTH]} />
      </mesh>
      <mesh name="dado_east"
            position={[X_MAX - DADO_INSET, y, (Z_MIN + OFFICE_Z0) / 2]} material={MAT.dado} receiveShadow>
        <boxGeometry args={[DADO_T, DADO_H, OFFICE_Z0 - Z_MIN]} />
      </mesh>
    </group>
  )
}

// ── Shell ───────────────────────────────────────────────────────────────────

export function FactoryFloor() {
  const production = slab(PRODUCTION_BAY, ZONE_Y)
  const control = slab(CONTROL_BAY, ZONE_Y)
  const south = SOUTH_BAY ? slab(SOUTH_BAY, ZONE_Y) : null

  return (
    <group name="factory_floor">
      {/* === FLOOR === */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, -FACTORY.WALL / 2, 0]}>
        <mesh name="floor" material={MAT.floor} receiveShadow>
          <boxGeometry args={[FACTORY.WIDTH, FACTORY.WALL, FACTORY.DEPTH]} />
        </mesh>
      </RigidBody>

      {/* ── Epoxy-coated work zones. Every one is derived above from the
             equipment standing on it; see PRODUCTION_BAY / CONTROL_BAY /
             SOUTH_BAY. There is no office zone — the office draws its own. ── */}
      <mesh name="floor_zone_production" position={production.position} material={MAT.epoxy} receiveShadow>
        <boxGeometry args={production.args} />
      </mesh>
      <mesh name="floor_zone_control" position={control.position} material={MAT.esd} receiveShadow>
        <boxGeometry args={control.args} />
      </mesh>
      {south && (
        <mesh name="floor_zone_south" position={south.position} material={MAT.epoxy} receiveShadow>
          <boxGeometry args={south.args} />
        </mesh>
      )}

      {/* === CEILING === */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, FACTORY.HEIGHT + FACTORY.WALL / 2, 0]}>
        <mesh name="ceiling" material={MAT.ceiling} receiveShadow>
          <boxGeometry args={[FACTORY.WIDTH, FACTORY.WALL, FACTORY.DEPTH]} />
        </mesh>
      </RigidBody>

      {/* === WALLS === */}
      {/* North wall — the switchgear elevation. See WALL_NORTH_COLOR. */}
      <WallSegment
        name="wall_north"
        position={[0, FACTORY.HEIGHT / 2, Z_MIN - FACTORY.WALL / 2]}
        args={[FACTORY.WIDTH + FACTORY.WALL * 2, FACTORY.HEIGHT, FACTORY.WALL]}
        material={MAT.wallNorth}
      />
      {/* South wall (entry) */}
      <WallSegment
        name="wall_south"
        position={[0, FACTORY.HEIGHT / 2, Z_MAX + FACTORY.WALL / 2]}
        args={[FACTORY.WIDTH + FACTORY.WALL * 2, FACTORY.HEIGHT, FACTORY.WALL]}
      />
      {/* West wall */}
      <WallSegment
        name="wall_west"
        position={[X_MIN - FACTORY.WALL / 2, FACTORY.HEIGHT / 2, 0]}
        args={[FACTORY.WALL, FACTORY.HEIGHT, FACTORY.DEPTH]}
      />
      {/* East wall */}
      <WallSegment
        name="wall_east"
        position={[X_MAX + FACTORY.WALL / 2, FACTORY.HEIGHT / 2, 0]}
        args={[FACTORY.WALL, FACTORY.HEIGHT, FACTORY.DEPTH]}
      />

      {/* === STRUCTURAL === */}
      <Dado />
      <CeilingBeams />
      <Columns />
      <FloorPaint />
      <FloorDrains />
    </group>
  )
}
