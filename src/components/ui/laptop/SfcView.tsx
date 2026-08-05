'use client'

/**
 * SfcView — the sequence, drawn as a step chart, live.
 *
 * The ladder answers "is this rung making power". This pane answers the other
 * half of the question a technician actually asks on a stopped machine: WHERE IS
 * THE SEQUENCE SITTING, AND WHAT IS IT WAITING FOR. On the real BE station that
 * is the whole job — the drill motor is fine, the clamp is fine, and the cell is
 * parked on Schritt 4 because one Endlage never made, so the transition below it
 * never becomes true and nothing moves for the rest of the shift.
 *
 * Three things here are load-bearing:
 *
 * 1. THE ACTIVE STEP IS THE POINT OF THE PANE. It gets the green box, the heavy
 *    ring, the reversed step chip and the AKTIV flag, and everything above it is
 *    dimmed to say "already been through here". If a player cannot tell from the
 *    doorway which step the cell is parked on, this file has failed.
 *
 * 2. THE BLOCK IS SPELLED OUT, NOT IMPLIED. When the active step's transition is
 *    false, `explainBlock()` is asked which tags are unmet and the answer is
 *    printed at that transition, per tag, wanted against actual. That readout is
 *    the thing the player trades their shift clock for; it does not get buried.
 *
 * 3. NOTHING LIVE RE-RENDERS REACT. Same constraint and same solution as
 *    LadderView and IoTable: `gameStore.tags` is replaced twenty times a second
 *    by the scan cycle and written every frame by the cell, so React draws the
 *    chart's GEOMETRY once per chart, and a rAF-coalesced store subscription
 *    writes one-character `data-` attributes onto pre-indexed elements. Colour
 *    and the show/hide of the diagnosis block live entirely in CSS attribute
 *    selectors, so the loop never touches style.
 *
 * The chrome matches the rest of the terminal — light face, blue operands, green
 * power, amber for "true-looking but going nowhere" — and it borrows the step /
 * transition-bar grammar the maintenance manual already teaches in
 * `BookDiagrams.tsx`, so the chart on the laptop reads as the same chart the
 * player saw on the whiteboard.
 */

import { Fragment, useEffect, useMemo, useRef } from 'react'
import type { JSX } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { activeOutputs, evalExpr, explainBlock, validateChart } from '@/engine/sfc'
import type {
  SfcAction,
  SfcChart,
  SfcExpr,
  SfcState,
  SfcStep,
  SfcTransition,
  SfcUnmet,
} from '@/engine/sfc'

// --- Store seam ---------------------------------------------------------

/**
 * The two fields this pane reads that `gameStore` does not carry YET.
 *
 * This file is not allowed to edit the store, and `GameState` is a private
 * interface inside `gameStore.ts` so it cannot be reached by declaration
 * merging either. So the seam is made explicit and kept in ONE place instead of
 * being smeared across every selector: the store is widened to a partial view,
 * a missing field reads as `null`, and the pane renders its empty state rather
 * than throwing on a store that has not been wired yet.
 *
 * When the integrator adds `sfcChart` and `sfcState` to `GameState` under these
 * exact names, delete `widen` and let the two selectors below read `s.sfcChart`
 * and `s.sfcState` directly — nothing else in the file changes.
 */
interface SfcSlice {
  sfcChart: SfcChart | null
  sfcState: SfcState | null
}

function widen(state: unknown): Partial<SfcSlice> {
  return state as Partial<SfcSlice>
}

const selectChart = (s: unknown): SfcChart | null => widen(s).sfcChart ?? null
const selectState = (s: unknown): SfcState | null => widen(s).sfcState ?? null

// --- Conditions as readable text ---------------------------------------

type TokKind = 'tag' | 'op' | 'paren'
interface Tok {
  t: TokKind
  s: string
}

/**
 * Binding strength, so the printed condition carries only the parentheses it
 * needs. `NOT I0.5 AND I0.4` and `NOT (I0.5 AND I0.4)` are different machines
 * and the pane must never let them look alike.
 */
const PREC: Record<SfcExpr['op'], number> = { or: 1, and: 2, not: 3, tag: 4 }

function tokenise(e: SfcExpr, outer: number, out: Tok[]): void {
  switch (e.op) {
    case 'tag':
      out.push({ t: 'tag', s: e.tag })
      return

    case 'not':
      out.push({ t: 'op', s: 'NOT' })
      tokenise(e.term, PREC.not, out)
      return

    case 'and':
    case 'or': {
      // A degenerate group still has to print as something a person can read.
      // Empty AND is the identity TRUE and empty OR is FALSE, which is what any
      // every()/some() evaluator does with it.
      if (e.terms.length === 0) {
        out.push({ t: 'op', s: e.op === 'and' ? 'TRUE' : 'FALSE' })
        return
      }
      const prec = PREC[e.op]
      const word = e.op === 'and' ? 'AND' : 'OR'
      const wrap = prec < outer
      if (wrap) out.push({ t: 'paren', s: '(' })
      e.terms.forEach((term, i) => {
        if (i > 0) out.push({ t: 'op', s: word })
        tokenise(term, prec, out)
      })
      if (wrap) out.push({ t: 'paren', s: ')' })
      return
    }
  }
}

const condTokens = (e: SfcExpr): Tok[] => {
  const out: Tok[] = []
  tokenise(e, 0, out)
  return out
}

