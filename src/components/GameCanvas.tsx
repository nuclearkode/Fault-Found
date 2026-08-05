'use client'

/**
 * GameCanvas — Main game renderer and scene orchestrator.
 *
 * Renderer priority: WebGPU → WebGL2 → WebGL1
 *
 * Three.js r170+ WebGPURenderer has a built-in fallback: if the browser
 * doesn't support WebGPU, it transparently falls back to WebGL2.
 * We use R3F's `gl` factory prop to create the renderer asynchronously
 * (WebGPU requires an async init step), then R3F takes over from there.
 *
 * The quality tier (high/medium/low) is determined by gpuCapabilities.ts
 * and can be overridden by the user in the pause menu.
 */

// MUST be first. Points drei's Draco decoder at /draco/ instead of gstatic.com,
// and only works if it is evaluated before the components below — several of
// them call useGLTF.preload() at module scope, which builds the loader on the
// spot. See src/three/dracoPath.ts.
import '@/three/dracoPath'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Physics, useRapier } from '@react-three/rapier'
import { detectGPU, type GPUCaps } from '@/utils/gpuCapabilities'
import { useSettingsStore } from '@/stores/settingsStore'
import { useGameStore } from '@/stores/gameStore'
import { SIMULATES, useUiFocus } from '@/stores/worldClock'
import { PlayerController } from '@/components/player/PlayerController'
import { FactoryFloor } from '@/components/factory/FactoryFloor'
import { PLCPanel } from '@/components/factory/PLCPanel'
import { RigRenderer } from '@/components/factory/RigRenderer'
import { Supervisor } from '@/components/factory/Supervisor'
import { FaultCamera } from '@/components/factory/FaultCamera'
import { PreShift } from '@/components/factory/PreShift'
import { RackClutter } from '@/components/factory/RackClutter'
import { Lighting } from '@/components/factory/Lighting'
import { BreakerPanel } from '@/components/factory/BreakerPanel'
import { SupervisorOffice } from '@/components/factory/SupervisorOffice'
import {
  Workbench,
  IndustrialShelving,
  CeilingPipes,
  CableTray,
  MotorControlCenter,
} from '@/components/factory/FactoryProps'
import { GameLoop } from '@/hooks/useGameLoop'
import { useScenarioLoader } from '@/hooks/useScenarioLoader'
import { useMenuAudio } from '@/hooks/useMenuAudio'
import { useAmbientAudio } from '@/hooks/useAmbientAudio'
import { CellAudio } from '@/hooks/useCellAudio'

// ─── Accelerated raycasting ──────────────────────────────────────────────────
// three-mesh-bvh patches Three.js prototypes so ALL raycasts in the scene
// (including useInteraction.ts) use BVH acceleration automatically.
// This turns O(n) triangle checks into O(log n) — critical for GLB models.
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh'
import * as THREE from 'three'
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

// ─── Loading screen ───────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0a', color: '#e0e0e0',
      fontFamily: '"JetBrains Mono", monospace', zIndex: 100,
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem', fontWeight: 700, letterSpacing: '0.12em' }}>
          <span style={{ color: '#e8e4e0' }}>FAULT</span>
          <span style={{ color: '#e63946' }}>//</span>
          <span style={{ color: '#e8e4e0' }}>FOUND</span>
        </div>
        <div style={{ opacity: 0.6, fontSize: '0.9rem' }}>Initializing systems...</div>
      </div>
    </div>
  )
}

// ─── Click-to-start / click-to-resume overlay ────────────────────────────────

