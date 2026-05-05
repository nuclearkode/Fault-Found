'use client'

import { useSettingsStore } from '@/stores/settingsStore'

export function Crosshair() {
  const isPaused = useSettingsStore(s => s.isPaused)

  if (isPaused) return null

  return (
    <div style={{
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none', zIndex: 10,
    }}>
      <div style={{
        position: 'absolute', width: '20px', height: '2px',
        background: 'rgba(255, 255, 255, 0.6)',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        boxShadow: '0 0 4px rgba(0, 0, 0, 0.8)',
      }} />
      <div style={{
        position: 'absolute', width: '2px', height: '20px',
        background: 'rgba(255, 255, 255, 0.6)',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        boxShadow: '0 0 4px rgba(0, 0, 0, 0.8)',
      }} />
      <div style={{
        position: 'absolute', width: '3px', height: '3px', borderRadius: '50%',
        background: 'rgba(255, 107, 53, 0.9)',
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      }} />
    </div>
  )
}
