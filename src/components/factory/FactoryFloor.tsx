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
 *
 * THE SECOND RULE, added when the paint was reworked: nothing is painted here
 * because it looks industrial. Every line implements a published requirement and
 * names it in the comment above it — OSHA 1910.176(a) and OSHA's 1972 letter of
 * interpretation for the aisles and their widths, NEC 110.26(A) as enforced by
 * OSHA 1910.303(g)(1) for the red boxes in front of the electrical gear, OSHA
 * 1910.144 / ANSI Z535.1 for what each colour is allowed to mean, and the 5S
 * white-for-footprints convention for everything that is not a safety marking.
 * A line that cannot be traced to one of those is a line that should not exist.
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
  paintYellow: new THREE.MeshStandardMaterial({
    color: '#c4a818', roughness: 0.6, metalness: 0.1,
    emissive: '#c4a818', emissiveIntensity: 0.05,
  }),
  paintRed: new THREE.MeshStandardMaterial({
    color: '#cc3333', roughness: 0.6, metalness: 0.1,
    emissive: '#cc3333', emissiveIntensity: 0.05,
  }),
  // White is the 5S non-safety colour — footprints, not hazards. Knocked well
  // back from pure white: floor paint on a grey slab under a shed roof never
  // reads as #fff, and at 1.0 it would out-shout the yellow that matters more.
  paintWhite: new THREE.MeshStandardMaterial({ color: '#d9d9d0', roughness: 0.65, metalness: 0.05 }),
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
//
// Aisle paint marks the EDGES of a route, never its centre. What follows is the
// arithmetic behind the widths, because none of them is a taste decision.
//
// OSHA 1910.176(a) requires that "sufficient safe clearances shall be allowed
// for aisles" and that permanent aisles "shall be appropriately marked" — the
// same duty the pre-2017 1910.22(b)(2) carried, and the one OSHA's enforcement
// directive STD 01-01-004 interprets (it makes the point that "marked" need not
// mean paint: pillars, cones and taped stripes all count). Neither text gives a
// number. OSHA's letter of interpretation of 15 May 1972 does, and it is still
// what the trade works to:
//
//   AISLE WIDTH  "at least 3 feet wider than the largest equipment to be
//                 utilized, or a minimum of 4 feet"
//   LINE WIDTH   "any width 2 inches or more is considered acceptable"
//
// So an aisle width here is computed from the widest thing that uses it. Park a
// counterbalance truck in this building and the paint moves on its own.

/** 3 ft (914 mm) — what the interpretation adds to the equipment width. */
const OSHA_AISLE_EXTRA = 0.914
/** 4 ft (1219 mm) — the floor no marked aisle drops below, whatever uses it. */
const OSHA_AISLE_MIN = 1.219

/**
 * The widest thing driven down the main route.
 *
 * This shed has no vehicle door, no charging bay and no forklift: what moves a
 * load in here is a hand pallet truck, 685 mm across the forks, under a
 * 1200 × 800 pallet. The load is wider than the truck, so the load is what
 * governs — 800 mm.
 */
const MHE_WIDTH = 0.80

/** Main north-south route, entry wall to the line: 800 + 914 = 1.714 m. */
const MAIN_AISLE_W = Math.max(MHE_WIDTH + OSHA_AISLE_EXTRA, OSHA_AISLE_MIN)
const MAIN_HALF = MAIN_AISLE_W / 2
/** Foot-only routes. Nothing is driven down them, so they sit on the 4 ft floor. */
const FOOT_AISLE_W = OSHA_AISLE_MIN

/**
 * The cross aisle, across the front of the production bay.
 *
 * Its north edge is set off the STRUCTURE, not off the machine: the column line
 * generated below runs at z = −7.5, −2.5, 2.5, 7.5 and each stanchion is 0.3 m
 * square, so the nearest one's south face is at −2.35 and this line goes 50 mm
 * south of that. Painting an aisle edge through a column is how floor marking
 * gets a reputation for being wallpaper. The same number is PRODUCTION_BAY's
 * south edge by construction, so the epoxy and the paint cannot drift apart.
 */
const COLUMN_HALF = 0.15
const CROSS_N = -2.5 + COLUMN_HALF + 0.05
const CROSS_S = CROSS_N + FOOT_AISLE_W

/**
 * How close a line stops to a wall face.
 *
 * Aisles run INTO the wall. The previous set stopped 300 mm short of the south
 * wall and 3.5 m short of the west one, which is the specific failure the rework
 * was for: a route that ends in open floor is not telling anyone anything.
 */
