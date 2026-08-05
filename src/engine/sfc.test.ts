import { describe, it, expect } from 'vitest'
import {
  initialState,
  evalExpr,
  activeOutputs,
  stepSfc,
  explainBlock,
  validateChart,
  type SfcChart,
  type SfcExpr,
  type SfcState,
  type SfcStep,
  type SfcTransition,
  type SfcUnmet,
} from './sfc'

// --- Builders -----------------------------------------------------------

const tag = (t: string): SfcExpr => ({ op: 'tag', tag: t })
const not = (term: SfcExpr): SfcExpr => ({ op: 'not', term })
const and = (...terms: SfcExpr[]): SfcExpr => ({ op: 'and', terms })
const or = (...terms: SfcExpr[]): SfcExpr => ({ op: 'or', terms })

type IO = Record<string, boolean>

function step(
  id: string,
  number: number,
  title: string,
  actions: SfcStep['actions'] = [],
  initial = false,
): SfcStep {
  return initial
    ? { id, number, title, actions, initial: true }
    : { id, number, title, actions }
}

function trans(
  id: string,
  number: number,
  from: string,
  to: string,
  expr: SfcExpr,
  title = id,
): SfcTransition {
  return { id, number, from, to, title, expr }
}

/**
 * The Festo Processing station (BE) sequence, cut to six steps.
 *
 * Rotary table indexes, clamp holds the part, drill goes down and comes back
 * up, the hole is checked, clamp releases, back to Grundstellung. Q_KLEMME is
 * latched at S3 and only cleared at S6, so it spans three steps — that span is
 * what the latch tests are actually about.
 */
function processingChart(): SfcChart {
  return {
    name: 'BE Processing — Bohren und Pruefen',
    steps: [
      step(
        'S1',
        1,
        'Grundstellung',
        [{ qualifier: 'N', tag: 'Q_LM_START', comment: 'Leuchtmelder START' }],
        true,
      ),
      step('S2', 2, 'Rundschalttisch takten', [
        { qualifier: 'N', tag: 'Q_TISCH' },
      ]),
      step('S3', 3, 'Werkstueck klemmen', [
        { qualifier: 'S', tag: 'Q_KLEMME', comment: 'Klemmzylinder ausfahren' },
      ]),
      step('S4', 4, 'Bohrmaschine ausfahren', [
        { qualifier: 'S', tag: 'Q_BOHRER' },
        { qualifier: 'N', tag: 'Q_HUB_AB' },
      ]),
      step('S5', 5, 'Bohrmaschine einfahren', [
        { qualifier: 'R', tag: 'Q_BOHRER' },
        { qualifier: 'N', tag: 'Q_HUB_AUF' },
      ]),
      step('S6', 6, 'Bohrlochpruefung', [
        { qualifier: 'R', tag: 'Q_KLEMME' },
        { qualifier: 'P', tag: 'Q_ZAEHLER', comment: 'Stueckzaehler +1' },
      ]),
    ],
    transitions: [
      trans(
        'T1',
        1,
        'S1',
        'S2',
        and(
          tag('I_START'),
          tag('B1_HUB_OBEN'),
          not(tag('B3_KLEMME_ZU')),
          not(tag('I_STOP')),
        ),
        'Start und Grundstellung',
      ),
      trans(
        'T2',
        2,
        'S2',
        'S3',
        and(tag('B5_TISCH_POS'), tag('B4_WERKSTUECK')),
        'Tisch in Position, Werkstueck erkannt',
      ),
      trans('T3', 3, 'S3', 'S4', tag('B3_KLEMME_ZU'), 'Klemme gespannt'),
      trans('T4', 4, 'S4', 'S5', tag('B2_HUB_UNTEN'), 'Bohrtiefe erreicht'),
      trans('T5', 5, 'S5', 'S6', tag('B1_HUB_OBEN'), 'Bohrer oben'),
      trans(
        'T6',
        6,
        'S6',
        'S1',
        or(tag('B6_LOCH_IO'), tag('I_QUIT')),
        'Pruefung i.O. oder quittiert',
      ),
    ],
  }
}

