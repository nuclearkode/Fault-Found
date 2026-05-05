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
  const isPaused = useSettingsStore(s => s.isPaused)

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

    if (started && !isPaused) {
      // Game is running, play the ambient hum
      audio.play().catch(e => {
        console.log('[FAULT//FOUND] Ambient audio playback blocked:', e)
      })
    } else {
      // Game is stopped or paused
      audio.pause()
    }
  }, [started, isPaused])
}
