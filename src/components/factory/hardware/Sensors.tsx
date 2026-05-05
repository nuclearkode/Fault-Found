import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

/**
 * Standard materials for sensors
 */
const MAT = {
  body: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.5, metalness: 0.4 }), // Dark grey plastic
  metalThread: new THREE.MeshStandardMaterial({ color: '#a0aab0', roughness: 0.3, metalness: 0.8 }), // Threaded barrel
  opticalLens: new THREE.MeshStandardMaterial({ color: '#cc1111', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.8 }), // Red laser/LED lens
  inductiveFace: new THREE.MeshStandardMaterial({ color: '#2563eb', roughness: 0.6, metalness: 0.1 }), // Blue sensing face
  cable: new THREE.MeshStandardMaterial({ color: '#444444', roughness: 0.8, metalness: 0 }), // Grey wire
  ledOn: new THREE.MeshBasicMaterial({ color: '#ffaa00' }), // Yellow active LED
  ledOff: new THREE.MeshStandardMaterial({ color: '#222', roughness: 0.5 }), // Dark LED
}

interface SensorProps {
  id?: string // PLC Tag ID (e.g. "I0.0")
  position?: [number, number, number]
  rotation?: [number, number, number]
  active?: boolean // Force active state for visuals, or read from store if id is provided
}

export function OpticalSensor({ id, position, rotation, active = false }: SensorProps) {
  // If id is provided, read the live PLC state from the store
  const liveActive = useGameStore(s => (id ? Boolean(s.tags[id]?.value) : active))

  return (
    <group position={position} rotation={rotation}>
      {/* Rectangular body for optical sensors */}
      <mesh material={MAT.body} castShadow>
        <boxGeometry args={[0.015, 0.03, 0.015]} />
      </mesh>
      {/* Red lens on the front (assuming facing Z+) */}
      <mesh position={[0, 0, 0.008]} material={MAT.opticalLens}>
        <boxGeometry args={[0.01, 0.02, 0.002]} />
      </mesh>
      {/* Status LED on top */}
      <mesh position={[0, 0.015, 0]} material={liveActive ? MAT.ledOn : MAT.ledOff}>
        <cylinderGeometry args={[0.003, 0.003, 0.002, 8]} />
      </mesh>
      {/* Cable exiting back */}
      <mesh position={[0, 0, -0.01]} rotation={[Math.PI / 2, 0, 0]} material={MAT.cable}>
        <cylinderGeometry args={[0.002, 0.002, 0.02, 8]} />
      </mesh>
    </group>
  )
}

export function InductiveSensor({ id, position, rotation, active = false }: SensorProps) {
  const liveActive = useGameStore(s => (id ? Boolean(s.tags[id]?.value) : active))

  return (
    <group position={position} rotation={rotation}>
      {/* Threaded cylindrical barrel */}
      <mesh rotation={[Math.PI / 2, 0, 0]} material={MAT.metalThread} castShadow>
        <cylinderGeometry args={[0.006, 0.006, 0.04, 12]} />
      </mesh>
      {/* Blue sensing face on front (Z+) */}
      <mesh position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]} material={MAT.inductiveFace}>
        <cylinderGeometry args={[0.005, 0.005, 0.002, 12]} />
      </mesh>
      {/* Status LED ring at the back */}
      <mesh position={[0, 0, -0.018]} rotation={[Math.PI / 2, 0, 0]} material={liveActive ? MAT.ledOn : MAT.ledOff}>
        <cylinderGeometry args={[0.0065, 0.0065, 0.004, 12]} />
      </mesh>
      {/* Cable exiting back */}
      <mesh position={[0, 0, -0.025]} rotation={[Math.PI / 2, 0, 0]} material={MAT.cable}>
        <cylinderGeometry args={[0.002, 0.002, 0.02, 8]} />
      </mesh>
    </group>
  )
}
