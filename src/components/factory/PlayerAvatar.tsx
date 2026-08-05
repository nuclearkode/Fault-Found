'use client'

/**
 * PlayerAvatar — the other technician on the floor.
 *
 * This is the third-person body for SOMEONE ELSE. It is never drawn for the
 * local player, who is a camera; a body on the camera is a view of the inside
 * of your own hard hat.
 *
 * ── The rig ──────────────────────────────────────────────────────────────────
 *
 * Same /models/worker.glb the supervisor wears, and the same awkwardness with
 * it: Blender's exporter wrote ONE CLIP PER ANIMATED OBJECT instead of a merged
 * take, so the walk arrives as nine clips — Hips (translation, the pelvis bob)
 * plus both hips, knees, shoulders and elbows (rotation) — which are all phases
 * of one cycle and only look like a walk if they are started together and kept
 * in lockstep. That is what the per-frame block in useFrame does, and it is
 * re-asserted every frame rather than cached for the reason written out in
 * Supervisor.tsx: drei rebuilds and uncaches the actions whenever the clip list
 * changes identity, and a cached array then holds nine dead objects that accept
 * every call and animate nothing.
 *
 * ── Why it interpolates ──────────────────────────────────────────────────────
 *
 * Movement arrives at about 12 Hz and the screen runs at 60+. Snapping to each
 * packet is a slideshow, so the target is the packet and the body chases it with
 * an exponential damp. The chase also *produces* the animation speed: the walk
 * cycle is timed off how fast the body is actually moving on screen, not off the
 * sender's claimed speed, so the feet stay with the ground even when packets are
 * late or lost.
 *
 * ── Cost when solo ───────────────────────────────────────────────────────────
 *
 * Nothing here runs. <RemotePlayers /> returns null before this component is
 * ever constructed, so no GLTF is fetched by this file, no clip is bound and no
 * frame callback is registered. Note that there is deliberately NO
 * useGLTF.preload() at the bottom of this file — Supervisor.tsx already
 * preloads the same model, so the cache is warm for free and a second preload
 * would be the one solo cost this feature could have had.
 */

import { useRef, useMemo, useEffect, Suspense } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { useLobbyStore } from '@/stores/lobbyStore'
import type { AvatarVariant, PeerId } from '@/net/session'

const MODEL_PATH = '/models/worker.glb'

/** The stride in the GLB is authored for this speed. Above Supervisor's WALK_SPEED. */
const AUTHORED_SPEED = 0.62
/** How hard the body chases its last known position. Higher is snappier and jerkier. */
const POS_DAMP = 11
const YAW_DAMP = 9
/** Below this the body is standing, and the clips are paused rather than crawling. */
const STILL_SPEED = 0.08
/** Teleport instead of sliding across the map — first packet, or a respawn. */
const SNAP_DIST = 6

/**
 * Camera height above the feet. Matches PlayerController's PLAYER_HEIGHT, which
 * puts the camera at capsule centre + HEIGHT/2 and the feet at centre - HEIGHT/2.
 * If that constant ever moves, remote players sink into the floor or hover.
 */
const PLAYER_EYE = 1.7

// Scratch. Never allocated inside useFrame.
const _fwd = new THREE.Vector3()
const _prev = new THREE.Vector3()

