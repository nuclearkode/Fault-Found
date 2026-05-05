'use client'

/**
 * PauseMenu — ESC-accessible settings overlay.
 *
 * Two-column layout: Graphics + Controls on left, Audio + Actions on right.
 * Non-scrollable — all content fits in viewport.
 * Styled with the FAULT//FOUND brand (red // slashes).
 */

import { useEffect, useCallback, useRef } from 'react'
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

  // Debounce ESC — browser fires ESC for pointer lock release,
  // then our handler fires again. Guard with a cooldown ref.
  const escCooldown = useRef(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && isPaused && !escCooldown.current) {
        e.preventDefault()
        e.stopPropagation()
        escCooldown.current = true
        // Close the menu → show "click to resume" overlay
        setPaused(false)
        setNeedsClick(true)
        // Cooldown to ignore the duplicate ESC from pointer lock release
        setTimeout(() => { escCooldown.current = false }, 300)
      }
    }
    document.addEventListener('keydown', onKeyDown, true) // capture phase
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [isPaused, setPaused, setNeedsClick])

  const handleResume = useCallback(() => {
    setPaused(false)
    setNeedsClick(true)
  }, [setPaused, setNeedsClick])

  if (!isPaused) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(10, 10, 14, 0.8)',
        backdropFilter: 'blur(10px)',
      }}
      // CRITICAL: Stop ALL pointer events from reaching the canvas behind.
      // Without this, clicking sliders causes PointerLockControls to re-lock.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={{
        width: '680px',
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
          marginBottom: '1rem', paddingBottom: '0.8rem',
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
          <div style={{
            fontSize: '0.6rem', opacity: 0.35,
            fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: '0.1em',
          }}>
            ESC TO RESUME
          </div>
        </div>

        {/* Two-column layout */}
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
                      transition: 'all 0.15s',
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <Slider
              label="Brightness"
              value={brightness}
              min={0.3} max={2.0} step={0.05}
              onChange={setBrightness}
              displayValue={`${Math.round(brightness * 100)}%`}
            />
            <Slider
              label="Fog / Atmosphere"
              value={fogDensity}
              min={0} max={1} step={0.05}
              onChange={setFogDensity}
              displayValue={`${Math.round(fogDensity * 100)}%`}
            />

            <SectionTitle>🎯 Controls</SectionTitle>

            <Slider
              label="Mouse Sensitivity"
              value={mouseSensitivity}
              min={0.0005} max={0.005} step={0.0001}
              onChange={setMouseSensitivity}
              displayValue={`${(mouseSensitivity * 1000).toFixed(1)}`}
            />
          </div>

          {/* ═══ RIGHT COLUMN: Audio + Actions ═══ */}
          <div>
            <SectionTitle>🔊 Audio</SectionTitle>

            <Slider
              label="Master Volume"
              value={masterVolume}
              min={0} max={1} step={0.05}
              onChange={setMasterVolume}
              displayValue={`${Math.round(masterVolume * 100)}%`}
            />
            <Slider
              label="SFX"
              value={sfxVolume}
              min={0} max={1} step={0.05}
              onChange={setSfxVolume}
              displayValue={`${Math.round(sfxVolume * 100)}%`}
            />
            <Slider
              label="Voice (Derek)"
              value={voiceVolume}
              min={0} max={1} step={0.05}
              onChange={setVoiceVolume}
              displayValue={`${Math.round(voiceVolume * 100)}%`}
            />
            <Slider
              label="Music / Ambience"
              value={musicVolume}
              min={0} max={1} step={0.05}
              onChange={setMusicVolume}
              displayValue={`${Math.round(musicVolume * 100)}%`}
            />
          </div>
        </div>

        {/* Resume button — spans full width */}
        <button
          onClick={handleResume}
          style={{
            width: '100%',
            marginTop: '1.2rem',
            padding: '0.65rem',
            background: 'linear-gradient(135deg, rgba(230, 57, 70, 0.15), rgba(230, 57, 70, 0.05))',
            border: '1px solid rgba(230, 57, 70, 0.35)',
            borderRadius: '6px',
            color: '#e63946',
            fontSize: '0.85rem',
            fontWeight: 600,
            fontFamily: '"JetBrains Mono", monospace',
            cursor: 'pointer',
            transition: 'all 0.2s',
            letterSpacing: '0.1em',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(230, 57, 70, 0.25), rgba(230, 57, 70, 0.1))'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'linear-gradient(135deg, rgba(230, 57, 70, 0.15), rgba(230, 57, 70, 0.05))'
          }}
        >
          [ RESUME ]
        </button>
      </div>
    </div>
  )
}
