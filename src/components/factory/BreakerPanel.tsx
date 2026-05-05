'use client'

/**
 * BreakerPanel — Wall-mounted electrical breaker box.
 *
 * Interactive element: when power goes down, the player must physically
 * walk to the breaker panel and flip the main breaker back on.
 * This affects all station operations (PLC systems must recover state).
 *
 * Visual: metal enclosure with hinged door, rows of breaker switches,
 * main disconnect, warning labels, and status indicator.
 */

import { useRef, useState, useCallback } from 'react'
import * as THREE from 'three'

const MAT = {
  enclosure: new THREE.MeshStandardMaterial({ color: '#d0d0d0', roughness: 0.5, metalness: 0.4 }),
  door: new THREE.MeshStandardMaterial({ color: '#c8c8c8', roughness: 0.45, metalness: 0.5 }),
  interior: new THREE.MeshStandardMaterial({ color: '#2a2a30', roughness: 0.7, metalness: 0.3 }),
  breaker: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.5, metalness: 0.4 }),
  breakerOn: new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.5, metalness: 0.4 }),
  handle: new THREE.MeshStandardMaterial({ color: '#e63946', roughness: 0.4, metalness: 0.3 }),
  mainBreaker: new THREE.MeshStandardMaterial({ color: '#333', roughness: 0.4, metalness: 0.5 }),
  copper: new THREE.MeshStandardMaterial({ color: '#b87333', roughness: 0.3, metalness: 0.8 }),
  label: new THREE.MeshStandardMaterial({ color: '#ffcc00', roughness: 0.6, metalness: 0.1 }),
  labelDanger: new THREE.MeshStandardMaterial({ color: '#cc2222', roughness: 0.5, metalness: 0.1 }),
  ledGreen: new THREE.MeshStandardMaterial({
    color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.2,
  }),
  ledRed: new THREE.MeshStandardMaterial({
    color: '#ef4444', emissive: '#ef4444', emissiveIntensity: 0.1, roughness: 0.3, metalness: 0.2,
  }),
} as const

interface BreakerPanelProps {
  position?: [number, number, number]
  rotation?: [number, number, number]
}

export function BreakerPanel({ position = [0, 0, 0], rotation = [0, 0, 0] }: BreakerPanelProps) {
  const [doorOpen] = useState(true) // Door stays open for gameplay visibility

  return (
    <group name="breaker_panel" position={position} rotation={rotation}>
      {/* Main enclosure (wall-mounted box) */}
      <mesh material={MAT.enclosure} castShadow>
        <boxGeometry args={[0.6, 0.9, 0.18]} />
      </mesh>

      {/* Interior backplate */}
      <mesh position={[0, 0, 0.02]} material={MAT.interior}>
        <boxGeometry args={[0.55, 0.85, 0.01]} />
      </mesh>

      {/* Door (hinged, open to show breakers) */}
      <group position={[-0.29, 0, 0.09]}>
        <mesh
          material={MAT.door}
          position={[doorOpen ? -0.15 : 0, 0, 0]}
          rotation={[0, doorOpen ? -Math.PI * 0.7 : 0, 0]}
          castShadow
        >
          <boxGeometry args={[0.57, 0.87, 0.02]} />
        </mesh>
        {/* Door handle */}
        <mesh position={[doorOpen ? -0.38 : 0.25, 0, doorOpen ? 0.12 : 0.02]} material={MAT.handle}>
          <boxGeometry args={[0.03, 0.06, 0.015]} />
        </mesh>
      </group>

      {/* === MAIN DISCONNECT (top, big red handle) === */}
      <group name="breaker_main_disconnect" position={[0, 0.3, 0.06]}>
        <mesh material={MAT.mainBreaker}>
          <boxGeometry args={[0.12, 0.08, 0.04]} />
        </mesh>
        <mesh position={[0, 0.03, 0.025]} material={MAT.handle}>
          <boxGeometry args={[0.08, 0.04, 0.02]} />
        </mesh>
        {/* ON/OFF label */}
        <mesh position={[0.07, 0.02, 0.04]} material={MAT.label}>
          <boxGeometry args={[0.02, 0.015, 0.002]} />
        </mesh>
      </group>

      {/* === BREAKER ROWS (3 rows of 4 breakers) === */}
      {[0, 1, 2].map(row => (
        <group key={row} position={[0, 0.1 - row * 0.15, 0.05]}>
          {[0, 1, 2, 3].map(col => (
            <group key={col} position={[-0.15 + col * 0.1, 0, 0]}>
              {/* Breaker body */}
              <mesh material={MAT.breaker}>
                <boxGeometry args={[0.07, 0.06, 0.03]} />
              </mesh>
              {/* Toggle switch */}
              <mesh position={[0, 0.015, 0.018]} material={MAT.breakerOn}>
                <boxGeometry args={[0.02, 0.025, 0.01]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}

      {/* === COPPER BUS BARS (visible between breaker rows) === */}
      {[0.17, 0.02, -0.13].map((y, i) => (
        <mesh key={i} position={[0, y, 0.04]} material={MAT.copper}>
          <boxGeometry args={[0.48, 0.008, 0.005]} />
        </mesh>
      ))}

      {/* === GROUNDING BAR (bottom) === */}
      <mesh position={[0, -0.32, 0.05]} material={MAT.copper}>
        <boxGeometry args={[0.4, 0.01, 0.01]} />
      </mesh>
      {/* Ground wire lugs */}
      {[-0.15, -0.05, 0.05, 0.15].map((x, i) => (
        <mesh key={i} position={[x, -0.32, 0.06]} material={MAT.copper}>
          <cylinderGeometry args={[0.005, 0.005, 0.015, 6]} />
        </mesh>
      ))}

      {/* === STATUS INDICATORS === */}
      <mesh name="breaker_led_power" position={[0.2, 0.35, 0.08]} material={MAT.ledGreen}>
        <cylinderGeometry args={[0.008, 0.008, 0.01, 8]} />
      </mesh>
      <mesh name="breaker_led_fault" position={[0.2, 0.32, 0.08]} material={MAT.ledRed}>
        <cylinderGeometry args={[0.008, 0.008, 0.01, 8]} />
      </mesh>

      {/* === WARNING LABELS === */}
      {/* "DANGER - HIGH VOLTAGE" */}
      <mesh position={[0, -0.38, 0.092]} material={MAT.labelDanger}>
        <boxGeometry args={[0.3, 0.04, 0.002]} />
      </mesh>
      {/* "MAIN POWER" label */}
      <mesh position={[0, 0.38, 0.092]} material={MAT.label}>
        <boxGeometry args={[0.2, 0.03, 0.002]} />
      </mesh>

      {/* === CONDUIT ENTRY (top) === */}
      <mesh position={[0, 0.47, 0]} material={MAT.enclosure}>
        <cylinderGeometry args={[0.03, 0.03, 0.04, 8]} />
      </mesh>
      <mesh position={[-0.15, 0.47, 0]} material={MAT.enclosure}>
        <cylinderGeometry args={[0.02, 0.02, 0.04, 8]} />
      </mesh>
    </group>
  )
}