const WALL_STOP = 0.05

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
 * the cross aisle so the epoxy stops exactly where the yellow paint starts.
 * Result: x ≈ −5.95..5.15, z ≈ −5.25..−2.30.
 *
 * WHAT THE GREEN IS. It is not a decorative rectangle: it is a coated work bay,
 * the sage-green epoxy every real production floor puts under machinery that
 * leaks oil, coolant and hydraulic fluid, because a coated slab can be squeegeed
 * and bare concrete cannot. That is also why the two floor drains sit just
 * outside it. Its outline is painted white below — 5S marks a machine's place so
 * you can see at a glance when something is standing where it should not be.
 */
const grownLine = grow(lineBounds ? unite(lineBounds, SILO) : SILO, BAY_MARGIN)
const PRODUCTION_BAY: Box = { ...grownLine, z1: Math.min(grownLine.z1, CROSS_N) }

/**
 * SOUTH BAY — green epoxy under the two standalone stations.
 *
 * Derived from the same layout config that places them (ST90/ST100 at z = 1.5),
 * which is what the old [0,·,3] 8 × 3 rectangle failed to do: it started at the
 * stations' centre line and ran 3 m further south into empty floor. It is a
 * permanently marked bay, so it is painted even when the silo rig is loaded and
 * the bay is standing empty — that is what floor paint is for.
 *
 * Same coating, same reason, as the production bay. The main aisle runs straight
 * through the middle of it, between ST90 and ST100, and that is fine: a coating
 * is a surface finish and the paint goes on top of it. It is why this bay gets no
 * outline of its own — a work-cell boundary with a traffic aisle through it would
 * be a lie. The two station footprints inside it are marked instead.
 */
const standaloneBounds = boundsOf(STANDALONE)
const SOUTH_BAY: Box | null = standaloneBounds ? grow(standaloneBounds, BAY_MARGIN) : null

// ── Electrical working space ────────────────────────────────────────────────
//
// THE RED BOXES ARE NOT DECORATION. DO NOT DELETE THEM.
//
// OSHA 1910.303(g)(1) adopts NEC (NFPA 70) 110.26(A) wholesale: every piece of
// electrical equipment likely to be examined, adjusted or serviced while
// energised must have clear working space in front of it, and that space must be
// kept clear. Note the standard number — 110.26 is the NEC. NFPA 70E is the
// companion standard and governs how you work on the thing (electrically safe
// work condition, approach boundaries, arc-flash PPE); the NEC governs the room
// around it, which is what floor paint can express.
//
//   DEPTH  Table 110.26(A)(1): 900 mm (3 ft) for 0–600 V nominal under Condition
//          1 — exposed live parts on one side of the working space and nothing
//          live or grounded on the other. Both runs in this shed face open floor,
//          so Condition 1 is the row that applies. Measured from the front of the
//          enclosure, NOT from the wall behind it.
//   WIDTH  110.26(A)(2): the width of the equipment, or 750 mm, whichever is
//          greater. Which of the two governs differs between the two panels here,
//          so both are run through widenTo() rather than either being assumed.
//
// Painted red because ANSI Z535.1 / OSHA 1910.144 give red to danger, and a
// space you may not obstruct in front of live gear is exactly that. It is the
// only thing on this floor that tells a person not to park a pallet here.

/** 3 ft, Table 110.26(A)(1) Condition 1, ≤600 V. */
const NEC_WORK_DEPTH = 0.914
/** 30 in, 110.26(A)(2). */
const NEC_WORK_MIN_W = 0.762

/** Grow a span about its own centre until it meets a minimum width. */
const widenTo = (a: number, b: number, min: number): [number, number] => {
  const c = (a + b) / 2
  const h = Math.max((b - a) / 2, min / 2)
  return [c - h, c + h]
}

/**
 * SWITCHGEAR RUN on the north wall, from the placements in GameCanvas: two
 * 0.8 × 0.4 PLC cabinets at x = 6.0 and 7.4 and the 2.0 × 0.6 MCC at x = 10.2,
 * all backed onto the wall face at z = −10.
 *
 * z1 is the MCC's front face and not the wall + 0.6 by luck: the MCC sits at
 * z = −9.65 and is the deepest of the three, so its door is the plane the
 * working space is measured off. Take the depth off the PLC cabinets instead and
 * the paint would fall 250 mm short in front of the biggest enclosure in the room.
 */
const SWITCHGEAR: Box = { x0: 6.0 - 0.4, x1: 10.2 + 1.0, z0: Z_MIN, z1: -9.65 + 0.3 }