/** Two ways out of S1, listed in the array in the WRONG order on purpose. */
function branchChart(): SfcChart {
  return {
    name: 'Weiche',
    steps: [
      step('S1', 1, 'Pruefen', [], true),
      step('S2', 2, 'Gutteil ausschleusen'),
      step('S3', 3, 'Ausschuss ausschleusen'),
    ],
    transitions: [
      trans('T9', 9, 'S1', 'S3', tag('B_NIO'), 'Teil n.i.O.'),
      trans('T2', 2, 'S1', 'S2', tag('B_IO'), 'Teil i.O.'),
      trans('T3', 3, 'S2', 'S1', tag('B_FREI')),
      trans('T4', 4, 'S3', 'S1', tag('B_FREI')),
    ],
  }
}

/** Three steps in a ring, every transition on the same always-true tag. */
function chainChart(): SfcChart {
  return {
    name: 'Kette',
    steps: [
      step('S1', 1, 'Eins', [], true),
      step('S2', 2, 'Zwei'),
      step('S3', 3, 'Drei'),
    ],
    transitions: [
      trans('T1', 1, 'S1', 'S2', tag('GO')),
      trans('T2', 2, 'S2', 'S3', tag('GO')),
      trans('T3', 3, 'S3', 'S1', tag('GO')),
    ],
  }
}

/**
 * Wrap an arbitrary expression in a minimal valid chart so `explainBlock` can
 * be pointed at it. Everything about the surrounding chart is deliberately
 * boring; only T1's condition is under test.
 */
function probeChart(expr: SfcExpr): SfcChart {
  return {
    name: 'Probe',
    steps: [step('S1', 1, 'Warten', [], true), step('S2', 2, 'Weiter')],
    transitions: [
      trans('T1', 1, 'S1', 'S2', expr),
      trans('T2', 2, 'S2', 'S1', tag('NEVER')),
    ],
  }
}

function unmetFor(expr: SfcExpr, io: IO): SfcUnmet[] {
  const chart = probeChart(expr)
  return explainBlock(chart, initialState(chart), io).flatMap((b) => b.unmet)
}

function blocksFor(expr: SfcExpr, io: IO): number {
  const chart = probeChart(expr)
  return explainBlock(chart, initialState(chart), io).length
}

/** Every assignment of `tags`, as an I/O image. */
function assignments(tags: string[]): IO[] {
  const out: IO[] = []
  for (let mask = 0; mask < 1 << tags.length; mask++) {
    const io: IO = {}
    tags.forEach((t, i) => {
      io[t] = (mask & (1 << i)) !== 0
    })
    out.push(io)
  }
  return out
}

// --- evalExpr -----------------------------------------------------------

describe('evalExpr', () => {
  it('reads a bare tag', () => {
    expect(evalExpr(tag('B1'), { B1: true })).toBe(true)
    expect(evalExpr(tag('B1'), { B1: false })).toBe(false)
  })

  it('reads a tag the I/O image does not carry as false, like an open input', () => {
    expect(evalExpr(tag('B_NICHT_VERDRAHTET'), {})).toBe(false)
    expect(evalExpr(not(tag('B_NICHT_VERDRAHTET')), {})).toBe(true)
  })

  it('matches hand-computed truth for a nested and/or/not expression', () => {
    // I_START AND (B1 OR NOT B2) AND NOT I_STOP
    const expr = and(
      tag('I_START'),
      or(tag('B1'), not(tag('B2'))),
      not(tag('I_STOP')),
    )
    for (const io of assignments(['I_START', 'B1', 'B2', 'I_STOP'])) {
      const expected =
        io.I_START === true &&
        (io.B1 === true || io.B2 !== true) &&
        io.I_STOP !== true
      expect(evalExpr(expr, io)).toBe(expected)
    }
  })

  it('obeys De Morgan under double negation', () => {
    const lhs = not(and(tag('A'), or(tag('B'), tag('C'))))
    const rhs = or(not(tag('A')), and(not(tag('B')), not(tag('C'))))
    for (const io of assignments(['A', 'B', 'C'])) {
      expect(evalExpr(lhs, io)).toBe(evalExpr(rhs, io))
    }
  })

  it('nests NOT arbitrarily deep', () => {
    expect(evalExpr(not(not(not(tag('A')))), { A: true })).toBe(false)
    expect(evalExpr(not(not(tag('A'))), { A: true })).toBe(true)
  })

  it('treats an empty and as vacuously true and an empty or as false', () => {
    // Documented trap, not an accident — validateChart is what rejects these.
    expect(evalExpr(and(), {})).toBe(true)
    expect(evalExpr(or(), {})).toBe(false)
  })
})

