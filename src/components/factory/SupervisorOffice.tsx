'use client'

/**
 * SupervisorOffice — ground-floor site office, tucked into a corner of the shed.
 *
 * Rebuilt from the earlier elevated mezzanine, which had three problems that were
 * all consequences of putting it in the air: at 3.0 m platform + 2.5 m room it
 * pushed through the 5.0 m ceiling, it needed a staircase (whose railings never
 * read correctly), and it sat marooned in the middle of the floor.
 *
 * A ground-floor cabin in the corner solves all three at once and is what these
 * sheds actually have. It also borrows two of its four walls from the building.
 *
 * Construction follows a real demountable partition system, which is what makes
 * it read as an office rather than a glass box: a solid dado panel up to desk
 * height, glazing above it, and both held in an aluminium frame with mullions at
 * a regular pitch. Uninterrupted floor-to-ceiling glass looks like a shop window.
 */

import { useRef, useEffect, useCallback } from 'react'
import { RigidBody, CuboidCollider } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'
import { worldInputEnabled, worldRunning } from '@/stores/worldClock'
import { hinge, slam } from '@/audio/foley'

// ── Shift clock ─────────────────────────────────────────────────────────────
// Seven-segment rather than a texture, so it can actually count and stays crisp
// at any distance. Segment order: a top, b upper-right, c lower-right, d bottom,
// e lower-left, f upper-left, g middle.
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc',    '2': 'abged',  '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd',  '6': 'afgecd','7': 'abc',    '8': 'abcdefg','9': 'abfgcd',
}
const SEG_ON = new THREE.MeshStandardMaterial({
  color: '#ff5a3c', emissive: '#ff5a3c', emissiveIntensity: 3.2, roughness: 0.4 })
const SEG_OFF = new THREE.MeshStandardMaterial({
  color: '#2a1512', roughness: 0.8, metalness: 0.1 })
/** Under a minute left. Same geometry, hotter material — no layout change. */
const SEG_URGENT = new THREE.MeshStandardMaterial({
  color: '#ff2018', emissive: '#ff2018', emissiveIntensity: 7.0, roughness: 0.4 })
const CLOCK_CASE = new THREE.MeshStandardMaterial({
  color: '#191b1e', roughness: 0.5, metalness: 0.35 })

/** Below this many seconds the display goes bright red and blinks. */
const URGENT_BELOW = 60

const DW = 0.052       // digit width
const DH = 0.100       // digit height
const ST = 0.011       // segment thickness

/** One seven-segment digit. Both states are drawn so unlit segments still read. */
function Digit({ value, x, index }: { value: string; x: number; index: number }) {
  const lit = SEGMENTS[value] ?? ''
  const segs: Array<[string, [number, number, number], [number, number, number]]> = [
    ['a', [0, DH / 2, 0], [DW, ST, ST]],
    ['g', [0, 0, 0], [DW, ST, ST]],
    ['d', [0, -DH / 2, 0], [DW, ST, ST]],
    ['f', [-DW / 2, DH / 4, 0], [ST, DH / 2, ST]],
    ['b', [DW / 2, DH / 4, 0], [ST, DH / 2, ST]],
    ['e', [-DW / 2, -DH / 4, 0], [ST, DH / 2, ST]],
    ['c', [DW / 2, -DH / 4, 0], [ST, DH / 2, ST]],
  ]
  return (
    <group position={[x, 0, 0]}>
      {segs.map(([id, p, s]) => (
        <mesh key={id} position={p} userData={{ seg: `${index}:${id}` }}>
          <boxGeometry args={s} />
          <primitive object={lit.includes(id) ? SEG_ON : SEG_OFF} attach="material" />
        </mesh>
      ))}
    </group>
  )
}

/**
 * MM:SS shift clock — the time LEFT on the job, not the time spent.
 *
 * It counts down from the scenario's `timeLimit`, and it is the same value the
 * supervisor is watching: at 00:00 he comes out of the office. Counting up (which
 * is what it did) told the player nothing, because nothing bounded it.
 */