/** Spaces everywhere except hugging the parentheses. */
const spaced = (toks: Tok[], i: number): boolean =>
  i > 0 && toks[i - 1].s !== '(' && toks[i].s !== ')'

const condText = (toks: Tok[]): string =>
  toks.reduce((acc, k, i) => acc + (spaced(toks, i) ? ' ' : '') + k.s, '')

function Condition({ toks }: { toks: Tok[] }): JSX.Element {
  return (
    <span className="ff-sfc-cond">
      {toks.map((k, i) => (
        <Fragment key={i}>
          {spaced(toks, i) ? ' ' : null}
          <span className={`ff-sfc-tok ff-sfc-tok-${k.t}`}>{k.s}</span>
        </Fragment>
      ))}
    </span>
  )
}

// --- The literals a transition is made of -------------------------------

/**
 * One operand of a transition, with the value it has to hold for the transition
 * to be satisfied. Polarity flips under every NOT, which is exactly how
 * `explainBlock` reports it, so the rows rendered from this can be matched to
 * its `SfcUnmet` entries by key.
 *
 * These are extracted ONCE, at chart time, because the set of operands in a
 * transition never changes — only their values do. That is what lets the whole
 * diagnosis be a static list of rows with two live attributes on each.
 */
interface Lit {
  key: string
  tag: string
  wanted: boolean
}

/** `I:1/00=1`. Separator chosen so it cannot collide with a PLC address. */
const litKey = (tag: string, wanted: boolean): string =>
  `${tag}=${wanted ? '1' : '0'}`

function collectLits(e: SfcExpr, wanted: boolean, seen: Set<string>, out: Lit[]): void {
  switch (e.op) {
    case 'tag': {
      const key = litKey(e.tag, wanted)
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ key, tag: e.tag, wanted })
      }
      return
    }
    case 'not':
      collectLits(e.term, !wanted, seen, out)
      return
    case 'and':
    case 'or':
      for (const t of e.terms) collectLits(t, wanted, seen, out)
  }
}

const literalsOf = (e: SfcExpr): Lit[] => {
  const out: Lit[] = []
  collectLits(e, true, new Set<string>(), out)
  return out
}

// --- Chart model --------------------------------------------------------

interface StepRow {
  kind: 'step'
  step: SfcStep
  index: number
}

interface TrRow {
  kind: 'tr'
  tr: SfcTransition
  /** Position of `tr.from` in the walk order — the step this gate hangs under. */
  fromIndex: number
  /** Position of `tr.to`, or -1 when the chart names a step that does not exist. */
  toIndex: number
  /** Does the target simply follow on the page, or is this a jump / a loop back? */
  inline: boolean
  toks: Tok[]
  lits: Lit[]
}

type Row = StepRow | TrRow

interface ChartModel {
  /** Steps in the order the sequence walks them, which is the order drawn. */
  order: SfcStep[]
  rows: Row[]
  problems: string[]
}

/**
 * Outgoing transitions of a step, in the order the ENGINE considers them.
 *
 * `stepSfc` sorts a step's outgoing transitions by `number` and fires the lowest
 * one that is true — a deliberate determinism decision documented in `sfc.ts`,
 * so that which branch a chart takes is a property of the printed program rather
 * than of the order an author happened to type the transitions into the JSON.
 * The pane has to sort the same way or it draws a branching chart with the wrong
 * leg inline: the player would read "S4 falls through to S9" off the laptop
 * while the processor is about to go to S5. Layout and execution must not
 * disagree about what comes next.
 */
const outgoingOf = (chart: SfcChart, stepId: string): SfcTransition[] =>
  chart.transitions.filter((t) => t.from === stepId).sort((a, b) => a.number - b.number)

/**
 * Walk the chart from its initial step and lay the steps out in the order the
 * token actually visits them.
 *
 * Chart JSON order is the author's filing order, not the machine's; drawing that
 * would make "everything above the active step has already run" a lie the moment
 * an author reorders a step. Walking also gives the loop back to Grundstellung a
 * natural end — the walk stops when it reaches a step it has already drawn.
 * Anything unreachable is appended rather than dropped, because a step that the
 * sequence can never enter is a fault worth being able to see.
 */
function walkOrder(chart: SfcChart): SfcStep[] {
  const byId = new Map(chart.steps.map((s) => [s.id, s]))
  const order: SfcStep[] = []
  const seen = new Set<string>()

  // Explicitly optional: an empty chart has no first step, and the walk runs off
  // the end of any chart whose last step has no outgoing transition.
  let cur: SfcStep | undefined =
    chart.steps.find((s) => s.initial === true) ?? chart.steps[0]
  while (cur !== undefined && !seen.has(cur.id)) {
    seen.add(cur.id)
    order.push(cur)
    // Annotated because `cur` is assigned from this, and TypeScript will not
    // infer through the loop's own back-edge.
    const here: string = cur.id
    const next: SfcStep | undefined = outgoingOf(chart, here)
      .map((t) => byId.get(t.to))
      .find((s): s is SfcStep => s !== undefined && !seen.has(s.id))
    cur = next
  }

  for (const s of chart.steps) {
    if (!seen.has(s.id)) {
      seen.add(s.id)
      order.push(s)
    }
  }
  return order
}

