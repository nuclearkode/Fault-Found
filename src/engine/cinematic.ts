/**
 * cinematic — the pre-shift sequence as DATA rather than as accumulated wall time.
 *
 * The old sequence integrated real delta time and fired `setTag`, `armFaults` and
 * `breakdown()` when that accumulator crossed a wall-clock threshold, with the
 * START pulse released by a `setTimeout`. On a machine that dropped frames the
 * thresholds were crossed at different points in the machine's own cycle, and a
 * `setTimeout` under load could land two or three frames late — so the order in
 * which things happened was not fixed, and the sound of it going wrong could
 * arrive before or after the thing that went wrong.
 *
 * Here the sequence is an ordered list of timestamped events plus one pure
 * function, `crossed()`, that says which of them a step of the clock passed. The
 * caller advances a FIXED 1/60 accumulator, so a browser that stalls for 400 ms
 * takes 24 steps on the next frame and every event in that window still fires,
 * exactly once, in timeline order. Nothing is skipped and nothing is reordered;
 * the sequence is simply delivered late.
 *
 * The camera is the other half of it. `cameraAt()` is a pure function of timeline
 * time — no lerp toward a moving target, no dependence on frame count — so the
 * same t always produces the same frame. That is what makes SKIPPING safe:
 * skipping is not a special case, it is setting t to the end and firing whatever
 * that step crossed, which by construction lands in the same state as watching.
 *
 * What this does NOT do, and it is worth being blunt about it: it does not
 * pre-render audio. Everything in src/audio is synthesised through WebAudio, and
 * once a voice is triggered its envelope is already scheduled on the audio
 * clock — sample-accurate, immune to frame drops. Playback was never the problem.
 * The problem was WHEN the trigger happened relative to everything else, and that
 * is what a timeline fixes. Nor does it make the cell itself deterministic: the
 * belt, the fill rate and the 20 Hz scan still integrate real dt, so the exact
 * carton position at t = 9.0 can differ by a frame's worth of travel between two
 * machines. What is now guaranteed is the ORDER and the SHOT.
 *
 * Architecture: pure TypeScript. No React, no Three.js — per rule 1.
 */

// ── Clock ────────────────────────────────────────────────────────────────────

/** The fixed step the sequence is advanced in. 60 Hz, independent of refresh. */
export const TICK = 1 / 60

/**
 * The most real time one frame may contribute, seconds.
 *
 * A backgrounded tab hands back a single enormous delta. Without a cap the
 * sequence would fast-forward through the fault and the briefing in one frame,
 * which is technically "in order" and useless. Capping bounds the catch-up to
 * 15 ticks per frame: a stalled machine finishes the sequence late, but it
 * finishes all of it.
 */
export const MAX_FRAME = 0.25

/** When the sequence hands over to the briefing. Also where a skip lands. */
export const CINEMATIC_END = 16

// ── Events ───────────────────────────────────────────────────────────────────

export type CineEventName =
  /** Press the operator's START button — the ladder does everything after this. */
  | 'press_start'
  /** ...and let it go. A momentary contact that never opens is a stuck button. */
  | 'release_start'
  /** The sound of it letting go. */
  | 'breakdown'
  /** The machine actually breaks. */
  | 'arm_faults'
  /** Belt squeal held under the symptom so the fault stays audible. */
  | 'squeal'
  /** Hand over to the operator's account. */
  | 'briefing'

/**
 * 'state' events change the game. 'audio' events only make a noise.
 *
 * The split is what lets a skip be exactly equivalent to watching: a skip fires
 * every 'state' event it passes and suppresses the 'audio' ones, because firing
 * a 1.6-second fault stinger at the same instant the briefing panel appears is
 * not "the same end state", it is a bug with a soundtrack.
 */
export type CineEventKind = 'state' | 'audio'

export interface CineEvent {
  /** Seconds into the sequence. Must be > 0 — see `crossed()`. */
  at: number
  name: CineEventName
  kind: CineEventKind
  /** Free numeric argument; currently only the squeal level uses it. */
  payload?: number
}

/**
 * The sequence. MUST stay sorted ascending by `at` — `crossed()` relies on the
 * matching window being contiguous, and the whole point of the module is that
 * the order is written down rather than emergent.
 *
 * Timings preserve the original pacing exactly: nine seconds of the line running
 * correctly, seven seconds of the symptom.
 */
