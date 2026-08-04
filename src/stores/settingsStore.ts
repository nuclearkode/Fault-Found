import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { GPUTier } from '@/utils/gpuCapabilities'

/** The full-screen surfaces that can hold the cursor. One at a time, never nested. */
export type Overlay = 'none' | 'laptop' | 'book' | 'pause'
export type PauseView = 'main' | 'settings'

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
  /**
   * Which full-screen surface has taken the cursor.
   *
   * This replaced a boolean `isPaused`, and the reason is worth keeping. Pausing
   * was one flag among several that all had to agree — paused, started, outcome,
   * pointer-lock state — and they kept disagreeing: a deliberate unlock landing
   * a tick after a restart re-paused the new run, leaving it frozen with no menu
   * on screen and the controls dead. There is now exactly ONE stored field for
   * "who owns the cursor", and the pause menu is simply `overlay === 'pause'`,
   * so it cannot contradict the focus because it IS the focus.
   *
   * See src/stores/worldClock.ts for how this becomes a UiFocus.
   */
  overlay: Overlay
  setOverlay: (o: Overlay) => void
  /** Take the cursor. Sets focus only — PointerLockWarden releases the pointer. */
  openOverlay: (o: Exclude<Overlay, 'none'>) => void
  /**
   * Give it back. `relock` is false when the close came from Escape: Chrome
   * refuses a pointer lock requested inside an Escape handler, so that path
   * raises `needsClick` instead of failing silently and leaving mouse-look dead.
   */
  closeOverlay: (relock?: boolean) => void
  needsClick: boolean
  setNeedsClick: (v: boolean) => void
  /** Lifted out of PauseMenu so the app has exactly one Escape handler. */
  pauseView: PauseView
  setPauseView: (v: PauseView) => void

  // --- Game State ---
  started: boolean
  setStarted: (v: boolean) => void
  requestPointerLock: () => void
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector((set, get) => ({
    // --- Graphics ---
    gpuTier: 'high',
    setGpuTier: (tier) => set({ gpuTier: tier }),
    qualityOverride: 'auto',
    setQualityOverride: (override) => set({ qualityOverride: override }),
    // 1.5 is the working default — the warehouse reads too dim below it. The
    // slider is centred on this value so it can be trimmed either way.
    brightness: 1.5,
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
    overlay: 'none',
    setOverlay: (o) => set({ overlay: o }),
    // Focus FIRST, and the pointer is not touched here at all. drei reports an
    // unlock asynchronously, on the next tick; if the store still said 'world'
    // when that landed, handleUnlock would stack the pause menu on top of the
    // laptop. Setting focus synchronously makes that impossible.
    openOverlay: (o) => set({ overlay: o, pauseView: 'main', needsClick: false }),
    closeOverlay: (relock = true) => {
      set({ overlay: 'none' })
      if (relock) get().requestPointerLock()
      else set({ needsClick: true })
    },
    needsClick: false,
    setNeedsClick: (v) => set({ needsClick: v }),
    pauseView: 'main',
    setPauseView: (v) => set({ pauseView: v }),

    started: false,
    setStarted: (v) => set({ started: v }),
    requestPointerLock: () => {
      console.warn('[FAULT//FOUND] requestPointerLock called before controller mounted')
    },
  }))
)
