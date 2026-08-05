/**
 * SFC / S7-GRAPH Sequence Model
 *
 * A sequential function chart: a token that sits on exactly one step, actions
 * the step drives while it holds the token, and transitions the token crosses
 * when their boolean condition comes true. This is the shape a Siemens
 * S7-GRAPH FB has on screen, cut down to the part a player can be asked to
 * diagnose.
 *
 * This module is PURE TypeScript — no React, no Three.js (architecture rule 1).
 *
 * WHY this exists at all, given `ladder.ts` already models logic: ladder tells
 * you whether a rung conducts RIGHT NOW. It cannot tell you why a machine that
 * is powered, unfaulted and reporting "ready" simply will not move. A real
 * Festo Processing station stops mid-cycle because Schritt 4 is waiting on one
 * end-position sensor that never made, and nothing on the panel says so. The
 * whole point of `explainBlock` is to turn "it's just sitting there" into
 * "Transition 4 wants B2 (Hubzylinder unten) TRUE and it reads FALSE" — which
 * is a sentence a player can walk out to the machine and act on.
 *
 * The chart is deliberately SINGLE-TOKEN: no simultaneous branches. The real
 * station does run the drilling module and the checking module on different
 * table positions at once, and modelling that properly would mean parallel
 * branch tokens, which doubles the state and makes "where is the sequence
 * stuck" ambiguous — you would have to ask "stuck in which branch". A player
 * reading one step number off a laptop is worth more than a structurally
 * complete chart, so the parallelism lives in the 3D layer and this stays one
 * token on one step.
 */

// --- Chart shape --------------------------------------------------------

/**
 * Action qualifiers, the useful subset of the IEC set.
 *
 * The stored ones (S/R) are why this model can express a fault at all. N alone
 * would make every output a pure function of the active step, so any wrong
 * output would be self-correcting the instant the sequence moved on, and the
 * classic "the drill motor was left running because nobody reset it" fault
 * would be impossible to author. S latches, and only an R somewhere later
 * clears it. Delete that R and the fault is real, permanent, and diagnosable.
 */
export type SfcQualifier = 'N' | 'S' | 'R' | 'P'

export interface SfcAction {
  /** N = while active, S = latch on, R = latch off, P = one scan on entry. */
  qualifier: SfcQualifier
  tag: string
  comment?: string
}

export interface SfcStep {
  id: string
  number: number
  /** Short machine-speak, as it reads on the panel: "Hubzylinder ausfahren". */
  title: string
  /** Plain English for the same thing — the laptop shows both. */
  comment?: string
  /** Exactly one step per chart. `validateChart` enforces it. */
  initial?: boolean
  actions: SfcAction[]
}

/**
 * A transition condition.
 *
 * A tree rather than the condition STRING `ladder.ts` parses, because
 * `explainBlock` has to walk the structure and report leaves with wanted-vs-
 * actual. Re-parsing a string on every laptop frame to answer that would work,
 * but it also means a typo in a scenario file becomes a runtime parse throw in
 * the middle of a shift instead of a load-time complaint from `validateChart`.
 */
export type SfcExpr =
  | { op: 'tag'; tag: string }
  | { op: 'not'; term: SfcExpr }
  | { op: 'and'; terms: SfcExpr[] }
  | { op: 'or'; terms: SfcExpr[] }

export interface SfcTransition {
  id: string
  /** Ties are broken by this, ascending — see `stepSfc`. */
  number: number
  from: string
  to: string
  title: string
  expr: SfcExpr
}

export interface SfcChart {
  name: string
  steps: SfcStep[]
  transitions: SfcTransition[]
}

// --- Runtime state ------------------------------------------------------

export interface SfcState {
  activeStep: string
  stepElapsedMs: number
  /** Tags held by an S action, cleared by an R action. Survives step changes. */
  latched: Record<string, boolean>
}

/** One leaf of a transition condition that is not going the way it needs to. */
export interface SfcUnmet {
  tag: string
  wanted: boolean
  actual: boolean
}

export interface SfcBlock {
  transition: SfcTransition
  unmet: SfcUnmet[]
}

// --- Reading I/O --------------------------------------------------------

/**
 * A tag the I/O image does not carry reads FALSE rather than throwing.
 *
 * Matches `scanCycle.evaluateCondition`, and matches the machine: an address
 * with nothing wired to it is an open input, and an open input is a zero. A
 * chart that references a tag no scenario defines is an authoring bug, and it
 * is `validateChart`'s job to be noisy about that at load time — not this
 * function's job to explode mid-scan.
 */
function read(io: Readonly<Record<string, boolean>>, tag: string): boolean {
  return io[tag] === true
}

