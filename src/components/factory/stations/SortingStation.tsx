'use client'

/**
 * SortingStation — High-fidelity replica of Festo MPS Sorting Station.
 * Features: Conveyor, Entry Stopper, Overhanging Sensor Block,
 * 3 Deflector Cylinders, 3 Zig-Zag Chutes, Air Service Unit, I/O Terminal.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { StationBase } from './StationBase'
import { OpticalSensor, InductiveSensor } from '../hardware/Sensors'
import { ShortStrokeCylinder, ConveyorMotor, SolenoidValve } from '../hardware/Actuators'

const MAT = {
  profile: new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.3, metalness: 0.7 }),
  belt: new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9, metalness: 0.05 }),
  gateFlap: new THREE.MeshStandardMaterial({ color: '#d0d0d0', roughness: 0.4, metalness: 0.8 }),
  chute: new THREE.MeshStandardMaterial({ color: '#a0aab0', roughness: 0.4, metalness: 0.6 }),
  mount: new THREE.MeshStandardMaterial({ color: '#555e6b', roughness: 0.5, metalness: 0.6 }),
  regulatorBlue: new THREE.MeshStandardMaterial({ color: '#0055a4', roughness: 0.3, metalness: 0.2 }),
  gaugeWhite: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 }),
  ioBlock: new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.2, metalness: 0.1 }),
} as const

interface Props { stationId: string; label: string }

export function SortingStation({ stationId, label }: Props) {
  const gate1Ref = useRef<THREE.Group>(null)
  const gate2Ref = useRef<THREE.Group>(null)
  const gate3Ref = useRef<THREE.Group>(null)

  // Temporary animation logic (until linked to physics/Zustand)
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    const cycle = t % 6
    const gates = [gate1Ref, gate2Ref, gate3Ref]

    gates.forEach((ref, i) => {
      if (!ref.current) return
      const gateStart = i * 2
      const open = cycle > gateStart && cycle < gateStart + 1
      // Flap swings across the belt
      ref.current.rotation.y = open ? Math.PI * 0.25 : 0
    })
  })

  return (
    <StationBase stationId={stationId} label={label}>
      
      {/* ─── 1. CONVEYOR BELT & MOTOR ───────────────────────────────────── */}
      <group position={[0, 0, 0]}>
        {/* Belt */}
        <mesh position={[0, 0.015, 0]} material={MAT.belt} receiveShadow>
          <boxGeometry args={[0.7, 0.005, 0.04]} />
        </mesh>
        {/* Aluminium guide rails */}
        {([-1, 1] as const).map(s => (
          <mesh key={s} position={[0, 0.02, s * 0.025]} material={MAT.profile} castShadow>
            <boxGeometry args={[0.7, 0.015, 0.005]} />
          </mesh>
        ))}
        {/* Motor at the right end (+0.35) */}
        <ConveyorMotor id={`${stationId}_M1`} position={[0.35, 0.015, 0.04]} />
        {/* Idler roller at left end (-0.35) */}
        <mesh position={[-0.35, 0.015, 0]} rotation={[Math.PI / 2, 0, 0]} material={MAT.mount}>
          <cylinderGeometry args={[0.015, 0.015, 0.04, 12]} />
        </mesh>
      </group>

      {/* ─── 2. START MODULE (Stopper & Entry Sensor) ───────────────────── */}
      <group position={[-0.3, 0, 0]}>
        {/* Stopper Cylinder (blocks the belt) */}
        <ShortStrokeCylinder id={`${stationId}_Y1`} position={[0, 0.015, 0.035]} rotation={[0, -Math.PI / 2, 0]} />
        {/* Entry Sensor Bracket */}
        <mesh position={[-0.03, 0.05, -0.04]} material={MAT.mount} castShadow>
          <boxGeometry args={[0.01, 0.1, 0.01]} />
        </mesh>
        <OpticalSensor id={`${stationId}_B1`} position={[-0.03, 0.08, -0.03]} rotation={[0, 0, 0]} />
      </group>

      {/* ─── 3. OVERHANGING SENSOR BLOCK ────────────────────────────────── */}
      <group position={[-0.15, 0, -0.06]}>
        {/* Vertical post */}
        <mesh position={[0, 0.06, 0]} material={MAT.profile} castShadow>
          <boxGeometry args={[0.02, 0.12, 0.02]} />
        </mesh>
        {/* Horizontal overhang arm */}
        <mesh position={[0, 0.11, 0.04]} material={MAT.profile} castShadow>
          <boxGeometry args={[0.02, 0.02, 0.08]} />
        </mesh>
        {/* Sensor mounts */}
        <mesh position={[0, 0.08, 0.06]} material={MAT.mount}>
          <boxGeometry args={[0.04, 0.06, 0.03]} />
        </mesh>
        {/* Sensors looking down at the belt */}
        <OpticalSensor id={`${stationId}_B2`} position={[-0.01, 0.06, 0.06]} rotation={[Math.PI / 2, 0, 0]} />
        <InductiveSensor id={`${stationId}_B3`} position={[0.01, 0.06, 0.06]} rotation={[Math.PI / 2, 0, 0]} />
      </group>

      {/* ─── 4. DEFLECTORS & CHUTES ─────────────────────────────────────── */}
      {[
        { x: -0.05, ref: gate1Ref, id: `${stationId}_Y2` },
        { x: 0.1, ref: gate2Ref, id: `${stationId}_Y3` },
        { x: 0.25, ref: gate3Ref, id: `${stationId}_Y4` },
      ].map(({ x, ref, id }, i) => (
        <group key={i} position={[x, 0, 0.035]}>
          
          {/* Deflector Cylinder (pushing flap) */}
          <ShortStrokeCylinder id={id} position={[0, 0.025, 0.02]} rotation={[0, -Math.PI / 2, 0]} />
          
          {/* Swinging Flap (pushed by cylinder across the belt) */}
          <group ref={ref} position={[-0.015, 0.025, -0.01]}>
            <mesh position={[-0.03, 0, 0]} material={MAT.gateFlap} castShadow>
              <boxGeometry args={[0.06, 0.015, 0.005]} />
            </mesh>
          </group>

          {/* Zig-Zag Slide Chute (aluminium extrusions) */}
          <group position={[0, -0.02, 0.12]}>
            {/* Top ramp (steep) */}
            <mesh position={[0, 0, -0.03]} rotation={[0.4, 0, 0]} material={MAT.chute} castShadow>
              <boxGeometry args={[0.04, 0.005, 0.1]} />
            </mesh>
            {/* Middle catch (flat) */}
            <mesh position={[0, -0.02, 0.02]} rotation={[0, 0, 0]} material={MAT.chute} castShadow>
              <boxGeometry args={[0.04, 0.005, 0.02]} />
            </mesh>
            {/* Lower ramp (shallow) */}
            <mesh position={[0, -0.03, 0.08]} rotation={[0.2, 0, 0]} material={MAT.chute} castShadow>
              <boxGeometry args={[0.04, 0.005, 0.1]} />
            </mesh>
            {/* End stop */}
            <mesh position={[0, -0.03, 0.13]} rotation={[Math.PI / 2, 0, 0]} material={MAT.chute} castShadow>
              <boxGeometry args={[0.04, 0.005, 0.02]} />
            </mesh>
          </group>

        </group>
      ))}

      {/* ─── 5. AIR SERVICE UNIT (Pressure Regulator) ───────────────────── */}
      <group position={[-0.25, 0, -0.15]}>
        {/* Mounting post */}
        <mesh position={[0, 0.05, 0]} material={MAT.profile}>
          <boxGeometry args={[0.015, 0.1, 0.015]} />
        </mesh>
        {/* Regulator body */}
        <mesh position={[0, 0.1, 0]} material={MAT.mount}>
          <boxGeometry args={[0.03, 0.04, 0.03]} />
        </mesh>
        {/* Blue adjustment knob */}
        <mesh position={[0, 0.125, 0]} material={MAT.regulatorBlue}>
          <cylinderGeometry args={[0.01, 0.01, 0.015, 12]} />
        </mesh>
        {/* Pressure Gauge Dial */}
        <group position={[0, 0.1, 0.016]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={MAT.gaugeWhite}>
            <cylinderGeometry args={[0.012, 0.012, 0.002, 16]} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} material={MAT.mount}>
            <cylinderGeometry args={[0.014, 0.014, 0.001, 16]} />
          </mesh>
        </group>
      </group>

      {/* ─── 6. FESTO I/O TERMINAL BLOCK ────────────────────────────────── */}
      <group position={[0.15, 0.02, -0.15]}>
        {/* White SysLink block */}
        <mesh material={MAT.ioBlock} castShadow>
          <boxGeometry args={[0.1, 0.04, 0.06]} />
        </mesh>
        {/* Grey cable connectors */}
        {[-0.03, 0.03].map(x => (
          <mesh key={x} position={[x, 0.025, 0]} material={MAT.mount}>
            <boxGeometry args={[0.02, 0.01, 0.04]} />
          </mesh>
        ))}
      </group>

      {/* ─── 7. VALVE SLICE (Solenoids for the cylinders) ───────────────── */}
      <group position={[-0.05, 0.02, -0.15]}>
        {/* 4 Solenoid valves ganged together */}
        {[-0.03, -0.01, 0.01, 0.03].map((x, i) => (
          <SolenoidValve key={i} id={`${stationId}_V${i+1}`} position={[x, 0, 0]} />
        ))}
      </group>

    </StationBase>
  )
}
