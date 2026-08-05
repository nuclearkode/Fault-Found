'use client'

import { GameCanvas } from '@/components/GameCanvas'
import { Crosshair } from '@/components/ui/Crosshair'
import { PauseMenu } from '@/components/ui/PauseMenu'
import { GameOverScreen } from '@/components/ui/GameOverScreen'
import { JobComplete } from '@/components/ui/JobComplete'
import { Briefing } from '@/components/ui/Briefing'
import { PointerLockWarden } from '@/components/ui/PointerLockWarden'
import { Laptop } from '@/components/ui/laptop/Laptop'
import { ReferenceBook } from '@/components/ui/book/ReferenceBook'
import { FirstRunHints } from '@/components/ui/FirstRunHints'
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
      {/* [L] and [B]. Both self-gate on `overlay`, so mounting them here is the
          whole wiring — keymap.ts sets the focus and PointerLockWarden hands the
          cursor over. They sit under the pause menu and the debrief on purpose:
          those can legitimately open on top of an overlay, never the reverse. */}
      <Laptop />
      <ReferenceBook />
      {/* The [L] and [B] keys are only worth binding if somebody learns they
          exist. Self-gates on localStorage and on being on shift, so it is a
          first-visit-only card and never appears again. Above the overlays it
          advertises, below the menus. */}
      <FirstRunHints />
      <JobComplete />
      <PauseMenu />
      {/* Last in the stack — the debrief covers everything, crosshair included */}
      <GameOverScreen />
    </main>
  )
}