export const TIMELINE: readonly CineEvent[] = [
  // A beat of the machine standing idle before anything is touched, so the
  // start is an event rather than the initial condition.
  { at: 0.60, name: 'press_start', kind: 'state' },
  // 180 ms of contact — three or four scans at 20 Hz, comfortably enough for the
  // seal-in to latch, and now a timeline entry instead of a setTimeout.
  { at: 0.78, name: 'release_start', kind: 'state' },

  // The cue lands a frame BEFORE the machine changes, which is how it reads as
  // cause rather than commentary. Two events at two timestamps rather than one
  // event doing both, so a skip can take the state and leave the noise.
  { at: 8.98, name: 'breakdown', kind: 'audio' },
  { at: 9.00, name: 'arm_faults', kind: 'state' },

  // Held under the symptom. A belt does not squeal once and go quiet; it grabs
  // and lets go for as long as the motor is turning, and keeping that under the
  // shot is half of what stops the fault reading as the game having stopped.
  { at: 11.40, name: 'squeal', kind: 'audio', payload: 0.7 },
  { at: 13.90, name: 'squeal', kind: 'audio', payload: 0.5 },

  { at: CINEMATIC_END, name: 'briefing', kind: 'state' },
]

const NONE: readonly CineEvent[] = []

/**
 * Which events a step of the clock passed, in timeline order.
 *
 * The window is half-open at the bottom and closed at the top — `prev < at <= next` —
 * so consecutive calls tile the line exactly and no event can fire twice or be
 * missed between two steps. An event at exactly 0 would never fire, which is why
 * `at` must be positive; the sequence starts from a held frame anyway.
 *
 * Returns a shared empty array when nothing was crossed, which is almost every
 * frame — this is called from inside useFrame and should not allocate for it.
 */
export function crossed(prev: number, next: number): readonly CineEvent[] {
  if (next <= prev) return NONE
  let lo = -1
  let hi = -1
  for (let i = 0; i < TIMELINE.length; i++) {
    const at = TIMELINE[i].at
    if (at > prev && at <= next) {
      if (lo < 0) lo = i
      hi = i
    }
  }
  return lo < 0 ? NONE : TIMELINE.slice(lo, hi + 1)
}

// ── The shot ─────────────────────────────────────────────────────────────────

export type Vec3 = readonly [number, number, number]

/**
 * A camera move, world space.
 *
 * Deliberately a dolly rather than an orbit — an orbit reads as a product demo,
 * a push reads as someone walking up to look at a machine.
 *
 * `from` → `to` is the establishing push, and it is over by the time the fault
 * lands. `to` → `drift` is what happens AFTER, and it is the answer to the
 * complaint that the belt-slip scenario looks like a freeze: the symptom is that
 * nothing on the machine moves, so if the camera also stops, every pixel on
 * screen is static and the honest conclusion is that the game has crashed. The
 * drift creeps toward the drive end at about 6 cm/s while the look target pans
 * onto the roller that is still turning. The machine is broken; the shot is not.
 */
export interface Shot {
  /** Wide establishing position. */
  from: Vec3
  /** Where the push settles, by the time the fault lands. */
  to: Vec3
  /** Where the post-fault drift ends up — in toward the drive end. */
  drift: Vec3
  /** Look target during the push. */
  at: Vec3
  /** Look target the drift pans onto: the drive roller that is still turning. */
  atDrift: Vec3
}

/**
 * Per-rig framing. The silo cell sits at world [0, 0, -4], so its drive end —
 * gearbox, motor and the drive roller at model x = +2.91 — is around
 * [2.91, 0.81, -4.0]. That is what the drift pans onto, because during the
 * belt-slip fault it is the one part of the machine still moving.
 */
export const SHOTS = {
  silo_cell: {
    from:    [6.6, 2.55, 1.7],
    to:      [3.5, 1.62, -0.75],
    drift:   [3.05, 1.46, -1.42],
    at:      [0.35, 1.05, -3.55],
    atDrift: [1.65, 0.96, -3.9],
  },
  mps_line: {
    from:    [5.5, 2.4, 1.5],
    to:      [2.8, 1.6, -0.9],
    drift:   [2.38, 1.48, -1.46],
    at:      [0, 1.1, -3.6],
    atDrift: [1.2, 1.02, -3.72],
  },
} as const satisfies Record<string, Shot>

/** Framing for a rig id, falling back to the silo cell. */
export function shotFor(rig: string): Shot {
  return (SHOTS as Record<string, Shot | undefined>)[rig] ?? SHOTS.silo_cell
}

/** Camera position and look target, both world space. Written in place. */
export interface CameraPose {
  px: number; py: number; pz: number
  lx: number; ly: number; lz: number
}

/** A pose to hand to `cameraAt`. One per component; never allocate per frame. */
export function makePose(): CameraPose {
  return { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 }
}

/** How long the establishing push takes. Runs 1.5 s past the fault so the camera
 *  has already settled on the machine when it misbehaves. */
const PUSH_SECONDS = 10.5
/** When the post-fault drift begins — the moment the machine goes wrong. */
const DRIFT_FROM = 9.0

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Ease-out so the push settles rather than stopping dead. */
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 2.6)
}

