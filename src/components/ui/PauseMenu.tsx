'use client'

/**
 * PauseMenu — ESC-accessible settings overlay.
 *
 * Two views:
 *   - Main: "Resume", "Settings", "Quit"
 *   - Settings: Graphics + Controls + Audio sliders
 *
 * Non-scrollable — all content fits in viewport.
 * Styled with the FAULT//FOUND brand (red // slashes).
 * Has a backdrop that strictly blocks all pointer events from reaching the game.
 */

import { useEffect, useCallback, useRef, useState } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (val: number) => void
  displayValue?: string
}

function Slider({ label, value, min, max, step, onChange, displayValue }: SliderProps) {
  return (
    <div style={{ marginBottom: '0.8rem' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem',
        fontSize: '0.75rem', color: '#b0b8c4',
      }}>
        <span>{label}</span>
        <span style={{ color: '#e63946', fontFamily: '"JetBrains Mono", monospace' }}>
          {displayValue ?? value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%',
          height: '4px',
          appearance: 'none',
          background: `linear-gradient(to right, #e63946 0%, #e63946 ${((value - min) / (max - min)) * 100}%, #2a2a3a ${((value - min) / (max - min)) * 100}%, #2a2a3a 100%)`,
          borderRadius: '2px',
          outline: 'none',
          cursor: 'pointer',
        }}
      />
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.65rem',
      fontWeight: 600,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.15em',
      color: '#e63946',
      marginBottom: '0.6rem',
      marginTop: '0.2rem',
      borderBottom: '1px solid rgba(230, 57, 70, 0.2)',
      paddingBottom: '0.3rem',
    }}>
      {children}
    </div>
  )
}