/**
 * The red keep-clear box in front of it.
 *
 * 5.6 m of line-up is far wider than the 750 mm floor, so 110.26(A)(2) adds
 * nothing here and the box is exactly as wide as the equipment. It is painted
 * back to the wall rather than starting at the cabinet doors so it reads as one
 * enclosed zone; the 914 mm that the code actually requires is the part in front
 * of SWITCHGEAR.z1.
 *
 * The previous box was 1.0 m deep off the wall and ran 600 mm west and 400 mm
 * east of the gear for no stated reason. Both fudge factors are gone.
 */
const [SWITCHGEAR_SPACE_X0, SWITCHGEAR_SPACE_X1] =
  widenTo(SWITCHGEAR.x0, SWITCHGEAR.x1, NEC_WORK_MIN_W)
const SWITCHGEAR_SPACE: Box = {
  x0: SWITCHGEAR_SPACE_X0,
  x1: SWITCHGEAR_SPACE_X1,
  z0: SWITCHGEAR.z0,
  z1: SWITCHGEAR.z1 + NEC_WORK_DEPTH,
}

/**
 * BREAKER PANEL working space on the west wall.
 *
 * The 0.6 × 0.9 × 0.18 enclosure GameCanvas places at [−14.5, 1.6, −5], turned a
 * quarter turn so its door faces east into the room. Turned, its 0.6 m width
 * lies along z and its front face lands at x = −14.41 — the panel stands a little
 * off the wall, which is why the depth is taken off the face and not off X_MIN.
 *
 * This is the panel where 110.26(A)(2) does the work: at 600 mm the enclosure is
 * narrower than the 750 mm minimum, so the painted box is wider than the box it
 * belongs to. That is the rule working, not an error.
 */
const BREAKER_FACE_X = -14.5 + 0.18 / 2
const [BREAKER_Z0, BREAKER_Z1] = widenTo(-5 - 0.3, -5 + 0.3, NEC_WORK_MIN_W)
const BREAKER_SPACE: Box = {
  x0: X_MIN,
  x1: BREAKER_FACE_X + NEC_WORK_DEPTH,
  z0: BREAKER_Z0,
  z1: BREAKER_Z1,
}

/**
 * EAST-WALL STORES RUN — two 2.5 m shelving bays at z = −6.6 / −3.4 and the
 * 2.4 m bench at z = −0.2, all turned to back onto the wall (see GameCanvas).
 *
 * Marked as a 5S storage footprint, not as an aisle. The old marking was a lone
 * yellow line at x = 13.6 that ran parallel to the racks, touched nothing at
 * either end, and implied an aisle 550 mm wide between itself and the racking —
 * i.e. it claimed to be a route while marking out something no one could walk
 * down. What is true about this run is where the racking is allowed to stand.
 */
const STORES: Box = { x0: 14.15, x1: X_MAX, z0: -6.6 - 1.25, z1: -0.2 + 1.2 }

/**
 * The supervisor's office has NO zone here. It draws its own slab — a
 * (W + 0.5) × (D + 0.5) pad with a yellow edge strip, in SupervisorOffice.tsx —
 * so the old `floor_zone_office` was a second, differently-sized, differently-
 * placed grey rectangle 3 m to the west of it. Deleted rather than re-derived:
 * the thing that owns the office floor is the office.
 */

// ── Floor paint ─────────────────────────────────────────────────────────────
//
// WHAT THE THREE COLOURS ARE ALLOWED TO MEAN.
//
// OSHA 1910.144 fixes two of them and nothing else: red is "the basic color for
// the identification of fire protection equipment, containers of flammable
// liquids, and stop buttons or switches used for emergency stopping", and yellow
// is "the basic color for designating caution and for marking physical hazards
// such as striking against, stumbling, falling, tripping and caught-in-between".
// ANSI Z535.1 fills in the rest of the safety palette — red danger, orange
// warning, yellow caution, green safety and first aid, blue notice — though
// strictly it is written for SIGNS, not for slabs, and neither document says a
// word about where a machine is supposed to stand.
//
// That gap is what the 5S floor-marking convention fills, and its central idea
// is worth more than the exact shades: keep the safety colours for safety, and
// mark everything else in white. Aisles and traffic lanes yellow; equipment,
// workstations, racking and material footprints white.
//
// So there are exactly three meanings on this floor and nothing else:
//
//   YELLOW  a route — you walk or wheel a load along it
//   RED     a space that must be kept clear: electrical working space
//   WHITE   the footprint of a thing, so you can see when it is out of place
//
// There is deliberately no yellow-and-black hatching. Hatching marks a physical
// hazard you must stay out of — a door swing, a pit, the strike zone of a
// machine — and this slab has none. Hatching an area that is merely important is
// how a floor ends up meaning nothing at all.

