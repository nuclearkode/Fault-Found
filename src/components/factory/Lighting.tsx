'use client'

/**
 * Lighting — the shed's lighting scheme, as one scheme.
 *
 * Based on how a real production floor is lit:
 * - Bright overhead fluorescents (4000K–5000K white)
 * - Light gray concrete reflects well
 * - Well-lit work areas with minimal shadows in aisles
 * - Brightness and fog controlled by settings store
 *
 * The important change from the earlier version is that there is no longer a
 * hand-placed pair of task lights bolted on over the control corner. That pair
 * existed because the luminaire grid was built from the gaps BETWEEN the roof
 * beams and therefore stopped at the outermost beam, leaving the two end bays —
 * the switchgear run in the north and the office frontage in the south — with no
 * fixture at all. The grid now covers every roof bay including the end ones, so
 * the exception is gone and the room is lit by a single rule.
 */

import type { GPUTier } from '@/utils/gpuCapabilities'
import { FACTORY, BEAM_Z } from './FactoryFloor'
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useSettingsStore } from '@/stores/settingsStore'
import { useGameStore } from '@/stores/gameStore'

interface LightingProps {
  tier: GPUTier
}

/** How far down the shed goes when he is fully wound up. */
const ANGRY_DIM = 0.28

/** Authored emissive level of a lit tube, before brightness and anger scale it. */
const TUBE_EMISSIVE = 2.0

/**
 * Shared luminaire materials.
 *
 * One tube material and one housing material for the whole grid, mutated in the
 * frame loop rather than re-created per fixture. The previous version declared
 * `<meshStandardMaterial>` inside the fixture map, so every luminaire compiled and
 * bound its own program for an identical surface — and the emissive level, which
 * is the only thing that ever changes, was baked into the JSX and so could not
 * follow the anger dimmer that was already pulling every actual light down.
 */
const MAT = {
  tube: new THREE.MeshStandardMaterial({
    color: '#f8f6f0', emissive: '#f8f6f0', emissiveIntensity: TUBE_EMISSIVE, roughness: 0.1,
  }),
  housing: new THREE.MeshStandardMaterial({ color: '#e0e0e0', roughness: 0.5, metalness: 0.3 }),
} as const

/**
 * Pulls every light in the group down as the supervisor's anger rises.
 *
 * Done by scaling the live lights rather than re-rendering with new intensity
 * props, because anger changes every frame — driving it through React would be
 * a full reconcile per frame for a number that only feeds three.js. Each light's
 * authored intensity is captured once into userData and treated as its 100%.
 *
 * The emissive tubes are dimmed here too, from the same factor. A fixture that
 * keeps glowing at full while the light it casts fades to a quarter reads as a
 * rendering bug, which is exactly how it read before.
 */
function AngerDimmer({ group }: { group: React.RefObject<THREE.Group | null> }) {
  const dim = useRef(1)
  const lastBrightness = useRef(-1)
  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const anger = useGameStore.getState().anger
    const want = 1 - Math.min(1, anger) * (1 - ANGRY_DIM)
    dim.current = THREE.MathUtils.damp(dim.current, want, 3, Math.min(delta, 0.05))

    // The brightness slider feeds every light's intensity PROP. Because this
    // loop overwrites intensity from a cached base, a cached base captured under
    // the old slider value would silently swallow the new one — moving the
    // slider would change nothing. R3F has already written the new prop by the
    // time the next frame runs, so re-capturing here is enough.
    const brightness = useSettingsStore.getState().brightness
    const recapture = brightness !== lastBrightness.current
    lastBrightness.current = brightness

    g.traverse((o) => {
      const l = o as THREE.Light
      if (!l.isLight) return
      if (recapture || l.userData.baseIntensity === undefined) {
        l.userData.baseIntensity = l.intensity
      }
      l.intensity = (l.userData.baseIntensity as number) * dim.current
    })
    MAT.tube.emissiveIntensity = TUBE_EMISSIVE * brightness * dim.current
  })
  return null
}

/**
 * Luminaire COLUMNS.
 *
 * Chosen to clear the ceiling services rather than to divide the width evenly.
 * The cable trays run the full depth at x = ±5 and the pipe bank sits at x ≈ −8,
 * and a 1.2 m tube directly above a 0.4 m tray is a tube nobody on the floor can
 * see — it lights the back of a tray. These five lines keep 1 m clear of every
 * tray and 1 m clear of the north-south roof beams at x = ±13, and put the outer
 * rows 3 m off the side walls, which is about right for a 5 m roof.
 */
const LIGHT_COLS = [-12, -6, 0, 6, 12] as const

/** Fixture height: just under the 0.3 m deep roof beams, which start at y = 4.7. */
const FIXTURE_Y = FACTORY.HEIGHT - 0.3

interface Fixture {
  pos: [number, number, number]
  ix: number
  iz: number
}

