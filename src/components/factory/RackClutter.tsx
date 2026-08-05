'use client'

/**
 * RackClutter — the stores rack: spare sensors and actuators, left where people
 * left them.
 *
 * This component PLACES devices; it does not build them. Every spare comes from
 * public/models/devices.glb, authored in blender_source/device_library.blend to
 * real hardware dimensions — an M12 barrel prox is 12 mm across because that is
 * what M12 means.
 *
 * That is deliberate, and it replaced the opposite approach. The first version
 * built each spare from THREE primitives in TSX, which meant the models existed
 * nowhere Blender could see: the next export of any rig would not know about
 * them, they could not be measured or reused, and the two representations would
 * drift with no way to say which was right. Geometry lives in the .blend; code
 * positions it.
 *
 * "Clumsy" is generated rather than authored, but from a FIXED seed, so the shed
 * looks the same on every load. A stores rack that rearranges itself on refresh
 * is worse than a tidy one.
 */

import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const DEVICES_URL = '/models/devices.glb'

/**
 * Shelf geometry, read off IndustrialShelving in FactoryProps.tsx: boards are
 * 2.5 x 0.04 x 0.5 centred at y = 0.5 / 1.2 / 1.9 with uprights 0.05 wide at
 * x = +-1.2. A board's top surface is its centre plus half of its 40 mm.
 */
const SHELF_Y = [0.5, 1.2, 1.9].map((y) => y + 0.02)
/** Usable span, kept inside the uprights and back off the front lip. */
const SHELF_X = 1.12
const SHELF_Z = 0.19

/**
 * What can sit on a shelf, and how it lies.
 *
 * `lay` is a rotation about X. Barrel sensors and stack lights are modelled
 * standing up because that is how they MOUNT; on a shelf they are on their side,
 * which is what -90 degrees does. Panel devices and DIN gear stay upright —
 * that is how they come out of the box and how they stack.
 */
interface Spare {
  node: string
  lay: number
  /** Half-footprint once laid down, used for spacing. */
  r: number
}

const SPARES: Spare[] = [
  { node: 'DEV_ProxM12', lay: -Math.PI / 2, r: 0.10 },
  { node: 'DEV_ProxM18', lay: -Math.PI / 2, r: 0.11 },
  { node: 'DEV_PhotoTx', lay: 0, r: 0.055 },
  { node: 'DEV_PhotoRx', lay: 0, r: 0.055 },
  { node: 'DEV_Reflector', lay: 0, r: 0.055 },
  { node: 'DEV_LimitSwitch', lay: 0, r: 0.05 },
  { node: 'DEV_EStop', lay: 0, r: 0.03 },
  { node: 'DEV_PushGreen', lay: 0, r: 0.025 },
  { node: 'DEV_PushRed', lay: 0, r: 0.025 },
  { node: 'DEV_PilotLamp', lay: 0, r: 0.025 },
  { node: 'DEV_Selector', lay: 0, r: 0.025 },
  { node: 'DEV_SolenoidValve', lay: 0, r: 0.05 },
  { node: 'DEV_Contactor', lay: 0, r: 0.05 },
  { node: 'DEV_Relay', lay: 0, r: 0.04 },
  { node: 'DEV_StackLight', lay: -Math.PI / 2, r: 0.10 },
  { node: 'DEV_Encoder', lay: 0, r: 0.045 },
]

/**
 * Mulberry32 — deterministic and seedable, unlike Math.random. That is the whole
 * point: the untidiness must be the SAME untidiness on every load.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Placed {
  node: string
  pos: [number, number, number]
  rot: [number, number, number]
}

/**
 * Walk a cursor left to right along each shelf, advancing by each item's own
 * width plus a gap.
 *
 * A cursor rather than random positions, because two spares occupying the same
 * 40 mm of shelf reads as a bug — whereas uneven spacing, crooked yaw and the
 * occasional empty stretch read as people.
 */