// --- initialState -------------------------------------------------------

describe('initialState', () => {
  it('parks the token on the step marked initial, with no elapsed time', () => {
    const state = initialState(processingChart())
    expect(state.activeStep).toBe('S1')
    expect(state.stepElapsedMs).toBe(0)
  })

  it('applies the initial step S/R actions immediately', () => {
    const chart = processingChart()
    chart.steps[0].actions.push({ qualifier: 'S', tag: 'Q_FREIGABE' })
    chart.steps[0].actions.push({ qualifier: 'R', tag: 'Q_STOERUNG' })
    expect(initialState(chart).latched).toEqual({
      Q_FREIGABE: true,
      Q_STOERUNG: false,
    })
  })

  it('leaves latches empty when the initial step only drives N actions', () => {
    // S1's Q_LM_START is N — a live drive, nothing retained.
    expect(initialState(processingChart()).latched).toEqual({})
  })

  it('refuses a chart with no initial step', () => {
    const chart = processingChart()
    delete chart.steps[0].initial
    expect(() => initialState(chart)).toThrow(/exactly one initial step/)
  })

  it('refuses a chart with two initial steps', () => {
    const chart = processingChart()
    chart.steps[3].initial = true
    expect(() => initialState(chart)).toThrow(/exactly one initial step/)
  })
})

// --- Transition firing --------------------------------------------------

describe('stepSfc', () => {
  it('accumulates elapsed time and fires nothing while the condition is false', () => {
    const chart = processingChart()
    let state = initialState(chart)
    const io: IO = { I_START: false, B1_HUB_OBEN: true }

    for (let i = 0; i < 3; i++) {
      const result = stepSfc(chart, state, io, 16)
      expect(result.fired).toBeNull()
      state = result.state
    }
    expect(state.activeStep).toBe('S1')
    expect(state.stepElapsedMs).toBe(48)
  })

  it('resets elapsed time to zero on the step it enters', () => {
    const chart = chainChart()
    let state = initialState(chart)
    state = stepSfc(chart, state, {}, 500).state
    expect(state.stepElapsedMs).toBe(500)
    state = stepSfc(chart, state, { GO: true }, 16).state
    expect(state.activeStep).toBe('S2')
    expect(state.stepElapsedMs).toBe(0)
  })

  it('fires exactly ONE transition per call even when the whole chain is true', () => {
    const chart = chainChart()
    const io: IO = { GO: true }
    let state = initialState(chart)

    const first = stepSfc(chart, state, io, 16)
    expect(first.fired?.id).toBe('T1')
    expect(first.state.activeStep).toBe('S2')

    const second = stepSfc(chart, first.state, io, 16)
    expect(second.fired?.id).toBe('T2')
    expect(second.state.activeStep).toBe('S3')

    const third = stepSfc(chart, second.state, io, 16)
    expect(third.fired?.id).toBe('T3')
    expect(third.state.activeStep).toBe('S1')

    state = third.state
    expect(state.activeStep).toBe('S1')
  })

  it('breaks a tie on the LOWEST transition number, not on array order', () => {
    // T9 is listed first in branchChart().transitions precisely so that an
    // implementation that just scans the array picks the wrong branch here.
    const chart = branchChart()
    const both: IO = { B_IO: true, B_NIO: true }
    const result = stepSfc(chart, initialState(chart), both, 16)
    expect(result.fired?.id).toBe('T2')
    expect(result.state.activeStep).toBe('S2')
  })

  it('still takes the high-numbered branch when it is the only one true', () => {
    const chart = branchChart()
    const result = stepSfc(chart, initialState(chart), { B_NIO: true }, 16)
    expect(result.fired?.id).toBe('T9')
    expect(result.state.activeStep).toBe('S3')
  })

  it('never mutates the state it was handed', () => {
    const chart = processingChart()
    const before = initialState(chart)
    const snapshot: SfcState = {
      activeStep: before.activeStep,
      stepElapsedMs: before.stepElapsedMs,
      latched: { ...before.latched },
    }
    const io: IO = { I_START: true, B1_HUB_OBEN: true }

    const result = stepSfc(chart, before, io, 16)
    expect(before).toEqual(snapshot)
    expect(result.state).not.toBe(before)
    expect(result.state.latched).not.toBe(before.latched)
  })

  it('throws when the state points at a step the chart does not contain', () => {
    const chart = processingChart()
    const bogus: SfcState = {
      activeStep: 'S42',
      stepElapsedMs: 0,
      latched: {},
    }
    expect(() => stepSfc(chart, bogus, {}, 16)).toThrow(/no step "S42"/)
    expect(() => activeOutputs(chart, bogus)).toThrow(/no step "S42"/)
    expect(() => explainBlock(chart, bogus, {})).toThrow(/no step "S42"/)
  })
})

