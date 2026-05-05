'use client'

/**
 * StationRenderer — Reads the factory layout config and renders all stations.
 *
 * This is the single point of entry for all MPS stations in the scene.
 * Add it to GameCanvas.tsx as: <StationRenderer />
 *
 * To rearrange stations, edit src/config/factoryLayout.ts — no code changes needed.
 */

import { RigidBody } from '@react-three/rapier'
import { DEFAULT_LAYOUT, type StationPlacement } from '@/config/factoryLayout'

import { DistributingStation } from './DistributingStation'
import { MeasuringStation } from './MeasuringStation'
import { PickPlaceStation } from './PickPlaceStation'
import { SortingStation } from './SortingStation'
import { SeparatingStation } from './SeparatingStation'
import { JoiningStation } from './JoiningStation'
import { PackagingStation } from './PackagingStation'
import { StorageStation } from './StorageStation'
import { DistributingProStation } from './DistributingProStation'
import { AssemblyRobotStation } from './AssemblyRobotStation'

/**
 * Maps station type string to the correct React component.
 */
function StationByType({ type, stationId, label }: { type: string; stationId: string; label: string }) {
  switch (type) {
    case 'distributing':      return <DistributingStation stationId={stationId} label={label} />
    case 'measuring':         return <MeasuringStation stationId={stationId} label={label} />
    case 'pickplace':         return <PickPlaceStation stationId={stationId} label={label} />
    case 'sorting':           return <SortingStation stationId={stationId} label={label} />
    case 'separating':        return <SeparatingStation stationId={stationId} label={label} />
    case 'joining':           return <JoiningStation stationId={stationId} label={label} />
    case 'packaging':         return <PackagingStation stationId={stationId} label={label} />
    case 'storage':           return <StorageStation stationId={stationId} label={label} />
    case 'distributing_pro':  return <DistributingProStation stationId={stationId} label={label} />
    case 'assembly_robot':    return <AssemblyRobotStation stationId={stationId} label={label} />
    default:
      console.warn(`[StationRenderer] Unknown station type: ${type}`)
      return null
  }
}

export function StationRenderer() {
  const layout = DEFAULT_LAYOUT

  return (
    <group name="mps_stations">
      {layout.map((placement: StationPlacement) => (
        <RigidBody
          key={placement.id}
          type="fixed"
          colliders="cuboid"
          position={placement.position}
          rotation={[0, (placement.rotation * Math.PI) / 180, 0]}
        >
          {/* 1.5× scale — matches real Festo MPS D proportions relative to player height */}
          <group scale={1.5}>
            <StationByType
              type={placement.type}
              stationId={placement.id}
              label={placement.label}
            />
          </group>
        </RigidBody>
      ))}
    </group>
  )
}
