'use client'

/**
 * FactoryFloor — The main factory environment.
 *
 * 30m × 20m × 5m industrial space with:
 * - Concrete floor with epoxy coating
 * - Metal walls with corrugated panels
 * - Industrial ceiling with pipe runs
 * - Safety markings and zone borders
 */

import { RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useMemo } from 'react'

// Factory dimensions
export const FACTORY = {
  WIDTH: 30,
  DEPTH: 20,
  HEIGHT: 5,
  WALL: 0.3,
} as const

// Realistic production floor colors
const FLOOR_COLOR = '#8a8a8a'      // Light gray sealed concrete
const WALL_COLOR = '#b0aaa0'       // Off-white / beige painted CMU block
const CEILING_COLOR = '#9a9a9a'    // Light gray painted steel deck
const EPOXY_COLOR = '#7a8a70'      // Sage green epoxy (common in manufacturing)

interface WallSegmentProps {
  position: [number, number, number]
  args: [number, number, number]
  color?: string
  name: string
  metalness?: number
  roughness?: number
}

function WallSegment({
  position,
  args,
  color = WALL_COLOR,
  name,
  metalness = 0.3,
  roughness = 0.8,
}: WallSegmentProps) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <mesh name={name} receiveShadow castShadow>
        <boxGeometry args={args} />
        <meshStandardMaterial
          color={color}
          roughness={roughness}
          metalness={metalness}
        />
      </mesh>
    </RigidBody>
  )
}

function FloorMarkings() {
  // Safety yellow lines on the floor — organized around actual equipment
  const lines = useMemo(() => [
    // ── MAIN AISLES (yellow safety paint, 100mm wide) ──
    // Centre aisle (north-south, player's main walking path)
    { pos: [0, 0.005, 0] as [number, number, number], args: [0.1, 0.01, FACTORY.DEPTH] as [number, number, number], color: '#c4a818' },
    // East service aisle (access to PLC + MCC + shelving)
    { pos: [6, 0.005, 0] as [number, number, number], args: [0.1, 0.01, FACTORY.DEPTH] as [number, number, number], color: '#c4a818' },
    // West service aisle (access to breaker panel)
    { pos: [-6, 0.005, 0] as [number, number, number], args: [0.1, 0.01, FACTORY.DEPTH] as [number, number, number], color: '#c4a818' },

    // ── CROSS AISLES ──
    // Front of stations (operator walkway between main line and south area)
    { pos: [0, 0.005, -2] as [number, number, number], args: [FACTORY.WIDTH, 0.01, 0.1] as [number, number, number], color: '#c4a818' },
    // Between south stations and supervisor office
    { pos: [0, 0.005, 5] as [number, number, number], args: [FACTORY.WIDTH, 0.01, 0.1] as [number, number, number], color: '#c4a818' },

    // ── HAZARD BOUNDARIES (red) ──
    // Around breaker panel (west wall)
    { pos: [-13, 0.005, -5] as [number, number, number], args: [2, 0.01, 2] as [number, number, number], color: '#cc3333' },
    // Around MCC (east wall)
    { pos: [13, 0.005, -1] as [number, number, number], args: [2, 0.01, 2] as [number, number, number], color: '#cc3333' },
    // PLC panel clearance zone
    { pos: [8.5, 0.005, -8] as [number, number, number], args: [8, 0.01, 0.1] as [number, number, number], color: '#cc3333' },

    // ── STATION AREA BOUNDARIES (hatched marking — simplified as thin dashes) ──
    // Main production line footprint
    { pos: [-4.55, 0.005, -4] as [number, number, number], args: [0.06, 0.01, 2.5] as [number, number, number], color: '#888' },
    { pos: [4.55, 0.005, -4] as [number, number, number], args: [0.06, 0.01, 2.5] as [number, number, number], color: '#888' },
  ], [])

  return (
    <group name="floor_markings">
      {lines.map((line, i) => (
        <mesh key={i} name={`floor_line_${i}`} position={line.pos} receiveShadow>
          <boxGeometry args={line.args} />
          <meshStandardMaterial
            color={line.color}
            roughness={0.6}
            metalness={0.1}
            emissive={line.color}
            emissiveIntensity={0.05}
          />
        </mesh>
      ))}
    </group>
  )
}

function CeilingBeams() {
  const beams = useMemo(() => {
    const result: { pos: [number, number, number]; length: number; axis: 'x' | 'z' }[] = []
    // East-west I-beams every 5 meters
    for (let z = -FACTORY.DEPTH / 2 + 2.5; z <= FACTORY.DEPTH / 2; z += 5) {
      result.push({ pos: [0, FACTORY.HEIGHT - 0.15, z], length: FACTORY.WIDTH, axis: 'x' })
    }
    // North-south support beams on edges
    result.push({ pos: [-FACTORY.WIDTH / 2 + 2, FACTORY.HEIGHT - 0.15, 0], length: FACTORY.DEPTH, axis: 'z' })
    result.push({ pos: [FACTORY.WIDTH / 2 - 2, FACTORY.HEIGHT - 0.15, 0], length: FACTORY.DEPTH, axis: 'z' })
    return result
  }, [])

  return (
    <group name="ceiling_beams">
      {beams.map((beam, i) => (
        <mesh key={i} name={`ceiling_beam_${i}`} position={beam.pos} castShadow>
          <boxGeometry args={beam.axis === 'x'
            ? [beam.length, 0.3, 0.15]
            : [0.15, 0.3, beam.length]
          } />
          <meshStandardMaterial color="#5a5a60" roughness={0.4} metalness={0.7} />
        </mesh>
      ))}
    </group>
  )
}

