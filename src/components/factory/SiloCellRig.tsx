'use client'

/**
 * SiloCellRig — the LogixPro silo fill cell, as a lazy-loadable rig.
 *
 * Separate module for the same reason as MpsLineRig: `useGLTF.preload()` runs at
 * module scope, so this keeps silo_cell.glb out of the bundle graph until a
 * scenario actually asks for it.
 *
 * Placed centred on the main production bay, where the MPS line stands in the
 * other rig, so the warehouse reads the same whichever job is loaded.
 */

import { SiloCell } from '@/components/factory/SiloCell'

/** Centre of the production bay — every rig is placed here. */
const BAY: [number, number, number] = [0, 0, -4]

export default function SiloCellRig() {
  return (
    <group name="rig_silo_cell">
      <SiloCell position={BAY} rotation={0} />
    </group>
  )
}
