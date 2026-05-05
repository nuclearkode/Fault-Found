'use client'

/**
 * Lighting — Realistic industrial factory lighting.
 *
 * Based on actual production floor lighting:
 * - Bright overhead fluorescents (4000K–5000K white)
 * - Light gray concrete reflects well
 * - Well-lit work areas with minimal shadows in aisles
 * - Brightness and fog controlled by settings store
 */

import type { GPUTier } from '@/utils/gpuCapabilities'
import { FACTORY } from './FactoryFloor'
import { useMemo } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'

interface LightingProps {
  tier: GPUTier
}

export function Lighting({ tier }: LightingProps) {
  const brightness = useSettingsStore(s => s.brightness)
  const fogDensity = useSettingsStore(s => s.fogDensity)

  // Position lights centred BETWEEN the east-west ceiling beams.
  // Beams are at Z = -7.5, -2.5, 2.5, 7.5 (every 5m starting at -7.5).
  // Midpoints between beam pairs: Z = -5, 0, 5
  // This creates 3 symmetrical rows of lights aligned with the structural grid.
  const tubeLights = useMemo(() => {
    const lights: [number, number, number][] = []
    const beamZPositions = [-7.5, -2.5, 2.5, 7.5]
    const midpoints: number[] = []
    for (let i = 0; i < beamZPositions.length - 1; i++) {
      midpoints.push((beamZPositions[i] + beamZPositions[i + 1]) / 2)
    }
    // X positions: evenly spaced every 5m, symmetrical around centre
    for (let x = -FACTORY.WIDTH / 2 + 5; x <= FACTORY.WIDTH / 2 - 5; x += 5) {
      for (const z of midpoints) {
        lights.push([x, FACTORY.HEIGHT - 0.3, z])
      }
    }
    return lights
  }, [])

  // Fog distance scales with density setting (0 = no fog, 1 = heavy fog)
  const fogNear = 10 + (1 - fogDensity) * 30
  const fogFar = 25 + (1 - fogDensity) * 60

  return (
    <group name="lighting">
      {/* Bright ambient — factories are well-lit */}
      <ambientLight intensity={0.5 * brightness} color="#e8e8f0" />

      {/* Hemisphere: white ceiling bounce + warm floor bounce */}
      <hemisphereLight
        color="#f0f0ff"
        groundColor="#c0b8a0"
        intensity={0.5 * brightness}
      />

      {/* Main overhead directional (simulating skylight / high bay) */}
      {tier !== 'low' && (
        <directionalLight
          position={[5, FACTORY.HEIGHT + 3, 3]}
          intensity={1.2 * brightness}
          color="#f5f0e8"
          castShadow
          shadow-mapSize-width={tier === 'high' ? 2048 : 1024}
          shadow-mapSize-height={tier === 'high' ? 2048 : 1024}
          shadow-camera-far={40}
          shadow-camera-near={0.1}
          shadow-camera-left={-18}
          shadow-camera-right={18}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
          shadow-bias={-0.0005}
        />
      )}

      {/* Fill from opposite side (prevents harsh single-direction shadows) */}
      {tier !== 'low' && (
        <directionalLight
          position={[-10, FACTORY.HEIGHT, -5]}
          intensity={0.4 * brightness}
          color="#e0e4f0"
        />
      )}

      {/* Low fill to reduce ground shadow darkness */}
      <directionalLight
        position={[0, 1, 0]}
        intensity={0.15 * brightness}
        color="#d8d0c0"
      />

      {/* Overhead fluorescent tubes — the main factory lighting */}
      {tier === 'high' && tubeLights.map((pos, i) => (
        <group key={i} position={pos}>
          <pointLight
            intensity={0.7 * brightness}
            color="#f8f4ec"
            distance={10}
            decay={2}
          />
          {/* Visible tube fixture (bright white emissive) */}
          <mesh name={`light_fixture_${i}`}>
            <boxGeometry args={[1.2, 0.04, 0.12]} />
            <meshStandardMaterial
              color="#f8f6f0"
              emissive="#f8f6f0"
              emissiveIntensity={2.0 * brightness}
              roughness={0.1}
            />
          </mesh>
          {/* Housing */}
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[1.3, 0.06, 0.2]} />
            <meshStandardMaterial color="#e0e0e0" roughness={0.5} metalness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Medium tier: fewer but brighter tubes */}
      {tier === 'medium' && tubeLights.filter((_, i) => i % 2 === 0).map((pos, i) => (
        <pointLight
          key={i}
          position={pos}
          intensity={0.9 * brightness}
          color="#f8f4ec"
          distance={14}
          decay={2}
        />
      ))}

      {/* Low tier: just boost ambient more */}
      {tier === 'low' && (
        <directionalLight
          position={[0, FACTORY.HEIGHT, 0]}
          intensity={0.8 * brightness}
          color="#f0ece0"
        />
      )}

      {/* Emergency exit light (red) */}
      <pointLight
        position={[3, FACTORY.HEIGHT - 0.5, -(FACTORY.DEPTH / 2 - 1)]}
        intensity={0.15}
        color="#ff2200"
        distance={5}
        decay={2}
      />

      {/* Fog — subtle industrial haze */}
      {fogDensity > 0.01 && (
        <fog attach="fog" args={['#d8dce6', fogNear, fogFar]} />
      )}
    </group>
  )
}