export function Lighting({ tier }: LightingProps) {
  const brightness = useSettingsStore(s => s.brightness)
  const fogDensity = useSettingsStore(s => s.fogDensity)

  /**
   * Luminaire ROWS — one down the centre of every roof bay.
   *
   * The east-west beams (BEAM_Z, exported by FactoryFloor so this cannot drift
   * from the structure it claims to follow) sit at z = −7.5, −2.5, 2.5, 7.5 and
   * divide the 20 m depth into FIVE bays once the two walls are counted as edges:
   * −10..−7.5, −7.5..−2.5, −2.5..2.5, 2.5..7.5, 7.5..10. Centres therefore fall
   * at −8.75, −5, 0, 5, 8.75. The old grid used only the three interior gaps,
   * which is why nothing north of z = −7.5 or south of z = 7.5 had a fixture.
   */
  const fixtures = useMemo(() => {
    const edges = [-FACTORY.DEPTH / 2, ...BEAM_Z, FACTORY.DEPTH / 2]
    const rows: number[] = []
    for (let i = 0; i < edges.length - 1; i++) rows.push((edges[i] + edges[i + 1]) / 2)

    const out: Fixture[] = []
    rows.forEach((z, iz) => {
      LIGHT_COLS.forEach((x, ix) => out.push({ pos: [x, FIXTURE_Y, z], ix, iz }))
    })
    return out
  }, [])

  /**
   * Which fixtures are actually emitting light, per tier.
   *
   * All 25 are DRAWN at every tier — they are two boxes each and they are what
   * the player reads as "a lit factory". Only a subset carries a point light,
   * because point lights are per-fragment work in a forward renderer and 25 of
   * them costs more than the room is worth.
   *
   * High: a checkerboard, 13 of 25. Every unlit fixture is 6 m from two lit ones
   * on the same axis, well inside their 14 m radius, so there is no dark node.
   * Medium: every other column of every other row, 9 of 25, brighter and further.
   * Low: none — a single overhead directional does the whole room.
   */
  const isLit = (f: Fixture) =>
    tier === 'high' ? (f.ix + f.iz) % 2 === 0
      : tier === 'medium' ? f.ix % 2 === 0 && f.iz % 2 === 0
        : false

  // Fog distance scales with density setting (0 = no fog, 1 = heavy fog)
  const fogNear = 10 + (1 - fogDensity) * 30
  const fogFar = 25 + (1 - fogDensity) * 60

  const group = useRef<THREE.Group>(null)

  return (
    <group name="lighting" ref={group}>
      <AngerDimmer group={group} />
      {/* Bright ambient — factories are well-lit */}
      <ambientLight intensity={0.5 * brightness} color="#e8e8f0" />

      {/* Hemisphere: white ceiling bounce + warm floor bounce */}
      <hemisphereLight
        color="#f0f0ff"
        groundColor="#c0b8a0"
        intensity={0.5 * brightness}
      />

      {/* Main overhead directional (simulating skylight / high bay) */}
      {tier !== 'low' && (
        <directionalLight
          position={[5, FACTORY.HEIGHT + 3, 3]}
          intensity={1.2 * brightness}
          color="#f5f0e8"
          castShadow
          shadow-mapSize-width={tier === 'high' ? 2048 : 1024}
          shadow-mapSize-height={tier === 'high' ? 2048 : 1024}
          shadow-camera-far={40}
          shadow-camera-near={0.1}
          shadow-camera-left={-18}
          shadow-camera-right={18}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-bias={-0.0005}
        />
      )}

      {/* Fill from the north-west, aimed back across the switchgear elevation —
          the one wall with no window, no skylight and a full-height run of dark
          cabinets in front of it. */}
      {tier !== 'low' && (
        <directionalLight
          position={[-10, FACTORY.HEIGHT, -5]}
          intensity={0.4 * brightness}
          color="#e0e4f0"
        />
      )}

      {/* Low fill to reduce ground shadow darkness */}
      <directionalLight
        position={[0, 1, 0]}
        intensity={0.15 * brightness}
        color="#d8d0c0"
      />

      {/* ── The luminaire grid ──────────────────────────────────────────────
          One twin-tube fitting per node, all sharing MAT.tube / MAT.housing. */}
      {fixtures.map((f, i) => {
        const lit = isLit(f)
        return (
          <group key={i} name={`luminaire_${i}`} position={f.pos}>
            {lit && (
              <pointLight
                intensity={(tier === 'high' ? 0.9 : 1.3) * brightness}
                color="#f8f4ec"
                distance={tier === 'high' ? 14 : 18}
                decay={2}
              />
            )}
            <mesh name={`light_fixture_${i}`} material={MAT.tube}>
              <boxGeometry args={[1.2, 0.04, 0.12]} />
            </mesh>
            <mesh name={`light_housing_${i}`} position={[0, 0.04, 0]} material={MAT.housing}>
              <boxGeometry args={[1.3, 0.06, 0.2]} />
            </mesh>
          </group>
        )
      })}

      {/* Low tier: no point lights at all, one more directional instead */}
      {tier === 'low' && (
        <directionalLight
          position={[0, FACTORY.HEIGHT, 0]}
          intensity={0.8 * brightness}
          color="#f0ece0"
        />
      )}

      {/* The red "fire point marker" glow that used to sit here is gone.
          It was a bare pointLight with no fixture, sign or housing anywhere
          near it, so all a player ever saw was an unexplained red pool on the
          south wall — read on sight as a bug, and reported as one. A marker
          light only reads as a marker if something visible is making it; until
          there is a board to mount, the honest version is no light. */}

      {/* Fog — subtle industrial haze */}
      {fogDensity > 0.01 && (
        <fog attach="fog" args={['#d8dce6', fogNear, fogFar]} />
      )}
    </group>
  )
}