function layout(seed: number): Placed[] {
  const rand = rng(seed)
  const out: Placed[] = []

  for (let shelf = 0; shelf < SHELF_Y.length; shelf++) {
    let x = -SHELF_X
    // Each shelf starts at a different point in the list, so the three do not
    // read as one row repeated three times.
    let i = Math.floor(rand() * SPARES.length)
    let guard = 0
    while (x < SHELF_X && guard++ < 40) {
      const s = SPARES[i % SPARES.length]
      i++
      // Occasionally leave a gap. A rack with no empty space looks stocked by a
      // machine rather than picked over by people.
      if (rand() < 0.18) {
        x += 0.10 + rand() * 0.12
        continue
      }
      if (x + s.r * 2 > SHELF_X) break
      out.push({
        node: s.node,
        pos: [x + s.r, SHELF_Y[shelf], (rand() - 0.5) * 2 * SHELF_Z * 0.55],
        rot: [
          // Only things lying down get a roll — an upright contactor that has
          // tipped sideways would just look broken.
          s.lay + (s.lay !== 0 ? (rand() - 0.5) * 0.16 : 0),
          (rand() - 0.5) * Math.PI * 0.9,
          s.lay !== 0 ? 0 : (rand() - 0.5) * 0.10,
        ],
      })
      x += s.r * 2 + 0.035 + rand() * 0.05
    }
  }
  return out
}

export interface RackClutterProps {
  position?: [number, number, number]
  rotation?: [number, number, number]
  /** Change for a different arrangement. Same seed, same rack, every load. */
  seed?: number
}

export function RackClutter({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  seed = 1,
}: RackClutterProps) {
  const { scene } = useGLTF(DEVICES_URL)
  const placed = useMemo(() => layout(seed), [seed])

  /**
   * One clone per placed spare.
   *
   * `clone(true)` shares geometry AND materials with the cached GLTF, so forty
   * spares drawn from sixteen device types still cost sixteen materials. Nothing
   * here mutates a material, which is what makes that sharing safe — see the
   * note in SiloCell.collect() for what happens when it is not.
   */
  const items = useMemo(() => {
    const box = new THREE.Box3()
    return placed
      .map((p, idx) => {
        const src = scene.getObjectByName(p.node)
        if (!src) return null
        const obj = src.clone(true)
        obj.name = `spare_${idx}_${p.node}`
        obj.traverse((c) => {
          const m = c as THREE.Mesh
          if (m.isMesh) { m.castShadow = true; m.receiveShadow = true }
        })

        // ── Seat it ON the shelf, measured rather than assumed ──────────────
        // Device origins are at their MOUNTING point, not their lowest point,
        // and that is correct modelling: a 22 mm pushbutton's body hangs behind
        // the panel face, so its origin is 53 mm above its own base. Laid on
        // their side, barrels rest on a radius. Neither is knowable from a
        // table, and a table would go stale the moment a device is remodelled.
        //
        // So: apply the rotation, measure the real bounding box, and lift by
        // however far the lowest point falls below the origin. Every spare then
        // rests on the board no matter how it is turned or what shape it is.
        obj.position.set(0, 0, 0)
        obj.rotation.set(p.rot[0], p.rot[1], p.rot[2])
        obj.updateMatrixWorld(true)
        box.setFromObject(obj)
        const lift = Number.isFinite(box.min.y) ? -box.min.y : 0

        obj.position.set(p.pos[0], p.pos[1] + lift, p.pos[2])
        return { key: String(idx), obj }
      })
      .filter(Boolean) as Array<{ key: string; obj: THREE.Object3D }>
  }, [scene, placed])

  return (
    <group name="rack_clutter" position={position} rotation={rotation}>
      {/* Position and rotation are already baked onto each clone by the seating
          pass above — setting them again here would undo the lift. */}
      {items.map(({ key, obj }) => (
        <primitive key={key} object={obj} />
      ))}
    </group>
  )
}

useGLTF.preload(DEVICES_URL)
