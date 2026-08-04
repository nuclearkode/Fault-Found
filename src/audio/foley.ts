'use client'

/**
 * foley — the small, sharp sounds: hinges, latches, slams, footsteps.
 *
 * Synthesised rather than sampled, which is the same choice made for the machine
 * audio in useCellAudio and for the same reasons: these are all short percussive
 * or resonant events that are cheap to build from noise and a filter, they cost
 * nothing to download, and each one can be varied per call so a footstep loop
 * doesn't turn into a metronome playing the same 200 ms of audio.
 *
 * One shared AudioContext for the whole module. Browsers cap how many a page may
 * hold and refuse to create any before a user gesture, so it is made lazily on
 * first use — by which point the player has clicked START — and resumed if the
 * browser suspended it on a tab switch.
 */

import { useSettingsStore } from '@/stores/settingsStore'

let ctx: AudioContext | null = null
let bus: GainNode | null = null

/**
 * Soft-clip curve for the impact bus.
 *
 * The fault cue is meant to be much louder than the machine hum it interrupts,
 * and it is built from several layers that peak together. Summing those past
 * full scale is not a bug to avoid but the intended loudness — so they are run
 * through tanh, which compresses the peaks instead of letting the browser hard-
 * clip them into a click.
 */
function makeLimiter(c: AudioContext): WaveShaperNode {
  const n = 2048
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6)
  }
  const w = c.createWaveShaper()
  w.curve = curve
  w.oversample = '2x'
  return w
}

function audio(): { ctx: AudioContext; bus: GainNode } | null {
  try {
    if (!ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as
        { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return null
      ctx = new Ctx()
      bus = ctx.createGain()
      bus.connect(makeLimiter(ctx)).connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    const s = useSettingsStore.getState()
    bus!.gain.value = s.masterVolume * s.sfxVolume
    return { ctx, bus: bus! }
  } catch {
    return null   // foley is decoration; never let it take a interaction down
  }
}

/** A burst of noise, shaped by an envelope of `decay` seconds. */
function noise(ctx: AudioContext, decay: number, curve: number): AudioBufferSourceNode {
  const len = Math.max(1, Math.floor(ctx.sampleRate * decay))
  const buf = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** curve
  const src = ctx.createBufferSource()
  src.buffer = buf
  return src
}

/**
 * A hinge turning. Opening and closing get different sweeps — a door swinging
 * open rises as it speeds up, and closing falls as it comes to rest — which is
 * enough to tell the two apart without looking.
 */
export function hinge(opening: boolean) {
  const a = audio()
  if (!a) return
  const { ctx, bus } = a
  const now = ctx.currentTime
  const dur = 0.55

  // The creak itself: a thin sawtooth swept through a resonant peak. A hinge is
  // stick-slip friction, so it wants to be tonal and unstable, not a whoosh.
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  const lo = 210 + Math.random() * 40
  const hi = 470 + Math.random() * 90
  osc.frequency.setValueAtTime(opening ? lo : hi, now)
  osc.frequency.linearRampToValueAtTime(opening ? hi : lo, now + dur)

  const peak = ctx.createBiquadFilter()
  peak.type = 'bandpass'
  peak.frequency.value = 1500
  peak.Q.value = 9

  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, now)
  g.gain.exponentialRampToValueAtTime(0.16, now + 0.06)
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur)

  osc.connect(peak).connect(g).connect(bus)
  osc.start(now)
  osc.stop(now + dur + 0.02)

  // and the thunk of the leaf settling once it has stopped
  if (!opening) latch(0.45)
}

/**
 * A latch, catch or pushbutton — the small mechanical click. `level` scales it
 * so the same sound serves a light button and a heavy isolator.
 */
export function latch(level = 1) {
  const a = audio()
  if (!a) return
  const { ctx, bus } = a
  const now = ctx.currentTime

  const src = noise(ctx, 0.07, 2.5)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2400 + Math.random() * 500
  bp.Q.value = 1.4
  const g = ctx.createGain()
  g.gain.value = 0.5 * level
  src.connect(bp).connect(g).connect(bus)
  src.start(now)
}

/**
 * A heavy door thrown open and hitting its stop.
 *
 * Four parts, because a slap is what you get with fewer. The first attempt was
 * a fast sine drop under a HIGHPASSED noise crack, and it slapped for exactly
 * that reason: all the energy was above 700 Hz and it was over in 200 ms. A door
 * is the opposite — a heavy, mostly LOW impact, a slab and a frame ringing after
 * it, the latch catching a moment later, and a shed answering for most of a
 * second. The lowpass on the impact is the single biggest difference.
 */
