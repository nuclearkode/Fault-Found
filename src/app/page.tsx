'use client'

import { GameCanvas } from '@/components/GameCanvas'
import { Crosshair } from '@/components/ui/Crosshair'
import { PauseMenu } from '@/components/ui/PauseMenu'
import { GameOverScreen } from '@/components/ui/GameOverScreen'
import { JobComplete } from '@/components/ui/JobComplete'
import { Briefing } from '@/components/ui/Briefing'
import { PointerLockWarden } from '@/components/ui/PointerLockWarden'
import { Keymap } from '@/input/keymap'

export default function Home() {
  return (
    <main>
      {/* The two things that own input, mounted once for the whole app. Both
          live outside the Canvas: anything inside it is a click-to-lock target
          for drei's PointerLockControls. */}
      <Keymap />
      <PointerLockWarden />
      <GameCanvas />
      <Crosshair />
      <Briefing />
      <JobComplete />
      <PauseMenu />
      {/* Last in the stack — the debrief covers everything, crosshair included */}
      <GameOverScreen />
    </main>
  )
}
