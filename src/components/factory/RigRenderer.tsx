'use client'

/**
 * RigRenderer — spawns whichever equipment rig the current scenario declares.
 *
 * The warehouse shell (floor, walls, columns, lighting, office, ceiling services)
 * is permanent and lives in GameCanvas. The *machinery* is not: only one rig is
 * mounted at a time, chosen by `activeRig`, which the scenario loader sets from
 * the scenario's `rig` field.
 *
 * Both rigs are behind `lazy()` deliberately. Station components call
 * `useGLTF.preload(...)` at module scope, so a plain import would fetch every
 * GLB the moment this file loads — about 750 KB for a line no scenario currently
 * spawns. Lazy boundaries mean a silo job downloads only the silo.
 *
 * Every rig sits centred on the main production bay at z = -4, where the MPS line
 * used to stand, so the warehouse reads the same whichever job is loaded.
 */

import { lazy, Suspense } from 'react'
import { useGameStore } from '@/stores/gameStore'

const MpsLineRig = lazy(() => import('@/components/factory/MpsLineRig'))
const SiloCellRig = lazy(() => import('@/components/factory/SiloCellRig'))

export function RigRenderer() {
  const rig = useGameStore((s) => s.activeRig)

  if (rig === 'none') return null

  return (
    <Suspense fallback={null}>
      {rig === 'mps_line' && <MpsLineRig />}
      {rig === 'silo_cell' && <SiloCellRig />}
    </Suspense>
  )
}
