'use client'

/**
 * SiloCell — the LogixPro Silo Simulator as a live, faultable 3D cell.
 *
 * This component owns NO control logic. That lives in the scenario's ladder
 * (src/scenarios/S02.json) and is evaluated by the engine's scan cycle, per the
 * project rule that PLC logic and 3D stay decoupled. The split is strict:
 *
 *   PHYSICAL → PLC   this writes the two field inputs it can actually sense:
 *                    I:1/03 prox (a carton is under the spout)
 *                    I:1/04 level (the carton is full)
 *                    plus the operator pushbuttons.
 *
 *   PLC → PHYSICAL   this reads the outputs and obeys them:
 *                    O:2/00 motor, O:2/01 valve, O:2/02-04 lamps.
 *
 * Everything in between — the seal-in, when the valve opens, when the motor
 * restarts — is the ladder's job. Change the rungs and the cell behaves
 * differently with no code change here.
 *
 * The one thing that stays physical is the FILL RATE, because the engine has no
 * timer instruction. The level rises while the valve is open and trips the level
 * sensor at LEVEL_TRIP, which reproduces the original lab's 3.5 s fill without
 * needing a TON.
 *
 * MECHANICAL FAULTS bypass the PLC entirely: the motor output can be TRUE, the
 * contactor pulled in and the RUN lamp lit while the belt does not move. See
 * hasMechanicalFault() in the engine.
 */