export function PauseMenu() {
  const isPaused = useSettingsStore(s => s.isPaused)
  const setPaused = useSettingsStore(s => s.setPaused)
  const setNeedsClick = useSettingsStore(s => s.setNeedsClick)
  const brightness = useSettingsStore(s => s.brightness)
  const setBrightness = useSettingsStore(s => s.setBrightness)
  const fogDensity = useSettingsStore(s => s.fogDensity)
  const setFogDensity = useSettingsStore(s => s.setFogDensity)
  const masterVolume = useSettingsStore(s => s.masterVolume)
  const setMasterVolume = useSettingsStore(s => s.setMasterVolume)
  const sfxVolume = useSettingsStore(s => s.sfxVolume)
  const setSfxVolume = useSettingsStore(s => s.setSfxVolume)
  const voiceVolume = useSettingsStore(s => s.voiceVolume)
  const setVoiceVolume = useSettingsStore(s => s.setVoiceVolume)
  const musicVolume = useSettingsStore(s => s.musicVolume)
  const setMusicVolume = useSettingsStore(s => s.setMusicVolume)
  const mouseSensitivity = useSettingsStore(s => s.mouseSensitivity)
  const setMouseSensitivity = useSettingsStore(s => s.setMouseSensitivity)
  const qualityOverride = useSettingsStore(s => s.qualityOverride)
  const setQualityOverride = useSettingsStore(s => s.setQualityOverride)

  const [view, setView] = useState<'main' | 'settings'>('main')

  // Debounce ESC — browser fires ESC for pointer lock release,
  // then our handler fires again. Guard with a cooldown ref.
  const escCooldown = useRef(false)

  // Reset to main view when menu opens
  useEffect(() => {
    if (isPaused) {
      setView('main')
    }
  }, [isPaused])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && isPaused) {
        e.preventDefault()
        e.stopPropagation()
        
        if (view === 'settings') {
          // If in settings, go back to main menu
          setView('main')
        } else {
          // If in main menu, exit pause menu
          setPaused(false)
          // Note: We DO NOT requestPointerLock here because the browser natively
          // blocks programmatic pointer locks triggered by the Escape key.
          // The user will just be returned to the game and can click the screen
          // anywhere to re-engage the pointer lock.
        }
      }
    }
    document.addEventListener('keydown', onKeyDown, true) // capture phase
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [isPaused, view, setPaused])

  const handleResume = useCallback(() => {
    setPaused(false)
    useSettingsStore.getState().requestPointerLock()
  }, [setPaused])

  const handleQuit = () => {
    window.location.reload()
  }

  if (!isPaused) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(5, 5, 8, 0.85)',
        backdropFilter: 'blur(8px)',
        // Force block all mouse events from passing through to the canvas
        pointerEvents: 'auto',
      }}
      // CRITICAL: Stop ALL pointer events from reaching the canvas behind.
      // Without this, clicking sliders causes PointerLockControls to re-lock.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{
        width: view === 'main' ? '400px' : '680px',
        transition: 'width 0.2s ease',
        background: 'linear-gradient(180deg, #16181e 0%, #1a1c24 100%)',
        border: '1px solid rgba(230, 57, 70, 0.15)',
        borderRadius: '8px',
        padding: '1.5rem 2rem',
        fontFamily: '"Inter", sans-serif',
        color: '#d0d4dc',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(230, 57, 70, 0.05)',
      }}>
        {/* Header with logo */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '1.5rem', paddingBottom: '0.8rem',
          borderBottom: '1px solid rgba(230, 57, 70, 0.1)',
        }}>
          <div style={{
            fontSize: '1.4rem', fontWeight: 700,
            fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: '0.1em',
          }}>
            <span style={{ color: '#e8e4e0' }}>FAULT</span>
            <span style={{ color: '#e63946' }}>//</span>
            <span style={{ color: '#e8e4e0' }}>FOUND</span>
          </div>
          {view === 'settings' ? (
            <button
              onClick={() => setView('main')}
              style={{
                background: 'rgba(230, 57, 70, 0.1)', border: '1px solid rgba(230, 57, 70, 0.3)',
                color: '#e63946', fontSize: '0.7rem', padding: '0.3rem 0.6rem',
                borderRadius: '4px', cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace',
                fontWeight: 600, letterSpacing: '0.05em'
              }}
            >
              BACK
            </button>
          ) : (
            <div style={{
              fontSize: '0.6rem', opacity: 0.35,
              fontFamily: '"JetBrains Mono", monospace',
              letterSpacing: '0.1em',
            }}>
              ESC TO RESUME
            </div>
          )}
        </div>

        {view === 'main' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <button
              onClick={handleResume}
              style={{
                background: '#e63946', color: '#fff', border: 'none', padding: '0.9rem',
                fontSize: '0.9rem', fontWeight: 600, letterSpacing: '0.1em', borderRadius: '4px',
                cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace',
                textTransform: 'uppercase', width: '100%',
                boxShadow: '0 4px 14px rgba(230, 57, 70, 0.2)'
              }}
            >
              Resume Game
            </button>
            <button
              onClick={() => setView('settings')}
              style={{
                background: 'rgba(255, 255, 255, 0.03)', color: '#d0d4dc', border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '0.9rem', fontSize: '0.85rem', fontWeight: 500, letterSpacing: '0.1em', borderRadius: '4px',
                cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace',
                textTransform: 'uppercase', width: '100%'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'}
            >
              Settings
            </button>
            <button
              onClick={handleQuit}
              style={{
                background: 'rgba(0, 0, 0, 0.3)', color: '#8890a0', border: '1px solid rgba(255, 255, 255, 0.05)',
                padding: '0.9rem', fontSize: '0.85rem', fontWeight: 500, letterSpacing: '0.1em', borderRadius: '4px',
                cursor: 'pointer', fontFamily: '"JetBrains Mono", monospace',
                textTransform: 'uppercase', width: '100%', marginTop: '0.5rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(230, 57, 70, 0.15)'
                e.currentTarget.style.color = '#e63946'
                e.currentTarget.style.borderColor = 'rgba(230, 57, 70, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0, 0, 0, 0.3)'
                e.currentTarget.style.color = '#8890a0'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'
              }}
            >
              Quit to Main Menu
            </button>
          </div>
        )}

        {view === 'settings' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1.5rem',
          }}>
            {/* ═══ LEFT COLUMN: Graphics + Controls ═══ */}
            <div>
              <SectionTitle>⚡ Graphics</SectionTitle>

              <div style={{ marginBottom: '0.8rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#b0b8c4', marginBottom: '0.35rem' }}>Quality Preset</div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  {(['auto', 'low', 'medium', 'high'] as const).map((q) => (
                    <button
                      key={q}
                      onClick={() => setQualityOverride(q)}
                      style={{
                        flex: 1,
                        padding: '0.35rem 0',
                        background: qualityOverride === q ? 'rgba(230, 57, 70, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: qualityOverride === q ? '1px solid #e63946' : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '4px',
                        color: qualityOverride === q ? '#e63946' : '#8890a0',
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textTransform: 'uppercase' as const,
                        fontFamily: '"JetBrains Mono", monospace',
                      }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              <Slider
                label="Environment Brightness" value={brightness} min={0.5} max={1.5} step={0.1} onChange={setBrightness}
              />
              <Slider
                label="Atmospheric Density" value={fogDensity} min={0.01} max={0.08} step={0.01} onChange={setFogDensity}
              />

              <div style={{ marginTop: '1.5rem' }}>
                <SectionTitle>⌨️ Controls</SectionTitle>
                <Slider
                  label="Mouse Sensitivity" value={mouseSensitivity} min={0.1} max={2.0} step={0.1} onChange={setMouseSensitivity} displayValue={`${(mouseSensitivity * 100).toFixed(0)}%`}
                />
              </div>
            </div>

            {/* ═══ RIGHT COLUMN: Audio + Actions ═══ */}
            <div>
              <SectionTitle>🔊 Audio</SectionTitle>
              <Slider label="Master Volume" value={masterVolume} min={0} max={1} step={0.05} onChange={setMasterVolume} displayValue={`${(masterVolume * 100).toFixed(0)}%`} />
              <Slider label="Sound Effects" value={sfxVolume} min={0} max={1} step={0.05} onChange={setSfxVolume} displayValue={`${(sfxVolume * 100).toFixed(0)}%`} />
              <Slider label="Voice Communications" value={voiceVolume} min={0} max={1} step={0.05} onChange={setVoiceVolume} displayValue={`${(voiceVolume * 100).toFixed(0)}%`} />
              <Slider label="Music" value={musicVolume} min={0} max={1} step={0.05} onChange={setMusicVolume} displayValue={`${(musicVolume * 100).toFixed(0)}%`} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
