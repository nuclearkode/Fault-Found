'use client'

/**
 * StationBase — Festo MPS D trolley cabinet + aluminum profile plate.
 *
 * Based on real Festo MPS D station reference photos:
 *   - ENCLOSED white/cream cabinet base (NOT open legs)
 *   - 4 black castor wheels at bottom
 *   - Recessed side handles
 *   - Front panel with HMI touchscreen (angled), status LEDs, E-stop
 *   - Thick aluminum T-slot profile plate on top
 *   - Cable conduit/trunking running up the back
 *   - "FESTO" branding plate at bottom front (we use FAULT//FOUND)
 *
 * Real dimensions (Festo Didactic spec):
 *   Cabinet: 700mm W × 700mm D × 750mm H
 *   Profile plate: 700mm × 700mm × 25mm (thick T-slot)
 *   Total with modules: ~1200–1400mm tall
 *   Working height (top of plate): ~770mm
 */

import { useMemo } from 'react'
import * as THREE from 'three'

// ─── Dimensions (metres) — matching real Festo MPS D ─────────────────────────
const W = 0.7      // cabinet width (X)
const D = 0.7      // cabinet depth (Z)
const CAB_H = 0.62 // cabinet body height (reduced for lower profile)
const PLATE_T = 0.025  // profile plate thickness
const CASTOR_H = 0.05  // castor height (slightly lower)
const TOTAL_BASE = CASTOR_H + CAB_H + PLATE_T  // ~0.695m — realistic working height

// ─── Shared materials ────────────────────────────────────────────────────────
const MAT = {
  // Cabinet body — light grey/cream (Festo standard)
  cabinet: new THREE.MeshStandardMaterial({ color: '#e8e4df', roughness: 0.6, metalness: 0.1 }),
  // Cabinet door panel — slightly different shade
  door: new THREE.MeshStandardMaterial({ color: '#ddd8d2', roughness: 0.55, metalness: 0.15 }),
  // Aluminum profile plate — silver T-slot
  plate: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  // Profile grooves (darker lines in the T-slot)
  groove: new THREE.MeshStandardMaterial({ color: '#999', roughness: 0.4, metalness: 0.5 }),
  // Black accents (castor wheels, handles, cable conduit)
  black: new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.6, metalness: 0.3 }),
  // Handle recesses
  handle: new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.4, metalness: 0.5 }),
  // HMI touchscreen — dark glass
  hmi: new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.1, metalness: 0.3 }),
  // HMI screen (active area)
  screen: new THREE.MeshStandardMaterial({
    color: '#0a2a4a', roughness: 0.2, metalness: 0.1,
    emissive: '#0a3a6a', emissiveIntensity: 0.3,
  }),
  // E-stop
  estop: new THREE.MeshStandardMaterial({
    color: '#cc2222', roughness: 0.4, metalness: 0.2,
    emissive: '#cc2222', emissiveIntensity: 0.15,
  }),
  estopBase: new THREE.MeshStandardMaterial({ color: '#e6b800', roughness: 0.4, metalness: 0.3 }),
  // Start button — green
  startBtn: new THREE.MeshStandardMaterial({
    color: '#22aa44', roughness: 0.4, metalness: 0.2,
    emissive: '#22aa44', emissiveIntensity: 0.1,
  }),
  // Status LEDs
  ledGreen: new THREE.MeshStandardMaterial({
    color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.2,
  }),
  ledAmber: new THREE.MeshStandardMaterial({
    color: '#f59e0b', emissive: '#f59e0b', emissiveIntensity: 0.3, roughness: 0.3, metalness: 0.2,
  }),
  ledOff: new THREE.MeshStandardMaterial({ color: '#444', roughness: 0.5, metalness: 0.3 }),
  // Cable conduit — dark grey ribbed
  conduit: new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.7, metalness: 0.2 }),
  // Branding strip
  brand: new THREE.MeshStandardMaterial({ color: '#1a1a2e', roughness: 0.5, metalness: 0.3 }),
} as const

interface StationBaseProps {
  stationId: string
  label?: string
  children?: React.ReactNode
}

