'use client'

import { GameCanvas } from '@/components/GameCanvas'
import { Crosshair } from '@/components/ui/Crosshair'
import { PauseMenu } from '@/components/ui/PauseMenu'

export default function Home() {
  return (
    <main>
      <GameCanvas />
      <Crosshair />
      <PauseMenu />
    </main>
  )
}
