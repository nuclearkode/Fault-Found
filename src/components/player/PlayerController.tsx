'use client'

/**
 * PlayerController — FPS capsule.
 *
 * Pointer lock is a browser-security-gated API:
 * - Lock REQUIRES a direct user gesture (click). Cannot be called programmatically.
 * - Unlock happens automatically when ESC is pressed by the browser.
 * - After unlock, only a new click can re-lock.
 *
 * Flow:
 *   User clicks canvas → lock → game active
 *   User presses ESC  → browser unlocks → onUnlock fires → pause menu shows
 *   User clicks Resume → pause menu hides → "click to resume" prompt shows
 *   User clicks canvas  → lock → game active
 */

import { useRef, useEffect, useCallback } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PointerLockControls } from '@react-three/drei'
import { RigidBody, CapsuleCollider } from '@react-three/rapier'
import type { RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { useSettingsStore } from '@/stores/settingsStore'

const MOVE_SPEED = 4.5
const PLAYER_HEIGHT = 1.7
const PLAYER_RADIUS = 0.3

// Pre-allocated — never new in useFrame
const _dir = new THREE.Vector3()
const _front = new THREE.Vector3()
const _side = new THREE.Vector3()

// Key state outside React state to avoid re-renders on every keypress
const keysDown = { w: false, s: false, a: false, d: false }

export function PlayerController() {
  const rigidBodyRef = useRef<RapierRigidBody>(null)
  const controlsRef = useRef<any>(null)
  const { camera } = useThree()
  const isPaused = useSettingsStore(s => s.isPaused)
  const setPaused = useSettingsStore(s => s.setPaused)
  const setNeedsClick = useSettingsStore(s => s.setNeedsClick)

  // Key handlers — update module-level object, not React state (no re-render)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keysDown.w = true
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keysDown.s = true
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keysDown.a = true
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keysDown.d = true
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keysDown.w = false
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keysDown.s = false
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keysDown.a = false
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keysDown.d = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // When browser unlocks pointer (ESC pressed) → show pause menu
  const handleUnlock = useCallback(() => {
    keysDown.w = keysDown.s = keysDown.a = keysDown.d = false
    setPaused(true)
  }, [setPaused])

  // Movement — only when pointer is locked AND not paused
  useFrame(() => {
    if (!rigidBodyRef.current || isPaused || !controlsRef.current?.isLocked) return
    const body = rigidBodyRef.current
    const vel = body.linvel()

    _front.set(0, 0, (keysDown.s ? 1 : 0) - (keysDown.w ? 1 : 0))
    _side.set((keysDown.a ? 1 : 0) - (keysDown.d ? 1 : 0), 0, 0)
    _dir.subVectors(_front, _side).normalize().multiplyScalar(MOVE_SPEED).applyEuler(camera.rotation)

    body.setLinvel({ x: _dir.x, y: vel.y, z: _dir.z }, true)
    const pos = body.translation()
    camera.position.set(pos.x, pos.y + PLAYER_HEIGHT / 2, pos.z)
  })

  return (
    <>
      <PointerLockControls ref={controlsRef} onUnlock={handleUnlock} />
      <RigidBody
        ref={rigidBodyRef}
        type="dynamic"
        position={[0, 2, 7]}
        enabledRotations={[false, false, false]}
        linearDamping={8}
        mass={80}
        lockRotations
        colliders={false}
      >
        <CapsuleCollider args={[PLAYER_HEIGHT / 2 - PLAYER_RADIUS, PLAYER_RADIUS]} />
      </RigidBody>
    </>
  )
}