// --- Actions and latching -----------------------------------------------

describe('activeOutputs', () => {
  it('drives the active step N actions and nothing else', () => {
    const chart = processingChart()
    expect(activeOutputs(chart, initialState(chart))).toEqual({
      Q_LM_START: true,
    })
  })

  it('drops an N output the moment the token leaves the step', () => {
    const chart = processingChart()
    const atS5: SfcState = {
      activeStep: 'S5',
      stepElapsedMs: 0,
      latched: {},
    }
    // Q_HUB_AB is S4's N action. It must be ABSENT, not merely false —
    // nothing retained it, so there is no bit for it to be false in.
    expect('Q_HUB_AB' in activeOutputs(chart, atS5)).toBe(false)
    expect(activeOutputs(chart, atS5).Q_HUB_AUF).toBe(true)
  })

  it('holds an S latch across every step until an R clears it', () => {
    const chart = processingChart()
    const io: IO = {
      I_START: true,
      B1_HUB_OBEN: true,
      B3_KLEMME_ZU: false,
      I_STOP: false,
    }
    let state = initialState(chart)
    expect(activeOutputs(chart, state).Q_KLEMME).toBeUndefined()

    // S1 -> S2
    state = stepSfc(chart, state, io, 16).state
    expect(state.activeStep).toBe('S2')

    // S2 -> S3, where the clamp is latched.
    state = stepSfc(
      chart,
      state,
      { B5_TISCH_POS: true, B4_WERKSTUECK: true },
      16,
    ).state
    expect(state.activeStep).toBe('S3')
    expect(state.latched.Q_KLEMME).toBe(true)
    expect(activeOutputs(chart, state).Q_KLEMME).toBe(true)

    // S3 -> S4. Clamp still held, drill latched on top of it.
    state = stepSfc(chart, state, { B3_KLEMME_ZU: true }, 16).state
    expect(state.activeStep).toBe('S4')
    expect(activeOutputs(chart, state)).toMatchObject({
      Q_KLEMME: true,
      Q_BOHRER: true,
      Q_HUB_AB: true,
    })

    // S4 -> S5. The drill R fires; the clamp is untouched by it.
    state = stepSfc(chart, state, { B2_HUB_UNTEN: true }, 16).state
    expect(state.activeStep).toBe('S5')
    expect(activeOutputs(chart, state)).toMatchObject({
      Q_KLEMME: true,
      Q_BOHRER: false,
      Q_HUB_AUF: true,
    })

    // S5 -> S6, three steps after the S: only now does the clamp release.
    state = stepSfc(chart, state, { B1_HUB_OBEN: true }, 16).state
    expect(state.activeStep).toBe('S6')
    expect(activeOutputs(chart, state).Q_KLEMME).toBe(false)
  })

  it('pulses a P action for the entry scan only', () => {
    const chart = processingChart()
    // Arrive at S6 the way the game does — by firing T5 with real elapsed time
    // on the clock — because the pulse is defined by the elapsed reset, not by
    // a hand-built state that happens to read zero.
    const onS5: SfcState = { activeStep: 'S5', stepElapsedMs: 940, latched: {} }
    const entry = stepSfc(chart, onS5, { B1_HUB_OBEN: true }, 16)
    expect(entry.fired?.id).toBe('T5')
    expect(entry.state.activeStep).toBe('S6')
    expect(activeOutputs(chart, entry.state).Q_ZAEHLER).toBe(true)

    // One more scan with no transition satisfied: still on S6, pulse gone.
    const later = stepSfc(chart, entry.state, {}, 16)
    expect(later.fired).toBeNull()
    expect(later.state.activeStep).toBe('S6')
    expect('Q_ZAEHLER' in activeOutputs(chart, later.state)).toBe(false)
  })

  it('lets an N action override a latch the same step just cleared', () => {
    // S2 carries both R Q_M1 and N Q_M1: the retained bit goes away, but the
    // step is actively driving the output for as long as it holds the token.
    const chart: SfcChart = {
      name: 'Ueberlagerung',
      steps: [
        step('S1', 1, 'Setzen', [{ qualifier: 'S', tag: 'Q_M1' }], true),
        step('S2', 2, 'Ruecksetzen und treiben', [
          { qualifier: 'R', tag: 'Q_M1' },
          { qualifier: 'N', tag: 'Q_M1' },
        ]),
        step('S3', 3, 'Leerlauf'),
      ],
      transitions: [
        trans('T1', 1, 'S1', 'S2', tag('GO')),
        trans('T2', 2, 'S2', 'S3', tag('GO')),
        trans('T3', 3, 'S3', 'S1', tag('GO')),
      ],
    }
    expect(validateChart(chart)).toEqual([])

    const io: IO = { GO: true }
    const atS2 = stepSfc(chart, initialState(chart), io, 16).state
    expect(atS2.activeStep).toBe('S2')
    expect(atS2.latched.Q_M1).toBe(false)
    expect(activeOutputs(chart, atS2).Q_M1).toBe(true)

    // Token moves on: the N hand comes off and the cleared latch shows through.
    const atS3 = stepSfc(chart, atS2, io, 16).state
    expect(atS3.activeStep).toBe('S3')
    expect(activeOutputs(chart, atS3).Q_M1).toBe(false)
  })

  it('expresses a motor left running when its R is deleted', () => {
    // The whole reason S/R exist in this model. Strip S5's reset and the drill
    // is still turning back at Grundstellung, one full cycle later.
    const chart = processingChart()
    chart.steps[4].actions = chart.steps[4].actions.filter(
      (a) => a.tag !== 'Q_BOHRER',
    )

    let state = initialState(chart)
    const script: IO[] = [
      { I_START: true, B1_HUB_OBEN: true },
      { B5_TISCH_POS: true, B4_WERKSTUECK: true },
      { B3_KLEMME_ZU: true },
      { B2_HUB_UNTEN: true },
      { B1_HUB_OBEN: true },
      { B6_LOCH_IO: true },
    ]
    for (const io of script) {
      const result = stepSfc(chart, state, io, 16)
      expect(result.fired).not.toBeNull()
      state = result.state
    }

    expect(state.activeStep).toBe('S1')
    expect(activeOutputs(chart, state).Q_BOHRER).toBe(true)

    // Same cycle on the unmodified chart leaves it off — so the fault above is
    // the missing R and nothing else about the sequence.
    const healthy = processingChart()
    let clean = initialState(healthy)
    for (const io of script) clean = stepSfc(healthy, clean, io, 16).state
    expect(clean.activeStep).toBe('S1')
    expect(activeOutputs(healthy, clean).Q_BOHRER).toBe(false)
  })
})