/**
 * Evaluate a transition condition.
 *
 * An empty `and` is TRUE and an empty `or` is FALSE, which is the standard
 * vacuous reading and also a trap: an empty `and` fires unconditionally. Both
 * are flagged by `validateChart` rather than special-cased here, so the
 * evaluator stays a plain fold.
 */
export function evalExpr(
  e: SfcExpr,
  io: Readonly<Record<string, boolean>>,
): boolean {
  switch (e.op) {
    case 'tag':
      return read(io, e.tag)
    case 'not':
      return !evalExpr(e.term, io)
    case 'and':
      return e.terms.every((t) => evalExpr(t, io))
    case 'or':
      return e.terms.some((t) => evalExpr(t, io))
  }
}

// --- Chart lookup -------------------------------------------------------

function findStep(chart: SfcChart, id: string): SfcStep | undefined {
  return chart.steps.find((s) => s.id === id)
}

/**
 * A state pointing at a step the chart does not contain is a load-order bug
 * (state kept across a scenario swap, a hand-edited save), not a runtime
 * condition. Fail loudly — a chart silently parked on a step that does not
 * exist looks exactly like the fault the player is hunting.
 */
function requireStep(chart: SfcChart, id: string): SfcStep {
  const step = findStep(chart, id)
  if (step === undefined) {
    throw new Error(`sfc: chart "${chart.name}" has no step "${id}"`)
  }
  return step
}

/** Outgoing transitions of a step, in the order `stepSfc` considers them. */
function outgoing(chart: SfcChart, stepId: string): SfcTransition[] {
  return chart.transitions
    .filter((t) => t.from === stepId)
    .sort((a, b) => a.number - b.number)
}

/**
 * Apply a step's stored actions on ENTRY, returning a new latch record.
 *
 * S and R fire once, as the token arrives — not on every scan the step is
 * active. It makes no observable difference for S/R specifically (setting an
 * already-set bit is a no-op), but doing it on entry is what the S7-GRAPH
 * manual describes, and it keeps `stepSfc` the only function that can change
 * a latch, so "what turned this output on" has exactly one place to check.
 *
 * A step carrying both S and R for the same tag is nonsense the author should
 * fix; the last one in `actions` wins, deterministically.
 */
function applyEntryLatches(
  step: SfcStep,
  latched: Readonly<Record<string, boolean>>,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...latched }
  for (const action of step.actions) {
    if (action.qualifier === 'S') next[action.tag] = true
    else if (action.qualifier === 'R') next[action.tag] = false
  }
  return next
}

// --- Running the chart --------------------------------------------------

export function initialState(chart: SfcChart): SfcState {
  const initials = chart.steps.filter((s) => s.initial === true)
  if (initials.length !== 1) {
    throw new Error(
      `sfc: chart "${chart.name}" must have exactly one initial step, found ` +
        `${initials.length} — run validateChart at load time`,
    )
  }
  const start = initials[0]
  return {
    activeStep: start.id,
    stepElapsedMs: 0,
    latched: applyEntryLatches(start, {}),
  }
}

/**
 * What the chart is driving right now.
 *
 * Latches first, then the active step's live actions on top. That ordering is
 * the interesting part: if a tag was cleared by an R somewhere upstream but
 * the step we are on drives it N, it comes out TRUE. N is a hand on the valve;
 * the R only cleared a retained bit. The step wins for as long as it holds the
 * token, and the latch reappears underneath the moment the token leaves.
 *
 * P (pulse) is true only on the entry scan, which is exactly `stepElapsedMs
 * === 0`. `SfcState` carries no separate "first scan" flag on purpose — one
 * more field is one more thing that can be persisted, restored, or copied out
 * of sync with `activeStep`. The consequence worth knowing: a caller that
 * ticks `stepSfc` with dtMs === 0 never leaves the entry scan and so holds the
 * pulse indefinitely, which is why the game loop must pass real elapsed time
 * even while the world is otherwise frozen.
 */
export function activeOutputs(
  chart: SfcChart,
  state: SfcState,
): Record<string, boolean> {
  const step = requireStep(chart, state.activeStep)
  const out: Record<string, boolean> = { ...state.latched }
  const entryScan = state.stepElapsedMs === 0

  for (const action of step.actions) {
    if (action.qualifier === 'N') out[action.tag] = true
    else if (action.qualifier === 'P' && entryScan) out[action.tag] = true
  }
  return out
}

/**
 * Advance the chart by one scan.
 *
 * Returns a NEW state; `state` is never mutated, so the store can keep the
 * previous scan around to diff against — that diff is what the laptop's step
 * trace is drawn from.
 */
