'use client'

/**
 * The only place in the app that releases the pointer.
 *
 * Every overlay used to call document.exitPointerLock() for itself, and every
 * one of them then had to be special-cased in PlayerController.handleUnlock so
 * the pause menu didn't appear on top of it. That list only ever grew, and the
 * bug it caused — a fresh run starting frozen, no menu visible, WASD dead —
 * came back each time a surface was added.
 *
 * Now focus is set synchronously by whoever wants the cursor, this effect
 * notices and releases the pointer afterwards, and drei's unlock event lands a
 * tick after that. By then the focus is already out of 'world', so handleUnlock
 * ignores it. No overlay needs to know about any other.
 *
 * Acquiring is not done here: pointer lock needs a user gesture and an effect
 * is not one, so re-locking stays with the keydown or click that asked for it.
 */

import { useEffect } from 'react'
import { LOCKED, useUiFocus } from '@/stores/worldClock'

export function PointerLockWarden() {
  const focus = useUiFocus()
  useEffect(() => {
    if (!LOCKED[focus] && document.pointerLockElement) document.exitPointerLock()
  }, [focus])
  return null
}