// --- explainBlock -------------------------------------------------------

describe('explainBlock — AND conditions', () => {
  it('names only the unsatisfied terms of an AND', () => {
    const chart = processingChart()
    const io: IO = {
      I_START: true, // satisfied
      B1_HUB_OBEN: false, // wanted true
      B3_KLEMME_ZU: true, // wanted false
      I_STOP: false, // satisfied
    }
    const blocks = explainBlock(chart, initialState(chart), io)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].transition.id).toBe('T1')
    expect(blocks[0].unmet).toEqual([
      { tag: 'B1_HUB_OBEN', wanted: true, actual: false },
      { tag: 'B3_KLEMME_ZU', wanted: false, actual: true },
    ])
  })

  it('reports a negated leaf as wanted false, not as a missing tag', () => {
    expect(unmetFor(and(tag('A'), not(tag('B'))), { A: true, B: true })).toEqual(
      [{ tag: 'B', wanted: false, actual: true }],
    )
  })

  it('says nothing at all once the transition is satisfied', () => {
    const chart = processingChart()
    const io: IO = { I_START: true, B1_HUB_OBEN: true }
    expect(explainBlock(chart, initialState(chart), io)).toEqual([])
  })

  it('fixing every leaf it named makes the transition fire', () => {
    // The contract the player is actually relying on for an AND-of-literals:
    // do what the laptop says, the machine moves.
    const chart = processingChart()
    const io: IO = { I_START: false, B1_HUB_OBEN: false, B3_KLEMME_ZU: true }
    const blocks = explainBlock(chart, initialState(chart), io)
    expect(blocks[0].unmet.length).toBeGreaterThan(0)

    const fixed: IO = { ...io }
    for (const u of blocks[0].unmet) fixed[u.tag] = u.wanted
    const result = stepSfc(chart, initialState(chart), fixed, 16)
    expect(result.fired?.id).toBe('T1')
  })
})

