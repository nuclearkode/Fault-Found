'use client'

/**
 * Every non-movement key binding in the game, in one place.
 *
 * They live here rather than next to the UI that uses them because the pointer
 * is locked to the camera for most of the game: a button on screen is not
 * reachable with a cursor, so NEXT JOB and RETRY were unusable no matter how
 * clearly they were drawn. Anything the player can do needs a key, and a key
 * map spread across five components is a key map with conflicts in it.
 *
 * Dispatch is on UiFocus, so the same physical key can mean different things in
 * different states without any component having to know about the others.
 */

import { useEffect } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { uiFocus } from '@/stores/worldClock'
import { nextScenarioId, SCENARIO_ORDER } from '@/hooks/useScenarioLoader'

export const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  interact: ['KeyE'],
  laptop: ['KeyL'],
  book: ['KeyB'],
  pause: ['Escape'],
  confirm: ['Enter', 'NumpadEnter'],
  next: ['KeyN'],
  retry: ['KeyR'],
} as const

/**
 * Queue a scenario and roll a fresh run.
 *
 * One implementation, shared by JobComplete's buttons and by the [N]/[R] keys,
 * so the two can never do subtly different things.
 */
export function startJob(id: string) {
  const s = useSettingsStore.getState()
  s.setOverlay('none')
  s.setNeedsClick(false)
  const g = useGameStore.getState()
  g.setQueuedScenario(id)
  // resetRun sets phase 'menu', so focus becomes 'title' and the pointer-lock
  // release that follows is a no-op rather than a pause.
  g.resetRun()
}

export function useKeymap() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      // Never steal a key from a real text field — the ladder editor has them.
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return

      const s = useSettingsStore.getState()
      const g = useGameStore.getState()
      const focus = uiFocus()

      // A won run is still a run you are standing in, and the banner advertises
      // [N] and [R] — so they work from wherever that banner is visible, which
      // includes with the laptop or the pause menu open on top of it.
      if (g.outcome === 'won' && focus !== 'title' && focus !== 'debrief') {
        if (e.code === 'KeyN') {
          return startJob(nextScenarioId(g.scenarioId) ?? SCENARIO_ORDER[0])
        }
        if (e.code === 'KeyR' && g.scenarioId) return startJob(g.scenarioId)
      }

      switch (focus) {
        case 'world':
          if (g.phase !== 'active') return
          if (e.code === 'KeyL') return s.openOverlay('laptop')
          if (e.code === 'KeyB') return s.openOverlay('book')
          // Escape is deliberately NOT handled here. The browser drops the lock
          // before any listener runs and it cannot be preventDefault()ed, so
          // drei reports an unlock regardless and handleUnlock opens the menu.
          // Handling it here as well opens it twice and makes closing a race.
          return

        case 'laptop':
          if (e.code === 'Escape') return s.closeOverlay(false)
          if (e.code === 'KeyL') return s.closeOverlay(true)
          return

        case 'book':
          if (e.code === 'Escape') return s.closeOverlay(false)
          if (e.code === 'KeyB') return s.closeOverlay(true)
          return

        case 'pause':
          if (e.code !== 'Escape') return
          if (s.pauseView === 'settings') return s.setPauseView('main')
          return s.closeOverlay(false)

        case 'briefing':
          if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return
          g.startTimer(g.timeLimit)
          g.setPhase('active')
          // A keydown carries transient activation, so this lock request is
          // allowed where one made from an effect would be refused.
          s.requestPointerLock()
          return

        case 'debrief':
          if (e.code === 'KeyR' && g.scenarioId) return startJob(g.scenarioId)
          if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            s.setStarted(false)
            g.resetRun()
          }
          return

        default:
          return   // title and cinematic have nothing bound
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Mountable form, for page.tsx. */
export function Keymap() {
  useKeymap()
  return null
}
