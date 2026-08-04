'use client'

/**
 * Supervisor — the man in the office, and the business end of the fail state.
 *
 * He has one job: be a clock you can see. While the shift clock is running he
 * paces his office and is scenery. When it hits zero he comes out and walks you
 * down, and the run ends when he reaches you.
 *
 * Everything here is world space. The model is a baked walk cycle — Blender's
 * exporter writes ONE CLIP PER ANIMATED OBJECT rather than a merged take, so it
 * arrives as nine clips (both hips, both knees, both shoulders, both elbows and
 * the pelvis bob), all phases of the same cycle, started together and kept in
 * lockstep. Locomotion is separate from the cycle: the clips move the limbs in
 * place and this component translates and turns the root, which is the standard
 * split and means the run is just the walk re-timed and leaned forward.
 */

import { useRef, useEffect, useMemo, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'
import { worldRunning } from '@/stores/worldClock'

const MODEL_PATH = '/models/worker.glb'

/** Metres per second. Matched to the 1.33 s stride so the feet don't skate. */
const WALK_SPEED = 0.62
/**
 * Chase speed. The player moves at 4.5, so this has to be faster or the whole
 * thing is a stalemate — but not so much faster that there's no point running.
 */
const RUN_SPEED = 5.6
/**
 * The stride is authored for 0.62 m/s. Playing it 9x faster to match RUN_SPEED
 * would look like a cartoon, so the clip is re-timed to roughly a run cadence
 * and the difference is absorbed by a forward lean. Some foot skate is the
 * accepted trade — every game does this.
 */
const RUN_TIMESCALE = 2.6
const RUN_LEAN = 0.22

const TURN_RATE = 3.2
/** Turn faster when running him down — he shouldn't arc lazily around you. */
const CHASE_TURN_RATE = 5.5

/**
 * Close enough to grab you. Deliberately tight — the scare should fire when he
 * is on top of you, not when he gets within conversational distance.
 */
const CATCH_DIST = 0.95
/** How long he's in your face before the screen goes out. */
const SCARE_SECONDS = 1.15
/** Where he ends up. Half a metre is inside your personal space, which is the point. */
const SCARE_DIST = 0.5

const EYE_HEIGHT = 1.62

// Scratch — never allocated in useFrame
const _head = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _up = new THREE.Vector3(0, 1, 0)

/** Shortest signed angle from a to b, in (-PI, PI]. */
function angleDelta(a: number, b: number): number {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

interface Props {
  /** World position of the office he works out of. */
  office?: [number, number, number]
  /** The doorway he has to come through, world XZ. Walking through the wall
   *  looked fine until the office got real colliders and the player didn't. */
  door?: [number, number]
  /** Ends of the beat he paces indoors, world XZ. */
  from?: [number, number]
  to?: [number, number]
}

export function Supervisor({
  office = [12.3, 0, 7.8],
  door = [10.65, 5.6],
  from = [10.6, 6.7],
  to = [14.0, 6.7],
}: Props) {
  const { scene, animations } = useGLTF(MODEL_PATH)
  const cloned = useMemo(() => scene.clone(true), [scene])
  const root = useRef<THREE.Group>(null)
  const lean = useRef<THREE.Group>(null)
  const { actions } = useAnimations(animations, cloned)
  const { camera } = useThree()

  /**
   * `stage` tracks where he is in the chase, which is NOT the same as the store's
   * supervisor state: the store says "he is chasing", this says "he is still
   * getting out of the room". Waypoints first, free pursuit after.
   */
  const s = useRef({
    t: 0, dir: 1, heading: 0,
    x: from[0], z: from[1],
    stage: 'patrol' as 'patrol' | 'toDoor' | 'throughDoor' | 'pursue',
    scare: 0,
    speed: 0,
    /** 0 while he's just doing his job, ramps up once he's coming for you. */
    anger: 0,
  })

  const glow = useRef<THREE.PointLight>(null)
  /**
   * His own copies of the model's materials.
   *
   * `scene.clone(true)` shares materials with the cached GLTF, so making him
   * glow red by writing to them would tint every future instance too — the cache
   * outlives this component. Cloned once, on the first frame that needs them.
   */
  const mats = useRef<THREE.MeshStandardMaterial[] | null>(null)

  // ── Audio ─────────────────────────────────────────────────────────────────
  // Footsteps are a real asset; the sting is synthesised, matching how the rest
  // of the machine audio in this project is made. Both are created lazily
  // because a browser will not give you an AudioContext without a gesture.
  const steps = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    const a = new Audio('/audio/heavy-footsteps.mp3')
    a.loop = true
    a.volume = 0
    steps.current = a
    return () => { a.pause(); a.src = ''; steps.current = null }
  }, [])

  /**
   * The chase cue: a harsh high screech, pulsing, somewhere between a crow and
   * a violin stab — the horror-trailer noise.
   *
   * What makes it a screech rather than a tone is the frequency modulation: a
   * square wave at ~31 Hz driving the carrier's pitch hard. That sideband mess
   * is exactly what a bird's syrinx produces and what a clean sine cannot, no
   * matter how high you put it. A steep bandpass then throws away the body and
   * keeps the cry.
   *
   * The pulse is a second LFO gating the output. Its rate comes from his
   * distance each frame, so the cawing quickens as he gains on you and you can
   * hear how much room you have left without turning round to look.
   *
   * Synthesised, like the rest of the audio in this project. Created on demand
   * because a browser will not hand out an AudioContext without a gesture.
   */
  const chase = useRef<{
    ctx: AudioContext
    master: GainNode
    lfo: OscillatorNode
    band: BiquadFilterNode
    voices: OscillatorNode[]
  } | null>(null)

  const stopChase = useCallback(() => {
    const rig = chase.current
    if (!rig) return
    chase.current = null
    try {
      const now = rig.ctx.currentTime
      rig.master.gain.cancelScheduledValues(now)
      rig.master.gain.setValueAtTime(rig.master.gain.value, now)
      rig.master.gain.linearRampToValueAtTime(0.0001, now + 0.45)
      for (const v of rig.voices) v.stop(now + 0.5)
      rig.lfo.stop(now + 0.5)
      setTimeout(() => rig.ctx.close().catch(() => {}), 900)
    } catch { /* tearing down audio must never break the chase */ }
  }, [])

  const startChase = useCallback(() => {
    if (chase.current) return
    try {
      const Ctx = window.AudioContext ?? (window as unknown as
        { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()

      const master = ctx.createGain()
      master.gain.value = 0.0001
      master.connect(ctx.destination)

      // Gate the tone with an LFO. The param's own value is the floor, the LFO
      // adds to it — so it throbs rather than cutting to silence.
      const gate = ctx.createGain()
      gate.gain.value = 0.45
      gate.connect(master)
      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = 3.4
      const depth = ctx.createGain()
      depth.gain.value = 0.55
      lfo.connect(depth).connect(gate.gain)

      // Steep bandpass — this is what turns a buzz into a cry. Everything below
      // it is body, and a crow has none.
      const band = ctx.createBiquadFilter()
      band.type = 'bandpass'
      band.frequency.value = 2150
      band.Q.value = 7.5
      band.connect(gate)
      const thin = ctx.createBiquadFilter()
      thin.type = 'highpass'
      thin.frequency.value = 900
      thin.connect(band)

      const tone = ctx.createGain()
      tone.gain.value = 0.075
      tone.connect(thin)

      // Two carriers a little apart so the two cries never quite agree
      const voices = [815, 838].map((hz) => {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = hz
        o.connect(tone)
        o.start()
        return o
      })

      // The rasp. A square wave this deep into the carrier's pitch is not
      // vibrato — it shreds the waveform into sidebands, which is the sound.
      const rasp = ctx.createOscillator()
      rasp.type = 'square'
      rasp.frequency.value = 31
      const raspDepth = ctx.createGain()
      raspDepth.gain.value = 210
      rasp.connect(raspDepth)
      for (const v of voices) raspDepth.connect(v.frequency)
      rasp.start()
      voices.push(rasp)

      lfo.start()
      master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.6)
      chase.current = { ctx, master, lfo, band, voices }
    } catch { /* the chase works fine in silence */ }
  }, [])

  useEffect(() => stopChase, [stopChase])

  const sting = useCallback(() => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as
        { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      const now = ctx.currentTime
      const out = ctx.createGain()
      out.gain.value = 0.9
      out.connect(ctx.destination)

      // A falling sub-bass hit — the body of it
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(160, now)
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.9)
      const og = ctx.createGain()
      og.gain.setValueAtTime(0.0001, now)
      og.gain.exponentialRampToValueAtTime(0.8, now + 0.012)
      og.gain.exponentialRampToValueAtTime(0.0001, now + 1.2)
      osc.connect(og).connect(out)
      osc.start(now); osc.stop(now + 1.25)

      // Broadband crack on top so it reads as an impact, not just a tone
      const len = Math.floor(ctx.sampleRate * 0.35)
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7
      const ng = ctx.createGain(); ng.gain.value = 0.55
      noise.connect(bp).connect(ng).connect(out)
      noise.start(now)

      setTimeout(() => ctx.close().catch(() => {}), 2000)
    } catch {
      // Audio is decoration here — never let it take the scare down with it
    }
  }, [])

  useFrame((_, delta) => {
    const g = root.current
    if (!g) return
    // He stops when the game does — a supervisor who keeps closing in behind the
    // pause menu is a way to lose a run you were not playing, and one still
    // walking across the debrief is just untidy.
    if (!worldRunning()) {
      if (steps.current && !steps.current.paused) steps.current.pause()
      stopChase()
      return
    }
    const dt = Math.min(delta, 0.05)
    const store = useGameStore.getState()
    const mode = store.supervisor
    const st = s.current

    // ── Decide where he is trying to be ──────────────────────────────────────
    let wantX = st.x, wantZ = st.z
    let speed = 0

    if (mode === 'patrol') {
      // Back to pacing — this is also the path taken when a chase is called off
      // because the player got the fault fixed in time.
      if (st.stage !== 'patrol') { st.stage = 'patrol'; st.t = 0; st.dir = 1 }
      const span = Math.hypot(to[0] - from[0], to[1] - from[1])
      st.t += (WALK_SPEED / span) * dt * st.dir
      if (st.t >= 1) { st.t = 1; st.dir = -1 }
      if (st.t <= 0) { st.t = 0; st.dir = 1 }
      wantX = from[0] + (to[0] - from[0]) * st.t
      wantZ = from[1] + (to[1] - from[1]) * st.t
      speed = WALK_SPEED
    } else if (mode === 'chasing') {
      if (st.stage === 'patrol') {
        // If the player is already standing in the office there is nothing to
        // exit — go straight for them rather than politely using the door.
        const near = Math.hypot(camera.position.x - st.x, camera.position.z - st.z) < 3
        st.stage = near ? 'pursue' : 'toDoor'
      }
      // Two waypoints, not one: aiming at the doorway from inside and then
      // straight at the player would clip him through the jamb on the way out.
      const goal =
        st.stage === 'toDoor' ? [door[0], door[1] + 0.7]
        : st.stage === 'throughDoor' ? [door[0], door[1] - 0.9]
        : [camera.position.x, camera.position.z]

      const dx = goal[0] - st.x, dz = goal[1] - st.z
      const dist = Math.hypot(dx, dz)
      speed = RUN_SPEED
      const step = Math.min(speed * dt, dist)
      if (dist > 1e-4) { wantX = st.x + (dx / dist) * step; wantZ = st.z + (dz / dist) * step }

      if (dist < 0.35) {
        if (st.stage === 'toDoor') st.stage = 'throughDoor'
        else if (st.stage === 'throughDoor') st.stage = 'pursue'
      }

      // Measured to the PLAYER, never to `dist`. `dist` is the distance to the
      // current waypoint, and clearing the last waypoint sets stage to 'pursue'
      // in this same frame — so testing `dist` here fired the scare the instant
      // he stepped out of the doorway, with the player still ten metres away.
      if (st.stage === 'pursue') {
        const reach = Math.hypot(camera.position.x - st.x, camera.position.z - st.z)
        if (reach < CATCH_DIST) {
          store.setSupervisor('jumpscare')
          st.scare = 0
          sting()
        }
      }
    } else {
      // jumpscare / caught — close the last of the gap and hold
      const dx = camera.position.x - st.x, dz = camera.position.z - st.z
      const dist = Math.hypot(dx, dz) || 1
      const want = Math.max(0, dist - SCARE_DIST)
      const step = Math.min(6 * dt, want)
      wantX = st.x + (dx / dist) * step
      wantZ = st.z + (dz / dist) * step
      speed = want > 0.05 ? RUN_SPEED : 0
    }

    st.x = wantX
    st.z = wantZ
    st.speed = speed
    g.position.set(st.x, office[1], st.z)

    // ── Facing ───────────────────────────────────────────────────────────────
    // heading 0 faces +Z, which is how the model is authored, so atan2(x, z).
    let wantHeading = st.heading
    if (mode === 'patrol') {
      wantHeading = Math.atan2((to[0] - from[0]) * st.dir, (to[1] - from[1]) * st.dir)
    } else {
      const dx = camera.position.x - st.x, dz = camera.position.z - st.z
      // While heading for the door he faces where he is going; once pursuing,
      // and always during the scare, he faces the player.
      if (mode === 'chasing' && st.stage !== 'pursue') {
        const gx = door[0] - st.x
        const gz = (st.stage === 'toDoor' ? door[1] + 0.7 : door[1] - 0.9) - st.z
        if (Math.hypot(gx, gz) > 1e-3) wantHeading = Math.atan2(gx, gz)
      } else if (Math.hypot(dx, dz) > 1e-3) {
        wantHeading = Math.atan2(dx, dz)
      }
    }
    const rate = mode === 'patrol' ? TURN_RATE : CHASE_TURN_RATE
    st.heading += THREE.MathUtils.clamp(
      angleDelta(st.heading, wantHeading), -rate * dt, rate * dt)
    g.rotation.y = st.heading

    // ── Cycle timing ─────────────────────────────────────────────────────────
    const running = mode !== 'patrol' && speed > 0.1

    // Re-asserted every frame, against a freshly read `actions`, and NOT cached.
    //
    // Caching the nine actions once looked equivalent and was not: drei rebuilds
    // and uncaches them whenever the clip list changes identity, which leaves any
    // array you kept holding nine dead objects. Nothing throws — `setEffectiveTimeScale`
    // on a detached action is perfectly legal — so the root went on translating
    // while every joint stood frozen in whatever pose it was in when the actions
    // were swapped. A walking man sliding across the floor with rigid legs.
    //
    // `play()` is idempotent: three.js no-ops it when the action is already
    // active, so calling it per frame costs nothing and revives a dead one.
    // `paused` is what stops him standing still, rather than timeScale 0 —
    // a zero timeScale makes an action look inactive and invites exactly the
    // restart loop that would reset his pose every frame.
    const ts = running ? RUN_TIMESCALE : 1
    for (const a of Object.values(actions)) {
      if (!a) continue
      a.setLoop(THREE.LoopRepeat, Infinity)
      a.play()
      a.setEffectiveTimeScale(ts)
      a.paused = speed <= 0.01
    }
    // Lean lives on a child group so it is applied in the model's own frame,
    // after the heading — putting both on one object mixes the Euler axes.
    if (lean.current) {
      lean.current.rotation.x = THREE.MathUtils.damp(
        lean.current.rotation.x, running ? RUN_LEAN : 0, 6, dt)
    }

    // ── Anger ────────────────────────────────────────────────────────────────
    // Ramped rather than switched, so he reddens as he comes rather than
    // popping. The same value dims the factory — see Lighting.
    const wantAnger = mode === 'patrol' ? 0 : mode === 'chasing' ? 1 : 1.5
    st.anger = THREE.MathUtils.damp(st.anger, wantAnger, 2.2, dt)
    store.setAnger(st.anger)

    if (!mats.current) {
      const found: THREE.MeshStandardMaterial[] = []
      g.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        const m = o.material
        if (Array.isArray(m)) return
        const copy = m.clone() as THREE.MeshStandardMaterial
        o.material = copy
        found.push(copy)
      })
      mats.current = found
    }
    for (const m of mats.current) {
      if (!m.emissive) continue
      m.emissive.setRGB(st.anger * 0.85, st.anger * 0.055, st.anger * 0.03)
      m.emissiveIntensity = 1
    }
    if (glow.current) glow.current.intensity = st.anger * 11

    // ── Footsteps and the chase cue ──────────────────────────────────────────
    const chasing = mode === 'chasing'
    const gap = Math.hypot(camera.position.x - st.x, camera.position.z - st.z)

    const step = steps.current
    if (step) {
      // Audible from across the floor and loud when he's on you — this and the
      // cue are the only warning the player gets if they aren't looking.
      step.volume = chasing ? THREE.MathUtils.clamp(1 - gap / 22, 0.12, 1) : 0
      if (chasing && step.paused) step.play().catch(() => {})
      if (!chasing && !step.paused) step.pause()
    }

    if (chasing) {
      startChase()
      const rig = chase.current
      if (rig) {
        // 0 across the shed, 1 on top of you. Everything below reads off it.
        const close = THREE.MathUtils.clamp(1 - gap / 18, 0, 1)
        const t = rig.ctx.currentTime
        // 2.6 caws a second at range, up to ~9 in your face — the tell that
        // he's gaining, and the reason you don't need to look behind you
        rig.lfo.frequency.setTargetAtTime(2.6 + close * 6.4, t, 0.12)
        // the cry sharpens as well as quickens, which reads as panic
        rig.band.frequency.setTargetAtTime(2150 + close * 900, t, 0.2)
        rig.master.gain.setTargetAtTime(0.3 + close * 0.5, t, 0.15)
      }
    } else if (mode === 'patrol') {
      stopChase()
    }

    // ── The scare ────────────────────────────────────────────────────────────
    if (mode === 'jumpscare') {
      st.scare += dt

      // Take the camera. PointerLockControls only writes rotation on mouse
      // events, so writing the quaternion here holds until the player moves the
      // mouse — and by then the screen is black.
      _head.set(st.x, office[1] + EYE_HEIGHT, st.z)
      _m.lookAt(camera.position, _head, _up)
      _q.setFromRotationMatrix(_m)
      camera.quaternion.slerp(_q, 1 - Math.exp(-14 * dt))

      // Shake, decaying as it goes so it lands rather than rattles
      const k = Math.max(0, 1 - st.scare / SCARE_SECONDS)
      const amp = 0.035 * k
      const r = camera.rotation
      r.set(
        r.x + (Math.random() * 2 - 1) * amp,
        r.y,
        r.z + (Math.random() * 2 - 1) * amp,
      )

      if (st.scare >= SCARE_SECONDS) {
        store.loseRun('The supervisor found you before you found the fault.')
        if (step) step.pause()
      }
    }
  })

  return (
    <group ref={root} name="supervisor" position={[from[0], office[1], from[1]]}>
      <group ref={lean}>
        <primitive object={cloned} castShadow receiveShadow />
      </group>
      {/* The aura. A light rather than a shell, so it throws red onto the floor
          and the machines around him — which is what makes him read as the
          source of it instead of a man wearing a bubble. Starts at zero. */}
      <pointLight
        ref={glow}
        color="#ff2410"
        intensity={0}
        distance={11}
        decay={2}
        position={[0, 1.15, 0]}
      />
    </group>
  )
}

useGLTF.preload(MODEL_PATH)