/**
 * Stripe width: 100 mm.
 *
 * OSHA's 1972 interpretation accepts "any width 2 inches or more"; 4 in / 100 mm
 * is the trade default because it is what stays legible from a moving truck
 * without eating floor. It is used for every line here, safety or footprint, so
 * that colour is the only variable a reader has to decode.
 */
const PAINT = 0.1
const PAINT_Y = 0.008
const ZONE_Y = 0.003

/**
 * Half a stripe. Every boundary line on this floor is painted OUTSIDE the thing
 * it bounds by this much, so that the line's INNER edge lands on the dimension.
 *
 * It matters twice. For the red boxes it is the difference between 914 mm of
 * genuinely clear floor and 864 mm of clear floor plus 50 mm of paint you are
 * standing on — the NEC dimension is to clear space, not to the middle of a
 * brush stroke. For the white footprints it is the difference between a visible
 * line and a line half hidden under the rack it marks. The first version of this
 * rework centred the switchgear return legs on the cabinet sides, and half of
 * each leg duly disappeared under the switchgear it was there to mark.
 */
const LINE_LIP = 0.05

type Paint = 'yellow' | 'red' | 'white'

interface Stripe { pos: [number, number, number]; args: [number, number, number]; paint: Paint }

/** A line of paint running east-west at a given z. */
const alongX = (z: number, x0: number, x1: number, paint: Paint = 'yellow'): Stripe => ({
  pos: [(x0 + x1) / 2, PAINT_Y, z], args: [x1 - x0, 0.01, PAINT], paint,
})
/** A line of paint running north-south at a given x. */
const alongZ = (x: number, z0: number, z1: number, paint: Paint = 'yellow'): Stripe => ({
  pos: [x, PAINT_Y, (z0 + z1) / 2], args: [PAINT, 0.01, z1 - z0], paint,
})

/**
 * The four sides of a Box, minus any side something else already paints.
 *
 * The skips are the point. Every omitted side is a side where this box shares an
 * edge with a wall or with an aisle line, and painting it anyway would double the
 * line up into a 200 mm band that means two different things at once.
 */
type Side = 'n' | 's' | 'e' | 'w'
function outline(b: Box, paint: Paint, skip: readonly Side[] = []): Stripe[] {
  const lines: Stripe[] = []
  if (!skip.includes('n')) lines.push(alongX(b.z0, b.x0, b.x1, paint))
  if (!skip.includes('s')) lines.push(alongX(b.z1, b.x0, b.x1, paint))
  if (!skip.includes('w')) lines.push(alongZ(b.x0, b.z0, b.z1, paint))
  if (!skip.includes('e')) lines.push(alongZ(b.x1, b.z0, b.z1, paint))
  return lines
}

/**
 * The red boxes as PAINTED, i.e. the code space plus the lip. Named rather than
 * inlined because the north spur has to line up with the switchgear box's east
 * leg, and two lines meant to be collinear must come from one number.
 */
const SWITCHGEAR_KEEP_CLEAR = grow(SWITCHGEAR_SPACE, LINE_LIP)
const BREAKER_KEEP_CLEAR = grow(BREAKER_SPACE, LINE_LIP)

/**
 * Every line on the floor, the standard it implements, and what it connects to.
 *
 * The aisles form one connected network — south wall to cross aisle to north
 * spur to the switchgear, with the cross aisle running wall to wall — because
 * that is the difference between a marked route and a decorative stripe. Nothing
 * below ends in open floor: every yellow line terminates on a wall, on another
 * yellow line, or on the red boundary it is not allowed to cross.
 *
 * Module scope, not useMemo: none of it depends on props or state, so it is built
 * once for the process rather than once per mount.
 */