/** Smoothstep, so the drift starts and ends without a visible corner. */
function smooth(t: number): number {
  const k = clamp01(t)
  return k * k * (3 - 2 * k)
}

function mix(a: number, b: number, k: number): number {
  return a + (b - a) * k
}

/**
 * Where the camera is at timeline time `t`. PURE — no history, no integration.
 *
 * The old version called `camera.position.lerpVectors(from, to, k)` every frame,
 * which is fine, and then the fix for the dead frame would have been to lerp
 * toward a moving target, which is not: an exponential lerp reaches a different
 * place depending on how many times it was evaluated, so two machines running
 * the same sequence would end up framing different things. Everything here is
 * evaluated from `t` alone, so they cannot.
 *
 * The sway is deliberate and tiny — under a centimetre, roughly a sixth of a
 * degree at working distance. It is not handheld camera-shake affectation; it is
 * insurance that no frame of this sequence is ever bit-identical to the last one,
 * which is the specific thing that made a stopped machine look like a crash.
 */
export function cameraAt(shot: Shot, t: number, out: CameraPose): CameraPose {
  const push = easeOut(clamp01(t / PUSH_SECONDS))
  const drift = smooth((t - DRIFT_FROM) / (CINEMATIC_END - DRIFT_FROM))

  // Establishing push, then a slow creep from where it settled toward the drive
  // end. Written as two independent terms of t rather than one chained move, so
  // neither can accumulate error from the other.
  out.px = mix(shot.from[0], shot.to[0], push) + (shot.drift[0] - shot.to[0]) * drift
  out.py = mix(shot.from[1], shot.to[1], push) + (shot.drift[1] - shot.to[1]) * drift
  out.pz = mix(shot.from[2], shot.to[2], push) + (shot.drift[2] - shot.to[2]) * drift

  out.lx = mix(shot.at[0], shot.atDrift[0], drift)
  out.ly = mix(shot.at[1], shot.atDrift[1], drift)
  out.lz = mix(shot.at[2], shot.atDrift[2], drift)

  // Sub-centimetre life. Incommensurate frequencies so it never visibly loops.
  out.px += 0.009 * Math.sin(t * 0.77) + 0.005 * Math.sin(t * 1.63 + 1.1)
  out.py += 0.006 * Math.sin(t * 0.53 + 0.4) + 0.004 * Math.sin(t * 1.21 + 2.3)
  out.pz += 0.007 * Math.sin(t * 0.61 + 2.0)

  return out
}

// ── Skip, and whether to advertise it ────────────────────────────────────────

/**
 * A one-bit latch: "the player asked to skip".
 *
 * Module state in the engine is unusual and worth justifying. The alternative
 * was for the key handler to reach into the component that owns the timeline,
 * and there isn't one — src/input/keymap.ts dispatches on UiFocus and has no
 * reference to PreShift, while PreShift's clock lives in a ref inside useFrame.
 * A single latched boolean between them is the smallest thing that works, and
 * because it is LATCHED and CONSUMED it is idempotent: it does not matter
 * whether the request arrives from keymap, from PreShift's own listener, or from
 * both on the same keystroke. That property is what makes the binding safe to
 * move into keymap.ts later without a flag day.
 *
 * Deliberately not in Zustand: nothing renders from it, and a store write per
 * keypress that only useFrame reads is a subscription nobody wants.
 */
let skipRequested = false

/** Ask for the rest of the sequence. Safe to call repeatedly. */
export function requestCinematicSkip(): void {
  skipRequested = true
}

/** Take the request, if there is one. Clears it. */
export function consumeCinematicSkip(): boolean {
  const s = skipRequested
  skipRequested = false
  return s
}

/** Drop any pending request — called when a new job rolls round. */
export function clearCinematicSkip(): void {
  skipRequested = false
}

/**
 * How many times a pre-shift sequence has actually been watched this session.
 *
 * Counted globally rather than per scenario, because what the hint teaches is a
 * CONTROL, not a scene. Once you know Escape skips, you know it on S05 as much
 * as on S02, and re-teaching it on every new job would put a UI element over the
 * one shot in the game that is meant to be watched without furniture on it.
 *
 * Session-scoped on purpose: it is a nudge, not a setting, and it costs nothing
 * to re-earn. See the integration note if this should survive a reload.
 */
let views = 0

/** Record that a sequence has started playing. */
export function noteCinematicView(): void {
  views++
}

/** How many have played, including the one running now. */
export function cinematicViews(): number {
  return views
}

/** Should the skip hint be on screen? True from the second viewing onward. */
export function shouldHintSkip(): boolean {
  return views >= 2
}