describe('explainBlock — OR conditions', () => {
  it('stays silent about the untaken branch when the OR already holds', () => {
    const chart = processingChart()
    const atS6: SfcState = { activeStep: 'S6', stepElapsedMs: 0, latched: {} }
    // B6 made, I_QUIT not pressed. I_QUIT is not a problem, it is an
    // alternative — reporting it would send the player to press a dead button.
    expect(explainBlock(chart, atS6, { B6_LOCH_IO: true })).toEqual([])
  })

  it('names every branch when none of them holds', () => {
    const chart = processingChart()
    const atS6: SfcState = { activeStep: 'S6', stepElapsedMs: 0, latched: {} }
    const blocks = explainBlock(chart, atS6, {})
    expect(blocks).toHaveLength(1)
    expect(blocks[0].unmet).toEqual([
      { tag: 'B6_LOCH_IO', wanted: true, actual: false },
      { tag: 'I_QUIT', wanted: true, actual: false },
    ])
  })

  it('skips a nested OR that holds while still naming the failing AND terms', () => {
    const expr = and(tag('A'), or(tag('B'), tag('C')))
    expect(unmetFor(expr, { A: false, B: true, C: false })).toEqual([
      { tag: 'A', wanted: true, actual: false },
    ])
  })

  it('names both legs of a nested OR that fails, alongside the AND terms', () => {
    const expr = and(tag('A'), or(tag('B'), tag('C')))
    expect(unmetFor(expr, { A: false, B: false, C: false })).toEqual([
      { tag: 'A', wanted: true, actual: false },
      { tag: 'B', wanted: true, actual: false },
      { tag: 'C', wanted: true, actual: false },
    ])
    expect(unmetFor(expr, { A: true, B: false, C: false })).toEqual([
      { tag: 'B', wanted: true, actual: false },
      { tag: 'C', wanted: true, actual: false },
    ])
  })

  it('inverts the regimes under NOT: a NOT-AND wants any one term to drop', () => {
    // NOT (A AND B) with both made: either one going false fixes it, so both
    // are reported, and both are reported as wanted FALSE.
    expect(unmetFor(not(and(tag('A'), tag('B'))), { A: true, B: true })).toEqual(
      [
        { tag: 'A', wanted: false, actual: true },
        { tag: 'B', wanted: false, actual: true },
      ],
    )
    // With A already clear the condition holds — no block at all.
    expect(blocksFor(not(and(tag('A'), tag('B'))), { A: false, B: true })).toBe(
      0,
    )
  })

  it('skips a nested NOT-AND that already holds', () => {
    // The satisfied-branch guard is only ever reached through NESTING —
    // explainBlock short-circuits a satisfied transition before it walks the
    // tree — so this is the case that actually exercises it for the NOT-AND
    // regime. B and C are not problems here; the interlock is already clear.
    const expr = and(tag('A'), not(and(tag('B'), tag('C'))))
    expect(unmetFor(expr, { A: false, B: true, C: false })).toEqual([
      { tag: 'A', wanted: true, actual: false },
    ])
    expect(unmetFor(expr, { A: false, B: true, C: true })).toEqual([
      { tag: 'A', wanted: true, actual: false },
      { tag: 'B', wanted: false, actual: true },
      { tag: 'C', wanted: false, actual: true },
    ])
  })

  it('inverts the regimes under NOT: a NOT-OR is a checklist of things to clear', () => {
    // NOT (A OR B) needs BOTH clear, so only the one still made is reported.
    expect(unmetFor(not(or(tag('A'), tag('B'))), { A: true, B: false })).toEqual(
      [{ tag: 'A', wanted: false, actual: true }],
    )
  })

  it('reports both legs of an OR-of-ANDs, each with its own polarity', () => {
    const expr = or(and(tag('A'), tag('B')), and(not(tag('A')), tag('C')))
    expect(unmetFor(expr, { A: true, B: false, C: false })).toEqual([
      { tag: 'B', wanted: true, actual: false },
      { tag: 'A', wanted: false, actual: true },
      { tag: 'C', wanted: true, actual: false },
    ])
  })
})