const STRIPES: Stripe[] = [
  // ── MAIN AISLE (yellow) — 1.71 m, sized in the Aisles block above for a hand
  // pallet truck under a euro pallet. Runs from the entry wall north to the
  // cross aisle and stops there, because the production bay is what is on the
  // far side. It used to run the full 20 m depth, which took 18 m of it under
  // the silo cell. A route ends where you can no longer walk.
  ...([-MAIN_HALF, MAIN_HALF] as const).map((x) => alongZ(x, CROSS_S, Z_MAX - WALL_STOP)),

  // ── CROSS AISLE (yellow) — 1.22 m, the 4 ft minimum, foot traffic only: it is
  // where an operator stands at the line, not a route to somewhere. Now runs the
  // full width of the building, west wall to the stores footprint, so the main
  // aisle, the north spur and the stores all hang off one spine. Its north edge
  // is PRODUCTION_BAY.z1 by construction, so paint and epoxy share an edge.
  alongX(CROSS_N, X_MIN + WALL_STOP, STORES.x0 - LINE_LIP),
  alongX(CROSS_S, X_MIN + WALL_STOP, STORES.x0 - LINE_LIP),

  // ── NORTH SPUR (yellow) — 1.22 m, the marked way up to the switchgear. Its
  // east edge is the east edge of the red working space, so the yellow line and
  // the red line meet end-to-end and read as one continuous boundary that simply
  // changes meaning where the electrical space begins. It stops ON that
  // boundary: you are told how to get there and told not to stand in it.
  ...([SWITCHGEAR_KEEP_CLEAR.x1 - FOOT_AISLE_W, SWITCHGEAR_KEEP_CLEAR.x1] as const)
    .map((x) => alongZ(x, SWITCHGEAR_SPACE.z1, CROSS_N)),

  // ── SWITCHGEAR WORKING SPACE (red) — NEC 110.26(A) / OSHA 1910.303(g)(1).
  // Three sides; the fourth is the north wall. KEEP THIS.
  ...outline(SWITCHGEAR_KEEP_CLEAR, 'red', ['n']),

  // ── BREAKER PANEL WORKING SPACE (red) — same standard, same treatment, and
  // here it is the 750 mm minimum width rather than the panel that sets the box.
  // Three sides; the fourth is the west wall. KEEP THIS TOO.
  ...outline(BREAKER_KEEP_CLEAR, 'red', ['w']),

  // ── PRODUCTION BAY FOOTPRINT (white, 5S) — the boundary of the coated work
  // bay. Three sides: the fourth is the cross aisle's north line, which is the
  // same number, so the aisle already draws it.
  ...outline(PRODUCTION_BAY, 'white', ['s']),

  // ── STANDALONE STATION FOOTPRINTS (white, 5S) — ST90 and ST100 marked
  // individually rather than as one bay, because the main aisle runs between
  // them. Derived from the same footprint() the bays are derived from, so a
  // station that moves in factoryLayout.ts takes its outline with it.
  ...STANDALONE.flatMap((s) => outline(grow(footprint(s), LINE_LIP), 'white')),

  // ── STORES FOOTPRINT (white, 5S) — where the racking and the bench are
  // allowed to stand. Three sides; the fourth is the east wall.
  // x1 is pinned back to the wall face after the lip, or the two return legs
  // would run 50 mm into the east wall and vanish inside it.
  ...outline({ ...grow(STORES, LINE_LIP), x1: X_MAX }, 'white', ['e']),
]

const PAINT_MAT: Record<Paint, THREE.Material> = {
  yellow: MAT.paintYellow,
  red: MAT.paintRed,
  white: MAT.paintWhite,
}

function FloorPaint() {
  return (
    <group name="floor_markings">
      {STRIPES.map((s, i) => (
        <mesh
          key={i}
          // Colour in the name, because the colour is the meaning: a probe or a
          // raycast hit that says floor_line_red_12 tells you what it hit.
          name={`floor_line_${s.paint}_${i}`}
          position={s.pos}
          material={PAINT_MAT[s.paint]}
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
  const south = SOUTH_BAY ? slab(SOUTH_BAY, ZONE_Y) : null

  return (
    <group name="factory_floor">
      {/* === FLOOR === */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, -FACTORY.WALL / 2, 0]}>
        <mesh name="floor" material={MAT.floor} receiveShadow>
          <boxGeometry args={[FACTORY.WIDTH, FACTORY.WALL, FACTORY.DEPTH]} />
        </mesh>
      </RigidBody>

      {/* ── SAGE-GREEN EPOXY WORK BAYS ─────────────────────────────────────
             Coated slab under the machinery — the ordinary green two-pack every
             production floor puts where oil, coolant and hydraulic fluid land,
             because a coated bay can be squeegeed into the drains beside it and
             bare concrete just soaks it up. Each one is derived above from the
             footprint of the equipment standing on it (PRODUCTION_BAY,
             SOUTH_BAY), and each carries a white 5S outline in STRIPES so the
             coated area reads as a marked work cell rather than a green patch.

             There is no office zone — the office draws its own slab. There is no
             longer a control-corner zone either: the dark mat that used to sit
             under the switchgear has been removed, and the red NEC working-space
             box is what marks that floor now. ── */}
      <mesh name="floor_zone_production" position={production.position} material={MAT.epoxy} receiveShadow>
        <boxGeometry args={production.args} />
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