export function slam() {
  const a = audio()
  if (!a) return
  const { ctx, bus } = a
  const now = ctx.currentTime

  // 1. The impact. Weight, not brightness.
  const hit = noise(ctx, 0.34, 1.2)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 420
  lp.Q.value = 0.9
  const hg = ctx.createGain()
  hg.gain.setValueAtTime(0.0001, now)
  hg.gain.exponentialRampToValueAtTime(0.9, now + 0.014)
  hg.gain.exponentialRampToValueAtTime(0.0001, now + 0.34)
  hit.connect(lp).connect(hg).connect(bus)
  hit.start(now)

  // 2. The leaf and the frame ringing on. Deliberately not a harmonic pair — a
  //    door is a slab, not a string — and each pitch drops a little as it settles.
  const partials: Array<[number, number, number]> = [[78, 0.5, 0.75], [131, 0.3, 0.55]]
  for (const [hz, level, dur] of partials) {
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(hz * 1.35, now)
    o.frequency.exponentialRampToValueAtTime(hz, now + 0.09)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(level, now + 0.016)
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    o.connect(g).connect(bus)
    o.start(now)
    o.stop(now + dur + 0.05)
  }

  // 3. The latch catching, a beat behind the leaf landing. Quiet — it is detail,
  //    not the event.
  const clack = noise(ctx, 0.05, 3)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 2600
  bp.Q.value = 2
  const cg = ctx.createGain()
  cg.gain.value = 0.2
  clack.connect(bp).connect(cg).connect(bus)
  clack.start(now + 0.022)

  // 4. The shed answering. A long, quiet, dull tail is most of what makes this
  //    read as a big empty building rather than a close-miked sample.
  const tail = noise(ctx, 0.9, 0.9)
  const tlp = ctx.createBiquadFilter()
  tlp.type = 'lowpass'
  tlp.frequency.value = 900
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0.0001, now)
  tg.gain.exponentialRampToValueAtTime(0.13, now + 0.05)
  tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.9)
  tail.connect(tlp).connect(tg).connect(bus)
  tail.start(now + 0.01)
}

/**
 * The moment it goes wrong, played over the pre-shift showcase.
 *
 * Two flavours, because the two families of fault in this game fail audibly
 * differently and the sound is a diagnostic clue in its own right:
 *
 *   'mechanical'  a belt losing grip — a rubber squeal that wavers and dies,
 *                 with a slap as the drive slips. Sweeping the filter rather
 *                 than the oscillator is what gives it the scraped, unstable
 *                 quality of something binding.
 *   'electrical'  a conductor letting go — a hard crack, a mains-frequency
 *                 buzz that fizzes out, and the contactor dropping after it.
 */