export function StationBase({ stationId, children }: StationBaseProps) {
  return (
    <group name={stationId}>
      {/* ══════════════════════════════════════════════════════════════════
          CASTOR WHEELS — 4 black wheels at the bottom corners
          ══════════════════════════════════════════════════════════════════ */}
      {[
        [-W / 2 + 0.08, 0, -D / 2 + 0.08],
        [W / 2 - 0.08, 0, -D / 2 + 0.08],
        [-W / 2 + 0.08, 0, D / 2 - 0.08],
        [W / 2 - 0.08, 0, D / 2 - 0.08],
      ].map((pos, i) => (
        <group key={`castor_${i}`} position={pos as [number, number, number]}>
          {/* Wheel */}
          <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.black}>
            <cylinderGeometry args={[0.03, 0.03, 0.025, 10]} />
          </mesh>
          {/* Swivel fork */}
          <mesh position={[0, 0.045, 0]} material={MAT.handle}>
            <boxGeometry args={[0.025, 0.02, 0.035]} />
          </mesh>
          {/* Mounting stem */}
          <mesh position={[0, CASTOR_H, 0]} material={MAT.handle}>
            <cylinderGeometry args={[0.008, 0.008, 0.02, 6]} />
          </mesh>
        </group>
      ))}

      {/* ══════════════════════════════════════════════════════════════════
          CABINET BODY — enclosed white box with door and side panels
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, CASTOR_H + CAB_H / 2, 0]}>
        {/* Main cabinet shell */}
        <mesh name={`${stationId}_cabinet`} material={MAT.cabinet} castShadow receiveShadow>
          <boxGeometry args={[W, CAB_H, D]} />
        </mesh>

        {/* Front door panel (slightly inset) */}
        <mesh position={[0, 0, D / 2 + 0.002]} material={MAT.door}>
          <boxGeometry args={[W - 0.04, CAB_H - 0.04, 0.005]} />
        </mesh>

        {/* Door handle (horizontal bar) */}
        <mesh position={[0.15, 0.15, D / 2 + 0.01]} material={MAT.handle}>
          <boxGeometry args={[0.12, 0.015, 0.015]} />
        </mesh>

        {/* Side handles (recessed, left and right) */}
        {([-1, 1] as const).map(s => (
          <group key={`handle_${s}`} position={[s * (W / 2 + 0.005), 0.1, 0]}>
            <mesh material={MAT.handle}>
              <boxGeometry args={[0.01, 0.04, 0.12]} />
            </mesh>
          </group>
        ))}

        {/* Ventilation slots (side panels) */}
        {([-1, 1] as const).map(s =>
          [0, 1, 2].map(i => (
            <mesh
              key={`vent_${s}_${i}`}
              position={[s * (W / 2 + 0.003), -0.15 + i * 0.06, -0.1]}
              material={MAT.handle}
            >
              <boxGeometry args={[0.006, 0.008, 0.08]} />
            </mesh>
          ))
        )}

        {/* Branding strip at bottom front */}
        <mesh position={[0, -CAB_H / 2 + 0.03, D / 2 + 0.004]} material={MAT.brand}>
          <boxGeometry args={[W - 0.02, 0.05, 0.003]} />
        </mesh>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          ALUMINUM PROFILE PLATE — thick T-slot plate on top of cabinet
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, CASTOR_H + CAB_H, 0]}>
        {/* Main plate */}
        <mesh
          name={`${stationId}_plate`}
          position={[0, PLATE_T / 2, 0]}
          material={MAT.plate}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[W + 0.02, PLATE_T, D + 0.02]} />
        </mesh>

        {/* T-slot groove lines (visual detail) */}
        {[-0.25, -0.15, -0.05, 0.05, 0.15, 0.25].map((x, i) => (
          <mesh key={`gx_${i}`} position={[x, PLATE_T + 0.001, 0]} material={MAT.groove}>
            <boxGeometry args={[0.006, 0.002, D + 0.02]} />
          </mesh>
        ))}
        {[-0.25, -0.15, -0.05, 0.05, 0.15, 0.25].map((z, i) => (
          <mesh key={`gz_${i}`} position={[0, PLATE_T + 0.001, z]} material={MAT.groove}>
            <boxGeometry args={[W + 0.02, 0.002, 0.006]} />
          </mesh>
        ))}
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          FRONT CONTROL PANEL — HMI touchscreen + buttons + LEDs
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, CASTOR_H + CAB_H * 0.75, D / 2 + 0.02]}>
        {/* HMI bezel */}
        <mesh name={`${stationId}_hmi`} material={MAT.hmi} castShadow>
          <boxGeometry args={[0.2, 0.14, 0.02]} />
        </mesh>
        {/* Screen active area */}
        <mesh position={[0, 0, 0.012]} material={MAT.screen}>
          <boxGeometry args={[0.17, 0.11, 0.002]} />
        </mesh>

        {/* Button Mounting Bracket */}
        <mesh position={[-0.16, -0.01, 0.015]} material={MAT.cabinet} castShadow>
          <boxGeometry args={[0.1, 0.1, 0.03]} />
        </mesh>

        {/* E-stop button (top left of bracket) */}
        <group name={`${stationId}_estop`} position={[-0.16, 0.015, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
          <mesh material={MAT.estopBase}>
            <cylinderGeometry args={[0.022, 0.022, 0.012, 12]} />
          </mesh>
          <mesh position={[0, -0.012, 0]} material={MAT.estop}>
            <cylinderGeometry args={[0.018, 0.02, 0.015, 12]} />
          </mesh>
        </group>

        {/* Start button (bottom left of bracket) */}
        <mesh name={`${stationId}_start`} position={[-0.16, -0.035, 0.03]} rotation={[Math.PI / 2, 0, 0]} material={MAT.startBtn}>
          <cylinderGeometry args={[0.015, 0.015, 0.012, 10]} />
        </mesh>

        {/* Status LED tower (right of screen) */}
        <group position={[0.16, 0.02, 0.005]}>
          <mesh material={MAT.ledGreen} position={[0, 0.03, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.01, 8]} />
          </mesh>
          <mesh material={MAT.ledAmber} position={[0, 0.01, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.01, 8]} />
          </mesh>
          <mesh material={MAT.ledOff} position={[0, -0.01, 0]}>
            <cylinderGeometry args={[0.008, 0.008, 0.01, 8]} />
          </mesh>
        </group>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          CABLE CONDUIT — runs up the back of the cabinet
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[-W / 2 + 0.06, CASTOR_H + CAB_H / 2, -D / 2 - 0.02]}>
        {/* Main cable chain */}
        <mesh material={MAT.conduit}>
          <boxGeometry args={[0.04, CAB_H * 0.8, 0.03]} />
        </mesh>
        {/* Chain segments (visual ribs) */}
        {[-0.2, -0.1, 0, 0.1, 0.2].map((y, i) => (
          <mesh key={i} position={[0, y, 0]} material={MAT.black}>
            <boxGeometry args={[0.045, 0.008, 0.035]} />
          </mesh>
        ))}
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          PNEUMATIC CONNECTIONS — bottom front of cabinet
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0.2, CASTOR_H + 0.08, D / 2 + 0.01]}>
        {[0, 0.03, 0.06].map((x, i) => (
          <mesh key={i} position={[x, 0, 0]} material={MAT.handle}>
            <cylinderGeometry args={[0.006, 0.006, 0.02, 6]} />
          </mesh>
        ))}
        {/* Air supply hose stub */}
        <mesh position={[0.03, -0.03, 0.01]} rotation={[Math.PI / 4, 0, 0]} material={MAT.conduit}>
          <cylinderGeometry args={[0.005, 0.005, 0.05, 6]} />
        </mesh>
      </group>

      {/* ══════════════════════════════════════════════════════════════════
          STATION-SPECIFIC MODULES — render on top of the plate
          ══════════════════════════════════════════════════════════════════ */}
      <group position={[0, TOTAL_BASE, 0]}>
        {children}
      </group>
    </group>
  )
}

/** Export the base height so station modules can reference it */
export const STATION_WORKING_HEIGHT = TOTAL_BASE
