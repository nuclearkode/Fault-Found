'use client'

/**
 * FaultCamera — photographs the thing the player should have fixed.
 *
 * When a run is lost the debrief shows a real view of the fault, not a
 * description of one. That means rendering the live scene from a second camera
 * at the moment of the loss and handing the result to the DOM as an image.
 *
 * It renders into an offscreen target rather than grabbing the canvas, because
 * the canvas is created without `preserveDrawingBuffer` — `toDataURL()` on it
 * would come back blank as often as not, depending on when the browser composited.
 * A render target has no such ambiguity: draw it, read it, done. One frame, once
 * per run, then it never runs again.
 */

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

const SHOT_W = 640
const SHOT_H = 360

/**
 * Where to point, per rig. Cell-local coordinates plus the rig's own placement
 * are already folded in — these are world.
 *
 * For S02 that's the drive roller at the discharge end of the silo conveyor:
 * the belt is slipping on worn lagging, and it is the one thing on the machine
 * that a player who blamed the prox sensor never actually looked at.
 */
const FOCUS: Record<string, { at: [number, number, number]; from: [number, number, number] }> = {
  silo_cell: { at: [2.91, 0.81, -4.38], from: [4.35, 1.55, -2.35] },
  mps_line:  { at: [0, 1.0, -4.0],      from: [2.6, 1.9, -1.4] },
}

export function FaultCamera() {
  const { gl, scene } = useThree()
  const done = useRef(false)
  const cam = useRef(new THREE.PerspectiveCamera(48, SHOT_W / SHOT_H, 0.05, 60))
  const rt = useRef<THREE.WebGLRenderTarget | null>(null)

  useEffect(() => {
    const target = new THREE.WebGLRenderTarget(SHOT_W, SHOT_H)
    // Without this the pixels come back linear and the shot is visibly darker
    // and flatter than the game it was taken from.
    target.texture.colorSpace = THREE.SRGBColorSpace
    rt.current = target
    return () => target.dispose()
  }, [])

  useFrame(() => {
    const store = useGameStore.getState()
    // Taken at the scare, not at the loss — by the time the screen has gone
    // black the supervisor is standing in shot.
    const wanted = store.supervisor === 'jumpscare' || store.outcome === 'lost'
    // Re-arms itself whenever a run is back in progress, so the next loss gets
    // its own shot rather than reusing the last one.
    if (!wanted) { done.current = false; return }
    if (done.current || store.failShot) return

    const spot = FOCUS[store.activeRig]
    const target = rt.current
    if (!spot || !target) { done.current = true; return }
    done.current = true

    try {
      const c = cam.current
      c.position.set(...spot.from)
      c.lookAt(new THREE.Vector3(...spot.at))
      c.updateMatrixWorld()

      const prevTarget = gl.getRenderTarget()
      gl.setRenderTarget(target)
      gl.render(scene, c)
      const buf = new Uint8Array(SHOT_W * SHOT_H * 4)
      gl.readRenderTargetPixels(target, 0, 0, SHOT_W, SHOT_H, buf)
      gl.setRenderTarget(prevTarget)

      const canvas = document.createElement('canvas')
      canvas.width = SHOT_W
      canvas.height = SHOT_H
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const img = ctx.createImageData(SHOT_W, SHOT_H)
      // readRenderTargetPixels hands back rows bottom-up; canvas wants top-down.
      for (let y = 0; y < SHOT_H; y++) {
        const src = (SHOT_H - 1 - y) * SHOT_W * 4
        img.data.set(buf.subarray(src, src + SHOT_W * 4), y * SHOT_W * 4)
      }
      ctx.putImageData(img, 0, 0)
      store.setFailShot(canvas.toDataURL('image/jpeg', 0.85))
    } catch (err) {
      // A missing shot degrades the debrief to text — it must not break the loss.
      console.warn('[FAULT//FOUND] Could not capture the fault view:', err)
    }
  })

  return null
}