function buildModel(chart: SfcChart | null): ChartModel | null {
  if (chart === null) return null

  const order = walkOrder(chart)
  const indexOf = new Map(order.map((s, i) => [s.id, i]))
  const rows: Row[] = []

  order.forEach((step, index) => {
    rows.push({ kind: 'step', step, index })
    for (const tr of outgoingOf(chart, step.id)) {
      const toIndex = indexOf.get(tr.to) ?? -1
      rows.push({
        kind: 'tr',
        tr,
        fromIndex: index,
        toIndex,
        inline: toIndex === index + 1,
        toks: condTokens(tr.expr),
        lits: literalsOf(tr.expr),
      })
    }
  })

  return { order, rows, problems: validateChart(chart) }
}

// --- Component ----------------------------------------------------------

const QUALIFIER_HINT: Record<SfcAction['qualifier'], string> = {
  N: 'non-stored — driven only while this step is active',
  S: 'set — latches the tag on and leaves it on',
  R: 'reset — unlatches the tag',
  P: 'pulse — one scan only, as the step is entered',
}

export function SfcView(): JSX.Element {
  const chart = useGameStore(selectChart)

  // Present only so the pane re-renders when a chart is first wired in or
  // swapped; the live reading of it happens in the paint loop below, which is
  // why nothing here subscribes to `stepElapsedMs`.
  const hasState = useGameStore((s) => selectState(s) !== null)

  // The LadderView / IoTable trick: the scan cycle replaces `tags` twenty times
  // a second but the SET of addresses only changes when a scenario loads, so
  // this selector returns an identical string on every scan and Zustand's
  // Object.is check stops the re-render at the store boundary. Never subscribe
  // to `s.tags` itself.
  const tagKeys = useGameStore((s) => Object.keys(s.tags).join(','))

  const symbolOf = useMemo<Record<string, string>>(() => {
    const tags = useGameStore.getState().tags
    const map: Record<string, string> = {}
    for (const id of tagKeys.split(',')) {
      if (id.length === 0) continue
      map[id] = tags[id]?.label ?? ''
    }
    return map
  }, [tagKeys])

  const model = useMemo(() => buildModel(chart), [chart])

  const rootRef = useRef<HTMLDivElement>(null)

  /**
   * The live layer.
   *
   * Everything below is written as `data-` attributes and text on elements React
   * has already placed, indexed once per chart. A steady machine costs zero DOM
   * writes per frame because every write is guarded by a previous-value cache;
   * a machine that is moving costs a handful of one-character attribute writes.
   *
   * `explainBlock` is the authority on WHY the sequence is stuck, and `evalExpr`
   * decides only whether a gate is currently satisfied — the two are separate on
   * purpose, so the colour of a transition bar and the diagnosis printed under
   * it can never come from different readings of the same scan.
   */
  useEffect(() => {
    const root = rootRef.current
    if (root === null || model === null || chart === null) return

    const steps = Array.from(root.querySelectorAll<HTMLElement>('[data-step-i]')).map(
      (el) => ({ el, i: Number(el.dataset.stepI) }),
    )
    const trs = Array.from(root.querySelectorAll<HTMLElement>('[data-tr-id]')).map((el) => ({
      el,
      id: el.dataset.trId ?? '',
      from: Number(el.dataset.trFrom),
    }))
    const lits = Array.from(root.querySelectorAll<HTMLElement>('[data-lit-key]')).map((el) => ({
      el,
      tr: el.dataset.litTr ?? '',
      key: el.dataset.litKey ?? '',
      tag: el.dataset.litTag ?? '',
      val: el.querySelector<HTMLElement>('[data-lit-val]'),
    }))
    const acts = Array.from(root.querySelectorAll<HTMLElement>('[data-act-tag]')).map((el) => ({
      el,
      tag: el.dataset.actTag ?? '',
      q: el.dataset.actQ ?? 'N',
    }))
    const clocks = Array.from(root.querySelectorAll<HTMLElement>('[data-elapsed-i]')).map(
      (el) => ({ el, i: Number(el.dataset.elapsedI) }),
    )
    const flagEl = root.querySelector<HTMLElement>('[data-sfc-flag]')
    const whereEl = root.querySelector<HTMLElement>('[data-sfc-where]')

    const prevStep = steps.map(() => '')
    const prevTr = trs.map(() => '')
    const prevLit = lits.map(() => '')
    const prevLitVal = lits.map(() => '')
    const prevAct = acts.map(() => '')
    const prevHold = acts.map(() => '')
    const prevClock = clocks.map(() => '')
    let prevFlag = ''
    let prevWhere = ''

    let raf = 0

    const paint = (): void => {
      raf = 0
      const game = useGameStore.getState()
      const state = selectState(game)

      // The engine wants a plain boolean image; the store carries IOTags whose
      // value may be numeric on an analogue point. Coercing here keeps `evalExpr`
      // and `explainBlock` reading the same world the ladder does.
      const io: Record<string, boolean> = {}
      for (const [id, tag] of Object.entries(game.tags)) io[id] = tag.value === true || tag.value === 1

      // `activeOutputs` and `explainBlock` both throw when the state names a step
      // the chart does not have, which is a real interval: the store can hold a
      // new chart for a frame before the scan cycle has re-seeded the state.
      // Resolving the index FIRST turns that into a pane that reads as "not
      // running" for one frame instead of an exception inside a rAF callback.
      const activeIndex =
        state === null ? -1 : model.order.findIndex((s) => s.id === state.activeStep)
      const live = state !== null && activeIndex >= 0
      const outputs = live && state !== null ? activeOutputs(chart, state) : {}
      const latched = state?.latched ?? {}

      const unmetByTr = new Map<string, Set<string>>()
      if (live && state !== null) {
        for (const block of explainBlock(chart, state, io)) {
          unmetByTr.set(
            block.transition.id,
            new Set(block.unmet.map((u: SfcUnmet) => litKey(u.tag, u.wanted))),
          )
        }
      }

      // --- steps: 0 not yet reached · 1 ACTIVE · 2 already passed this cycle
      for (let i = 0; i < steps.length; i++) {
        const t = steps[i]
        const st = activeIndex < 0 ? '0' : t.i === activeIndex ? '1' : t.i < activeIndex ? '2' : '0'
        if (prevStep[i] !== st) {
          prevStep[i] = st
          t.el.setAttribute('data-st', st)
        }
      }

      // --- transitions: 0 ahead · 1 BLOCKED here · 2 satisfied · 3 passed
      let held: TrRow | null = null
      for (let i = 0; i < trs.length; i++) {
        const t = trs[i]
        let st = '0'
        if (activeIndex >= 0) {
          if (t.from === activeIndex) {
            const tr = chart.transitions.find((x) => x.id === t.id)
            st = tr !== undefined && evalExpr(tr.expr, io) ? '2' : '1'
          } else if (t.from < activeIndex) {
            st = '3'
          }
        }
        if (prevTr[i] !== st) {
          prevTr[i] = st
          t.el.setAttribute('data-tst', st)
        }
        if (st === '1' && held === null) {
          const row = model.rows.find((r) => r.kind === 'tr' && r.tr.id === t.id)
          held = row !== undefined && row.kind === 'tr' ? row : null
        }
      }

      // --- the diagnosis rows: met, and the actual bit right now
      for (let i = 0; i < lits.length; i++) {
        const t = lits[i]
        const unmet = unmetByTr.get(t.tr)
        // No entry from explainBlock means this gate is not the one holding the
        // sequence, so every operand on it reads as met — the row is hidden by
        // CSS anyway unless its transition is the blocking one.
        const met = unmet === undefined || !unmet.has(t.key) ? '1' : '0'
        if (prevLit[i] !== met) {
          prevLit[i] = met
          t.el.setAttribute('data-met', met)
        }
        const actual = io[t.tag] === true ? '1' : '0'
        if (prevLitVal[i] !== actual && t.val !== null) {
          prevLitVal[i] = actual
          t.val.textContent = actual
          t.val.setAttribute('data-s', actual === '1' ? '2' : '0')
        }
      }

      // --- action chips: energised now, and held by an earlier S
      for (let i = 0; i < acts.length; i++) {
        const t = acts[i]
        const on = outputs[t.tag] === true ? '2' : '0'
        if (prevAct[i] !== on) {
          prevAct[i] = on
          t.el.setAttribute('data-s', on)
        }
        // Only worth saying on a latch: an N action is on because its step is
        // active, which the step highlight already says far more loudly.
        const hold = (t.q === 'S' || t.q === 'R') && latched[t.tag] === true ? '1' : '0'
        if (prevHold[i] !== hold) {
          prevHold[i] = hold
          t.el.setAttribute('data-h', hold)
        }
      }

      for (let i = 0; i < clocks.length; i++) {
        const t = clocks[i]
        const text =
          state !== null && t.i === activeIndex
            ? `${(state.stepElapsedMs / 1000).toFixed(1)} s in this step`
            : ''
        if (prevClock[i] !== text) {
          prevClock[i] = text
          t.el.textContent = text
        }
      }

      if (flagEl !== null) {
        const flag = !live ? '0' : held !== null ? '1' : '2'
        if (prevFlag !== flag) {
          prevFlag = flag
          flagEl.setAttribute('data-sfc-flag', flag)
          flagEl.textContent =
            flag === '0' ? 'NO CHART' : flag === '1' ? 'HELD' : 'STEPPING'
        }
      }

      if (whereEl !== null) {
        const where =
          activeIndex < 0
            ? `— of ${model.order.length}`
            : `${model.order[activeIndex].id} · step ${activeIndex + 1} of ${model.order.length}`
        if (prevWhere !== where) {
          prevWhere = where
          whereEl.textContent = where
        }
      }
    }

    const schedule = (): void => {
      if (raf === 0) raf = requestAnimationFrame(paint)
    }

    paint()
    // Two subscriptions, one loop. The chart moves on `sfcState`, but the
    // wanted-vs-actual readout moves with the I/O image between transitions —
    // which is precisely the interval the player spends staring at it.
    const offState = useGameStore.subscribe(selectState, schedule)
    const offTags = useGameStore.subscribe((s) => s.tags, schedule)
    return () => {
      offState()
      offTags()
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [chart, model])

  if (model === null) {
    return (
      <div className="ff-sfc">
        <style>{CSS}</style>
        <div className="ff-sfc-empty">
          No step chart in the processor — this job has no sequence loaded.
        </div>
      </div>
    )
  }

  return (
    <div className="ff-sfc" ref={rootRef}>
      <style>{CSS}</style>

      <div className="ff-sfc-head">
        <span className="ff-sfc-head-t">
          Sequence — step chart, read live from the processor
        </span>
        <span className="ff-sfc-name">{chart?.name ?? ''}</span>
        <span className="ff-sfc-where" data-sfc-where>
          — of {model.order.length}
        </span>
        <span className="ff-sfc-flag" data-sfc-flag="0">
          NO CHART
        </span>
      </div>

      {model.problems.length > 0 && (
        <div className="ff-sfc-problems">
          <b>Chart will not run</b> — {model.problems.join(' · ')}
        </div>
      )}

      {!hasState && (
        <div className="ff-sfc-cold">
          The chart is loaded but the processor is not reporting a step. Nothing
          below is live.
        </div>
      )}

      <ol className="ff-sfc-chart">
        {model.rows.map((row, i) =>
          row.kind === 'step' ? (
            <li
              className={row.index === 0 ? 'ff-sfc-node ff-sfc-first' : 'ff-sfc-node'}
              key={`s-${row.step.id}`}
              data-step-i={row.index}
              data-st="0"
            >
              <div className="ff-sfc-rail">
                <span className="ff-sfc-spine" />
                <span
                  className="ff-sfc-chip"
                  data-initial={row.step.initial === true ? '1' : '0'}
                  title={
                    row.step.initial === true
                      ? 'Grundstellung — the step the cell powers up in'
                      : undefined
                  }
                >
                  {row.step.id}
                </span>
              </div>

              <div className="ff-sfc-body">
                <div className="ff-sfc-box">
                  <div className="ff-sfc-box-head">
                    <span className="ff-sfc-no">Schritt {row.step.number}</span>
                    <span className="ff-sfc-title">{row.step.title}</span>
                    {row.step.initial === true && (
                      <span className="ff-sfc-tagline">Grundstellung</span>
                    )}
                    <span className="ff-sfc-live">AKTIV</span>
                    <span className="ff-sfc-elapsed" data-elapsed-i={row.index} />
                  </div>

                  {row.step.comment !== undefined && row.step.comment.length > 0 && (
                    <p className="ff-sfc-comment">{row.step.comment}</p>
                  )}

                  {row.step.actions.length === 0 ? (
                    <p className="ff-sfc-noact">no actions — this step only waits</p>
                  ) : (
                    <ul className="ff-sfc-acts">
                      {row.step.actions.map((a, k) => (
                        <li
                          className="ff-sfc-act"
                          key={`${a.qualifier}-${a.tag}-${k}`}
                          data-act-tag={a.tag}
                          data-act-q={a.qualifier}
                          data-s="0"
                          data-h="0"
                        >
                          <b className="ff-sfc-q" data-q={a.qualifier} title={QUALIFIER_HINT[a.qualifier]}>
                            {a.qualifier}
                          </b>
                          <span className="ff-sfc-act-tag">{a.tag}</span>
                          {(symbolOf[a.tag] ?? '').length > 0 && (
                            <span className="ff-sfc-act-sym">{symbolOf[a.tag]}</span>
                          )}
                          {a.comment !== undefined && a.comment.length > 0 && (
                            <span className="ff-sfc-act-note">{a.comment}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </li>
          ) : (
            <li
              className={row.inline ? 'ff-sfc-node ff-sfc-tr' : 'ff-sfc-node ff-sfc-tr ff-sfc-jump'}
              key={`t-${row.tr.id}-${i}`}
              data-tr-id={row.tr.id}
              data-tr-from={row.fromIndex}
              data-tst="0"
            >
              <div className="ff-sfc-rail">
                <span className="ff-sfc-spine" />
                <span className="ff-sfc-bar" />
              </div>

              <div className="ff-sfc-body">
                <div className="ff-sfc-trhead">
                  <span className="ff-sfc-trno">T{row.tr.number}</span>
                  <span className="ff-sfc-trtitle">{row.tr.title}</span>
                  {!row.inline && (
                    <span className="ff-sfc-goto">
                      {row.toIndex < 0
                        ? `→ ${row.tr.to} (no such step)`
                        : row.toIndex <= row.fromIndex
                          ? `↩ zurück zu ${row.tr.to}`
                          : `→ ${row.tr.to}`}
                    </span>
                  )}
                </div>

                <div className="ff-sfc-condline" title={condText(row.toks)}>
                  <Condition toks={row.toks} />
                </div>

                <div className="ff-sfc-ok">
                  Bedingung erfüllt — the sequence steps on the next scan.
                </div>

                <div className="ff-sfc-diag">
                  <div className="ff-sfc-diag-head">
                    The sequence is held here. This transition is false:
                  </div>
                  <ul className="ff-sfc-lits">
                    {row.lits.map((l) => (
                      <li
                        className="ff-sfc-lit"
                        key={l.key}
                        data-lit-key={l.key}
                        data-lit-tr={row.tr.id}
                        data-lit-tag={l.tag}
                        data-met="1"
                      >
                        <span className="ff-sfc-lit-tag">{l.tag}</span>
                        {(symbolOf[l.tag] ?? '').length > 0 && (
                          <span className="ff-sfc-lit-sym">{symbolOf[l.tag]}</span>
                        )}
                        <span className="ff-sfc-lit-want">= {l.wanted ? '1' : '0'}</span>
                        <span className="ff-sfc-lit-act">
                          actual{' '}
                          <b className="ff-sfc-lit-val" data-lit-val data-s="0">
                            0
                          </b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          ),
        )}
      </ol>

      <div className="ff-sfc-key" aria-label="Colour key">
        <i className="ff-sfc-sw ff-sfc-sw-live" /> active step
        <i className="ff-sfc-sw ff-sfc-sw-past" /> already passed this cycle
        <i className="ff-sfc-sw ff-sfc-sw-held" /> transition holding the sequence
        <span className="ff-sfc-key-note">
          N drives while the step is active · S latches on · R unlatches · P fires
          for one scan
        </span>
      </div>
    </div>
  )
}

/**
 * The pane's styling.
 *
 * It ships here rather than in `Laptop.tsx`'s `CSS` because this file is the
 * only one this pane owns; every colour is taken from the `--ff-*` custom
 * properties `.ff-backdrop` already defines, so the step chart cannot drift away
 * from the palette the ladder is painted with. Fold it into `Laptop.tsx`
 * whenever that file is next open.
 *
 * The live layer writes only these attributes and the cascade does the rest:
 *
 *   [data-st]   on a step         0 not yet reached · 1 ACTIVE · 2 passed
 *   [data-tst]  on a transition   0 ahead · 1 BLOCKED · 2 satisfied · 3 passed
 *   [data-met]  on a diagnosis row  1 this operand is right · 0 it is not
 *   [data-s]    on an action chip   2 energised right now · 0 not
 *   [data-h]    on an action chip   1 currently latched by an S
 */
const CSS = `
.ff-sfc {
  flex: 1 1 auto; min-width: 0; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
  background: #fff;
}
.ff-sfc::-webkit-scrollbar { width: 14px; }
.ff-sfc::-webkit-scrollbar-thumb {
  background: #c3cad6; border: 3px solid #fff; border-radius: 7px;
}
.ff-sfc::-webkit-scrollbar-track { background: #f1f3f7; }

.ff-sfc-empty { padding: 18px; font-size: 12px; color: var(--ff-dim); }

/* --- header ------------------------------------------------------------- */
.ff-sfc-head {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 6px 10px; font-size: 11px; color: var(--ff-dim);
  background: var(--ff-face); border-bottom: 1px solid var(--ff-line);
  position: sticky; top: 0; z-index: 3;
}
.ff-sfc-head-t { white-space: nowrap; }
.ff-sfc-name {
  font-family: ui-monospace, Consolas, monospace;
  color: var(--ff-ink); font-weight: 600;
}
.ff-sfc-where {
  margin-left: auto;
  font-family: ui-monospace, Consolas, monospace; color: #333b49;
}
.ff-sfc-flag {
  padding: 2px 9px; border-radius: 2px; font-size: 10.5px; font-weight: 700;
  letter-spacing: .08em;
  background: #ececef; border: 1px solid #9aa3b1; color: #5c6472;
}
.ff-sfc-flag[data-sfc-flag="1"] { background: #fdeccd; border-color: #d09a2c; color: #7a5200; }
.ff-sfc-flag[data-sfc-flag="2"] { background: #dcf5e1; border-color: #4aa863; color: #0d6b28; }

.ff-sfc-problems {
  padding: 5px 10px; font-size: 11px;
  background: #fdeaea; border-bottom: 1px solid #d08a86; color: #8c1f18;
}
.ff-sfc-cold {
  padding: 5px 10px; font-size: 11px;
  background: #f3f4f7; border-bottom: 1px solid var(--ff-line); color: var(--ff-dim);
}

/* --- the chart ---------------------------------------------------------- */
.ff-sfc-chart { list-style: none; margin: 0; padding: 4px 12px 8px 0; }

.ff-sfc-node { display: flex; align-items: stretch; }
/* min-width:0 on the flex child is what guarantees a long German title or a wide
   condition wraps instead of forcing the whole laptop to scroll sideways. */
.ff-sfc-body { flex: 1 1 auto; min-width: 0; padding: 0 0 0 4px; }

.ff-sfc-rail { flex: none; width: 70px; position: relative; }
.ff-sfc-spine {
  position: absolute; left: 34px; top: 0; bottom: 0; width: 2px;
  background: #c3cad6;
}
/* The token came through here, so the line it walked is live. */
[data-st="1"] .ff-sfc-spine, [data-st="2"] .ff-sfc-spine,
[data-tst="3"] .ff-sfc-spine { background: var(--ff-green); }
.ff-sfc-first .ff-sfc-spine { top: 14px; }
.ff-sfc-chart > .ff-sfc-node:last-child .ff-sfc-spine { bottom: auto; height: 20px; }

/* --- step --------------------------------------------------------------- */
.ff-sfc-chip {
  position: relative; z-index: 1;
  display: flex; align-items: center; justify-content: center;
  width: 54px; height: 30px; margin: 8px auto 0;
  background: #fff; border: 1.4px solid #56606f;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 12.5px; font-weight: 700; color: var(--ff-ink);
}
/* The doubled border is the IEC mark for the initial step, and the manual
   already draws it that way — see FigSfcAnatomy. */
.ff-sfc-chip[data-initial="1"]::after {
  content: ''; position: absolute; inset: 3px;
  border: 1px solid #56606f; pointer-events: none;
}

.ff-sfc-box {
  margin: 6px 0;
  padding: 6px 10px 7px;
  background: #fff;
  border: 1px solid #9aa3b1;
  border-left: 3px solid #9aa3b1;
}
.ff-sfc-box-head {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
}
.ff-sfc-no {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10px; letter-spacing: .06em; color: var(--ff-dim);
  text-transform: uppercase;
}
.ff-sfc-title {
  font-size: 12.5px; font-weight: 600; color: var(--ff-ink);
  overflow-wrap: anywhere;
}
.ff-sfc-tagline {
  font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase;
  padding: 1px 6px; color: #4c5666;
  background: var(--ff-face-2); border: 1px solid var(--ff-line);
}
.ff-sfc-comment {
  margin: 3px 0 0; font-size: 10.5px; color: #4c5666; max-width: 88ch;
  overflow-wrap: anywhere;
}
.ff-sfc-noact { margin: 4px 0 0; font-size: 10.5px; color: #96a0ae; font-style: italic; }

/* AKTIV and the step clock only exist on the step the processor is sitting on. */
.ff-sfc-live, .ff-sfc-elapsed { display: none; }

/* --- THE ACTIVE STEP ---------------------------------------------------- */
/* The single most important thing in this pane. Everything here is deliberate:
   the box goes green and gains a heavy ring, the step chip reverses out, the
   title steps up a size, and the AKTIV flag appears. It has to be readable
   without reading — from across the room, at a glance, mid-panic. */
[data-st="1"] .ff-sfc-box {
  background: #e4f7e8;
  border: 2px solid var(--ff-green);
  border-left: 6px solid var(--ff-green);
  box-shadow: 0 0 0 3px rgba(6,161,44,.16), 0 2px 6px rgba(6,161,44,.18);
  padding: 7px 10px 8px;
}
[data-st="1"] .ff-sfc-title { font-size: 14.5px; font-weight: 700; color: #06340f; }
[data-st="1"] .ff-sfc-no { color: #0d6b28; font-weight: 700; }
[data-st="1"] .ff-sfc-comment { color: #204527; }
[data-st="1"] .ff-sfc-chip {
  background: var(--ff-green); border-color: #04781f; color: #fff;
  box-shadow: 0 0 0 3px rgba(6,161,44,.22);
  animation: ff-sfc-beat 1.8s ease-in-out infinite;
}
[data-st="1"] .ff-sfc-chip[data-initial="1"]::after { border-color: rgba(255,255,255,.75); }
[data-st="1"] .ff-sfc-live {
  display: inline-block;
  padding: 1px 7px; font-size: 9.5px; font-weight: 700; letter-spacing: .12em;
  background: var(--ff-green); color: #fff;
}
[data-st="1"] .ff-sfc-elapsed {
  display: inline-block; margin-left: auto;
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10.5px; color: #0d6b28;
}
@keyframes ff-sfc-beat {
  0%, 100% { box-shadow: 0 0 0 3px rgba(6,161,44,.22); }
  50%      { box-shadow: 0 0 0 6px rgba(6,161,44,.10); }
}
@media (prefers-reduced-motion: reduce) {
  [data-st="1"] .ff-sfc-chip { animation: none; }
}

/* --- steps already passed this cycle ------------------------------------ */
[data-st="2"] .ff-sfc-box { background: #fbfcfd; border-color: #d5dbe4; border-left-color: #a9d5b4; }
[data-st="2"] .ff-sfc-chip { color: #7a8494; border-color: #b6bfcb; }
[data-st="2"] .ff-sfc-title, [data-st="2"] .ff-sfc-no { color: #8b94a4; }
[data-st="2"] .ff-sfc-comment, [data-st="2"] .ff-sfc-acts { opacity: .5; }

/* --- transitions -------------------------------------------------------- */
.ff-sfc-tr .ff-sfc-body { padding: 4px 0 6px 4px; }
.ff-sfc-bar {
  position: absolute; z-index: 1;
  left: 15px; top: 13px; width: 40px; height: 3px;
  background: #8b94a4;
}
[data-tst="1"] .ff-sfc-bar { background: var(--ff-amber); height: 5px; top: 12px; }
[data-tst="2"] .ff-sfc-bar { background: var(--ff-green); height: 5px; top: 12px; }
[data-tst="3"] .ff-sfc-bar { background: #a9d5b4; }

.ff-sfc-trhead { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.ff-sfc-trno {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 10.5px; font-weight: 700; color: var(--ff-blue);
}
.ff-sfc-trtitle { font-size: 11px; color: #4c5666; overflow-wrap: anywhere; }
.ff-sfc-goto {
  font-size: 10px; letter-spacing: .04em; color: var(--ff-dim);
  padding: 1px 6px; background: var(--ff-face); border: 1px solid var(--ff-line);
}

.ff-sfc-condline {
  margin-top: 2px; padding: 3px 8px;
  background: #f7f9fc; border: 1px solid #dde3ec;
  overflow-wrap: anywhere;
}
.ff-sfc-cond { font-size: 11.5px; line-height: 1.5; }
.ff-sfc-tok-tag {
  font-family: ui-monospace, Consolas, monospace;
  color: var(--ff-blue); font-weight: 600;
}
.ff-sfc-tok-op { font-size: 10px; letter-spacing: .1em; color: #7a8494; }
.ff-sfc-tok-paren { color: #7a8494; }
[data-tst="1"] .ff-sfc-condline { background: #fff8ea; border-color: #e0c187; }
[data-tst="2"] .ff-sfc-condline { background: #eefaf0; border-color: #9dd3ac; }
[data-tst="3"] .ff-sfc-condline { opacity: .5; }
[data-tst="3"] .ff-sfc-trtitle, [data-tst="3"] .ff-sfc-trno { opacity: .55; }

/* --- the diagnosis ------------------------------------------------------ */
/* Hidden everywhere except the one transition that is actually holding the
   sequence, so the pane never shows two competing explanations. */
.ff-sfc-ok, .ff-sfc-diag { display: none; }
[data-tst="2"] .ff-sfc-ok {
  display: block; margin-top: 3px;
  font-size: 10.5px; color: #0d6b28;
}
[data-tst="1"] .ff-sfc-diag {
  display: block; margin-top: 4px;
  border: 1px solid #d09a2c; border-left: 4px solid var(--ff-amber);
  background: #fffaf0;
}
.ff-sfc-diag-head {
  padding: 3px 8px; font-size: 10.5px; font-weight: 700; color: #7a5200;
  background: #fdeccd; border-bottom: 1px solid #e6cd9a;
}
.ff-sfc-lits { list-style: none; margin: 0; padding: 3px 8px 5px; }
.ff-sfc-lit {
  display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap;
  padding: 2px 0; font-size: 11px; color: #6b4700;
}
/* The lead word IS the diagnosis, so it is generated from the state rather than
   written twice into the DOM by the paint loop. */
.ff-sfc-lit::before {
  content: 'waiting on';
  flex: none; width: 9ch;
  font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase;
  font-weight: 700; color: #a6650a;
}
.ff-sfc-lit[data-met="1"] { color: #5d6879; }
.ff-sfc-lit[data-met="1"]::before { content: 'ok'; color: #4aa863; }
.ff-sfc-lit-tag {
  font-family: ui-monospace, Consolas, monospace;
  font-weight: 700; color: var(--ff-blue);
}
.ff-sfc-lit[data-met="1"] .ff-sfc-lit-tag { font-weight: 600; opacity: .7; }
.ff-sfc-lit-sym { color: inherit; overflow-wrap: anywhere; }
.ff-sfc-lit-want { font-family: ui-monospace, Consolas, monospace; font-weight: 700; }
.ff-sfc-lit-act { margin-left: auto; font-size: 10.5px; color: inherit; }
.ff-sfc-lit-val {
  display: inline-block; min-width: 2ch; text-align: center;
  font-family: ui-monospace, Consolas, monospace; font-weight: 700;
  color: #6b7382; background: #eef1f5; border: 1px solid var(--ff-line);
}
.ff-sfc-lit-val[data-s="2"] { color: #06340f; background: #7ce894; border-color: #4aa863; }

/* --- actions ------------------------------------------------------------ */
.ff-sfc-acts { list-style: none; margin: 5px 0 0; padding: 0; display: grid; gap: 2px; }
.ff-sfc-act {
  display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap;
  padding: 1px 6px 1px 3px; font-size: 11px; color: #333b49;
  background: #fdf6e4; border: 1px solid #e6d9b4;
}
.ff-sfc-act[data-s="2"] { background: #dcf5e1; border-color: #7cc493; color: #0d3d19; }
.ff-sfc-q {
  flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  width: 17px; height: 15px;
  font-family: ui-monospace, Consolas, monospace; font-size: 10px;
  color: #fff; background: var(--ff-blue);
}
.ff-sfc-q[data-q="S"] { background: #0d8b3a; }
.ff-sfc-q[data-q="R"] { background: var(--ff-red); }
.ff-sfc-q[data-q="P"] { background: var(--ff-amber); }
.ff-sfc-act-tag {
  font-family: ui-monospace, Consolas, monospace;
  font-weight: 600; color: var(--ff-blue);
}
.ff-sfc-act[data-s="2"] .ff-sfc-act-tag { color: #0a5c1e; }
.ff-sfc-act-sym { overflow-wrap: anywhere; }
.ff-sfc-act-note { font-size: 10px; color: var(--ff-dim); overflow-wrap: anywhere; }
.ff-sfc-act[data-h="1"]::after {
  content: 'latched';
  margin-left: auto;
  font-size: 9px; letter-spacing: .1em; text-transform: uppercase;
  padding: 0 5px; color: #0a5c1e; background: #b9ecc6; border: 1px solid #6fb884;
}

/* --- key ---------------------------------------------------------------- */
.ff-sfc-key {
  display: flex; align-items: center; gap: .3rem; flex-wrap: wrap;
  padding: 5px 10px 10px; font-size: 10.5px; color: var(--ff-dim);
  border-top: 1px solid #eceff4;
}
.ff-sfc-sw { width: 12px; height: 8px; margin-left: .55rem; flex: none; }
.ff-sfc-sw:first-child { margin-left: 0; }
.ff-sfc-sw-live { background: var(--ff-green); }
.ff-sfc-sw-past { background: #a9d5b4; }
.ff-sfc-sw-held { background: var(--ff-amber); }
.ff-sfc-key-note { margin-left: auto; }
`
