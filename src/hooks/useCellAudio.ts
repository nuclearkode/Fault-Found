'use client'

/**
 * useCellAudio — procedural machine sound, synthesised from PLC tags.
 *
 * No audio assets. Everything here is generated with the Web Audio API, which
 * suits industrial sound unusually well because the real thing IS mostly simple
 * periodic and broadband noise:
 *
 *   motor hum      a sawtooth at mains-ish frequency + its harmonic, low-passed.
 *                  Sawtooth rather than sine because a loaded induction motor is
 *                  rich in harmonics; a pure sine sounds like a test tone.
 *   valve hiss     band-passed white noise — compressed air through an orifice.
 *   contactor      a very short filtered noise burst, snapped by a fast envelope.
 *                  Real contactors click on BOTH pull-in and drop-out.
 *   room tone      brown noise at low level, the HVAC/ambient floor of a shed.
 *
 * Driving it from the tags means the audio can't drift out of sync with the sim —
 * and it makes the belt-slip fault audible: the motor hum runs while nothing moves.
 *
 * Autoplay: browsers refuse an AudioContext until a user gesture. The game's
 * click-to-start provides one, so the context is created lazily on first use and
 * resumed if the browser suspended it.
 */

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '@/stores/gameStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { worldRunning } from '@/stores/worldClock'

/** Tags that produce a contactor click when they change state. */
const SWITCHED = ['O:2/00', 'O:2/01'] as const

/**
 * Where each sound physically comes from, in world space. The silo rig sits at
 * [0, 0, -4], so these are its local emitter positions offset by that.
 */
const SRC = {
  motor: new THREE.Vector3(2.9, 0.8, -4.4),   // gearmotor on the discharge end
  valve: new THREE.Vector3(0.0, 1.3, -4.0),   // solenoid at the silo spout
  panel: new THREE.Vector3(-1.85, 1.2, -2.8), // contactors, heard at the cabinet
}

/**
 * Audible out to ~20 m, full level within ~4 m. Inverse-square-ish rolloff.
 *
 * Opened up from 2.5/14. Strict inverse-square is physically right and made the
 * machine inaudible from anywhere you would actually stand to look at it — at
 * 7 m the motor was running at 0.005 gain, which is silence. Rooms are more
 * reverberant than a point source in free air anyway.
 */
const REF_DIST = 4.0
const MAX_DIST = 20

/**
 * Level used instead of distance falloff during the pre-shift sequence.
 *
 * The camera there is a camera, not the player's ears — it is 7 m from the cell
 * to frame the whole machine, and a showcase you cannot hear showcases nothing.
 * Film does the same thing: the microphone is wherever the story needs it.
 */
const CINEMATIC_LEVEL = 0.85

function falloff(src: THREE.Vector3, listener: THREE.Vector3): number {
  const d = src.distanceTo(listener)
  if (d > MAX_DIST) return 0
  const a = REF_DIST / Math.max(d, REF_DIST)
  return a * a * (1 - d / MAX_DIST)   // trims the tail so it reaches true silence
}

const LISTENER = new THREE.Vector3()

interface Rig {
  ctx: AudioContext
  master: GainNode
  motorGain: GainNode
  valveGain: GainNode
  roomGain: GainNode
  noise: AudioBuffer
}

/** A second of white noise, reused for every noise-based voice. */
function makeNoise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return buf
}

