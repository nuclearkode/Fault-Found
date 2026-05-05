'use client'

/**
 * BoxRoom — The Phase 0 tech spike room.
 *
 * A simple concrete-walled room with floor and ceiling.
 * All surfaces have Rapier rigid bodies for collision.
 */

import { RigidBody } from '@react-three/rapier'

const ROOM_WIDTH = 10
const ROOM_DEPTH = 10
const ROOM_HEIGHT = 3.5
const WALL_THICKNESS = 0.2

// Industrial concrete color palette
const FLOOR_COLOR = '#2a2a2a'
const WALL_COLOR = '#3a3a3a'
const CEILING_COLOR = '#333333'

interface WallProps {
  position: [number, number, number]
  args: [number, number, number]
  color?: string
  name: string
}

function Wall({ position, args, color = WALL_COLOR, name }: WallProps) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={position}>
      <mesh name={name} receiveShadow>
        <boxGeometry args={args} />
        <meshStandardMaterial
          color={color}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>
    </RigidBody>
  )
}

export function BoxRoom() {
  return (
    <group name="box_room">
      {/* Floor */}
      <Wall
        name="floor"
        position={[0, -WALL_THICKNESS / 2, 0]}
        args={[ROOM_WIDTH, WALL_THICKNESS, ROOM_DEPTH]}
        color={FLOOR_COLOR}
      />

      {/* Ceiling */}
      <Wall
        name="ceiling"
        position={[0, ROOM_HEIGHT + WALL_THICKNESS / 2, 0]}
        args={[ROOM_WIDTH, WALL_THICKNESS, ROOM_DEPTH]}
        color={CEILING_COLOR}
      />

      {/* North wall (far, -Z) */}
      <Wall
        name="wall_north"
        position={[0, ROOM_HEIGHT / 2, -(ROOM_DEPTH / 2 + WALL_THICKNESS / 2)]}
        args={[ROOM_WIDTH + WALL_THICKNESS * 2, ROOM_HEIGHT, WALL_THICKNESS]}
      />

      {/* South wall (near, +Z) */}
      <Wall
        name="wall_south"
        position={[0, ROOM_HEIGHT / 2, ROOM_DEPTH / 2 + WALL_THICKNESS / 2]}
        args={[ROOM_WIDTH + WALL_THICKNESS * 2, ROOM_HEIGHT, WALL_THICKNESS]}
      />

      {/* West wall (-X) */}
      <Wall
        name="wall_west"
        position={[-(ROOM_WIDTH / 2 + WALL_THICKNESS / 2), ROOM_HEIGHT / 2, 0]}
        args={[WALL_THICKNESS, ROOM_HEIGHT, ROOM_DEPTH]}
      />

      {/* East wall (+X) */}
      <Wall
        name="wall_east"
        position={[ROOM_WIDTH / 2 + WALL_THICKNESS / 2, ROOM_HEIGHT / 2, 0]}
        args={[WALL_THICKNESS, ROOM_HEIGHT, ROOM_DEPTH]}
      />
    </group>
  )
}
