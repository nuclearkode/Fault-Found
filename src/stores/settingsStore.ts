import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { GPUTier } from '@/utils/gpuCapabilities'

interface SettingsState {
  // --- Graphics ---
  gpuTier: GPUTier
  setGpuTier: (tier: GPUTier) => void
  qualityOverride: GPUTier | 'auto'
  setQualityOverride: (override: GPUTier | 'auto') => void
  brightness: number  // 0.0–2.0 multiplier (1.0 = default)
  setBrightness: (val: number) => void
  fogDensity: number  // 0.0–1.0
  setFogDensity: (val: number) => void

  // --- Audio ---
  masterVolume: number
  setMasterVolume: (vol: number) => void
  sfxVolume: number
  setSfxVolume: (vol: number) => void
  voiceVolume: number
  setVoiceVolume: (vol: number) => void
  musicVolume: number
  setMusicVolume: (vol: number) => void

  // --- Controls ---
  mouseSensitivity: number
  setMouseSensitivity: (sens: number) => void
  invertY: boolean
  setInvertY: (invert: boolean) => void

  // --- UI ---
  isPaused: boolean
  setPaused: (paused: boolean) => void
  togglePause: () => void
  needsClick: boolean
  setNeedsClick: (v: boolean) => void

  // --- Game State ---
  started: boolean
  setStarted: (v: boolean) => void
  requestPointerLock: () => void
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set) => ({
    // --- Graphics ---
    gpuTier: 'high',
    setGpuTier: (tier) => set({ gpuTier: tier }),
    qualityOverride: 'auto',
    setQualityOverride: (override) => set({ qualityOverride: override }),
    brightness: 1.0,
    setBrightness: (val) => set({ brightness: Math.max(0.2, Math.min(2.0, val)) }),
    fogDensity: 0.5,
    setFogDensity: (val) => set({ fogDensity: Math.max(0, Math.min(1, val)) }),

    // --- Audio ---
    masterVolume: 0.8,
    setMasterVolume: (vol) => set({ masterVolume: vol }),
    sfxVolume: 0.7,
    setSfxVolume: (vol) => set({ sfxVolume: vol }),
    voiceVolume: 1.0,
    setVoiceVolume: (vol) => set({ voiceVolume: vol }),
    musicVolume: 0.5,
    setMusicVolume: (vol) => set({ musicVolume: vol }),

    // --- Controls ---
    mouseSensitivity: 0.002,
    setMouseSensitivity: (sens) => set({ mouseSensitivity: sens }),
    invertY: false,
    setInvertY: (invert) => set({ invertY: invert }),

    // --- UI ---
    isPaused: false,
    setPaused: (paused) => set({ isPaused: paused }),
    togglePause: () => set((s) => ({ isPaused: !s.isPaused })),
    needsClick: false,
    setNeedsClick: (v) => set({ needsClick: v }),

    started: false,
    setStarted: (v) => set({ started: v }),
    requestPointerLock: () => {
      console.warn('[FAULT//FOUND] requestPointerLock called before controller mounted')
    },
  }))
)