export function breakdown(kind: 'mechanical' | 'electrical') {
  const a = audio()
  if (!a) return
  const { ctx, bus } = a
  const now = ctx.currentTime

  // ── The stinger, played for every fault ──
  //
  // Deliberately NON-diegetic, and that is the honest way to solve this. A
  // crushed 24 V conductor does not arc, a broken wire in a drag chain makes no
  // noise at all, and a photo-eye that latches on is perfectly silent — so
  // putting a bang on those would be teaching the player something false about
  // how machines fail. What the moment does need is to be unmissable. A film
  // score answers exactly this: the cue belongs to the audience, not the room.
  //
  // A fifth falling to a tritone, which is the interval that refuses to resolve.
  for (const [f0, f1, level] of [[196, 138.6, 0.85], [98, 69.3, 0.7]] as const) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f0, now)
    o.frequency.exponentialRampToValueAtTime(f1, now + 0.22)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(2600, now)
    lp.frequency.exponentialRampToValueAtTime(320, now + 1.4)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(level, now + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6)
    o.connect(lp).connect(g).connect(bus)
    o.start(now)
    o.stop(now + 1.65)
  }
  // and the hit that lands it
  const stab = noise(ctx, 0.4, 1.1)
  const sf = ctx.createBiquadFilter()
  sf.type = 'lowpass'
  sf.frequency.value = 1100
  const sg = ctx.createGain()
  sg.gain.setValueAtTime(0.0001, now)
  sg.gain.exponentialRampToValueAtTime(1.0, now + 0.006)
  sg.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
  stab.connect(sf).connect(sg).connect(bus)
  stab.start(now)

  if (kind === 'mechanical') {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(148, now)
    osc.frequency.linearRampToValueAtTime(121, now + 1.5)

    // The squeal. A high-Q peak wandering over the harmonics reads as rubber
    // grabbing and letting go; sweeping the source instead just sounds like a siren.
    const peak = ctx.createBiquadFilter()
    peak.type = 'bandpass'
    peak.Q.value = 14
    peak.frequency.setValueAtTime(900, now)
    peak.frequency.linearRampToValueAtTime(2050, now + 0.55)
    peak.frequency.linearRampToValueAtTime(1180, now + 1.1)
    peak.frequency.linearRampToValueAtTime(1600, now + 1.5)

    // Loud, and held. This is the one fault in the set that genuinely makes a
    // noise, and it is the signature sound of the whole scenario — a belt losing
    // its grip and screaming about it. It sits well above the 0.30 motor hum on
    // purpose; the limiter on the bus is what makes that safe.
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(1.25, now + 0.07)
    g.gain.exponentialRampToValueAtTime(0.7, now + 1.0)
    g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2)
    osc.connect(peak).connect(g).connect(bus)
    osc.start(now)
    osc.stop(now + 2.25)

    // The drive letting go — three slaps as the lagging loses and regains grip,
    // which is what slipping actually sounds like: not one event, a stutter.
    for (const [at, level] of [[0.10, 0.9], [0.42, 0.65], [0.83, 0.4]] as const) {
      const slap = noise(ctx, 0.22, 1.3)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 420
      const sg = ctx.createGain()
      sg.gain.value = level
      slap.connect(lp).connect(sg).connect(bus)
      slap.start(now + at)
    }
    return
  }

  // ── electrical ──
  const crack = noise(ctx, 0.12, 2.2)
  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 1300
  const cg = ctx.createGain()
  cg.gain.value = 0.75
  crack.connect(hp).connect(cg).connect(bus)
  crack.start(now)

  // mains buzz, fizzing out as the fault settles
  const buzz = ctx.createOscillator()
  buzz.type = 'square'
  buzz.frequency.setValueAtTime(100, now)
  buzz.frequency.linearRampToValueAtTime(96, now + 0.7)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 780
  bp.Q.value = 3
  const bg = ctx.createGain()
  bg.gain.setValueAtTime(0.0001, now)
  bg.gain.exponentialRampToValueAtTime(0.34, now + 0.02)
  bg.gain.exponentialRampToValueAtTime(0.0001, now + 0.75)
  buzz.connect(bp).connect(bg).connect(bus)
  buzz.start(now)
  buzz.stop(now + 0.8)

  // and the contactor letting go behind it
  latch(1.1)
}

/**
 * The line coming back to life. Played once, when the last fault is cleared.
 *
 * A rising perfect fifth on soft triangles, because the job is "it works again"
 * rather than "you scored points" — a fanfare would be the wrong register for a
 * maintenance call. The third note lands late and quiet, which is what stops it
 * sounding like a phone notification.
 */
export function success() {
  const a = audio()
  if (!a) return
  const { ctx, bus } = a
  const now = ctx.currentTime

  const notes: Array<[number, number, number]> = [
    [523.25, 0.00, 0.55],   // C5
    [783.99, 0.13, 0.60],   // G5
    [1046.5, 0.30, 0.85],   // C6, the resolution
  ]
  for (const [hz, at, dur] of notes) {
    const t = now + at
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.value = hz
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(bus)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
}

/**
 * One footstep on sealed concrete. `boot` widens it and drops it for something
 * heavier. Pitch and level are jittered per call — identical repeated steps are
 * the thing that makes synthesised walking sound like a machine.
 */
export function footstep(boot = false) {
  const a = audio()
  if (!a) return
  const { ctx, bus } = a
  const now = ctx.currentTime

  const src = noise(ctx, boot ? 0.17 : 0.11, boot ? 2.2 : 3.0)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = (boot ? 620 : 950) * (0.85 + Math.random() * 0.3)
  lp.Q.value = 1.1
  const g = ctx.createGain()
  g.gain.value = (boot ? 0.42 : 0.26) * (0.8 + Math.random() * 0.4)
  src.connect(lp).connect(g).connect(bus)
  src.start(now)

  // the heel, a touch of low body under the scuff
  const thud = ctx.createOscillator()
  thud.type = 'sine'
  thud.frequency.setValueAtTime(boot ? 92 : 128, now)
  thud.frequency.exponentialRampToValueAtTime(boot ? 45 : 62, now + 0.1)
  const tg = ctx.createGain()
  tg.gain.setValueAtTime(0.0001, now)
  tg.gain.exponentialRampToValueAtTime(boot ? 0.3 : 0.16, now + 0.006)
  tg.gain.exponentialRampToValueAtTime(0.0001, now + 0.15)
  thud.connect(tg).connect(bus)
  thud.start(now)
  thud.stop(now + 0.18)
}
