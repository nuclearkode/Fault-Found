'use client'

/**
 * MpsLineRig — the ten-station Festo MPS line, as a single lazy-loaded rig.
 *
 * This exists as its own module so `RigRenderer` can `React.lazy()` it. That
 * matters more than it looks: every station component calls
 * `useGLTF.preload(...)` at module scope, so merely *importing* them fetches all
 * ten GLBs (~750 KB) even when the branch never renders. Behind a lazy boundary
 * the module — and therefore the preloads — only load if a scenario actually
 * asks for this rig.
 *
 * Note: the eight main-line stations (ST10-ST80) currently have known mechanical
 * defects and no scenario spawns them. ST90/ST100 are sound.
 */

import { StationRenderer } from '@/components/factory/stations/StationRenderer'
import { NominalCycle } from '@/components/factory/NominalCycle'
import { DemoWorkpieces } from '@/components/factory/Workpiece'

export default function MpsLineRig() {
  return (
    <group name="rig_mps_line">
      {/* StationRenderer carries its own layout from src/config/factoryLayout.ts */}
      <StationRenderer />
      <NominalCycle />
      {/* Demo workpieces were placed against the station layout, so they belong
          to this rig — mounted in the warehouse they orphan into mid-air. */}
      <DemoWorkpieces />
    </group>
  )
}
