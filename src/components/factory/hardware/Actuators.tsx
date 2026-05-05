import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

const MAT = {
  cylinderBody: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.8 }), // Aluminium cylinder
  rod: new THREE.MeshStandardMaterial({ color: '#e0e0e0', roughness: 0.2, metalness: 0.9 }), // Steel piston rod
  valveBody: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.4, metalness: 0.2 }), // Blue solenoid valve
  motorHousing: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.7, metalness: 0.3 }), // Black motor
  mount: new THREE.MeshStandardMaterial({ color: '#555e6b', roughness: 0.5, metalness: 0.6 }), // Steel bracket
}

interface ActuatorProps {
  id?: string // PLC Tag ID (e.g. "Q0.0")
  position?: [number, number, number]
  rotation?: [number, number, number]
  active?: boolean
  strokeLength?: number // For cylinders
}

export function ShortStrokeCylinder({ id, position, rotation, active = false, strokeLength = 0.04 }: ActuatorProps) {
  const liveActive = useGameStore(s => (id ? Boolean(s.tags[id]?.value) : active))
  
  // Extension value: 0 to strokeLength based on active state. 
  // In a real physics setup, this would be animated/lerped. 
  // For now, it's instant or tied to the game loop elsewhere, but visually we just jump.
  const ext = liveActive ? strokeLength : 0

  return (
    <group position={position} rotation={rotation}>
      {/* Cylinder body */}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={MAT.cylinderBody} castShadow>
        <cylinderGeometry args={[0.015, 0.015, 0.05, 12]} />
      </mesh>
      {/* Piston rod (extends along Z+) */}
      <mesh position={[0, 0, 0.025 + ext / 2]} rotation={[Math.PI / 2, 0, 0]} material={MAT.rod} castShadow>
        <cylinderGeometry args={[0.004, 0.004, ext, 8]} />
      </mesh>
      {/* Rod end / mounting piece */}
      <mesh position={[0, 0, 0.025 + ext]} material={MAT.mount} castShadow>
        <boxGeometry args={[0.01, 0.015, 0.01]} />
      </mesh>
    </group>
  )
}

export function SolenoidValve({ id, position, rotation, active = false }: ActuatorProps) {
  const liveActive = useGameStore(s => (id ? Boolean(s.tags[id]?.value) : active))

  return (
    <group position={position} rotation={rotation}>
      {/* Valve slice base */}
      <mesh material={MAT.valveBody} castShadow>
        <boxGeometry args={[0.015, 0.04, 0.06]} />
      </mesh>
      {/* Solenoid coil block */}
      <mesh position={[0, 0.025, 0.02]} material={MAT.motorHousing}>
        <boxGeometry args={[0.015, 0.02, 0.02]} />
      </mesh>
      {/* LED indicator */}
      <mesh position={[0, 0.036, 0.02]} material={liveActive ? new THREE.MeshBasicMaterial({ color: '#ffaa00' }) : new THREE.MeshStandardMaterial({ color: '#222' })}>
        <boxGeometry args={[0.004, 0.002, 0.004]} />
      </mesh>
    </group>
  )
}

export function ConveyorMotor({ id, position, rotation, active = false }: ActuatorProps) {
  // Motor doesn't physically move its own geometry, but represents the drive unit
  return (
    <group position={position} rotation={rotation}>
      {/* Cylindrical motor housing */}
      <mesh rotation={[0, 0, Math.PI / 2]} material={MAT.motorHousing} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.08, 16]} />
      </mesh>
      {/* Gearbox/mount */}
      <mesh position={[0.045, 0, 0]} material={MAT.cylinderBody} castShadow>
        <boxGeometry args={[0.03, 0.05, 0.05]} />
      </mesh>
    </group>
  )
}
