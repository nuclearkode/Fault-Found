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
import { useGameStore } from '@/stores/gameStore'
import { uiFocus, worldInputEnabled } from '@/stores/worldClock'
import { footstep } from '@/audio/foley'

const MOVE_SPEED = 4.5
const PLAYER_HEIGHT = 1.7
const PLAYER_RADIUS = 0.3
/**
 * Metres of travel per footfall, not seconds per footfall.
 *
 * Pacing steps on a timer desynchronises them from the movement the moment
 * anything slows the player down — you get the same cadence whether you are
 * running or shuffling into a wall. Accumulating distance instead means the
 * stride is tied to the ground covered, which is what a stride is.
 */
const STRIDE = 1.9
/** Where a run begins. Also where a new one puts you back. */
const SPAWN: [number, number, number] = [0, 2, 7]

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
  const started = useSettingsStore(s => s.started)

  // Register the pointer lock function in the global store so UI can trigger it
  useEffect(() => {
    useSettingsStore.setState({
      requestPointerLock: () => {
        try {
          if (controlsRef.current) {
            controlsRef.current.lock()
          }
        } catch (err) {
          console.warn('[FAULT//FOUND] Failed to acquire pointer lock:', err)
        }
      }
    })
  }, [])

  // Key handlers — update module-level object, not React state (no re-render)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Gated at the SOURCE, not just where movement is applied. Typing "was"
      // into the ladder editor would otherwise latch W and A, and if that field
      // stops propagation on keyup they stay latched — close the laptop and you
      // sprint into a wall.
      if (!worldInputEnabled()) return
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

  // When the browser drops the pointer lock → decide whether that was a pause.
  const handleUnlock = useCallback(() => {
    keysDown.w = keysDown.s = keysDown.a = keysDown.d = false
    // An unlock is a pause ONLY if nobody asked for the cursor.
    //
    // Every deliberate release — laptop, book, briefing, debrief, NEXT JOB —
    // has already moved the focus out of 'world' by the time this fires,
    // because focus is set synchronously and PointerLockWarden releases the
    // pointer afterwards, in an effect. drei reports the unlock a tick after
    // that, so this read is always the post-release state. Escape from a locked
    // world is the only case that still reads 'world' — exactly the case that
    // should pause.
    //
    // This replaces a growing list of special cases, and is why no future
    // overlay needs a clause here.
    if (uiFocus() !== 'world') return
    useSettingsStore.getState().openOverlay('pause')
  }, [])

  // Losing world focus must drop the keys AND the momentum. Physics is NOT
  // paused under the laptop, so a player who opened it mid-stride keeps sliding.
  useEffect(() => useSettingsStore.subscribe(
    (s) => s.overlay,
    () => {
      keysDown.w = keysDown.s = keysDown.a = keysDown.d = false
      const body = rigidBodyRef.current
      if (!body) return
      const v = body.linvel()
      body.setLinvel({ x: 0, y: v.y, z: 0 }, true)
    },
  ), [])

  // Put everything back where a fresh launch would have it. The RigidBody's
  // `position` prop only applies at mount and useFrame stops writing the camera
  // once `started` goes false, so without this a restart drops you at the spot
  // the supervisor cornered you in, still looking him in the eye.
  const runNonce = useGameStore(s => s.runNonce)
  useEffect(() => {
    if (runNonce === 0) return   // first mount is already at the spawn
    const body = rigidBodyRef.current
    if (body) {
      body.setTranslation({ x: SPAWN[0], y: SPAWN[1], z: SPAWN[2] }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    }
    // Matches the Canvas's initial `camera` prop: eye height, facing down -Z.
    camera.position.set(SPAWN[0], PLAYER_HEIGHT, SPAWN[2])
    camera.rotation.set(0, 0, 0)
    keysDown.w = keysDown.s = keysDown.a = keysDown.d = false
    // Focus, not the DOM. resetRun() has already put the phase back to 'menu',
    // so the warden sees a non-locked focus and hands the cursor back for us.
    useSettingsStore.getState().setOverlay('none')
  }, [runNonce, camera])

  // Movement — only when pointer is locked AND not paused AND game has started
  const stride = useRef(0)
  useFrame((_, delta) => {
    // `isLocked` is doing the overlay check for free: under the laptop the world
    // still steps but the pointer is released, so the player stands still while
    // the machine keeps running. No extra flag needed.
    if (!started || !rigidBodyRef.current || !controlsRef.current?.isLocked) return
    // Once he has hold of you, you don't get to walk out of it.
    const scare = useGameStore.getState().supervisor
    if (scare === 'jumpscare' || scare === 'caught') return
    const body = rigidBodyRef.current
    const vel = body.linvel()

    _front.set(0, 0, (keysDown.s ? 1 : 0) - (keysDown.w ? 1 : 0))
    _side.set((keysDown.a ? 1 : 0) - (keysDown.d ? 1 : 0), 0, 0)
    _dir.subVectors(_front, _side).normalize().multiplyScalar(MOVE_SPEED).applyEuler(camera.rotation)

    body.setLinvel({ x: _dir.x, y: vel.y, z: _dir.z }, true)
    const pos = body.translation()
    camera.position.set(pos.x, pos.y + PLAYER_HEIGHT / 2, pos.z)

    // Footsteps, measured off what the player ACTUALLY moved rather than what
    // was commanded — walk into a wall and the steps stop, which is the whole
    // point of reading it back from the physics body.
    const moved = Math.hypot(vel.x, vel.z) * Math.min(delta, 0.05)
    if (moved > 1e-4) {
      stride.current += moved
      if (stride.current >= STRIDE) {
        stride.current = 0
        footstep()
      }
    } else {
      // Land the next step promptly on setting off again, instead of carrying a
      // stale part-stride that fires the moment you twitch.
      stride.current = Math.min(stride.current, STRIDE * 0.6)
    }
  })

  return (
    <>
      {/* `selector` matters more than it looks. Without it drei binds its
          click-to-lock handler to `document`, so ANY click anywhere — the title
          screen's own START button, the debrief, a pause-menu slider — grabs the
          pointer again. Scoping it to the canvas keeps click-to-resume working
          in the world while leaving overlay clicks alone. */}
      <PointerLockControls ref={controlsRef} onUnlock={handleUnlock} selector="canvas" />
      <RigidBody
        ref={rigidBodyRef}
        type="dynamic"
        position={SPAWN}
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
