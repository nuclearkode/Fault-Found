'use client'

import { useGameStore } from '@/stores/gameStore'
import { useUiFocus } from '@/stores/worldClock'

/** Interactable: warmer, brighter, slightly larger, with the target's name. */
const HOT = 'rgba(255, 168, 76, 0.95)'
const COLD = 'rgba(255, 255, 255, 0.6)'

export function Crosshair() {
  // The crosshair belongs to the locked world view and nowhere else — it is
  // meaningless over the laptop, the manual, a menu or the debrief.
  const focus = useUiFocus()
  // `hoveredInteractable` was previously write-only — nothing rendered it, so the
  // player had no way to tell what could be actioned. This is the whole affordance.
  const hovered = useGameStore(s => s.hoveredInteractable)

  if (focus !== 'world') return null

  const active = hovered !== null
  const arm = active ? 26 : 20
  const colour = active ? HOT : COLD

  return (
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none', zIndex: 10,
    }}>
      <div style={{
        position: 'absolute', width: `${arm}px`, height: '2px',
        background: colour,
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        boxShadow: '0 0 4px rgba(0, 0, 0, 0.8)',
        transition: 'width 90ms ease, background 90ms ease',
      }} />
      <div style={{
        position: 'absolute', width: '2px', height: `${arm}px`,
        background: colour,
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        boxShadow: '0 0 4px rgba(0, 0, 0, 0.8)',
        transition: 'height 90ms ease, background 90ms ease',
      }} />
      <div style={{
        position: 'absolute', width: active ? '5px' : '3px',
        height: active ? '5px' : '3px', borderRadius: '50%',
        background: 'rgba(255, 107, 53, 0.9)',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        transition: 'width 90ms ease, height 90ms ease',
      }} />
      {active && (
        <div style={{
          position: 'absolute', top: '26px', left: '50%',
          transform: 'translateX(-50%)', whiteSpace: 'nowrap',
          font: '500 12px/1 ui-monospace, monospace', letterSpacing: '0.08em',
          color: HOT, textShadow: '0 0 6px rgba(0, 0, 0, 0.9)',
        }}>
          {hovered}
        </div>
      )}
    </div>
  )
}
