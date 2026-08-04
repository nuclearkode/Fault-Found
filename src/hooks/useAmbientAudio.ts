'use client'

/**
 * useAmbientAudio — Manages the continuous factory background drone.
 *
 * Plays a low hum (HVAC/aircon) when the game is actively running.
 * Pauses when the game is paused (ESC menu) or on the start screen.
 */

import { useEffect, useRef } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'

const AMBIENT_URL = '/audio/ambient_hum.mp3'

export function useAmbientAudio(started: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const overlay = useSettingsStore(s => s.overlay)

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio(AMBIENT_URL)
    audio.loop = true
    audio.volume = 0.5 // Adjust based on preference
    audio.preload = 'auto'
    audioRef.current = audio

    return () => {
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [])

  // Play/pause logic based on game state
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // The shed keeps humming under the laptop — the player is still standing in
    // it. It stops for the manual and the pause menu.
    if (started && (overlay === 'none' || overlay === 'laptop')) {
      // Game is running, play the ambient hum
      audio.play().catch(e => {
        console.log('[FAULT//FOUND] Ambient audio playback blocked:', e)
      })
    } else {
      // Game is stopped or paused
      audio.pause()
    }
  }, [started, overlay])
}