/** Shortest signed angle from a to b, in (-PI, PI]. */
function angleDelta(a: number, b: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

// ─── The female variant ──────────────────────────────────────────────────────
//
// HONEST ACCOUNT, because this is a compromise and pretending otherwise would
// waste somebody's afternoon later:
//
// worker.glb is ONE rig. There is no second body in this project and authoring
// one is not a fifteen-minute job — see the notes at the bottom of this block.
// What follows is a silhouette edit: per-part proportion changes, a procedural
// ponytail, and a material pass. From across the bay, which is the distance you
// will actually see another player at, it reads as a different person. Standing
// nose to nose it reads as the same mesh with different numbers on it, because
// that is what it is.
//
// The proportion edits are geometry-agnostic. Each mesh node is scaled about
// its OWN bounding-box centre rather than about the node origin, which for this
// model sits at the feet — scaling in place there would drag every part
// downwards and pull the body apart. Solving position so the centre is fixed
// (p' = p + c(1 - s)) keeps every part where the animator put it. That matters
// because the nine clips animate the PIVOT nodes (Hips, Hip_L/R, Knee_L/R,
// Shoulder_L/R, Elbow_L/R) and touch only translation and rotation; the mesh
// nodes underneath them carry no tracks, so their scale and position are ours
// to write and nothing fights us for them.

/** Per-mesh scale for the female variant. Meshes not listed are untouched. */
const FEMALE_PARTS: Record<string, [number, number, number]> = {
  // Narrower shoulders and chest — the single strongest read at distance.
  Torso: [0.90, 1.0, 0.94],
  Vest_Band: [0.90, 1.0, 0.94],
  // Belt stays wider than the shoulders, which inverts the male taper.
  Belt: [0.97, 1.0, 0.99],
  Neck: [0.84, 1.0, 0.84],
  Head: [0.95, 0.97, 0.95],
  Hat: [0.95, 0.95, 0.95],
  Hat_Peak: [0.95, 0.95, 0.95],
  UpperArm_L: [0.85, 1.0, 0.85],
  UpperArm_R: [0.85, 1.0, 0.85],
  Forearm_L: [0.84, 1.0, 0.84],
  Forearm_R: [0.84, 1.0, 0.84],
  Hand_L: [0.9, 0.92, 0.9],
  Hand_R: [0.9, 0.92, 0.9],
  Thigh_L: [0.93, 1.0, 0.93],
  Thigh_R: [0.93, 1.0, 0.93],
  Shin_L: [0.88, 1.0, 0.88],
  Shin_R: [0.88, 1.0, 0.88],
  Boot_L: [0.92, 0.94, 0.92],
  Boot_R: [0.92, 0.94, 0.92],
}

/** Whole-body scale per variant. Slightly shorter and narrower, not a doll. */
const BODY_SCALE: Record<AvatarVariant, [number, number, number]> = {
  male: [1, 1, 1],
  female: [0.95, 0.96, 0.95],
}

/**
 * Scale a mesh node about its geometry's own centre instead of the node origin.
 *
 * Exported because it is the one piece of arithmetic here that can be silently
 * wrong — a sign error moves a limb instead of resizing it, and on a walking
 * body that reads as "the model is just like that" rather than as a bug.
 */
export function scaleAboutCentre(node: THREE.Mesh, s: [number, number, number]) {
  const geo = node.geometry
  if (!geo) return
  if (!geo.boundingBox) geo.computeBoundingBox()
  const bb = geo.boundingBox
  if (!bb) return
  const cx = (bb.min.x + bb.max.x) * 0.5
  const cy = (bb.min.y + bb.max.y) * 0.5
  const cz = (bb.min.z + bb.max.z) * 0.5
  node.position.set(
    node.position.x + cx * (1 - s[0]),
    node.position.y + cy * (1 - s[1]),
    node.position.z + cz * (1 - s[2]),
  )
  node.scale.set(s[0], s[1], s[2])
}

/**
 * A ponytail, built here rather than in the GLB.
 *
 * This is the one part of the variant that is an addition rather than an edit,
 * and it earns its place: proportion changes alone leave two identical
 * silhouettes in identical PPE, and PPE is the whole visual language of this
 * game — you cannot give one of them a different outfit without lying about the
 * site rules. Hair under the back of the hat is the cue that survives at fifteen
 * metres in bad light.
 *
 * Built the same way SiloCell builds its level-sensor beam: a mesh created in
 * code and parented into the cloned graph, so it inherits every transform above
 * it and needs no separate animation.
 */
function addPonytail(head: THREE.Mesh): THREE.Mesh {
  const geo = head.geometry
  if (!geo.boundingBox) geo.computeBoundingBox()
  const bb = geo.boundingBox
  const cx = bb ? (bb.min.x + bb.max.x) * 0.5 : 0
  const cy = bb ? (bb.min.y + bb.max.y) * 0.5 : 0
  const cz = bb ? (bb.min.z + bb.max.z) * 0.5 : 0
  const depth = bb ? bb.max.z - bb.min.z : 0.2
  const height = bb ? bb.max.y - bb.min.y : 0.22

  const hair = new THREE.Mesh(
    new THREE.CapsuleGeometry(depth * 0.19, height * 0.75, 3, 10),
    new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.85, metalness: 0 }),
  )
  hair.name = 'Hair_Ponytail'
  hair.castShadow = true
  // The model faces +Z (heading 0), so the back of the head is -Z.
  hair.position.set(cx, cy - height * 0.28, cz - depth * 0.52)
  hair.rotation.set(0.34, 0, 0)
  head.add(hair)
  return hair
}