function Columns() {
  const positions = useMemo(() => {
    const cols: [number, number, number][] = []
    // Support columns in a grid pattern
    for (const x of [-FACTORY.WIDTH / 2 + 2, FACTORY.WIDTH / 2 - 2]) {
      for (let z = -FACTORY.DEPTH / 2 + 2.5; z <= FACTORY.DEPTH / 2 - 2; z += 5) {
        cols.push([x, FACTORY.HEIGHT / 2, z])
      }
    }
    return cols
  }, [])

  return (
    // Single compound RigidBody — Rapier auto-merges all child cuboid colliders.
    // 8 separate physics bodies → 1 body with 8 sub-shapes.
    <RigidBody type="fixed" colliders="cuboid">
      <group name="columns">
        {positions.map((pos, i) => (
          <mesh key={i} name={`column_${i}`} position={pos} castShadow receiveShadow>
            <boxGeometry args={[0.3, FACTORY.HEIGHT, 0.3]} />
            <meshStandardMaterial color="#555560" roughness={0.5} metalness={0.6} />
          </mesh>
        ))}
      </group>
    </RigidBody>
  )
}

export function FactoryFloor() {
  return (
    <group name="factory_floor">
      {/* === FLOOR === */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, -FACTORY.WALL / 2, 0]}>
        <mesh name="floor" receiveShadow>
          <boxGeometry args={[FACTORY.WIDTH, FACTORY.WALL, FACTORY.DEPTH]} />
          <meshStandardMaterial
            color={FLOOR_COLOR}
            roughness={0.85}
            metalness={0.05}
          />
        </mesh>
      </RigidBody>

      {/* ── Epoxy-coated work zones ── */}
      {/* Production line zone — green epoxy strip under the main station line */}
      <mesh name="floor_zone_production" position={[0, 0.003, -4]} receiveShadow>
        <boxGeometry args={[12, 0.005, 3]} />
        <meshStandardMaterial color={EPOXY_COLOR} roughness={0.7} metalness={0.05} />
      </mesh>
      {/* Control corner — dark anti-static epoxy (PLC + MCC area, NE) */}
      <mesh name="floor_zone_control" position={[10, 0.003, -7.5]} receiveShadow>
        <boxGeometry args={[9, 0.005, 5]} />
        <meshStandardMaterial color="#3a3a4a" roughness={0.7} metalness={0.05} />
      </mesh>
      {/* Supervisor office zone — slightly different grey under the mezzanine */}
      <mesh name="floor_zone_office" position={[8, 0.003, 7]} receiveShadow>
        <boxGeometry args={[8, 0.005, 6]} />
        <meshStandardMaterial color="#555560" roughness={0.75} metalness={0.05} />
      </mesh>
      {/* South station zone — green epoxy under the standalone stations */}
      <mesh name="floor_zone_south" position={[0, 0.003, 3]} receiveShadow>
        <boxGeometry args={[8, 0.005, 3]} />
        <meshStandardMaterial color={EPOXY_COLOR} roughness={0.7} metalness={0.05} />
      </mesh>

      {/* === CEILING === */}
      <RigidBody type="fixed" colliders="cuboid" position={[0, FACTORY.HEIGHT + FACTORY.WALL / 2, 0]}>
        <mesh name="ceiling" receiveShadow>
          <boxGeometry args={[FACTORY.WIDTH, FACTORY.WALL, FACTORY.DEPTH]} />
          <meshStandardMaterial color={CEILING_COLOR} roughness={0.9} metalness={0.1} />
        </mesh>
      </RigidBody>

      {/* === WALLS === */}
      {/* North wall (PLC panels go here) */}
      <WallSegment
        name="wall_north"
        position={[0, FACTORY.HEIGHT / 2, -(FACTORY.DEPTH / 2 + FACTORY.WALL / 2)]}
        args={[FACTORY.WIDTH + FACTORY.WALL * 2, FACTORY.HEIGHT, FACTORY.WALL]}
        color="#404048"
      />
      {/* South wall (entry) */}
      <WallSegment
        name="wall_south"
        position={[0, FACTORY.HEIGHT / 2, FACTORY.DEPTH / 2 + FACTORY.WALL / 2]}
        args={[FACTORY.WIDTH + FACTORY.WALL * 2, FACTORY.HEIGHT, FACTORY.WALL]}
      />
      {/* West wall */}
      <WallSegment
        name="wall_west"
        position={[-(FACTORY.WIDTH / 2 + FACTORY.WALL / 2), FACTORY.HEIGHT / 2, 0]}
        args={[FACTORY.WALL, FACTORY.HEIGHT, FACTORY.DEPTH]}
      />
      {/* East wall */}
      <WallSegment
        name="wall_east"
        position={[FACTORY.WIDTH / 2 + FACTORY.WALL / 2, FACTORY.HEIGHT / 2, 0]}
        args={[FACTORY.WALL, FACTORY.HEIGHT, FACTORY.DEPTH]}
      />

      {/* === STRUCTURAL === */}
      <CeilingBeams />
      <Columns />
      <FloorMarkings />
    </group>
  )
}
