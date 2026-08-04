'use client'

/**
 * useMenuAudio — Manages the start screen background music.
 *
 * Plays the menu theme when the start screen is visible.
 * Fades out smoothly when the player clicks "CLICK TO START".
 *
 * Browser autoplay policy: Audio can't play without a user gesture.
 * We attempt autoplay immediately, and if blocked, we hook the first
 * user interaction (mousemove/click/keydown) to start playback.
 */

import { useEffect, useRef, useCallback } from 'react'

const MENU_THEME_URL = '/audio/menu_theme.mp3'
const FADE_DURATION_MS = 1500  // fade-out time when game starts

export function useMenuAudio(isPlaying: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasStartedRef = useRef(false)
  // Once the player is in the game the theme is done for good. Without this, the
  // gesture listeners below could restart it mid-session — every click, keypress
  // and mouse move is a candidate trigger.
  const retiredRef = useRef(false)

  // Start playback (called on mount or first user interaction)
  const startPlayback = useCallback(() => {
    if (retiredRef.current || hasStartedRef.current || !audioRef.current) return
    const audio = audioRef.current

    audio.play().then(() => {
      hasStartedRef.current = true
      console.log('[FAULT//FOUND] Menu theme playing')
    }).catch(() => {
      // Autoplay blocked — will retry on next user interaction
    })
  }, [])

  // Initialize audio element on mount
  useEffect(() => {
    const audio = new Audio(MENU_THEME_URL)
    audio.loop = true
    audio.volume = 0.6
    audio.preload = 'auto'
    audioRef.current = audio

    // Belt and braces. Fading on a state change is not enough on its own: any
    // later call to play() — a stray gesture listener, a remount, the browser
    // resuming media after a tab switch — restarts the theme underneath the game.
    // Guarding the element's own `play` event catches every one of those routes,
    // because whatever started it has to fire this.
    const guard = () => {
      if (retiredRef.current) {
        audio.pause()
        audio.currentTime = 0
      }
    }
    audio.addEventListener('play', guard)

    return () => {
      audio.removeEventListener('play', guard)
      // Cleanup on unmount
      if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current)
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [])

  // Attempt autoplay + fallback to first user interaction
  useEffect(() => {
    if (!isPlaying) return

    // Coming back to the title after a loss puts us here a second time, and the
    // retirement latch below would otherwise keep the theme off for the rest of
    // the session — a silent menu. Retirement means "not while the player is in
    // the game", not "never again".
    retiredRef.current = false
    hasStartedRef.current = false
    // The fade-out left the element at zero. Playing it again without this
    // starts the theme silently, which is indistinguishable from it not playing.
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current)
      fadeIntervalRef.current = null
    }
    if (audioRef.current) audioRef.current.volume = 0.6

    // Try immediate autoplay
    startPlayback()

    // Fallback: start on first user gesture if autoplay was blocked
    const onGesture = () => {
      startPlayback()
      if (hasStartedRef.current) {
        // Remove all listeners once playing
        window.removeEventListener('click', onGesture)
        window.removeEventListener('mousemove', onGesture)
        window.removeEventListener('keydown', onGesture)
        window.removeEventListener('touchstart', onGesture)
      }
    }

    window.addEventListener('click', onGesture, { once: false })
    window.addEventListener('mousemove', onGesture, { once: false })
    window.addEventListener('keydown', onGesture, { once: false })
    window.addEventListener('touchstart', onGesture, { once: false })

    return () => {
      window.removeEventListener('click', onGesture)
      window.removeEventListener('mousemove', onGesture)
      window.removeEventListener('keydown', onGesture)
      window.removeEventListener('touchstart', onGesture)
    }
  }, [isPlaying, startPlayback])

  // Fade out when isPlaying becomes false (game starts)
  useEffect(() => {
    if (isPlaying) return
    retiredRef.current = true          // the theme never comes back this session
    if (!audioRef.current) return
    const audio = audioRef.current
    if (!hasStartedRef.current) {
      // never got going — make sure a queued play() can't sneak through
      audio.pause()
      return
    }
    const startVolume = audio.volume
    const steps = 30  // 30 steps over the fade duration
    const stepTime = FADE_DURATION_MS / steps
    const volumeStep = startVolume / steps
    let currentStep = 0

    fadeIntervalRef.current = setInterval(() => {
      currentStep++
      audio.volume = Math.max(0, startVolume - volumeStep * currentStep)

      if (currentStep >= steps) {
        if (fadeIntervalRef.current) clearInterval(fadeIntervalRef.current)
        fadeIntervalRef.current = null
        audio.pause()
        audio.currentTime = 0
        console.log('[FAULT//FOUND] Menu theme faded out')
      }
    }, stepTime)

    return () => {
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current)
        fadeIntervalRef.current = null
      }
    }
  }, [isPlaying])
}
