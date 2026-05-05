'use client'

/**
 * FactoryProps — Workbench, shelving, pipe runs, cable trays,
 * and miscellaneous factory set dressing.
 */

import { RigidBody } from '@react-three/rapier'
import { useMemo } from 'react'
import { FACTORY } from './FactoryFloor'

export function Workbench({ position = [-10, 0, 6] as [number, number, number] }) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <group name="workbench">
        {/* Table top */}
        <mesh name="workbench_top" position={[0, 0.9, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.06, 0.8]} />
          <meshStandardMaterial color="#5c4a3a" roughness={0.8} metalness={0.1} />
        </mesh>
        {/* Legs */}
        {[[-1.1, 0, -0.35], [-1.1, 0, 0.35], [1.1, 0, -0.35], [1.1, 0, 0.35]].map((p, i) => (
          <mesh key={i} name={`bench_leg_${i}`} position={[p[0], 0.45, p[2]]} castShadow>
            <boxGeometry args={[0.05, 0.9, 0.05]} />
            <meshStandardMaterial color="#4a4a50" roughness={0.5} metalness={0.6} />
          </mesh>
        ))}
        {/* Backboard / pegboard */}
        <mesh name="workbench_pegboard" position={[0, 1.5, -0.38]} castShadow>
          <boxGeometry args={[2.4, 1.2, 0.04]} />
          <meshStandardMaterial color="#6b6b5a" roughness={0.9} metalness={0.05} />
        </mesh>
        {/* Vise */}
        <mesh name="workbench_vise" position={[0.8, 0.98, 0]} castShadow>
          <boxGeometry args={[0.15, 0.12, 0.2]} />
          <meshStandardMaterial color="#4a5568" roughness={0.4} metalness={0.7} />
        </mesh>
      </group>
    </RigidBody>
  )
}

export function IndustrialShelving({ position = [13, 0, -5] as [number, number, number] }) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <group name="shelving">
        {/* Uprights */}
        {[-1.2, 1.2].map((x, i) => (
          <mesh key={i} name={`shelf_upright_${i}`} position={[x, 1.2, 0]} castShadow>
            <boxGeometry args={[0.05, 2.4, 0.5]} />
            <meshStandardMaterial color="#5a6370" roughness={0.4} metalness={0.7} />
          </mesh>
        ))}
        {/* Shelves (3 levels) */}
        {[0.5, 1.2, 1.9].map((y, i) => (
          <mesh key={i} name={`shelf_${i}`} position={[0, y, 0]} receiveShadow>
            <boxGeometry args={[2.5, 0.04, 0.5]} />
            <meshStandardMaterial color="#4a5060" roughness={0.5} metalness={0.5} />
          </mesh>
        ))}
        {/* Some boxes on shelves */}
        <mesh name="shelf_box_1" position={[-0.5, 0.62, 0]} castShadow>
          <boxGeometry args={[0.3, 0.2, 0.25]} />
          <meshStandardMaterial color="#8B6914" roughness={0.9} metalness={0} />
        </mesh>
        <mesh name="shelf_box_2" position={[0.3, 1.32, 0.05]} castShadow>
          <boxGeometry args={[0.4, 0.2, 0.3]} />
          <meshStandardMaterial color="#8B6914" roughness={0.9} metalness={0} />
        </mesh>
      </group>
    </RigidBody>
  )
}

export function CeilingPipes() {
  const pipes = useMemo(() => [
    { pos: [-8, FACTORY.HEIGHT - 0.5, 0] as [number, number, number], len: FACTORY.DEPTH - 1, axis: 'z' as const, r: 0.06, color: '#6b7280' },
    { pos: [-8.3, FACTORY.HEIGHT - 0.7, 0] as [number, number, number], len: FACTORY.DEPTH - 1, axis: 'z' as const, r: 0.04, color: '#d97706' },
    { pos: [8, FACTORY.HEIGHT - 0.5, 0] as [number, number, number], len: FACTORY.DEPTH - 1, axis: 'z' as const, r: 0.05, color: '#6b7280' },
    { pos: [0, FACTORY.HEIGHT - 0.4, -FACTORY.DEPTH / 2 + 1] as [number, number, number], len: FACTORY.WIDTH - 4, axis: 'x' as const, r: 0.07, color: '#4a5568' },
  ], [])

  return (
    <group name="ceiling_pipes">
      {pipes.map((pipe, i) => (
        <mesh
          key={i}
          name={`pipe_${i}`}
          position={pipe.pos}
          rotation={pipe.axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry args={[pipe.r, pipe.r, pipe.len, 12]} />
          <meshStandardMaterial color={pipe.color} roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
    </group>
  )
}

export function CableTray({ position = [4, FACTORY.HEIGHT - 0.8, 0] as [number, number, number] }) {
  return (
    <group name="cable_tray" position={position}>
      {/* Tray bottom */}
      <mesh name="tray_bottom" position={[0, 0, 0]}>
        <boxGeometry args={[0.4, 0.02, FACTORY.DEPTH - 2]} />
        <meshStandardMaterial color="#5a6370" roughness={0.5} metalness={0.6} />
      </mesh>
      {/* Tray sides */}
      {[-1, 1].map((s) => (
        <mesh key={s} name={`tray_side_${s}`} position={[s * 0.2, 0.04, 0]}>
          <boxGeometry args={[0.02, 0.08, FACTORY.DEPTH - 2]} />
          <meshStandardMaterial color="#5a6370" roughness={0.5} metalness={0.6} />
        </mesh>
      ))}
      {/* Cable bundles */}
      <mesh name="cables_bundle" position={[0, 0.04, 0]}>
        <boxGeometry args={[0.3, 0.06, FACTORY.DEPTH - 3]} />
        <meshStandardMaterial color="#1a1a2e" roughness={0.9} metalness={0} />
      </mesh>
    </group>
  )
}

export function MotorControlCenter({ position = [13, 0, 5] as [number, number, number] }) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <group name="mcc">
        {/* Main cabinet */}
        <mesh name="mcc_cabinet" position={[0, 1.2, 0]} castShadow receiveShadow>
          <boxGeometry args={[2, 2.4, 0.6]} />
          <meshStandardMaterial color="#3a4050" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Door panels (3 buckets) */}
        {[-0.65, 0, 0.65].map((x, i) => (
          <mesh key={i} name={`mcc_door_${i}`} position={[x, 1.2, 0.305]}>
            <boxGeometry args={[0.6, 2.3, 0.01]} />
            <meshStandardMaterial color="#4a5568" roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
        {/* Handle per door */}
        {[-0.65, 0, 0.65].map((x, i) => (
          <mesh key={i} name={`mcc_handle_${i}`} position={[x + 0.2, 1.2, 0.32]}>
            <boxGeometry args={[0.03, 0.12, 0.03]} />
            <meshStandardMaterial color="#9ca3af" roughness={0.3} metalness={0.8} />
          </mesh>
        ))}
        {/* Danger label */}
        <mesh name="mcc_danger_label" position={[0, 2.2, 0.31]}>
          <boxGeometry args={[0.6, 0.12, 0.005]} />
          <meshStandardMaterial color="#dc2626" roughness={0.5} emissive="#dc2626" emissiveIntensity={0.1} />
        </mesh>
      </group>
    </RigidBody>
  )
}
