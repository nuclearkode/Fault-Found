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

import { useState, useEffect, useCallback, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { detectGPU, type GPUCaps } from '@/utils/gpuCapabilities'
import { useSettingsStore } from '@/stores/settingsStore'
import { PlayerController } from '@/components/player/PlayerController'
import { FactoryFloor } from '@/components/factory/FactoryFloor'
import { PLCPanel } from '@/components/factory/PLCPanel'
import { StationRenderer } from '@/components/factory/stations/StationRenderer'
import { Lighting } from '@/components/factory/Lighting'
import { BreakerPanel } from '@/components/factory/BreakerPanel'
import { SupervisorOffice } from '@/components/factory/SupervisorOffice'
import { DemoWorkpieces } from '@/components/factory/Workpiece'
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


// ─── Dev-mode: auto-load S01 ─────────────────────────────────────────────────

function ScenarioBootstrap() {
  const { loadDev } = useScenarioLoader()
  useEffect(() => {
    loadDev('S01')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
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
  const isPaused = useSettingsStore(s => s.isPaused)

  useEffect(() => {
    const caps = detectGPU()
    setGpuCaps(caps)
    setGpuTier(caps.tier)
    console.log(`[FAULT//FOUND] GPU: ${caps.renderer} → tier=${caps.tier}, backend=${caps.backend}`)
  }, [setGpuTier])

  const handleStart = useCallback(() => {
    setStarted(true)
    // Request pointer lock directly when starting the game
    // Small timeout ensures React has processed the state change
    setTimeout(() => {
      document.querySelector('canvas')?.requestPointerLock()
    }, 10)
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
        camera={{ fov: 75, near: 0.1, far: 100 }}
        frameloop="always"
        style={{
          cursor: 'none',
          pointerEvents: isPaused ? 'none' : 'auto',
        }}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]} colliders={false}>
            {/* PLC scan engine — 20Hz tick, only runs when phase === 'active' */}
            <GameLoop />

            <Lighting tier={tier} />
            <FactoryFloor />

            {/* ── CONTROL CORNER (north-east) ─────────────────────────────
                PLC panels on the north wall, workbench + shelving adjacent.
                MCC against the east wall for short cable runs. */}
            <PLCPanel position={[7,  1, -9.2]} />
            <PLCPanel position={[10, 1, -9.2]} />
            <Workbench position={[8, 0, -6.5]} />
            <IndustrialShelving position={[13, 0, -7]} />
            <MotorControlCenter position={[13.2, 0, -1]} />

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
            <SupervisorOffice position={[6, 0, 8]} />

            {/* ── MPS STATIONS — all 10 Festo stations ─────────────────────
                Positions defined in src/config/factoryLayout.ts.
                Scaled 1.5× in StationRenderer. */}
            <StationRenderer />

            {/* ── WORKPIECES — independent entities ────────────────────────
                These will flow through stations in Phase 3.
                For now, demo placement for visual scale check. */}
            <DemoWorkpieces />

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