function ClickOverlay({ label, hint, onStart }: {
  label: string
  hint?: string
  onStart: () => void
}) {
  return (
    <div onClick={onStart} style={{
      position: 'absolute', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(10, 10, 14, 0.85)', cursor: 'pointer', zIndex: 50,
      fontFamily: '"JetBrains Mono", monospace',
    }}>
      <div style={{ textAlign: 'center', color: '#e0e0e0' }}>
        {/* Logo: FAULT//FOUND with red slashes */}
        <div style={{
          fontSize: '3.5rem', fontWeight: 700, marginBottom: '0.5rem',
          letterSpacing: '0.15em',
        }}>
          <span style={{ color: '#e8e4e0' }}>FAULT</span>
          <span style={{ color: '#e63946' }}>//</span>
          <span style={{ color: '#e8e4e0' }}>FOUND</span>
        </div>
        <div style={{ fontSize: '0.85rem', opacity: 0.4, marginBottom: '2.5rem', letterSpacing: '0.2em' }}>
          PLC TROUBLESHOOTING SIMULATOR
        </div>
        <div style={{
          fontSize: '1.1rem', padding: '0.8rem 2.5rem',
          border: '1px solid rgba(230, 57, 70, 0.4)', borderRadius: '4px',
          color: '#e63946', letterSpacing: '0.1em',
        }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontSize: '0.72rem', opacity: 0.3, marginTop: '1.8rem', letterSpacing: '0.05em' }}>{hint}</div>
        )}
      </div>
    </div>
  )
}


// ─── Dev-mode: auto-load a scenario ──────────────────────────────────────────
// The scenario declares its own rig, so this also decides which machinery is on
// the warehouse floor. S02 = the silo fill cell with the belt-slip fault live.

const DEV_SCENARIO = 'S02'

/**
 * Countdown override, in seconds, applied only OUTSIDE production.
 *
 * 30 s is the right number to test the failure path against — nothing about the
 * chase or the debrief can be seen inside the scenarios' authored 600-780 s. It
 * is the wrong number to hand to a player: the supervisor arrives before you can
 * reach the machine, so the game reads as broken rather than tense.
 *
 * Keyed on NODE_ENV rather than a constant somebody has to remember to flip. A
 * shipped build that still had a 30-second timer in it would be a bad first
 * impression that nobody would recognise as a stray dev flag.
 */
const DEV_TIME_LIMIT: number | undefined =
  process.env.NODE_ENV === 'production' ? undefined : 30

/**
 * Dev-only handles on the live scene and physics world, at `window.__scene` and
 * `window.__world`.
 *
 * R3F keeps its store inside its own reconciler and Rapier's colliders exist
 * only in WASM, so from the outside neither is reachable — which makes "what is
 * that object near the ceiling?" and "is there actually a wall there?" questions
 * you can only answer by reading source and guessing. Guessing is how the office
 * shipped with no collision at all. Stripped from production builds.
 */
function SceneProbe() {
  const scene = useThree(s => s.scene)
  const camera = useThree(s => s.camera)
  const { world } = useRapier()
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w.__scene = scene
    w.__world = world
    w.__camera = camera
    // Also the stores, which is what makes the fail state testable at all:
    //   __game.getState().setSupervisor('chasing')   send him out now
    //   __game.getState().startTimer(5)              five seconds on the clock
    w.__game = useGameStore
    w.__settings = useSettingsStore
  }, [scene, world, camera])
  return null
}

function ScenarioBootstrap() {
  const { load } = useScenarioLoader()
  // Keyed on runNonce, which resetRun() bumps — so coming back from a loss, or
  // taking NEXT out of a win, reloads whatever job is queued rather than
  // dropping the player into a spent scenario.
  const runNonce = useGameStore(s => s.runNonce)
  useEffect(() => {
    const s = useGameStore.getState()
    const id = runNonce === 0 ? DEV_SCENARIO : s.queuedScenario
    if (runNonce === 0) s.setQueuedScenario(DEV_SCENARIO)
    load(id, DEV_TIME_LIMIT)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runNonce])
  return null
}

// ─── Renderer factory ────────────────────────────────────────────────────────
//
// R3F v9's `gl` prop accepts: (canvas) => Renderer
//
// WebGPU Note: R3F v9 does NOT reliably support async gl factories.
// WebGPURenderer.init() is async, but R3F expects a synchronous return.
// We use WebGLRenderer (which supports WebGL2 automatically) and log
// WebGPU availability for future upgrade when R3F adds official support.
//
// The detection in gpuCapabilities.ts still checks for WebGPU so the
// tier system is ready — just the renderer path needs R3F to catch up.