function ShiftClock({ position }: { position: [number, number, number] }) {
  const digits = useRef<string[]>(['0', '0', '0', '0'])
  const urgent = useRef(false)
  const group = useRef<THREE.Group>(null)

  const paint = (next: string[], hot: boolean, blankAll: boolean) => {
    const g = group.current
    if (!g) return
    const lit = hot ? SEG_URGENT : SEG_ON
    g.traverse((o) => {
      const tag = o.userData.seg as string | undefined
      if (!tag || !(o instanceof THREE.Mesh)) return
      if (tag === 'colon') { o.material = blankAll ? SEG_OFF : lit; return }
      const [di, sid] = tag.split(':')
      const on = !blankAll && (SEGMENTS[next[+di]] ?? '').includes(sid)
      o.material = on ? lit : SEG_OFF
    })
  }

  useFrame((state) => {
    const s = useGameStore.getState()
    const t = Math.max(0, Math.ceil(s.remainingTime))
    const mm = Math.floor(t / 60) % 100
    const ss = t % 60
    const next = [
      String(Math.floor(mm / 10)), String(mm % 10),
      String(Math.floor(ss / 10)), String(ss % 10),
    ]

    // Blink on the last minute. Half-second duty cycle, driven off the render
    // clock so it keeps flashing even once the countdown itself has stopped.
    const hot = t <= URGENT_BELOW
    const blank = hot && t > 0 && Math.floor(state.clock.elapsedTime * 2) % 2 === 1

    const changed =
      next.some((d, i) => d !== digits.current[i]) || hot !== urgent.current
    // The blink has to repaint every frame it toggles, so it can't be gated on
    // the digits changing — but outside the last minute nothing touches the
    // scene graph unless a digit actually rolls over.
    if (changed || hot) {
      digits.current = next
      urgent.current = hot
      paint(next, hot, blank)
    }
  })

  return (
    // Turned to face -Z, the side an approaching player reads it from. The digits
    // are laid out left-to-right in +X, so without this they are seen from behind
    // and run backwards. A Y rotation is a proper rotation, so nothing is
    // mirrored — but it DOES flip the depth order, which is why the case sits at
    // local -Z (away from the reader) and the digits at +Z. The other way round
    // and the case is between you and the display: a dead black box.
    <group position={position} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[0.34, 0.17, 0.045]} />
        <primitive object={CLOCK_CASE} attach="material" />
      </mesh>
      <group ref={group} position={[0, 0, 0.012]}>
        {/* Laid out once as 00:00. Every subsequent change is a material swap in
            useFrame, so the ref is never read during render. */}
        {(['0', '0', '0', '0'] as const).map((d, i) => (
          <Digit key={i} index={i} value={d}
                 x={-0.105 + i * 0.07 + (i > 1 ? 0.018 : 0)} />
        ))}
        {/* colon */}
        {[0.022, -0.022].map((dy) => (
          <mesh key={dy} position={[-0.001, dy, 0]} userData={{ seg: 'colon' }}>
            <boxGeometry args={[ST, ST, ST]} />
            <primitive object={SEG_ON} attach="material" />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// ── Palette ─────────────────────────────────────────────────────────────────
const MAT = {
  frame: new THREE.MeshStandardMaterial({
    color: '#b7bcc2', roughness: 0.35, metalness: 0.85 }),
  dado: new THREE.MeshStandardMaterial({
    color: '#8e9aa6', roughness: 0.62, metalness: 0.08 }),
  wall: new THREE.MeshStandardMaterial({
    color: '#d9d6d0', roughness: 0.85, metalness: 0.02 }),
  glass: new THREE.MeshStandardMaterial({
    color: '#cfe2ec', roughness: 0.06, metalness: 0.0,
    transparent: true, opacity: 0.22 }),
  ceiling: new THREE.MeshStandardMaterial({
    color: '#eceae6', roughness: 0.9, metalness: 0.0 }),
  floor: new THREE.MeshStandardMaterial({
    color: '#5d6b62', roughness: 0.55, metalness: 0.03 }),
  door: new THREE.MeshStandardMaterial({
    color: '#6f7d8a', roughness: 0.5, metalness: 0.25 }),
  handle: new THREE.MeshStandardMaterial({
    color: '#2a2d30', roughness: 0.4, metalness: 0.6 }),
  desk: new THREE.MeshStandardMaterial({
    color: '#9a7a55', roughness: 0.6, metalness: 0.05 }),
  dark: new THREE.MeshStandardMaterial({
    color: '#26292d', roughness: 0.55, metalness: 0.3 }),
  screen: new THREE.MeshStandardMaterial({
    color: '#16334a', roughness: 0.12, metalness: 0.1,
    emissive: '#1d5b86', emissiveIntensity: 1.4 }),
  board: new THREE.MeshStandardMaterial({
    color: '#f2f4f5', roughness: 0.35, metalness: 0.02 }),
  safety: new THREE.MeshStandardMaterial({
    color: '#d8a51d', roughness: 0.6, metalness: 0.05 }),
} as const

// ── Dimensions ──────────────────────────────────────────────────────────────
const W = 5.4          // along X
const D = 4.4          // along Z
const H = 2.9          // internal height
const T = 0.09         // partition thickness
const DADO = 0.95      // solid panel height — desk height, so monitors hide
const FR = 0.055       // frame member
const DOOR_W = 1.0
const DOOR_H = 2.1
const DOOR_X = -W / 2 + 1.05   // door sits toward the open end of the front wall

const hw = W / 2
const hd = D / 2

/**
 * The two solid piers of the front elevation, as [centreX, length].
 *
 * Everything on that face below the door head — dado, glazing, rail — is built
 * from these, so nothing can end up spanning the opening. Derived once rather
 * than repeated per element, which is how the glazing came to cover the doorway
 * in the first place: only the dado knew the door was there.
 */
const PIERS: Array<[number, number]> = ([-1, 1] as const)
  .map((side) => {
    const outer = side < 0 ? -hw : hw
    const edge = DOOR_X + (side * DOOR_W) / 2
    return [(outer + edge) / 2, Math.abs(outer - edge)] as [number, number]
  })
  .filter(([, len]) => len >= 0.05)

// ── Door ────────────────────────────────────────────────────────────────────

/** Swing angle when open, radians about local Y. Positive swings out onto the
 *  factory floor (-Z); negative would swing it back into the room. */
const DOOR_OPEN = 1.75
/** Radians per second. A little over half a second door-to-door. */
const DOOR_RATE = 3.4
/** How close, and how near the crosshair, before the handle can be worked. */
const DOOR_REACH = 2.6
const DOOR_AIM = 0.11

const _leaf = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _up = new THREE.Vector3(0, 1, 0)
const _handleW = new THREE.Vector3()
const _proj = new THREE.Vector3()

/**
 * The office door, hinged on the left jamb.
 *
 * Two things move together and must not drift apart: the visible leaf, which is
 * an ordinary rotated group, and its collider, which is a kinematic body driven
 * in world space. Both are computed from the same angle each frame, so an open
 * door is walk-through-able and a closed one is not.
 *
 * It opens on E when you are near the handle, and it is thrown open for you when
 * the supervisor comes out — he is not going to stop and work the latch.
 */
function OfficeDoor({ origin }: { origin: [number, number, number] }) {
  const pivot = useRef<THREE.Group>(null)
  const handle = useRef<THREE.Mesh>(null)
  const body = useRef<RapierRigidBody>(null)
  const state = useRef({ angle: 0, open: false, aimed: false, forced: false })
  const { camera } = useThree()

  const hx = origin[0] + DOOR_X - DOOR_W / 2
  const hz = origin[2] - hd

  const toggle = useCallback(() => {
    state.current.open = !state.current.open
    hinge(state.current.open)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || !state.current.aimed) return
      // See the matching guard in SiloCell — the phase alone is not enough once
      // an overlay can be open on top of an 'active' shift.
      if (!worldInputEnabled()) return
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  useFrame((_, delta) => {
    if (!worldRunning()) return
    const dt = Math.min(delta, 0.05)
    const s = state.current
    const store = useGameStore.getState()

    // A supervisor on his way out overrides whatever the player left it at
    const forced = store.supervisor !== 'patrol'
    // He doesn't work the latch — he puts it through the frame. Fired on the
    // edge, so it lands once as the chase starts rather than every frame of it.
    if (forced && !s.forced) slam()
    s.forced = forced
    const target = forced || s.open ? DOOR_OPEN : 0
    s.angle = THREE.MathUtils.damp(s.angle, target, DOOR_RATE, dt)

    if (pivot.current) pivot.current.rotation.y = s.angle

    // Collider follows the leaf. Rapier wants world space, so the parent group's
    // transform is baked in here rather than inherited — which also means the
    // collider cannot silently disagree with what is drawn.
    if (body.current) {
      const c = Math.cos(s.angle), sn = Math.sin(s.angle)
      _leaf.set(hx + c * (DOOR_W / 2), origin[1] + DOOR_H / 2, hz - sn * (DOOR_W / 2))
      _q.setFromAxisAngle(_up, s.angle)
      body.current.setNextKinematicTranslation(_leaf)
      body.current.setNextKinematicRotation(_q)
    }

    // Aim test against the live handle — it travels with the leaf, so a fixed
    // hotspot would be left hanging in the empty doorway once the door swung.
    let aimed = false
    if (handle.current && !forced) {
      handle.current.getWorldPosition(_handleW)
      if (_handleW.distanceTo(camera.position) <= DOOR_REACH) {
        _proj.copy(_handleW).project(camera)
        aimed = _proj.z <= 1 && Math.hypot(_proj.x, _proj.y) < DOOR_AIM
      }
    }
    if (aimed !== s.aimed) {
      s.aimed = aimed
      store.setHoveredInteractable(
        aimed ? `OFFICE DOOR — ${s.open ? 'OPEN' : 'CLOSED'}  [E]` : null)
    }
  })

  return (
    // World-placed, NOT nested in the office group. The collider is driven in
    // world space, so inheriting a parent offset would apply it twice; keeping
    // the leaf and the body in the same frame is what stops them disagreeing.
    <>
      <group ref={pivot} name="office_door" position={[hx, origin[1], hz]}>
        <mesh position={[DOOR_W / 2, DOOR_H / 2, 0]} castShadow>
          <boxGeometry args={[DOOR_W, DOOR_H, 0.045]} />
          <primitive object={MAT.door} attach="material" />
        </mesh>
        <mesh position={[DOOR_W / 2, DOOR_H * 0.68, -0.005]}>
          <boxGeometry args={[DOOR_W - 0.22, 0.85, 0.05]} />
          <primitive object={MAT.glass} attach="material" />
        </mesh>
        <mesh ref={handle} name="office_door_handle"
              position={[DOOR_W - 0.11, 1.05, -0.05]}>
          <boxGeometry args={[0.035, 0.28, 0.035]} />
          <primitive object={MAT.handle} attach="material" />
        </mesh>
      </group>
      {/* Kinematic, not fixed: a fixed body cannot be moved after creation, so
          the doorway would stay blocked no matter what the leaf did. */}
      <RigidBody ref={body} type="kinematicPosition" colliders={false}
                 position={[hx + DOOR_W / 2, origin[1] + DOOR_H / 2, hz]}>
        <CuboidCollider args={[DOOR_W / 2, DOOR_H / 2, 0.03]} />
      </RigidBody>
    </>
  )
}

/**
 * Every solid surface of the office, as one static body.
 *
 * Two things about this are deliberate.
 *
 * The shapes are declared, not derived from meshes. The previous version wrapped
 * `visible={false}` meshes in a `colliders="cuboid"` RigidBody, which silently
 * produced NOTHING: react-three-rapier walks children with `traverseVisible()`
 * unless `includeInvisible` is set, so an invisible mesh contributes no collider
 * at all. No error, no warning — the walls simply weren't there.
 *
 * And the body carries the office's world position itself rather than inheriting
 * it from the surrounding group. A RigidBody nested under a transformed group has
 * to read that transform off `matrixWorld` at mount, before R3F has necessarily
 * propagated it, and when that loses the race every collider lands at the origin —
 * invisible walls in the middle of the factory floor, nothing at all round the
 * office. Placing the body absolutely removes the race rather than betting on it.
 *
 * The front elevation is split around the doorway: the glazing spans the full
 * width from 0.95 m up, so colliding the visual mesh would seal the door shut.
 * Args are half-extents, hence the /2 throughout.
 */
function OfficeCollision({ origin }: { origin: [number, number, number] }) {
  return (
    <RigidBody type="fixed" colliders={false} position={origin}>
      {/* back (+Z) and side (+X) walls, both against the building corner */}
      <CuboidCollider args={[W / 2, H / 2, T / 2]} position={[0, H / 2, hd]} />
      <CuboidCollider args={[T / 2, H / 2, D / 2]} position={[hw, H / 2, 0]} />
      {/* the open (-X) elevation is solid all the way up */}
      <CuboidCollider args={[T / 2, H / 2, D / 2]} position={[-hw, H / 2, 0]} />
      {/* front (-Z) elevation — same two piers the glazing is built from, so
          what you can see through and what you can walk through cannot disagree */}
      {PIERS.map(([cx, len], i) => (
        <CuboidCollider key={i} args={[len / 2, H / 2, T / 2]}
                        position={[cx, H / 2, -hd]} />
      ))}
      {/* transom above the opening, leaving a walkable 1.0 x 2.1 m door */}
      <CuboidCollider args={[DOOR_W / 2, (H - DOOR_H) / 2, T / 2]}
                      position={[DOOR_X, (DOOR_H + H) / 2, -hd]} />
      {/* fit-out, so you can't stand inside the furniture either */}
      <CuboidCollider args={[0.95, 0.39, 0.39]} position={[0.35, 0.39, 0.75]} />
      <CuboidCollider args={[0.25, 0.65, 0.31]} position={[hw - 0.45, 0.65, hd - 0.45]} />
    </RigidBody>
  )
}

interface Props {
  /** Placed so +X and +Z faces sit flush against the building corner. */
  position?: [number, number, number]
}

export function SupervisorOffice({ position = [0, 0, 0] }: Props) {
  // Mullion positions along the -Z (front) elevation, skipping the doorway
  const frontMullions: number[] = []
  for (let x = -hw + 1.35; x < hw - 0.2; x += 1.35) {
    if (Math.abs(x - DOOR_X) > DOOR_W / 2 + 0.1) frontMullions.push(x)
  }
  const sideMullions: number[] = []
  for (let z = -hd + 1.45; z < hd - 0.2; z += 1.45) sideMullions.push(z)

  return (
    <>
    {/* Physics and the moving door are world-placed siblings, not children of
        the group below — both reasons are documented on OfficeCollision. */}
    <OfficeCollision origin={position} />
    <OfficeDoor origin={position} />
    <group name="supervisor_office" position={position}>
      {/* ── Slab: a painted bay the office sits on, edged in safety yellow ── */}
      <mesh name="office_slab" position={[0, 0.012, 0]} receiveShadow>
        <boxGeometry args={[W + 0.5, 0.024, D + 0.5]} />
        <primitive object={MAT.floor} attach="material" />
      </mesh>
      <mesh position={[-hw - 0.22, 0.026, 0]}>
        <boxGeometry args={[0.06, 0.004, D + 0.5]} />
        <primitive object={MAT.safety} attach="material" />
      </mesh>
      <mesh position={[0, 0.026, -hd - 0.22]}>
        <boxGeometry args={[W + 0.5, 0.004, 0.06]} />
        <primitive object={MAT.safety} attach="material" />
      </mesh>

      {/* ── Back walls. These face into the building corner, so they are plain
             painted board rather than glazing. Collision for the whole office
             lives in OfficeCollision, world-placed alongside this group. ── */}
      <mesh name="office_wall_back" position={[0, H / 2, hd]} castShadow receiveShadow>
        <boxGeometry args={[W, H, T]} />
        <primitive object={MAT.wall} attach="material" />
      </mesh>
      <mesh name="office_wall_side" position={[hw, H / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[T, H, D]} />
        <primitive object={MAT.wall} attach="material" />
      </mesh>

      {/* Whiteboard on the back wall — the thing that makes it read as *used* */}
      <mesh position={[0.6, 1.65, hd - T / 2 - 0.02]}>
        <boxGeometry args={[1.8, 1.05, 0.03]} />
        <primitive object={MAT.board} attach="material" />
      </mesh>
      <mesh position={[0.6, 1.09, hd - T / 2 - 0.04]}>
        <boxGeometry args={[1.84, 0.05, 0.05]} />
        <primitive object={MAT.frame} attach="material" />
      </mesh>

      {/* ── Front (-Z) elevation: dado + glazing in an aluminium frame ──
             Everything below the door head is split around the opening. It used
             to be the dado alone, which left the glazing and its rail running
             straight across the doorway at chest height — a pane of glass in the
             one place you are meant to walk through. ── */}
      <group name="office_front">
        {PIERS.map(([cx, len], i) => (
          <group key={i}>
            {/* solid dado up to desk height */}
            <mesh position={[cx, DADO / 2, -hd]} castShadow>
              <boxGeometry args={[len, DADO, T]} />
              <primitive object={MAT.dado} attach="material" />
            </mesh>
            {/* glazing above it */}
            <mesh position={[cx, (DADO + H) / 2, -hd]}>
              <boxGeometry args={[len, H - DADO, 0.02]} />
              <primitive object={MAT.glass} attach="material" />
            </mesh>
            {/* rail on top of the dado */}
            <mesh position={[cx, DADO, -hd]}>
              <boxGeometry args={[len, FR, T + 0.01]} />
              <primitive object={MAT.frame} attach="material" />
            </mesh>
          </group>
        ))}
        {/* fanlight over the door — starts above the head, so it clears it */}
        <mesh position={[DOOR_X, (DOOR_H + FR + H) / 2, -hd]}>
          <boxGeometry args={[DOOR_W, H - DOOR_H - FR, 0.02]} />
          <primitive object={MAT.glass} attach="material" />
        </mesh>
        {/* head rail, the full width — it is above the opening */}
        <mesh position={[0, H - FR / 2, -hd]}>
          <boxGeometry args={[W, FR, T + 0.01]} />
          <primitive object={MAT.frame} attach="material" />
        </mesh>
        {frontMullions.map((x, i) => (
          <mesh key={i} position={[x, (DADO + H) / 2, -hd]}>
            <boxGeometry args={[FR, H - DADO, T + 0.01]} />
            <primitive object={MAT.frame} attach="material" />
          </mesh>
        ))}
      </group>

      {/* ── Open (-X) elevation, facing the factory floor ── */}
      <group name="office_open_side">
        <mesh position={[-hw, DADO / 2, 0]} castShadow>
          <boxGeometry args={[T, DADO, D]} />
          <primitive object={MAT.dado} attach="material" />
        </mesh>
        <mesh position={[-hw, (DADO + H) / 2, 0]}>
          <boxGeometry args={[0.02, H - DADO, D]} />
          <primitive object={MAT.glass} attach="material" />
        </mesh>
        <mesh position={[-hw, DADO, 0]}>
          <boxGeometry args={[T + 0.01, FR, D]} />
          <primitive object={MAT.frame} attach="material" />
        </mesh>
        <mesh position={[-hw, H - FR / 2, 0]}>
          <boxGeometry args={[T + 0.01, FR, D]} />
          <primitive object={MAT.frame} attach="material" />
        </mesh>
        {sideMullions.map((z, i) => (
          <mesh key={i} position={[-hw, (DADO + H) / 2, z]}>
            <boxGeometry args={[T + 0.01, H - DADO, FR]} />
            <primitive object={MAT.frame} attach="material" />
          </mesh>
        ))}
      </group>

      {/* Shift clock, mounted outside beside the door where anyone walking past
          can read it without going in. Counts the scenario timer. */}
      <ShiftClock position={[DOOR_X + 0.86, 1.95, -hd - 0.05]} />
      <mesh position={[DOOR_X + 0.86, 1.79, -hd - 0.05]}>
        <boxGeometry args={[0.36, 0.02, 0.03]} />
        <primitive object={MAT.frame} attach="material" />
      </mesh>

      {/* corner post where the two glazed elevations meet */}
      <mesh position={[-hw, H / 2, -hd]}>
        <boxGeometry args={[FR * 1.6, H, FR * 1.6]} />
        <primitive object={MAT.frame} attach="material" />
      </mesh>

      {/* Door frame — static, so it stays put while the leaf swings. The leaf
          itself is world-placed above, with its collider. */}
      <group position={[DOOR_X, 0, -hd]}>
        <mesh position={[-DOOR_W / 2, DOOR_H / 2, 0]}>
          <boxGeometry args={[FR, DOOR_H + FR, T + 0.01]} />
          <primitive object={MAT.frame} attach="material" />
        </mesh>
        <mesh position={[DOOR_W / 2, DOOR_H / 2, 0]}>
          <boxGeometry args={[FR, DOOR_H + FR, T + 0.01]} />
          <primitive object={MAT.frame} attach="material" />
        </mesh>
        <mesh position={[0, DOOR_H, 0]}>
          <boxGeometry args={[DOOR_W + FR, FR, T + 0.01]} />
          <primitive object={MAT.frame} attach="material" />
        </mesh>
      </group>

      {/* ── Roof deck. Well clear of the 5 m building ceiling. ── */}
      <mesh name="office_roof" position={[0, H + 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[W + 0.12, 0.1, D + 0.12]} />
        <primitive object={MAT.ceiling} attach="material" />
      </mesh>
      {/* strip light under the deck */}
      <mesh position={[-0.4, H - 0.06, 0]}>
        <boxGeometry args={[1.6, 0.05, 0.16]} />
        <primitive object={MAT.board} attach="material" />
      </mesh>

      {/* ── Fit-out ── */}
      <group name="office_furniture" position={[0.35, 0, 0.75]}>
        {/* desk against the back wall */}
        <mesh position={[0, 0.73, 0]} castShadow>
          <boxGeometry args={[1.9, 0.045, 0.78]} />
          <primitive object={MAT.desk} attach="material" />
        </mesh>
        {([[-0.88, -0.33], [-0.88, 0.33], [0.88, -0.33], [0.88, 0.33]] as const).map(
          ([x, z], i) => (
            <mesh key={i} position={[x, 0.355, z]}>
              <boxGeometry args={[0.05, 0.71, 0.05]} />
              <primitive object={MAT.dark} attach="material" />
            </mesh>
          ),
        )}
        {/* monitor */}
        <mesh position={[0.05, 0.79, 0.22]}>
          <boxGeometry args={[0.22, 0.03, 0.16]} />
          <primitive object={MAT.dark} attach="material" />
        </mesh>
        <mesh position={[0.05, 0.94, 0.24]}>
          <boxGeometry args={[0.05, 0.28, 0.04]} />
          <primitive object={MAT.dark} attach="material" />
        </mesh>
        <mesh position={[0.05, 1.22, 0.235]} rotation={[0.12, 0, 0]}>
          <boxGeometry args={[0.62, 0.38, 0.03]} />
          <primitive object={MAT.dark} attach="material" />
        </mesh>
        <mesh position={[0.05, 1.22, 0.215]} rotation={[0.12, 0, 0]}>
          <boxGeometry args={[0.58, 0.34, 0.01]} />
          <primitive object={MAT.screen} attach="material" />
        </mesh>
        {/* keyboard + mug */}
        <mesh position={[0.05, 0.76, -0.12]}>
          <boxGeometry args={[0.42, 0.02, 0.15]} />
          <primitive object={MAT.dark} attach="material" />
        </mesh>
        <mesh position={[0.62, 0.795, -0.08]}>
          <cylinderGeometry args={[0.04, 0.04, 0.08, 10]} />
          <primitive object={MAT.board} attach="material" />
        </mesh>

        {/* chair */}
        <group position={[0.05, 0, -0.72]}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <boxGeometry args={[0.5, 0.07, 0.48]} />
            <primitive object={MAT.dark} attach="material" />
          </mesh>
          {/* Backrest sits BEHIND the occupant. The desk is at +Z from the chair,
              so the back belongs at -Z — putting it at +Z faces the chair away. */}
          <mesh position={[0, 0.76, -0.21]} rotation={[0.16, 0, 0]}>
            <boxGeometry args={[0.46, 0.55, 0.06]} />
            <primitive object={MAT.dark} attach="material" />
          </mesh>
          {/* armrests, which also read the facing direction at a glance */}
          {([-1, 1] as const).map((s) => (
            <mesh key={s} position={[s * 0.27, 0.62, 0.02]}>
              <boxGeometry args={[0.05, 0.05, 0.34]} />
              <primitive object={MAT.dark} attach="material" />
            </mesh>
          ))}
          <mesh position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.035, 0.035, 0.42, 8]} />
            <primitive object={MAT.dark} attach="material" />
          </mesh>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.cos(a) * 0.2, 0.04, Math.sin(a) * 0.2]}>
                <boxGeometry args={[0.22, 0.05, 0.05]} />
                <primitive object={MAT.dark} attach="material" />
              </mesh>
            )
          })}
        </group>
      </group>

      {/* filing cabinet in the corner */}
      <mesh position={[hw - 0.45, 0.65, hd - 0.45]} castShadow>
        <boxGeometry args={[0.5, 1.3, 0.62]} />
        <primitive object={MAT.dark} attach="material" />
      </mesh>
      {[0.35, 0.75, 1.15].map((y, i) => (
        <mesh key={i} position={[hw - 0.71, y, hd - 0.45]}>
          <boxGeometry args={[0.02, 0.05, 0.3]} />
          <primitive object={MAT.frame} attach="material" />
        </mesh>
      ))}
    </group>
    </>
  )
}