export function stepSfc(
  chart: SfcChart,
  state: SfcState,
  io: Readonly<Record<string, boolean>>,
  dtMs: number,
): { state: SfcState; fired: SfcTransition | null } {
  requireStep(chart, state.activeStep)

  // AT MOST ONE transition fires per call, and when several outgoing
  // transitions of the active step are simultaneously true the LOWEST-NUMBERED
  // one wins.
  //
  // That tie-break is a determinism decision, not an artefact of array order,
  // and it is load-bearing. The player single-steps this chart on the laptop
  // trying to work out why the sequence took the wrong branch; if the answer
  // depended on the order transitions happen to appear in the scenario JSON,
  // the same fault would reproduce differently between runs and the diagnosis
  // would be unfalsifiable. Sorting by the printed transition number makes the
  // branch choice a property of the PROGRAM — the thing on screen the player
  // is allowed to read and reason about.
  //
  // Firing only one per scan matters for the same reason: a chart that raced
  // through three steps in a single tick would show the player a step trace
  // that never contained the step where the machine actually paused.
  let fired: SfcTransition | null = null
  for (const transition of outgoing(chart, state.activeStep)) {
    if (evalExpr(transition.expr, io)) {
      fired = transition
      break
    }
  }

  if (fired === null) {
    return {
      state: { ...state, stepElapsedMs: state.stepElapsedMs + dtMs },
      fired: null,
    }
  }

  // Elapsed resets to 0 rather than carrying any remainder of dtMs. The
  // leftover would be sub-frame noise, and 0 is precisely what marks the entry
  // scan for P actions — see `activeOutputs`.
  const next = requireStep(chart, fired.to)
  return {
    state: {
      activeStep: next.id,
      stepElapsedMs: 0,
      latched: applyEntryLatches(next, state.latched),
    },
    fired,
  }
}

// --- Why is it stuck ----------------------------------------------------

/**
 * Every leaf of `e` that is not doing what it must for `e` to come out `want`.
 *
 * Two regimes, and getting them the right way round is the whole feature:
 *
 * CONJUNCTIVE (an `and` that must be true, an `or` that must be false) — every
 * term has to hold, so recurse into all of them. Terms that already hold
 * return nothing of their own accord, so what comes back is precisely the
 * offenders. This is the common case and it reads like a checklist:
 * Grundstellung demands four end-position sensors and names only the two that
 * are not made.
 *
 * DISJUNCTIVE (an `or` that must be true, an `and` that must be false) — any
 * ONE branch would do. If the node already holds, report nothing at all, even
 * though the untaken branches are individually false; those are not problems,
 * they are alternatives. If it does not hold, then every branch has failed and
 * every branch is a way out, so report all of their leaves. A player reading
 * "B6 or the manual QUIT button" understands that as a choice; a player shown
 * only the first branch would go and chase a sensor that did not need fixing.
 */
function unmetLeaves(
  e: SfcExpr,
  io: Readonly<Record<string, boolean>>,
  want: boolean,
): SfcUnmet[] {
  switch (e.op) {
    case 'tag': {
      const actual = read(io, e.tag)
      return actual === want ? [] : [{ tag: e.tag, wanted: want, actual }]
    }

    case 'not':
      // NOT contributes no leaf of its own; it flips what the subtree owes.
      return unmetLeaves(e.term, io, !want)

    case 'and':
      return want
        ? e.terms.flatMap((t) => unmetLeaves(t, io, true))
        : branchLeaves(e, e.terms, io, false)

    case 'or':
      return want
        ? branchLeaves(e, e.terms, io, true)
        : e.terms.flatMap((t) => unmetLeaves(t, io, false))
  }
}

/**
 * The disjunctive half of `unmetLeaves`: silent when satisfied, otherwise
 * every branch's leaves.
 *
 * The satisfied-check is not an optimisation and cannot be dropped. Without
 * it, `B6 OR QUIT` with B6 already made would still report QUIT as unmet, and
 * the laptop would send the player off to press a button that changes nothing.
 */
function branchLeaves(
  whole: SfcExpr,
  terms: SfcExpr[],
  io: Readonly<Record<string, boolean>>,
  want: boolean,
): SfcUnmet[] {
  if (evalExpr(whole, io) === want) return []
  return terms.flatMap((t) => unmetLeaves(t, io, want))
}

/**
 * Collapse repeats, keeping first-mentioned order.
 *
 * A tag can appear in several branches of one condition — an interlock quoted
 * once per leg is ordinary in generated S7-GRAPH — and listing it twice reads
 * as two separate faults to go and fix.
 *
 * Keyed on the tag alone, which is sound rather than merely convenient: a leaf
 * only lands here when `actual !== wanted`, and a tag has exactly one actual
 * value in a given I/O image, so every line for a given tag necessarily
 * carries the same `wanted`. There is no polarity to disambiguate. Even
 * `A AND NOT A` cannot produce two: whichever half is currently satisfied
 * contributes nothing.
 */