describe('explainBlock — bookkeeping', () => {
  it('lists a tag once however many legs quote it', () => {
    const expr = and(tag('I_STOP_OK'), or(tag('I_STOP_OK'), tag('B_ALT')))
    expect(unmetFor(expr, { I_STOP_OK: false, B_ALT: false })).toEqual([
      { tag: 'I_STOP_OK', wanted: true, actual: false },
      { tag: 'B_ALT', wanted: true, actual: false },
    ])
  })

  it('gives one block per blocked outgoing transition, in transition-number order', () => {
    const chart = branchChart()
    const blocks = explainBlock(chart, initialState(chart), {})
    expect(blocks.map((b) => b.transition.id)).toEqual(['T2', 'T9'])
    expect(blocks[0].unmet).toEqual([
      { tag: 'B_IO', wanted: true, actual: false },
    ])
    expect(blocks[1].unmet).toEqual([
      { tag: 'B_NIO', wanted: true, actual: false },
    ])
  })

  it('reports only the branch still blocked when the other one is open', () => {
    const chart = branchChart()
    const blocks = explainBlock(chart, initialState(chart), { B_IO: true })
    expect(blocks.map((b) => b.transition.id)).toEqual(['T9'])
  })

  it('always reports wanted as the opposite of the value actually read', () => {
    // Holds by construction — a leaf only surfaces when actual !== wanted — and
    // it is what makes deduping on the tag alone sound.
    const exprs: SfcExpr[] = [
      and(tag('A'), not(tag('B')), or(tag('C'), not(tag('A')))),
      not(and(or(tag('A'), tag('B')), not(tag('C')))),
      or(and(tag('A'), tag('B')), and(not(tag('B')), tag('C'))),
      not(not(and(tag('A'), or(not(tag('B')), tag('C'))))),
    ]
    let seenAny = false
    for (const expr of exprs) {
      for (const io of assignments(['A', 'B', 'C'])) {
        for (const u of unmetFor(expr, io)) {
          seenAny = true
          expect(u.wanted).toBe(!u.actual)
          expect(u.actual).toBe(io[u.tag] === true)
        }
      }
    }
    expect(seenAny).toBe(true)
  })
})