/**
 * Give this instance its own materials, then edit them.
 *
 * MANDATORY, not hygiene. `scene.clone(true)` shares materials with the cached
 * GLTF and the cache outlives every component that touches it — tint a hard hat
 * here without cloning and you have tinted the supervisor, the next player to
 * join, and every worker in every future scene. Same trap SiloCell.collect()
 * documents and the same fix.
 */
function reskin(root: THREE.Object3D, variant: AvatarVariant, accent: THREE.Color) {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    const m = o.material
    if (Array.isArray(m) || !(m instanceof THREE.MeshStandardMaterial)) return
    const copy = m.clone()
    // The hard hat is the per-player colour: it is the biggest flat area on the
    // body, it is at head height, and colour-coded hats are what a real site
    // does. Everything else stays site-issue, because it should.
    if (copy.name === 'hardhat') copy.color.copy(accent)
    if (copy.name === 'hivis' && variant === 'female') {
      // A shade cooler, so the two variants do not strobe against each other
      // under the sodium lighting. Still hi-vis; still obviously the same PPE.
      copy.color.setRGB(0.72, 0.86, 0.16)
    }
    o.material = copy
  })
}

/** Stable, well-spread hat colour from a peer id. Same id, same hat, every session. */
function accentFor(seed: string): THREE.Color {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Golden-angle hop around the wheel so nearby seeds are not nearby colours.
  const hue = ((h >>> 0) % 360) / 360
  return new THREE.Color().setHSL(hue, 0.62, 0.56)
}

// ─── Nameplate ───────────────────────────────────────────────────────────────

/**
 * A canvas texture on a THREE.Sprite.
 *
 * A sprite is always camera-facing by construction, which is the requirement,
 * and it is one draw call with no font loading. drei's <Text> would be prettier
 * and would also fetch a font from a CDN the first time somebody joins — a
 * network round trip inside the frame where a player pops into existence.
 */
function makeNameplate(label: string, accent: THREE.Color): THREE.Sprite | null {
  if (typeof document === 'undefined') return null
  const W = 512, H = 128
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.clearRect(0, 0, W, H)
  // Slate plate with a coloured edge matching the hat, so the label and the body
  // agree about who this is.
  // Plain rects rather than ctx.roundRect: that method is recent enough that it
  // is missing from some of the runtimes this ships to, and a nameplate is not
  // worth a feature test.
  ctx.fillStyle = 'rgba(12, 12, 16, 0.72)'
  ctx.fillRect(6, 26, W - 12, H - 52)
  ctx.lineWidth = 4
  ctx.strokeStyle = `#${accent.getHexString()}`
  ctx.strokeRect(6, 26, W - 12, H - 52)

  ctx.font = '600 46px "JetBrains Mono", ui-monospace, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#e8e4e0'
  ctx.fillText(label.toUpperCase(), W / 2, H / 2, W - 40)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    // Left depth-tested on purpose: a name badge that shines through the silo
    // would let players see each other through solid steel.
    depthTest: true,
    toneMapped: false,
  })
  const sprite = new THREE.Sprite(mat)
  sprite.name = 'player-nameplate'
  sprite.scale.set(0.62, 0.155, 1)
  return sprite
}

// ─── The avatar ──────────────────────────────────────────────────────────────