import { useMemo, useRef, useCallback, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'
import { worldInputEnabled, worldRunning } from '@/stores/worldClock'
import { hinge, latch } from '@/audio/foley'
import { TagTable } from '@/components/factory/TagTable'
import { hasMechanicalFault } from '@/engine'

const MODEL_PATH = '/models/silo_cell.glb'

// Geometry constants, matching blender_source/silo_conveyor_cell.blend
const BELT_X0 = -3.0
const BELT_X1 = 3.0
const FILL_X = 0.0
// The prox window is deliberately asymmetric. A symmetric ±0.12 window trips as
// soon as the carton's leading edge enters it, so the belt stops 120 mm short and
// the carton parks beside the nozzle instead of under it. Making it just before
// centre and holding well past means the carton stops aligned with the spout.
const PROX_ENTER = -0.015    // trips this far before the fill point
const PROX_HOLD = 0.15       // stays made until the carton is this far past
const BELT_SPEED = 0.55      // m/s
const FILL_SECONDS = 3.5     // matches the original lab's fill timer
const LEVEL_TRIP = 0.82      // fill fraction at which the level sensor makes
const GATE_OPEN_X = 0.34

const LAMP_ON = 4.0
const LAMP_OFF = 0.04

// ── Product ─────────────────────────────────────────────────────────────────
// Measured off the GLB rather than guessed. Each Carton_N is an open-topped box:
// a 12 mm floor whose top face sits at y = 0.912, and four 12 mm walls reaching
// y = 1.190. The cavity is therefore 276 mm square and 278 mm deep, and the
// carton's own node origin is centred on it in x and z — so a product block is
// simply a child at [0, floor + h/2, 0].
// The cavity is exactly 276 mm square with its floor top at 912 mm. The product
// block is built 4 mm narrower and seated 1 mm higher: coplanar faces z-fight at
// grazing angles, and the carton is looked into from above, which is the worst
// case for it.
const CARTON_FLOOR_Y = 0.913
const CARTON_CAVITY = 0.272
/** Stop a little short of the rim: a box filled to the brim reads as a solid. */
const CARTON_FILL_H = 0.252

/** The spout mouth, where product leaves the silo. */
const SPOUT_Y = 1.285
const SPOUT_R = 0.055

/** Grains in the stream. Trivial for the GPU; the cost is the CPU update. */
const GRAINS = 130
const GRAIN_GRAVITY = 5.2

/**
 * The product in the box, and the product in the air.
 *
 * Two colours, not one. The cartons are #ceb38b cardboard, and a product tinted
 * anywhere near that disappears into them — a filled box read as an empty box
 * with a slightly odd floor. The fill is pushed cool and dark so it separates
 * from the tan; the falling grains stay light so they show against the dark
 * belt and the shadow under the spout, which is where they actually are.
 */
const PRODUCT_COLOUR = '#6f6b5f'
const GRAIN_COLOUR = '#c6c0ae'

/** The fault this cell can suffer, and the output it makes a liar of. */
const MOTOR_TAG = 'O:2/00'

// Scratch vectors — reused every frame so aiming allocates nothing
const WORLD = new THREE.Vector3()
const PROJ = new THREE.Vector3()

type ControlKind = 'momentary' | 'maintained' | 'door' | 'loto' | 'repair'

/**
 * Operator controls and maintenance points, cell-local.
 * Blender is Z-up and glTF is Y-up, so a Blender (x, y, z) lands here as (x, z, -y).
 */
const CONTROLS: Array<{
  name: string
  kind: ControlKind
  tag?: string
  pos: [number, number, number]
}> = [
  { name: 'START',         kind: 'momentary',  tag: 'I:1/00', pos: [-1.975, 1.16, 1.292] },
  { name: 'STOP',          kind: 'momentary',  tag: 'I:1/01', pos: [-1.975, 1.08, 1.292] },
  { name: 'MODE SELECTOR', kind: 'momentary',  tag: 'I:1/05', pos: [-1.725, 1.14, 1.306] },
  // moved with the button when it went to the panel's top-right corner
  { name: 'E-STOP',        kind: 'maintained', tag: 'I:1/02', pos: [-1.725, 1.47, 1.298] },
  // Maintenance points — not I/O, but things a technician physically does.
  // The isolator lives INSIDE the cabinet, so the door has to be opened first.
  { name: 'CABINET DOOR',   kind: 'door',   pos: [-2.83, 0.90, 1.48] },
  { name: 'MAIN ISOLATOR',  kind: 'loto',   pos: [-3.30, 1.16, 1.33] },
  { name: 'DRIVE ROLLER',   kind: 'repair', pos: [2.91, 0.81, -0.38] },
]

/**
 * Swing angle of the cabinet door when open, radians, about the WORLD-UP axis.
 *
 * Blender is Z-up but glTF is Y-up, so the hinge's vertical axis arrives here as
 * `rotation.y`, not `rotation.z`. Driving `.z` rotates about a horizontal axis and
 * tips the door up like a hatch. Flip the sign to reverse the swing.
 */
const DOOR_OPEN = -1.65

/** How close the player must be, and how tight the crosshair must be, to interact. */
const REACH = 2.6
/**
 * Screen-space radius, in NDC, within which a control counts as aimed at.
 *
 * 0.11 was too mean to use. A cabinet handle is small on screen and the test
 * measures from the exact hotspot, so being half a handle's width off gave you
 * nothing at all — no prompt, no hint you were close, just a door that appeared
 * to be scenery. Widening it costs no precision between neighbouring controls,
 * because the loop still picks the one NEAREST the crosshair.
 */
const AIM_RADIUS = 0.17

interface Cell {
  cartons: THREE.Object3D[]
  gate: THREE.Object3D | null
  lamps: Record<string, THREE.Mesh>
  door: THREE.Object3D | null
  /** The door handle. Aim at this rather than a fixed point — it swings with the
   *  leaf, so a static hotspot would be left floating in the doorway once open. */
  handle: THREE.Object3D | null
  /**
   * Centre of the handle's geometry, in the handle's OWN local frame.
   *
   * Not redundant with the node itself: `PLC_Handle` has its object origin at the
   * model origin, and its parent pivot's translation exactly cancels its own
   * ([3.42, -0.9, -1.455] under [-3.42, 0.9, 1.455]). getWorldPosition() therefore
   * reports the cell origin — about 3 m away, on the floor under the silo — so the
   * hotspot detaches from the handle entirely and the door stops being clickable.
   *
   * Reading the geometry's centre instead is right no matter where the origin
   * sits, which makes that whole failure mode impossible rather than merely fixed.
   */
  handleOffset: THREE.Vector3
  isolator: THREE.Object3D | null
  /** A/B/C mode knob — turns to point at the selected letter. */
  selector: THREE.Object3D | null
  padlock: THREE.Object3D[]
  /**
   * The product block inside each carton, parallel to `cartons`.
   *
   * Made here and parented to the carton, which is what makes a filled box carry
   * its contents when the belt indexes it away — the alternative, drawing them in
   * R3F at computed world positions, would have to re-derive that every frame and
   * would drift the moment anything else moved a carton.
   */
  product: THREE.Mesh[]
  /**
   * How full each carton is, 0..1, parallel to `cartons`.
   *
   * Per-carton, not one shared number. A single `level` could only describe the
   * box under the spout, so a full box lost its contents the instant it moved on
   * and the next empty one inherited them.
   */
  fill: number[]
  /** The falling stream, and its per-grain velocities. */
  grains: THREE.Points | null
  grainV: Float32Array
  /** Where the cartons started, so a new job can put them back. */
  home: number[]
}

/** Knob angle per mode, degrees, matching the A/B/C marks silkscreened on the panel. */
const MODE_ANGLE = [-40, 0, 40]

/** Resolve the moving parts once. Module-level so the component never mutates a
 *  value the React compiler considers owned by a hook. */
function collect(root: THREE.Object3D): Cell {
  const cartons: THREE.Object3D[] = []
  const lamps: Record<string, THREE.Mesh> = {}
  const padlock: THREE.Object3D[] = []
  let gate: THREE.Object3D | null = null
  let door: THREE.Object3D | null = null
  let handle: THREE.Object3D | null = null
  let isolator: THREE.Object3D | null = null
  let selector: THREE.Object3D | null = null
  root.traverse((o) => {
    if (o.name.startsWith('Carton_')) cartons.push(o)
    else if (o.name === 'FillValve_Gate') gate = o
    else if (o.name === 'PLC_Door_Pivot') door = o
    // startsWith, not ===. Blender appends .001 to a name collision, and if the
    // survivor of a rebuild keeps that suffix an exact match fails silently — the
    // hotspot just falls back to a stale fixed position with no error anywhere.
    else if (o.name.startsWith('PLC_Handle')) handle = o
    else if (o.name === 'PLC_Isolator_Handle') isolator = o
    else if (o.name === 'SEL_Knob') selector = o
    else if (o.name.startsWith('LOTO_')) padlock.push(o)
    else if (o.name.startsWith('Lamp_') && o instanceof THREE.Mesh) {
      // clone() shares materials with the cached GLTF — copy before mutating
      o.material = (o.material as THREE.Material).clone()
      lamps[o.name] = o
    }
  })
  cartons.sort((a, b) => a.position.x - b.position.x)
  // the lock only exists once it has been applied
  for (const p of padlock) p.visible = false

  // ── Product in the boxes ──
  // One shared material and one shared unit-cube geometry; each block is scaled
  // in y and re-seated so its base stays on the carton floor.
  const productMat = new THREE.MeshStandardMaterial({
    color: PRODUCT_COLOUR, roughness: 0.95, metalness: 0,
  })
  const productGeo = new THREE.BoxGeometry(CARTON_CAVITY, 1, CARTON_CAVITY)
  const product = cartons.map((carton, i) => {
    const m = new THREE.Mesh(productGeo, productMat)
    m.name = `Product_${i}`
    m.castShadow = false
    m.receiveShadow = true
    m.visible = false
    carton.add(m)
    return m
  })

  // ── The falling stream ──
  // Points rather than instanced meshes: at this size each grain is a couple of
  // pixels, so the geometry would never be seen and instancing would only buy
  // per-grain rotation nobody can perceive.
  const pos = new Float32Array(GRAINS * 3)
  const grainV = new Float32Array(GRAINS)
  for (let i = 0; i < GRAINS; i++) pos[i * 3 + 1] = -999   // parked out of sight
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const grains = new THREE.Points(geo, new THREE.PointsMaterial({
    color: GRAIN_COLOUR, size: 0.018, sizeAttenuation: true,
    transparent: true, opacity: 0.95, depthWrite: false,
  }))
  grains.name = 'product_stream'
  grains.frustumCulled = false   // positions are rewritten every frame
  root.add(grains)

  return {
    cartons, gate, lamps, door, handle, isolator, selector, padlock,
    handleOffset: localCentre(handle),
    product, fill: cartons.map(() => 0), grains, grainV,
    home: cartons.map((c) => c.position.x),
  }
}

/**
 * Put the machine back to how it was found.
 *
 * The rig does NOT remount between jobs — the component is the same, the rig id
 * is still 'silo_cell', so `cell.current` survives. Everything physical it holds
 * therefore leaks across scenarios: half-filled cartons stranded mid-belt, a
 * cabinet door left open, a latched E-stop. The store is reset by resetRun(); the
 * machine has to be reset here, and this is the only place that knows how.
 */
function restock(cell: Cell) {
  for (let i = 0; i < cell.cartons.length; i++) {
    cell.cartons[i].position.x = cell.home[i]
    cell.fill[i] = 0
    showFill(cell, i)
  }
  if (cell.grains) {
    const attr = cell.grains.geometry.getAttribute('position') as THREE.BufferAttribute
    const p = attr.array as Float32Array
    for (let i = 0; i < GRAINS; i++) p[i * 3 + 1] = -999
    attr.needsUpdate = true
  }
  if (cell.gate) cell.gate.position.x = 0
  for (const l of cell.padlock) l.visible = false
}

/** Seat a carton's product block so its base rests on the carton floor. */
function showFill(cell: Cell, i: number) {
  const m = cell.product[i]
  if (!m) return
  const h = cell.fill[i] * CARTON_FILL_H
  if (h < 0.002) { m.visible = false; return }
  m.visible = true
  m.scale.y = h
  m.position.set(0, CARTON_FLOOR_Y + h / 2, 0)
}

/**
 * Advance the falling stream.
 *
 * Grains are a fixed pool. While the valve is open, dead ones are respawned at
 * the spout mouth; each falls under gravity and dies when it reaches the surface
 * of whatever is under it — the product already in the box, or the box floor —
 * so the stream visibly shortens as the carton fills.
 */
function driveGrains(cell: Cell, pouring: boolean, landingY: number, targetX: number, dt: number) {
  const g = cell.grains
  if (!g) return
  const attr = g.geometry.getAttribute('position') as THREE.BufferAttribute
  const p = attr.array as Float32Array
  let live = 0

  for (let i = 0; i < GRAINS; i++) {
    const y = p[i * 3 + 1]
    if (y < -900) {
      // dead — respawn a few per frame while pouring so the stream builds
      if (pouring && live < 6) {
        const a = Math.random() * Math.PI * 2
        const r = Math.sqrt(Math.random()) * SPOUT_R
        p[i * 3] = targetX + Math.cos(a) * r
        p[i * 3 + 1] = SPOUT_Y - Math.random() * 0.02
        p[i * 3 + 2] = Math.sin(a) * r
        cell.grainV[i] = 0
        live++
      }
      continue
    }
    cell.grainV[i] += GRAIN_GRAVITY * dt
    p[i * 3 + 1] = y - cell.grainV[i] * dt
    if (p[i * 3 + 1] <= landingY) p[i * 3 + 1] = -999   // landed
  }
  attr.needsUpdate = true
}

/**
 * Where an object's geometry actually sits, expressed in that object's own frame.
 *
 * Box3.setFromObject works in world space, so the result is mapped back through
 * the inverted world matrix. That makes it independent of every ancestor
 * transform, which is the point — the caller can then apply the live matrixWorld
 * each frame and get the true centre however the node has been parented.
 */
function localCentre(o: THREE.Object3D | null): THREE.Vector3 {
  const v = new THREE.Vector3()
  if (!o) return v
  o.updateWorldMatrix(true, true)
  new THREE.Box3().setFromObject(o).getCenter(v)
  return v.applyMatrix4(new THREE.Matrix4().copy(o.matrixWorld).invert())
}

function advanceCartons(cell: Cell, dt: number) {
  const span = BELT_X1 - BELT_X0
  for (let i = 0; i < cell.cartons.length; i++) {
    const c = cell.cartons[i]
    c.position.x += BELT_SPEED * dt
    if (c.position.x > BELT_X1) {
      // Off the end of the belt and round again — which is a NEW, empty carton,
      // not the same one with its contents intact.
      c.position.x -= span
      cell.fill[i] = 0
      showFill(cell, i)
    }
  }
}

function driveGate(cell: Cell, open: boolean, dt: number) {
  if (!cell.gate) return
  cell.gate.position.x = THREE.MathUtils.lerp(
    cell.gate.position.x, open ? GATE_OPEN_X : 0, 10 * dt)
}

function setLamp(cell: Cell, name: string, on: boolean) {
  const m = cell.lamps[name]?.material as THREE.MeshStandardMaterial | undefined
  if (m) m.emissiveIntensity = on ? LAMP_ON : LAMP_OFF
}

/** PLC outputs are bit addresses — any non-zero value means energised. */
function on(v: boolean | number | undefined): boolean {
  return typeof v === 'number' ? v !== 0 : v === true
}

interface Props {
  position?: [number, number, number]
  rotation?: number
}

export function SiloCell({ position = [0, 0, 0], rotation = 0 }: Props) {
  const { scene } = useGLTF(MODEL_PATH)
  const cellScene = useMemo(() => scene.clone(true), [scene])

  const cell = useRef<Cell | null>(null)
  const group = useRef<THREE.Group>(null)
  // Physical state only — no control state. The ladder owns that.
  // `mode` is the A/B/C selector position, 0-2. It lives here rather than in the
  // tag map because the knob is a physical position, not a bit.
  const phys = useRef({ level: 0, estop: false, prevProx: false, doorOpen: false, mode: 0 })
  const aimed = useRef<number | null>(null)
  const aimedLabel = useRef<string | null>(null)
  const { camera } = useThree()

  // A new job gets a machine in the state it was found in. The rig does not
  // remount between scenarios, so nothing else does this.
  //
  // The effect only raises a flag; useFrame does the work. Two reasons: on first
  // mount `cell.current` is still null because collect() runs on the first frame,
  // and touching it from an effect would put the whole cell off-limits to the
  // per-frame writes that are this component's entire job.
  const runNonce = useGameStore(s => s.runNonce)
  const restockAt = useRef(-1)
  useEffect(() => {
    phys.current = { level: 0, estop: false, prevProx: false, doorOpen: false, mode: 0 }
  }, [runNonce])

  const activate = useCallback((idx: number) => {
    const ctl = CONTROLS[idx]
    const store = useGameStore.getState()

    if (ctl.kind === 'momentary' && ctl.tag) {
      // The selector is a maintained rotary dressed as a momentary contact: each
      // press advances it A -> B -> C and the knob turns to match.
      if (ctl.tag === 'I:1/05') phys.current.mode = (phys.current.mode + 1) % 3
      latch(0.7)
      store.setTag(ctl.tag, true)
      setTimeout(() => useGameStore.getState().setTag(ctl.tag!, false), 120)
      return
    }
    if (ctl.kind === 'maintained') {
      phys.current.estop = !phys.current.estop     // written every frame below
      latch(1.2)                                   // a mushroom head is a big clack
      return
    }
    if (ctl.kind === 'door') {
      phys.current.doorOpen = !phys.current.doorOpen
      hinge(phys.current.doorOpen)
      return
    }
    if (ctl.kind === 'loto') {
      if (!phys.current.doorOpen) {
        console.warn('[SiloCell] The isolator is inside the cabinet — open the door first.')
        return
      }
      // A toggle, not a one-way latch. You lock off to work and you unlock to
      // prove the repair — a handle that only ever throws one way is not an
      // isolator, and it left the player with no way to re-energise the cell.
      latch(1.4)
      store.setLotoApplied(!store.lotoApplied)
      return
    }
    if (ctl.kind === 'repair') {
      if (!store.lotoApplied) {
        // Reaching into a live drive is the thing this scenario exists to punish
        store.applyPenalty('skipLOTO', 300)
        console.warn('[SiloCell] Refused: the drive is still live. Isolate first.')
        return
      }
      const jam = store.faults.find(
        (f) => f.active && f.type === 'mechanical_jam' && f.targetTag === MOTOR_TAG)
      if (jam) {
        store.clearFault(jam.id)
        console.log('[SiloCell] Drive roller re-lagged and belt re-tensioned')
      }
    }
  }, [])

  // E to interact. The crosshair is pinned to the screen centre under pointer
  // lock, so "what am I aiming at" is decided by projecting each control and
  // measuring its distance from centre — steadier than raycasting colliders.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return
      // worldInputEnabled(), not just the phase. The phase stays 'active' with
      // the laptop open, so typing an E into the ladder editor would otherwise
      // reach in and throw whatever the frozen crosshair was last aimed at.
      if (!worldInputEnabled()) return
      const idx = aimed.current
      if (idx !== null) activate(idx)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activate])

  useFrame((_, delta) => {
    if (!worldRunning()) return
    if (!cell.current) cell.current = collect(cellScene)
    const c = cell.current
    const p = phys.current
    const dt = Math.min(delta, 0.05)
    const { tags, faults, setTag, runNonce: nonce } = useGameStore.getState()

    // Restock on the first frame of every job — see the effect above.
    if (restockAt.current !== nonce) {
      restockAt.current = nonce
      restock(c)
    }

    // ── PHYSICAL → PLC : the only inputs this cell can actually sense ──
    // Which carton is at the spout, by index — the level sensor looks at THAT
    // box, and so does the valve. Tracking the index rather than a bare boolean
    // is what lets each carton keep its own contents.
    let atProx = -1
    for (let i = 0; i < c.cartons.length; i++) {
      const dx = c.cartons[i].position.x - FILL_X
      if (dx >= PROX_ENTER && dx <= PROX_HOLD) { atProx = i; break }
    }
    const prox = atProx >= 0
    p.prevProx = prox
    // `level` is now just a view of the carton under the spout. A box that has
    // moved on keeps what it was given; it does not evaporate because the sensor
    // stopped looking at it.
    p.level = prox ? c.fill[atProx] : 0

    setTag('I:1/03', prox)
    setTag('I:1/04', p.level >= LEVEL_TRIP)
    setTag('I:1/02', p.estop)          // maintained, so written continuously

    // ── PLC → PHYSICAL : obey the outputs, decide nothing ──
    const motorCmd = on(tags[MOTOR_TAG]?.value)
    const valveCmd = on(tags['O:2/01']?.value)

    // Product only flows while the valve is actually open, and only into the box
    // that is actually under the spout. With the prox shorted (S05) the valve
    // opens with no carton there, and the product goes on the floor — which is
    // exactly the symptom that scenario is about.
    if (valveCmd && atProx >= 0) {
      c.fill[atProx] = Math.min(1, c.fill[atProx] + dt / FILL_SECONDS)
      showFill(c, atProx)
      p.level = c.fill[atProx]
    }

    // The stream. It lands on whatever surface is under it — the product already
    // in the box, the box floor, or the belt if there is no box at all.
    const target = atProx >= 0 ? c.cartons[atProx] : null
    const landing = target
      ? CARTON_FLOOR_Y + c.fill[atProx] * CARTON_FILL_H
      : 0.9   // the belt
    driveGrains(c, valveCmd, landing, target ? target.position.x : FILL_X, dt)

    // A mechanical fault is invisible to the PLC: the output stays TRUE and the
    // lamp stays lit, but the belt does not move.
    const jammed = hasMechanicalFault(faults, MOTOR_TAG)
    if (motorCmd && !jammed) {
      advanceCartons(c, dt)
    } else if (prox) {
      // Settle the stopped carton onto the fill point.
      //
      // Relying on stopping distance alone never lands consistently: the sensor
      // makes on one frame, but the motor doesn't drop out until the next 20 Hz
      // scan, by which time the belt has run on another ~27 mm. Easing the held
      // carton to FILL_X removes that timing dependency entirely, and reads as the
      // carton nudging into position against a stop.
      for (const k of c.cartons) {
        const dx = k.position.x - FILL_X
        if (dx >= PROX_ENTER && dx <= PROX_HOLD) {
          k.position.x = THREE.MathUtils.lerp(k.position.x, FILL_X, 6 * dt)
          break
        }
      }
    }

    driveGate(c, valveCmd, dt)
    setLamp(c, 'Lamp_RUN', on(tags['O:2/02']?.value))
    setLamp(c, 'Lamp_FILL', on(tags['O:2/03']?.value))
    setLamp(c, 'Lamp_FULL', on(tags['O:2/04']?.value))

    // ── maintenance state, made visible ──
    // Clicking the isolator previously changed nothing on screen, so there was no
    // way to tell whether the lock-out had taken. Now the door swings, the handle
    // throws to OFF, and a padlock appears on it.
    if (c.door) {
      // .y — the hinge is vertical, and vertical is Y in glTF space
      c.door.rotation.y = THREE.MathUtils.lerp(
        c.door.rotation.y, phys.current.doorOpen ? DOOR_OPEN : 0, 6 * dt)
    }
    const locked = useGameStore.getState().lotoApplied
    if (c.isolator) {
      // the isolator handle turns in the plane of the panel face, so its axis is
      // the panel normal — which for a face pointing -Y in Blender is +Z here
      c.isolator.rotation.z = THREE.MathUtils.lerp(
        c.isolator.rotation.z, locked ? -Math.PI / 2 : 0, 10 * dt)
    }
    for (const p of c.padlock) p.visible = locked

    // Mode knob points at the letter it has selected. Same axis as the isolator:
    // the knob turns in the plane of the panel face, so its axis is the face normal.
    if (c.selector) {
      const target = THREE.MathUtils.degToRad(MODE_ANGLE[phys.current.mode] ?? 0)
      c.selector.rotation.z = THREE.MathUtils.lerp(c.selector.rotation.z, target, 12 * dt)
    }

    // ── what is the crosshair on? ──
    const g = group.current
    if (!g) return
    let best: number | null = null
    let bestOffset = AIM_RADIUS
    for (let i = 0; i < CONTROLS.length; i++) {
      const ctl = CONTROLS[i]
      // The door is opened by its handle, and the handle travels with the leaf —
      // so track the live mesh rather than a fixed hotspot, which would otherwise
      // be left hanging in the empty doorway once the door swung away from it.
      if (ctl.kind === 'door' && c.handle) {
        // The door rotation was written a few lines above, but matrixWorld is only
        // refreshed at render. Without forcing it here we read LAST frame's matrix,
        // which for a door that has already swung means the hotspot stays pinned to
        // where the handle used to be — on the cabinet face.
        c.handle.updateWorldMatrix(true, false)
        // NOT getWorldPosition — see Cell.handleOffset. The node's origin is at
        // the model origin, so its world position is a point on the floor.
        WORLD.copy(c.handleOffset).applyMatrix4(c.handle.matrixWorld)
      } else {
        WORLD.set(ctl.pos[0], ctl.pos[1], ctl.pos[2]).applyMatrix4(g.matrixWorld)
      }
      if (WORLD.distanceTo(camera.position) > REACH) continue
      PROJ.copy(WORLD).project(camera)
      if (PROJ.z > 1) continue                       // behind the camera
      const offset = Math.hypot(PROJ.x, PROJ.y)      // distance from screen centre
      if (offset < bestOffset) { bestOffset = offset; best = i }
    }
    // Label carries the CURRENT STATE, not just the name. Without it the isolator
    // is an unmarked black box: you throw it and nothing tells you whether the
    // machine is now safe, which is the one thing that matters before reaching in.
    let label: string | null = null
    if (best !== null) {
      const ctl = CONTROLS[best]
      const locked2 = useGameStore.getState().lotoApplied
      if (ctl.kind === 'door') {
        label = `CABINET DOOR — ${phys.current.doorOpen ? 'OPEN' : 'CLOSED'}  [E]`
      } else if (ctl.kind === 'loto') {
        label = locked2
          ? 'MAIN ISOLATOR — LOCKED OFF · SAFE TO WORK  [E]'
          : 'MAIN ISOLATOR — ON · LIVE  [E]'
      } else if (ctl.kind === 'repair') {
        label = locked2
          ? 'DRIVE ROLLER — re-lag and re-tension  [E]'
          : 'DRIVE ROLLER — ISOLATE FIRST'
      } else if (ctl.tag === 'I:1/02') {
        label = `E-STOP — ${phys.current.estop ? 'LATCHED' : 'ARMED'}  [E]`
      } else {
        label = `${ctl.name}  [E]`
      }
    }
    if (label !== aimedLabel.current) {
      aimedLabel.current = label
      useGameStore.getState().setHoveredInteractable(label)
    }
    aimed.current = best
  })

  return (
    <group
      ref={group}
      name="silo_cell"
      position={position}
      rotation={[0, (rotation * Math.PI) / 180, 0]}
    >
      <primitive object={cellScene} castShadow receiveShadow />
      {/* The I/O schedule, on the same whiteboard as the SFC. Inside this group
          so it inherits the rig's placement and uses cell-local coordinates. */}
      <TagTable />
    </group>
  )
}

useGLTF.preload(MODEL_PATH)
