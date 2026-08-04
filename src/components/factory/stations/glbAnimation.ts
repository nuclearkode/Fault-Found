/**
 * Shared runtime reader for the animation contract authored in Blender.
 *
 * Every actuator node in the ST90/ST100 GLBs carries custom properties that
 * survive the glTF export as node `userData`:
 *
 *   { station, tag, anim_type, anim_axis, anim_range, anim_space: 'three' }
 *
 * `anim_space: 'three'` means the axis and range are already expressed in
 * Three.js coordinates, so they apply directly with no Blender→glTF axis swap.
 * `anim_range` is [home, driven] — the de-energised pose first. Reading these
 * at runtime keeps Blender the single source of truth for stroke lengths and
 * joint angles: re-export the GLB and the game picks up the new travel with no
 * code change.
 *
 * Nodes carrying only sensor metadata (no `anim_type`) are ignored here — they
 * are wired up through src/config/stationIO.ts instead.
 */

import * as THREE from 'three'

export type AnimAxis = 'x' | 'y' | 'z'

export interface AnimSpec {
  node: THREE.Object3D
  /** PLC output tag that commands this actuator, e.g. 'Q90.0'. */
  tag: string
  kind: 'translate' | 'rotate'
  axis: AnimAxis
  /** De-energised value — metres for translate, radians for rotate. */
  home: number
  /** Energised value, same units as `home`. */
  driven: number
  /** Frame this actuator fires on Blender's master timeline, if authored. */
  cycleIn?: number
  /** Frame it finishes. */
  cycleOut?: number
}

/** Reads one node's animation contract, or null if it isn't a driven actuator. */
export function readAnimSpec(node: THREE.Object3D): AnimSpec | null {
  const data = node.userData as Record<string, unknown>

  const kind = data.anim_type
  if (kind !== 'translate' && kind !== 'rotate') return null
  if (typeof data.tag !== 'string') return null

  const axis = typeof data.anim_axis === 'string' ? data.anim_axis.toLowerCase() : ''
  if (axis !== 'x' && axis !== 'y' && axis !== 'z') return null

  const range = data.anim_range
  if (!Array.isArray(range) || range.length !== 2) return null
  const [home, driven] = range
  if (typeof home !== 'number' || typeof driven !== 'number') return null

  // Blender stores rotation limits in degrees; Three.js wants radians.
  const toRadians = kind === 'rotate' ? THREE.MathUtils.DEG2RAD : 1

  return {
    node,
    tag: data.tag,
    kind,
    axis,
    home: home * toRadians,
    driven: driven * toRadians,
    cycleIn: typeof data.cycle_frame_in === 'number' ? data.cycle_frame_in : undefined,
    cycleOut: typeof data.cycle_frame_out === 'number' ? data.cycle_frame_out : undefined,
  }
}

/** Collects every driven actuator under a loaded station scene. */
export function collectAnimSpecs(root: THREE.Object3D): AnimSpec[] {
  const specs: AnimSpec[] = []
  root.traverse((child) => {
    const spec = readAnimSpec(child)
    if (spec) specs.push(spec)
  })
  return specs
}

/** PLC actuator tags are bit addresses — any non-zero value means energised. */
export function isEnergised(value: boolean | number | undefined): boolean {
  return typeof value === 'number' ? value !== 0 : value === true
}

/** Eases one actuator toward the end of travel its tag currently commands. */
export function applyAnimSpec(spec: AnimSpec, energised: boolean, lerpSpeed: number): void {
  const target = energised ? spec.driven : spec.home
  const channel = spec.kind === 'rotate' ? spec.node.rotation : spec.node.position
  channel[spec.axis] = THREE.MathUtils.lerp(channel[spec.axis], target, lerpSpeed)
}