export interface PlayerAvatarProps {
  /** Shown on the nameplate. */
  name: string
  variant?: AvatarVariant
  /** Target feet position, world metres. */
  position?: readonly [number, number, number]
  /** Target heading. 0 faces +Z, the model's own convention. */
  yaw?: number
  /** Is the target walking? Only used before the first frame of motion. */
  moving?: boolean
  /**
   * When set, the target is read from the lobby's live peer record every frame
   * instead of from props — which is how the props stay stable while a player
   * runs around, and how React never re-renders on a movement packet. The props
   * above then act as the starting pose.
   */
  peerId?: PeerId
  /** Hard-hat colour. Defaults to a stable hash of peerId or name. */
  accent?: string
}

export function PlayerAvatar({
  name,
  variant = 'male',
  position = [0, 0, 0],
  yaw = 0,
  moving = false,
  peerId,
  accent,
}: PlayerAvatarProps) {
  const { scene, animations } = useGLTF(MODEL_PATH)

  const colour = useMemo(
    () => (accent ? new THREE.Color(accent) : accentFor(peerId ?? name)),
    [accent, peerId, name],
  )

  // One clone per avatar, variant baked in at build time. Every mutation below
  // happens on objects created inside this factory, never on anything the GLTF
  // cache still owns.
  const body = useMemo(() => {
    const root = scene.clone(true)
    root.name = 'player-body'
    const s = BODY_SCALE[variant]
    root.scale.set(s[0], s[1], s[2])
    if (variant === 'female') {
      root.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        const spec = FEMALE_PARTS[o.name]
        if (spec) scaleAboutCentre(o, spec)
        if (o.name === 'Head') addPonytail(o)
      })
    }
    reskin(root, variant, colour)
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true
    })
    return root
  }, [scene, variant, colour])

  const plate = useMemo(() => makeNameplate(name, colour), [name, colour])

  // Everything built above is per-instance and therefore per-instance garbage.
  // Sprites, canvas textures and the ponytail's geometry all hold GPU memory
  // that is not freed by dropping the React node.
  useEffect(() => {
    const owned = body
    return () => {
      owned.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        const m = o.material
        if (m instanceof THREE.Material) m.dispose()
        if (o.name === 'Hair_Ponytail') o.geometry.dispose()
      })
    }
  }, [body])

  useEffect(() => {
    const owned = plate
    if (!owned) return
    return () => {
      owned.material.map?.dispose()
      owned.material.dispose()
    }
  }, [plate])

  const { actions } = useAnimations(animations, body)
  const root = useRef<THREE.Group>(null)

  /** Where the body actually is, as opposed to where the last packet said. */
  const now = useRef({
    x: position[0], y: position[1], z: position[2],
    yaw,
    speed: 0,
    /** False until the first frame, so the first packet places rather than slides. */
    placed: false,
  })

  useFrame((_, delta) => {
    const g = root.current
    if (!g) return
    const dt = Math.min(delta, 0.05)
    const st = now.current

    // Target: the live peer record when we have one, otherwise the props.
    let tx = position[0], ty = position[1], tz = position[2]
    let tyaw = yaw
    let tmoving = moving
    if (peerId) {
      const p = useLobbyStore.getState().peers[peerId]
      if (p) {
        tx = p.pos[0]; ty = p.pos[1]; tz = p.pos[2]
        tyaw = p.yaw
        tmoving = p.moving
      }
    }

    _prev.set(st.x, st.y, st.z)

    const far = Math.hypot(tx - st.x, ty - st.y, tz - st.z) > SNAP_DIST
    if (!st.placed || far) {
      // First sight of them, or they have been moved by something that is not
      // walking. Sliding a body across half the factory is worse than a pop.
      st.x = tx; st.y = ty; st.z = tz
      st.yaw = tyaw
      st.placed = true
    } else {
      st.x = THREE.MathUtils.damp(st.x, tx, POS_DAMP, dt)
      st.y = THREE.MathUtils.damp(st.y, ty, POS_DAMP, dt)
      st.z = THREE.MathUtils.damp(st.z, tz, POS_DAMP, dt)
      st.yaw += THREE.MathUtils.clamp(
        angleDelta(st.yaw, tyaw), -YAW_DAMP * dt, YAW_DAMP * dt)
    }

    g.position.set(st.x, st.y, st.z)
    g.rotation.set(0, st.yaw, 0)

    // Cadence off the OBSERVED movement, not off the sender's claim. A late
    // packet then shows as a body that pauses and catches up rather than one
    // that mimes walking on the spot.
    const travelled = Math.hypot(st.x - _prev.x, st.z - _prev.z)
    st.speed = THREE.MathUtils.damp(st.speed, dt > 0 ? travelled / dt : 0, 12, dt)

    const walking = tmoving && st.speed > STILL_SPEED
    // Re-asserted every frame against a freshly read `actions`, deliberately not
    // cached — see the header. play() is idempotent, so this costs nothing and
    // revives an action drei has swapped out from under us.
    const ts = walking ? THREE.MathUtils.clamp(st.speed / AUTHORED_SPEED, 0.65, 3.2) : 1
    for (const a of Object.values(actions)) {
      if (!a) continue
      a.setLoop(THREE.LoopRepeat, Infinity)
      a.play()
      a.setEffectiveTimeScale(ts)
      // `paused`, not timeScale 0: a zero timescale makes an action look
      // inactive and invites a restart loop that resets the pose every frame.
      a.paused = !walking
    }
  })

  // Above the hat, and above the SCALED hat — the female variant is shorter, and
  // a plate at a fixed height would sit on her head.
  const plateY = 2.06 * BODY_SCALE[variant][1]

  return (
    <group ref={root} name={`player-${peerId ?? name}`}>
      <primitive object={body} />
      {plate && <primitive object={plate} position={[0, plateY, 0]} />}
    </group>
  )
}

