/**
 * useInteraction — Raycasting-based first-person interaction system.
 *
 * Casts a ray from the camera center every other frame (30Hz) to detect
 * named interactable meshes within reach distance. On 'E' key press,
 * fires the registered callback for the hovered object.
 *
 * Performance rules:
 *   - Raycasts at 30Hz (every 2 frames) — interaction doesn't need 60Hz
 *   - hovered object stored in a ref (not state) — no re-render on hover change
 *   - Only updates Zustand when the hovered target actually changes
 *   - Ray origin reused (pre-allocated) — no GC pressure per frame
 *
 * Interactable mesh names (must match mesh name="" props in scene):
 *   'plc_cabinet_door'  → opens ladder logic HMI
 *   'conveyor_motor'    → opens multimeter panel
 *   'workbench'         → picks up tool
 *   'mcc_cabinet'       → opens MCC panel
 */

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'

// How far the player can reach to interact (metres)
const REACH_DISTANCE = 2.5

// Names of meshes that can be interacted with
// Key = mesh name, Value = interaction identifier passed to onInteract
const INTERACTABLE_MESHES: Record<string, string> = {
  plc_cabinet_door: 'plc_panel',
  plc_cabinet_body: 'plc_panel',
  conveyor_motor:   'conveyor_motor',
  motor_body:       'conveyor_motor',
  workbench_top:    'workbench',
  mcc_cabinet:      'mcc',
  mcc_door_0:       'mcc',
  mcc_door_1:       'mcc',
  mcc_door_2:       'mcc',
}

// Pre-allocated — never new inside useFrame
const _raycaster = new THREE.Raycaster()
const _center = new THREE.Vector2(0, 0)

interface UseInteractionOptions {
  /** Called when player presses E on an interactable object */
  onInteract?: (target: string) => void
  /** Only active when true (default: true) */
  enabled?: boolean
}

export function useInteraction({ onInteract, enabled = true }: UseInteractionOptions = {}) {
  const { camera, scene } = useThree()
  const hoveredRef = useRef<string | null>(null)
  const frameCountRef = useRef(0)
  const setHoveredInteractable = useGameStore(s => s.setHoveredInteractable)
  const phase = useGameStore(s => s.phase)

  // E key handler — fire interaction on the currently hovered object
  useEffect(() => {
    if (!onInteract) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' && hoveredRef.current && phase === 'active') {
        onInteract(hoveredRef.current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onInteract, phase])

  useFrame(() => {
    if (!enabled || phase !== 'active') {
      // Clear hover when interaction is disabled
      if (hoveredRef.current !== null) {
        hoveredRef.current = null
        setHoveredInteractable(null)
      }
      return
    }

    // Only raycast every other frame — 30Hz is enough for interaction
    frameCountRef.current++
    if (frameCountRef.current % 2 !== 0) return

    // Cast ray from camera center
    _raycaster.setFromCamera(_center, camera)
    _raycaster.far = REACH_DISTANCE

    const hits = _raycaster.intersectObjects(scene.children, true)

    let newTarget: string | null = null
    for (const hit of hits) {
      const interactionId = INTERACTABLE_MESHES[hit.object.name]
      if (interactionId) {
        newTarget = interactionId
        break
      }
    }

    // Only update Zustand when the target changes — avoids constant store writes
    if (newTarget !== hoveredRef.current) {
      hoveredRef.current = newTarget
      setHoveredInteractable(newTarget)
    }
  })

  return {
    /** The interaction identifier of the currently hovered object, or null */
    hovered: hoveredRef,
  }
}