function dedupeUnmet(unmet: SfcUnmet[]): SfcUnmet[] {
  const seen = new Set<string>()
  const out: SfcUnmet[] = []
  for (const u of unmet) {
    if (seen.has(u.tag)) continue
    seen.add(u.tag)
    out.push(u)
  }
  return out
}

/**
 * Why the sequence is not advancing.
 *
 * One entry per outgoing transition of the ACTIVE step that is currently
 * false, each naming the leaves standing in its way, ordered by transition
 * number. A satisfied transition is not reported: it is blocking nothing, and
 * the next `stepSfc` will cross it.
 *
 * So an empty array means the chart is about to move — which is itself a
 * diagnosis, and an unwelcome one, because it says the sequence is healthy and
 * the fault is downstream in the wiring or the mechanics.
 */
export function explainBlock(
  chart: SfcChart,
  state: SfcState,
  io: Readonly<Record<string, boolean>>,
): SfcBlock[] {
  requireStep(chart, state.activeStep)

  const blocks: SfcBlock[] = []
  for (const transition of outgoing(chart, state.activeStep)) {
    if (evalExpr(transition.expr, io)) continue
    blocks.push({
      transition,
      unmet: dedupeUnmet(unmetLeaves(transition.expr, io, true)),
    })
  }
  return blocks
}

// --- Authoring checks ---------------------------------------------------

/** Empty `and`/`or` term lists anywhere in an expression — each is a constant. */
function constantTermLists(e: SfcExpr): ('and' | 'or')[] {
  switch (e.op) {
    case 'tag':
      return []
    case 'not':
      return constantTermLists(e.term)
    case 'and':
    case 'or':
      return e.terms.length === 0 ? [e.op] : e.terms.flatMap(constantTermLists)
  }
}

/**
 * Everything wrong with a chart, as sentences, before it is ever run.
 *
 * Called at scenario load. Every one of these is silent at runtime and vicious
 * in play: an unreachable step is machine behaviour the player will never see
 * fire, a step with no way out is a hang the player will spend the whole shift
 * mistaking for the fault they were sent to find, and both are indistinguish-
 * able from a correctly modelled machine right up until they aren't. Returns
 * every problem rather than the first, because a hand-authored chart usually
 * has three.
 */
export function validateChart(chart: SfcChart): string[] {
  const errors: string[] = []

  const byId = new Map<string, SfcStep>()
  for (const step of chart.steps) {
    if (byId.has(step.id)) {
      errors.push(`step id "${step.id}" is declared more than once`)
    } else {
      byId.set(step.id, step)
    }
  }

  const initials = chart.steps.filter((s) => s.initial === true)
  if (initials.length === 0) {
    errors.push('no step is marked initial — the chart has nowhere to start')
  } else if (initials.length > 1) {
    const named = initials.map((s) => s.id).join(', ')
    errors.push(
      `${initials.length} steps are marked initial (${named}) — exactly one may be`,
    )
  }

  const edges = new Map<string, string[]>()
  for (const transition of chart.transitions) {
    const fromKnown = byId.has(transition.from)
    if (!fromKnown) {
      errors.push(
        `transition ${transition.id} leaves from unknown step "${transition.from}"`,
      )
    }
    if (!byId.has(transition.to)) {
      errors.push(
        `transition ${transition.id} leads to unknown step "${transition.to}"`,
      )
    }
    for (const op of constantTermLists(transition.expr)) {
      const consequence =
        op === 'and' ? 'true and fires immediately' : 'false and never fires'
      errors.push(
        `transition ${transition.id} contains an empty "${op}" list, so it is ` +
          `always ${consequence}`,
      )
    }
    if (fromKnown) {
      const list = edges.get(transition.from)
      if (list === undefined) edges.set(transition.from, [transition.to])
      else list.push(transition.to)
    }
  }

  // Reachability walks from EVERY step marked initial, not just the first.
  // When two are marked, the count error above is already the real problem;
  // exploring both keeps this from piling on a page of bogus "unreachable"
  // lines for the half of the chart hanging off the second one.
  if (initials.length > 0) {
    const seen = new Set<string>()
    const queue: string[] = initials.map((s) => s.id)
    while (queue.length > 0) {
      const id = queue.pop()
      if (id === undefined || seen.has(id)) continue
      seen.add(id)
      for (const to of edges.get(id) ?? []) {
        if (byId.has(to) && !seen.has(to)) queue.push(to)
      }
    }
    for (const step of chart.steps) {
      if (!seen.has(step.id)) {
        errors.push(
          `step ${step.id} ("${step.title}") is unreachable from the initial step`,
        )
      }
    }
  }

  for (const step of chart.steps) {
    if ((edges.get(step.id) ?? []).length === 0) {
      errors.push(
        `step ${step.id} ("${step.title}") has no outgoing transition — the ` +
          `sequence deadlocks there`,
      )
    }
  }

  return errors
}