// ─── Mounting ────────────────────────────────────────────────────────────────

/**
 * Publishes the local player's motion. Mounted only when a session exists, so
 * solo registers no frame callback at all.
 *
 * It reads the camera rather than the physics body because the camera is the
 * player as far as everything else in this game is concerned, and because
 * reaching into PlayerController for its RigidBody ref would couple two things
 * that currently know nothing about each other.
 */
function LocalBroadcast() {
  const camera = useThree(s => s.camera)
  const last = useRef(new THREE.Vector3().copy(camera.position))

  useFrame((_, delta) => {
    const dt = Math.max(delta, 1e-4)
    const p = camera.position
    const speed = Math.hypot(p.x - last.current.x, p.z - last.current.z) / dt
    last.current.copy(p)

    camera.getWorldDirection(_fwd)
    // Model convention: heading 0 faces +Z, so atan2(x, z) — the same as
    // Supervisor.tsx, because it is the same rig.
    const heading = Math.atan2(_fwd.x, _fwd.z)

    // Feet, not eyes. The receiver should not have to know our eye height.
    useLobbyStore.getState().publishLocal(
      [p.x, p.y - PLAYER_EYE, p.z],
      heading,
      speed > 0.35,
    )
  })

  return null
}

/**
 * The one thing GameCanvas mounts.
 *
 * Renders nothing whatsoever when solo or when nobody else has joined: no
 * avatar, no broadcast, no GLTF request, no frame callback. The two store reads
 * are ordinary selector subscriptions that fire on join and leave only, because
 * `peers` is replaced only on roster changes — movement is written into the
 * existing objects in place. See the header of lobbyStore.ts.
 */
export function RemotePlayers() {
  const role = useLobbyStore(s => s.role)
  const peers = useLobbyStore(s => s.peers)
  const ids = Object.keys(peers)

  if (role === 'solo') return null

  return (
    <>
      <LocalBroadcast />
      {/* Its own boundary. GameCanvas wraps the entire scene in one Suspense,
          so a cold model cache here would blank the whole factory for a frame
          the moment somebody joined. In practice Supervisor has already loaded
          worker.glb, and this is the belt to that pair of braces. */}
      <Suspense fallback={null}>
        {ids.map((id) => (
          <PlayerAvatar
            key={id}
            peerId={id}
            name={peers[id].name}
            variant={peers[id].variant}
            position={peers[id].pos}
            yaw={peers[id].yaw}
          />
        ))}
      </Suspense>
    </>
  )
}
