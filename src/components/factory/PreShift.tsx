'use client'

/**
 * PreShift — what happened before you were called in.
 *
 * Runs between the title screen and the shift. The camera goes to the cell, the
 * line is started and runs a few correct cycles, and then the fault is armed and
 * the machine goes wrong ON CAMERA. Only after that does the operator's account
 * come up and the shift begin.
 *
 * The important part is that none of it is faked. The nominal cycle is the real
 * ladder driving the real cell — the same scan that runs during play — with the
 * faults simply dormant. So "here is what it should look like" is not an
 * animation somebody authored; it is the machine working, which means it stays
 * truthful when the scenario or the ladder changes.
 *
 * Phases: 'nominal' (running well) -> fault armed -> 'briefing' (report shown).
 * The Briefing overlay owns the transition to 'active'.
 */

import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { breakdown } from '@/audio/foley'

/** How long the line runs correctly before anything goes wrong. */
const NOMINAL_SECONDS = 9
/** How long the player watches the symptom before the report comes up. */
const SYMPTOM_SECONDS = 7

/**
 * Camera move per rig, world space: a slow push from a wide establishing shot
 * to the fill station, which is where every one of these faults shows itself.
 *
 * Deliberately a dolly rather than an orbit — an orbit reads as a product demo,
 * a push reads as someone walking up to look at a machine.
 */
const SHOT: Record<string, { from: [number, number, number]; to: [number, number, number]; at: [number, number, number] }> = {
  silo_cell: {
    from: [6.6, 2.55, 1.7],
    to:   [3.5, 1.62, -0.75],
    at:   [0.35, 1.05, -3.55],
  },
  mps_line: {
    from: [5.5, 2.4, 1.5],
    to:   [2.8, 1.6, -0.9],
    at:   [0, 1.1, -3.6],
  },
}

const _from = new THREE.Vector3()
const _to = new THREE.Vector3()
const _at = new THREE.Vector3()

/** Ease-out so the push settles rather than stopping dead. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 2.6)
}

export function PreShift() {
  const { camera } = useThree()
  const state = useRef({ t: 0, armed: false, started: false, lastPhase: '' })

  useFrame((_, delta) => {
    const s = useGameStore.getState()
    const phase = s.phase
    const running = phase === 'nominal' || phase === 'briefing'

    // Re-arm whenever a new job rolls round, so the second briefing plays like
    // the first rather than inheriting the last one's progress.
    if (phase !== state.current.lastPhase) {
      state.current.lastPhase = phase
      if (phase === 'nominal') {
        state.current = { t: 0, armed: false, started: false, lastPhase: phase }
      }
    }
    if (!running) return
    if (!useSettingsStore.getState().started) return

    const st = state.current
    st.t += Math.min(delta, 0.05)

    // Press START for the operator. The ladder does the rest — this is the same
    // seal-in the player will use, not a scripted animation.
    if (!st.started && st.t > 0.6) {
      st.started = true
      s.setTag('I:1/00', true)
      setTimeout(() => useGameStore.getState().setTag('I:1/00', false), 150)
    }

    // Break it, on camera — and audibly. The sound is the first clue the player
    // gets, and it is a real one: a belt losing grip and a conductor letting go
    // do not sound remotely alike.
    if (!st.armed && st.t > NOMINAL_SECONDS) {
      st.armed = true
      const kind = s.faults[0]?.type === 'mechanical_jam' ? 'mechanical' : 'electrical'
      breakdown(kind)
      s.armFaults()
    }

    // Hand over to the report once the symptom has had time to read.
    if (phase === 'nominal' && st.t > NOMINAL_SECONDS + SYMPTOM_SECONDS) {
      s.setPhase('briefing')
    }

    // ── The shot ──────────────────────────────────────────────────────────────
    const shot = SHOT[s.activeRig] ?? SHOT.silo_cell
    _from.set(...shot.from)
    _to.set(...shot.to)
    _at.set(...shot.at)

    // The push runs across the nominal stretch and then holds, so the camera is
    // already settled on the machine when it misbehaves.
    const k = easeOut(THREE.MathUtils.clamp(st.t / (NOMINAL_SECONDS + 1.5), 0, 1))
    camera.position.lerpVectors(_from, _to, k)
    camera.lookAt(_at)
  })

  return null
}