function createRenderer(
  canvas: HTMLCanvasElement,
  gpuCaps: GPUCaps,
  tier: 'high' | 'medium' | 'low'
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: tier !== 'low',
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  })

  const backend = gpuCaps.webgl2 ? 'WebGL2' : 'WebGL1'
  const gpuNote = gpuCaps.webgpu ? ' (WebGPU available — will use when R3F supports async gl)' : ''
  console.log(`[FAULT//FOUND] Renderer: ${backend}${gpuNote}`)

  return renderer
}

// ─── Main canvas ─────────────────────────────────────────────────────────────

export function GameCanvas() {
  const [gpuCaps, setGpuCaps] = useState<GPUCaps | null>(null)
  const started = useSettingsStore(s => s.started)
  const setStarted = useSettingsStore(s => s.setStarted)
  const setGpuTier = useSettingsStore(s => s.setGpuTier)
  const qualityOverride = useSettingsStore(s => s.qualityOverride)
  // The reactive twin of worldRunning(). Literally the same lookup table, so
  // the polled predicate and this prop cannot drift — which they did when they
  // were two hand-written conditions and one of them froze the physics on a WIN.
  const focus = useUiFocus()
  const frozen = !SIMULATES[focus]

  useEffect(() => {
    const caps = detectGPU()
    setGpuCaps(caps)
    setGpuTier(caps.tier)
    console.log(`[FAULT//FOUND] GPU: ${caps.renderer} → tier=${caps.tier}, backend=${caps.backend}`)
  }, [setGpuTier])

  const handleStart = useCallback(() => {
    useSettingsStore.getState().setOverlay('none')
    setStarted(true)
    // Pointer lock is NOT requested here any more. What follows is the pre-shift
    // sequence, which owns the camera and ends in a button the player has to be
    // able to click. The Briefing panel takes the lock when they take the shift.
  }, [setStarted])

  // Menu theme audio — plays on start screen, fades out when game starts.
  // MUST be called before any conditional returns (React hooks rules).
  useMenuAudio(!started)

  // Ambient factory hum — plays while game is running (and not paused)
  useAmbientAudio(started)

  if (!gpuCaps) return <LoadingScreen />

  // Effective tier: pause-menu override takes priority over auto-detection
  const tier = qualityOverride === 'auto' ? gpuCaps.tier : qualityOverride

  const showStartOverlay = !started

  // Capture gpuCaps in closure for the renderer factory
  const capturedCaps = gpuCaps
  const capturedTier = tier

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#1a1a1e' }}>
      {/* Load S01 into Zustand before the canvas even mounts */}
      <ScenarioBootstrap />

      {/* Overlays */}
      {showStartOverlay && (
        <ClickOverlay
          label="[ CLICK TO START ]"
          hint="WASD to move · Mouse to look · E to interact · ESC for settings"
          onStart={handleStart}
        />
      )}

      {/* Canvas — renderer configured via gl props object */}
      <Canvas
        gl={{
          antialias: tier !== 'low',
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        shadows={tier === 'high' ? 'soft' : tier === 'medium'}
        dpr={tier === 'high' ? [1, 2] : [1, 1]}
        // Start at the player spawn at eye height. PlayerController overwrites this
        // every frame once pointer lock is held, but until then the default [0,0,5]
        // puts the camera on the floor at the origin, facing a wall of cabinet bases.
        camera={{ fov: 75, near: 0.1, far: 100, position: [0, 1.7, 7] }}
        frameloop="always"
        style={{
          cursor: 'none',
          // Any overlay that owns the cursor also takes the canvas out of the
          // hit path. drei's click-to-lock is bound to selector="canvas", so a
          // click landing beside an open laptop would otherwise yank the pointer
          // straight back mid-edit.
          pointerEvents: focus === 'world' || focus === 'title' ? 'auto' : 'none',
        }}
      >
        <Suspense fallback={null}>
          {/* Any menu freezes the world, not just the player: rigid bodies stop
              here, and the scan cycle, the countdown, the door and the supervisor
              all check worldRunning(), which is the same three conditions. The
              debrief counts as a menu — nothing moves behind it. */}
          <Physics gravity={[0, -9.81, 0]} colliders={false} paused={frozen}>
            {/* PLC scan engine — 20Hz tick, only runs when phase === 'active' */}
            <GameLoop />

            <Lighting tier={tier} />
            <FactoryFloor />

            {/* ── CONTROL CORNER (north-east) ─────────────────────────────
                Laid out along the two walls that bound it rather than scattered
                across the middle of the bay, which is how the room actually
                works and how it reads: switchgear in one run on the north wall,
                stores and bench in one run on the east wall, and the floor
                between them left clear to stand and work in.

                Everything is flush. The north wall's inner face is z = -10 and
                the east wall's is x = 15, so each unit is set back by half its
                own depth — a cabinet 0.4 deep sits at -9.8, one 0.6 deep at
                -9.65. The east-wall units are turned a quarter turn so their
                backs, not their ends, face the wall. */}
            <PLCPanel position={[6.0, 1, -9.8]} />
            <PLCPanel position={[7.4, 1, -9.8]} />
            <MotorControlCenter position={[10.2, 0, -9.65]} />
            <IndustrialShelving position={[14.7, 0, -6.6]} rotation={[0, -Math.PI / 2, 0]} />
            <IndustrialShelving position={[14.7, 0, -3.4]} rotation={[0, -Math.PI / 2, 0]} />
            {/* Spares on the stores racks. Each device is a clone out of
                devices.glb — see RackClutter, which places but never builds.
                Different seeds so the two racks are not the same rack twice. */}
            <RackClutter position={[14.7, 0, -6.6]} rotation={[0, -Math.PI / 2, 0]} seed={7} />
            <RackClutter position={[14.7, 0, -3.4]} rotation={[0, -Math.PI / 2, 0]} seed={23} />
            <Workbench position={[14.55, 0, -0.2]} rotation={[0, -Math.PI / 2, 0]} />

            {/* ── BREAKER PANEL — west wall ─────────────────────────────────
                Main power disconnect. When power fails, player walks here
                to flip the breaker back on. Systems must recover state. */}
            <BreakerPanel
              position={[-14.5, 1.6, -5]}
              rotation={[0, Math.PI / 2, 0]}
            />

            {/* ── SUPERVISOR OFFICE — south-east corner, flush against south wall ─
                Elevated mezzanine with glass-fronted office, metal stairs
                running sideways (west) along the wall. Back wall = factory wall.
                Supervisor will burst out and run down stairs (trip hazard). */}
            {/* Back-right corner from the player spawn at [0, 1.7, 7]. Sized so
                its +X and +Z faces sit flush on the building walls at 15 and 10,
                borrowing two of its four walls from the shed. */}
            <SupervisorOffice position={[12.3, 0, 7.8]} />
            {/* Derek. Paces his office until the shift clock runs out, then comes
                through that door after the player. Walk cycle is baked in the
                GLB; path, speed and the chase are driven in the component. */}
            <Supervisor
              office={[12.3, 0, 7.8]}
              door={[10.65, 5.6]}
              from={[10.9, 6.9]}
              to={[14.2, 6.9]}
            />
            {/* Takes the debrief photo of the fault at the moment of the scare */}
            <FaultCamera />
            {/* Runs the line, breaks it on camera, then hands over to Briefing */}
            <PreShift />
            {process.env.NODE_ENV !== 'production' && <SceneProbe />}

            {/* ── EQUIPMENT RIG ────────────────────────────────────────────
                The warehouse shell above is permanent; the machinery is not.
                RigRenderer spawns whichever rig the scenario calls for — the
                MPS line, the LogixPro silo cell, or nothing — centred on the
                production bay. Switch with useGameStore.setActiveRig(). */}
            <RigRenderer />

            {/* Procedural machine audio — motor, valve, contactor clicks and room
                tone, synthesised from the PLC tags. Inside the Canvas because each
                voice is attenuated by the player's distance from its source. */}
            <CellAudio />


            {/* ── CEILING INFRASTRUCTURE ───────────────────────────────────
                Cable trays above aisles, pipe runs on west side. */}
            <CeilingPipes />
            <CableTray position={[5, 4.2, 0]} />
            <CableTray position={[-5, 4.2, 0]} />
            <PlayerController />
          </Physics>
        </Suspense>
      </Canvas>
    </div>
  )
}