// --- validateChart ------------------------------------------------------

describe('validateChart', () => {
  it('passes a well-formed chart', () => {
    expect(validateChart(processingChart())).toEqual([])
    expect(validateChart(branchChart())).toEqual([])
    expect(validateChart(chainChart())).toEqual([])
  })

  it('catches a chart with no initial step', () => {
    const chart = processingChart()
    delete chart.steps[0].initial
    const errors = validateChart(chart)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/no step is marked initial/)
  })

  it('catches a chart with two initial steps, naming both', () => {
    const chart = processingChart()
    chart.steps[3].initial = true
    const errors = validateChart(chart)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/2 steps are marked initial \(S1, S4\)/)
  })

  it('catches a transition leading to a step that does not exist', () => {
    const chart = processingChart()
    chart.transitions[2].to = 'S99'
    const errors = validateChart(chart)
    expect(errors).toContainEqual(
      expect.stringMatching(/transition T3 leads to unknown step "S99"/),
    )
  })

  it('catches a transition leaving from a step that does not exist', () => {
    const chart = chainChart()
    chart.transitions.push(trans('T7', 7, 'S77', 'S1', tag('GO')))
    const errors = validateChart(chart)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/transition T7 leaves from unknown step "S77"/)
  })

  it('catches a step nothing can reach', () => {
    const chart = chainChart()
    chart.steps.push(step('S9', 9, 'Handbetrieb'))
    chart.transitions.push(trans('T9', 9, 'S9', 'S9', tag('GO')))
    const errors = validateChart(chart)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(
      /step S9 \("Handbetrieb"\) is unreachable from the initial step/,
    )
  })

  it('catches a step with no way out', () => {
    const chart = chainChart()
    chart.transitions = chart.transitions.filter((t) => t.from !== 'S3')
    const errors = validateChart(chart)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/step S3 \("Drei"\) has no outgoing transition/)
  })

  it('catches a duplicated step id', () => {
    const chart = chainChart()
    chart.steps.push(step('S2', 22, 'Zwei nochmal'))
    const errors = validateChart(chart)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/step id "S2" is declared more than once/)
  })

  it('catches empty and/or term lists, which are constants in disguise', () => {
    const chart = chainChart()
    chart.transitions[0].expr = and()
    chart.transitions[1].expr = or(tag('GO'), and(tag('A'), or()))
    const errors = validateChart(chart)
    expect(errors).toHaveLength(2)
    expect(errors[0]).toMatch(/transition T1 .* empty "and" .* fires immediately/)
    expect(errors[1]).toMatch(/transition T2 .* empty "or" .* never fires/)
  })

  it('returns every problem at once rather than stopping at the first', () => {
    const chart: SfcChart = {
      name: 'Kaputt',
      steps: [step('S1', 1, 'Eins'), step('S2', 2, 'Zwei')],
      transitions: [trans('T1', 1, 'S1', 'S404', tag('GO'))],
    }
    const errors = validateChart(chart)
    expect(errors).toHaveLength(3)
    expect(errors.join('\n')).toMatch(/no step is marked initial/)
    expect(errors.join('\n')).toMatch(/T1 leads to unknown step "S404"/)
    expect(errors.join('\n')).toMatch(/step S2 \("Zwei"\) has no outgoing/)
  })
})
