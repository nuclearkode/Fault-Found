'use client'

/**
 * Workpiece — The cylindrical part that flows through the production line.
 *
 * This is a STANDALONE entity, not embedded in any station.
 * It represents a real Festo MPS workpiece (coloured cylinder with bore hole).
 *
 * In Phase 3, workpieces will be spawned by the Distributing station,
 * picked up by grippers, measured, sorted, joined, packaged, and stored.
 * For now, they sit at demo positions to show scale and look.
 *
 * Real Festo workpiece: 40mm diameter × 22.5mm height, available in
 * red, black, and silver (aluminium).
 */

import * as THREE from 'three'

// ─── Workpiece materials (shared singletons) ─────────────────────────────────
export const WORKPIECE_MATS = {
  red: new THREE.MeshStandardMaterial({
    color: '#cc2222', roughness: 0.45, metalness: 0.1,
  }),
  black: new THREE.MeshStandardMaterial({
    color: '#222', roughness: 0.5, metalness: 0.15,
  }),
  silver: new THREE.MeshStandardMaterial({
    color: '#b0b0b0', roughness: 0.25, metalness: 0.8,
  }),
} as const

export type WorkpieceColour = keyof typeof WORKPIECE_MATS

interface WorkpieceProps {
  position?: [number, number, number]
  colour?: WorkpieceColour
  id?: string
}

/**
 * Single workpiece cylinder.
 * Dimensions match real Festo spec: ⌀40mm × 22.5mm (scaled to metres).
 */
export function Workpiece({ position = [0, 0, 0], colour = 'red', id }: WorkpieceProps) {
  const r = 0.02    // 20mm radius (40mm diameter)
  const h = 0.0225  // 22.5mm height

  return (
    <group name={id ?? `workpiece_${colour}`} position={position}>
      {/* Main body */}
      <mesh material={WORKPIECE_MATS[colour]} castShadow>
        <cylinderGeometry args={[r, r, h, 16]} />
      </mesh>
      {/* Centre bore hole (dark ring on top) */}
      <mesh position={[0, h / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.005, 0.012, 12]} />
        <meshStandardMaterial color="#111" roughness={0.8} metalness={0.1} />
      </mesh>
    </group>
  )
}

/**
 * Demo workpiece set — places a few workpieces around the factory
 * so the player can see them at proper scale.
 * Remove this once the real workpiece flow system is built.
 */
export function DemoWorkpieces() {
  return (
    <group name="demo_workpieces">
      {/* On the distributing station magazine area */}
      <Workpiece position={[-4.55, 1.3, -3.5]} colour="red" id="wp_demo_1" />
      <Workpiece position={[-4.55, 1.35, -3.5]} colour="red" id="wp_demo_2" />
      <Workpiece position={[-4.55, 1.4, -3.5]} colour="red" id="wp_demo_3" />

      {/* On the belt near sorting station */}
      <Workpiece position={[-0.65, 1.22, -3.6]} colour="black" id="wp_demo_4" />

      {/* On the storage station */}
      <Workpiece position={[4.55, 1.3, -3.8]} colour="silver" id="wp_demo_5" />

      {/* On the assembly robot fixture */}
      <Workpiece position={[2.5, 1.25, 3.2]} colour="red" id="wp_demo_6" />
    </group>
  )
}