function build(): Rig | null {
  const Ctor = window.AudioContext ?? (window as unknown as
    { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  const ctx = new Ctor()

  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  const noise = makeNoise(ctx)

  // ── motor: two detuned saws through a low-pass, so it growls rather than buzzes
  const motorGain = ctx.createGain()
  motorGain.gain.value = 0
  const motorFilter = ctx.createBiquadFilter()
  motorFilter.type = 'lowpass'
  // Softer than the first pass: cutoff down from 320 Hz and Q from 4 to 0.9. The
  // resonant peak was what made it grating — it sat right in the ear's most
  // sensitive band and never moved. Now it's a low rumble you stop noticing.
  motorFilter.frequency.value = 190
  motorFilter.Q.value = 0.9
  motorFilter.connect(motorGain)
  motorGain.connect(master)
  for (const [freq, level] of [[49, 0.5], [98, 0.14], [147, 0.04]] as const) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = freq
    const g = ctx.createGain()
    g.gain.value = level
    osc.connect(g); g.connect(motorFilter)
    osc.start()
  }

  // ── valve: band-passed noise, the sound of air through a gap
  const valveGain = ctx.createGain()
  valveGain.gain.value = 0
  const valveFilter = ctx.createBiquadFilter()
  valveFilter.type = 'bandpass'
  valveFilter.frequency.value = 2600
  valveFilter.Q.value = 0.8
  valveFilter.connect(valveGain)
  valveGain.connect(master)
  const valveSrc = ctx.createBufferSource()
  valveSrc.buffer = noise; valveSrc.loop = true
  valveSrc.connect(valveFilter); valveSrc.start()

  // ── room tone: heavily low-passed noise, just enough to kill the silence
  const roomGain = ctx.createGain()
  roomGain.gain.value = 0
  const roomFilter = ctx.createBiquadFilter()
  roomFilter.type = 'lowpass'
  roomFilter.frequency.value = 420
  roomFilter.connect(roomGain)
  roomGain.connect(master)
  const roomSrc = ctx.createBufferSource()
  roomSrc.buffer = noise; roomSrc.loop = true
  roomSrc.connect(roomFilter); roomSrc.start()

  return { ctx, master, motorGain, valveGain, roomGain, noise }
}

/** Contactor snap — short, bright, and gone in 60 ms. */
function click(rig: Rig, level: number) {
  const { ctx } = rig
  const src = ctx.createBufferSource()
  src.buffer = rig.noise
  src.loop = false
  const filt = ctx.createBiquadFilter()
  filt.type = 'highpass'
  filt.frequency.value = 1400
  const g = ctx.createGain()
  const t = ctx.currentTime
  g.gain.setValueAtTime(level, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
  src.connect(filt); filt.connect(g); g.connect(rig.master)
  src.start(t, Math.random() * 0.5, 0.07)
}

function ramp(p: AudioParam, to: number, ctx: AudioContext, seconds = 0.12) {
  p.cancelScheduledValues(ctx.currentTime)
  p.setTargetAtTime(to, ctx.currentTime, seconds)
}

export function useCellAudio() {
  const rig = useRef<Rig | null>(null)
  const prev = useRef<Record<string, boolean>>({})
  const { camera } = useThree()

  // tear the context down on unmount
  useEffect(() => () => {
    const r = rig.current
    rig.current = null
    if (r) void r.ctx.close()
  }, [])

  useFrame(() => {
    const { phase, tags } = useGameStore.getState()
    // 'nominal' and 'briefing' count. The pre-shift sequence is where the player
    // learns what the machine sounds like WORKING, which is half of what makes
    // the fault recognisable later — and it was running in total silence.
    const cinematic = phase === 'nominal' || phase === 'briefing'
    const inGame = phase === 'active' || cinematic

    // Build on first need — by then the click-to-start gesture has happened
    if (!rig.current) {
      if (!inGame) return
      rig.current = build()
      if (!rig.current) return
    }
    const r = rig.current
    if (r.ctx.state === 'suspended') void r.ctx.resume()

    // `masterVolume` / `sfxVolume` — the names the settings store actually uses.
    // This read was for `volumeMaster` / `volumeAmbient`, which do not exist on
    // it, so both silently fell back to 1 and the pause-menu sliders moved
    // nothing on the machine audio at all.
    // Follows worldRunning(), not the overlay. Machine noise continues under the
    // laptop and cuts for the manual and the pause menu — which is free feedback
    // about which of them is costing the player time.
    const { masterVolume, sfxVolume } = useSettingsStore.getState()
    const vol = masterVolume * sfxVolume * (inGame && worldRunning() ? 1 : 0)
    ramp(r.master.gain, vol * 1.6, r.ctx, 0.25)

    const on = (id: string) => {
      const v = tags[id]?.value
      return typeof v === 'number' ? v !== 0 : v === true
    }

    // Every voice is attenuated by how far the player is from the thing making it,
    // so walking away from the cell quietens it and walking up to the motor makes
    // it obvious which machine is running.
    camera.getWorldPosition(LISTENER)
    const nearMotor = cinematic ? CINEMATIC_LEVEL : falloff(SRC.motor, LISTENER)
    const nearValve = cinematic ? CINEMATIC_LEVEL : falloff(SRC.valve, LISTENER)

    // Motor hum tracks the OUTPUT, not the belt. That is the point: during the
    // belt-slip fault the motor is audibly running while nothing moves.
    ramp(r.motorGain.gain, on('O:2/00') ? 0.30 * nearMotor : 0, r.ctx)
    ramp(r.valveGain.gain, on('O:2/01') ? 0.20 * nearValve : 0, r.ctx)
    ramp(r.roomGain.gain, 0.06, r.ctx, 0.6)

    const nearPanel = cinematic ? CINEMATIC_LEVEL : falloff(SRC.panel, LISTENER)
    for (const id of SWITCHED) {
      const now = on(id)
      if (prev.current[id] !== undefined && prev.current[id] !== now && nearPanel > 0.01) {
        click(r, (now ? 0.34 : 0.24) * nearPanel)   // pull-in louder than drop-out
      }
      prev.current[id] = now
    }
  })
}

/** Thin component wrapper so it can be dropped into the tree like GameLoop. */
export function CellAudio() {
  useCellAudio()
  return null
}
