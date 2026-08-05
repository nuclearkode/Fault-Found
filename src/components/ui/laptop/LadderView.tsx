'use client'

/**
 * LadderView — the running PLC program, drawn as ladder logic and editable.
 *
 * Two things in this file are load-bearing and neither is obvious:
 *
 * 1. THE LIVE HIGHLIGHT NEVER RE-RENDERS REACT. See the comment above
 *    `useEffect(... paint ...)`. The scan cycle replaces `gameStore.tags` twenty
 *    times a second and the silo cell writes sensor values into it at sixty; any
 *    component that subscribes to `s.tags` through React re-renders at that rate,
 *    and this one draws several hundred SVG nodes. So the geometry renders once
 *    per PROGRAM change, and power flow is painted onto pre-indexed SVG elements
 *    from a rAF-coalesced store subscription.
 *
 * 2. EDITS GO TO A DRAFT, NOT TO THE PROCESSOR. Every operation here goes
 *    through `laptopStore`, which runs the pure ops in `@/engine/ladder` and
 *    keeps the result as a draft condition string. `gameStore.rungs` — what the
 *    scan cycle is actually executing on the live machine — changes only when
 *    the player presses DOWNLOAD TO PLC.
 *
 *    Which is exactly why an EDITED rung is drawn DEAD. The geometry on screen
 *    is the draft, but the processor is still scanning the downloaded rung, so
 *    animating the draft from live tags would be the display asserting something
 *    false — and the one thing the player has to be able to trust is that green
 *    means power. An edited rung therefore goes grey and says so, and the moment
 *    it is downloaded it comes back to life. That transition is the feedback
 *    that teaches what DOWNLOAD actually does.
 *
 * The look is a light, dense, mouse-driven ladder editor: white canvas, blue
 * instructions, green power. Colour is CSS only (see the palette in Laptop.tsx);
 * the paint loop writes a single `data-s` character and the cascade does the
 * rest.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { isNoOpDraft, useLaptopStore } from '@/stores/laptopStore'
import {
  equivalent,
  evaluateFlow,
  layout,
  parseCondition,
  setContactTag,
} from '@/engine/ladder'
import type {
  ContactNode,
  LadderCell,
  LadderNode,
  LadderPath,
} from '@/engine/ladder'
import type { Rung } from '@/engine/types'

// --- Geometry -----------------------------------------------------------

const CELL_W = 132
const CELL_H = 84
const BAR = 9      // half the gap between a contact's two bars
const BAR_H = 13   // half a contact bar's height
const RAIL_X = 22
const FIRST_X = 64 // left edge of column 0 — the gap holds the "insert first" slot
const ROW0_Y = 58  // centre line of row 0 — the main rung line
const COIL_W = 184

/** Text rows above a contact's centre line: symbol chip, address word, address bit. */
const CHIP_Y = -50
const CHIP_H = 12
const WORD_Y = -30
const BIT_Y = -18

const colLeft = (c: number) => FIRST_X + c * CELL_W
const colRight = (c: number) => FIRST_X + (c + 1) * CELL_W
const rowY = (r: number) => ROW0_Y + r * CELL_H

/** Rough monospace advance at font-size 9, for sizing the symbol chip. */
const chipWidth = (text: string) => Math.max(26, text.length * 5.4 + 10)

/**
 * `I:1/00` -> `I:1` above the contact and `00` below it; `I0.0` -> `I0` / `0`.
 * That two-line silhouette is the single most recognisable thing about an
 * RSLogix rung, and it falls out of one string split.
 */
function splitAddress(addr: string): [string, string] {
  const slash = addr.lastIndexOf('/')
  if (slash > 0) return [addr.slice(0, slash), addr.slice(slash + 1)]
  const dot = addr.lastIndexOf('.')
  if (dot > 0) return [addr.slice(0, dot), addr.slice(dot + 1)]
  return [addr, '']
}

interface Seg {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Index into `nodes` of the element whose power state this wire shows. */
  n: number
  /** true = show power LEAVING that element, false = power ARRIVING at it. */
  hot: boolean
}

interface ContactShape {
  cx: number
  cy: number
  col: number
  row: number
  node: ContactNode
  path: LadderPath
  n: number
}

interface Box { r0: number; r1: number; c0: number; c1: number }

interface Geometry {
  nodes: LadderNode[]
  segs: Seg[]
  contacts: ContactShape[]
  coil: { cx: number; cy: number }
  width: number
  height: number
  cellCount: number
}

const pathKey = (p: LadderPath) => p.join('.')

/**
 * Turn a tree into drawable primitives.
 *
 * Contact placement comes from `layout()` — that is the engine's business and
 * this file does not second-guess it. What is computed here is the WIRING: each
 * node's bounding box (the union of its children's, which is exact because
 * layout packs children contiguously), and from that the two verticals of every
 * branch plus the wire that pads a short leg out to the branch's right edge.
 */
function buildGeometry(tree: LadderNode): Geometry {
  const lay = layout(tree)

  const nodes: LadderNode[] = []
  const idx = new Map<LadderNode, number>()
  const indexNode = (n: LadderNode): void => {
    idx.set(n, nodes.length)
    nodes.push(n)
    if (n.kind !== 'contact') n.children.forEach(indexNode)
  }
  indexNode(tree)
  const nid = (n: LadderNode): number => idx.get(n) ?? 0

  const cellByPath = new Map<string, LadderCell>()
  for (const c of lay.cells) cellByPath.set(pathKey(c.path), c)

  const segs: Seg[] = []
  const contacts: ContactShape[] = []

  function emit(node: LadderNode, path: LadderPath): Box {
    const n = nid(node)

    if (node.kind === 'contact') {
      const cell = cellByPath.get(pathKey(path))
      if (cell === undefined) {
        throw new Error('ladder view: layout is missing a contact')
      }
      const cx = colLeft(cell.col) + CELL_W / 2
      const cy = rowY(cell.row)
      segs.push({ x1: colLeft(cell.col), y1: cy, x2: cx - BAR, y2: cy, n, hot: false })
      segs.push({ x1: cx + BAR, y1: cy, x2: colRight(cell.col), y2: cy, n, hot: true })
      contacts.push({ cx, cy, col: cell.col, row: cell.row, node, path, n })
      return { r0: cell.row, r1: cell.row, c0: cell.col, c1: cell.col }
    }

    const boxes = node.children.map((child, i) => emit(child, [...path, i]))
    const box = boxes.reduce((a, b) => ({
      r0: Math.min(a.r0, b.r0),
      r1: Math.max(a.r1, b.r1),
      c0: Math.min(a.c0, b.c0),
      c1: Math.max(a.c1, b.c1),
    }))

    if (node.kind === 'parallel') {
      const xl = colLeft(box.c0)
      const xr = colRight(box.c1)
      // Left vertical carries what arrives at the branch, right vertical what
      // leaves it — so a made contact on a dead leg lights neither.
      segs.push({ x1: xl, y1: rowY(box.r0), x2: xl, y2: rowY(box.r1), n, hot: false })
      segs.push({ x1: xr, y1: rowY(box.r0), x2: xr, y2: rowY(box.r1), n, hot: true })
      node.children.forEach((child, i) => {
        const b = boxes[i]
        const end = colRight(b.c1)
        if (end < xr) {
          segs.push({ x1: end, y1: rowY(b.r0), x2: xr, y2: rowY(b.r0), n: nid(child), hot: true })
        }
      })
    }

    return box
  }

  const root = emit(tree, [])
  const rootN = nid(tree)
  const lastX = colRight(root.c1)
  const width = lastX + COIL_W
  const railRight = width - 22
  const coilCx = (lastX + railRight) / 2

  segs.push({ x1: RAIL_X, y1: rowY(0), x2: colLeft(0), y2: rowY(0), n: rootN, hot: false })
  segs.push({ x1: lastX, y1: rowY(0), x2: coilCx - 16, y2: rowY(0), n: rootN, hot: true })
  segs.push({ x1: coilCx + 16, y1: rowY(0), x2: railRight, y2: rowY(0), n: rootN, hot: true })

  return {
    nodes,
    segs,
    contacts,
    coil: { cx: coilCx, cy: rowY(0) },
    width,
    // Deep enough for the branch drop slot that hangs under the bottom row.
    height: rowY(lay.rows - 1) + 38,
    cellCount: lay.cells.length,
  }
}

// --- Per-rung view model ------------------------------------------------

interface RungView {
  index: number
  rung: Rung
  /** The condition being DRAWN — the draft if there is one, else the running one. */
  condition: string
  /**
   * The drawn condition is NOT what the processor is executing.
   *
   * Gates the live highlight: see the paint loop, and note that `laptopStore`
   * guarantees a draft that matches the running program is deleted rather than
   * kept, so this is never true of a rung that only looks edited.
   */
  edited: boolean
  /** Edited, but computes the same function as what is running. */
  sameLogic: boolean
  geom: Geometry | null
  error: string | null
}

function buildViews(
  rungs: Rung[],
  drafts: Record<number, string>,
): RungView[] {
  return rungs.map((rung, index) => {
    const draft = drafts[rung.id]
    const condition = draft ?? rung.condition
    const edited = draft !== undefined && !isNoOpDraft(draft, rung.condition)
    let geom: Geometry | null = null
    let error: string | null = null
    try {
      geom = buildGeometry(parseCondition(condition))
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
    let sameLogic = false
    if (edited && geom) {
      try {
        sameLogic = equivalent(condition, rung.condition)
      } catch {
        sameLogic = false
      }
    }
    return { index, rung, condition, edited, sameLogic, geom, error }
  })
}

// --- Address editor -----------------------------------------------------

interface TagRow { id: string; label: string }

const ADDRESS_KEYWORDS = new Set(['AND', 'OR', 'NOT'])

/** Would this text survive a round trip through the condition-string dialect? */
function usableAddress(text: string): boolean {
  const t = text.trim()
  if (t.length === 0) return false
  if (/[\s()]/.test(t)) return false
  return !ADDRESS_KEYWORDS.has(t.toUpperCase())
}

/** One row of the popover list — a real address, or the typed-in one. */
interface Candidate {
  id: string
  label: string
  isNew: boolean
}

/**
 * The inline operand editor — double-click an address and type.
 *
 * It filters the processor's real I/O image on address AND symbol, because a
 * technician looking for the pusher-retracted proximity switch knows the word
 * "retract" and not `I:1/03`. Typing an address the image has never heard of is
 * still allowed, and still flagged: writing a rung against a tag that doesn't
 * exist is a real mistake worth being able to make.
 *
 * THE LIST IS THE KEYBOARD'S CONTRACT. Every row that can be clicked is in one
 * ordered list, the first row is marked, and Enter commits that first row —
 * nothing else. The freeform row therefore sits BELOW the matches rather than
 * above them: while a half-typed address still filters real tags, the thing
 * Enter would take is the top match, and the list has to say so. An
 * unrecognised address only becomes the Enter target once nothing in the image
 * matches at all, which is exactly when the player meant it.
 */
function AddressEditor({
  x,
  y,
  current,
  tags,
  onPick,
  onClose,
}: {
  x: number
  y: number
  current: string
  tags: TagRow[]
  onPick: (id: string) => void
  onClose: () => void
}) {
  // Seeded with the address being edited, not blank. Blank meant the empty
  // query matched every tag, so `candidates[0]` was simply whichever row sorts
  // first in the I/O image and a reflexive Enter silently rewired the rung to
  // an unrelated address. Seeding also gives the select() below something to
  // select: the box opens with the old address highlighted, so typing replaces
  // it and Enter on its own is a no-op instead of a random edit.
  const [query, setQuery] = useState(current)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const q = query.trim().toLowerCase()
  const matches = tags.filter(
    (t) =>
      q.length === 0 ||
      t.id.toLowerCase().includes(q) ||
      t.label.toLowerCase().includes(q),
  )
  const exact = tags.some((t) => t.id.toLowerCase() === q)
  const freeform = !exact && usableAddress(query) ? query.trim() : null

  const candidates: Candidate[] = matches.map((t) => ({
    id: t.id,
    label: t.label,
    isNew: false,
  }))
  if (freeform !== null) {
    candidates.push({ id: freeform, label: 'not in the I/O image', isNew: true })
  }

  const commit = (): void => {
    // An empty box is not a choice. Clearing the field and pressing Enter must
    // not fall through to "the first tag in the table".
    if (q.length === 0) return
    const first = candidates[0]
    if (first !== undefined) onPick(first.id)
  }

  return (
    <>
      {/* Anything outside the popover dismisses it, including the 3D world's
          own overlay — the laptop already swallows those clicks. */}
      <div className="ff-pop-scrim" onMouseDown={onClose} />
      <div className="ff-pop" style={{ left: x, top: y }}>
        <div className="ff-pop-head">Address · was {current}</div>
        <input
          ref={inputRef}
          className="ff-pop-input"
          value={query}
          placeholder="filter address or symbol…"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Local to a text field only. keymap.ts ignores INPUT entirely, so
            // no binding is being taken from it here.
            if (e.key === 'Escape') {
              e.stopPropagation()
              onClose()
            } else if (e.key === 'Enter') {
              e.stopPropagation()
              commit()
            }
          }}
        />
        <ul className="ff-pop-list">
          {candidates.map((c, i) => {
            const classes = ['ff-pop-row']
            if (c.isNew) classes.push('ff-pop-new')
            else if (c.id === current) classes.push('ff-pop-cur')
            if (i === 0) classes.push('ff-pop-first')
            return (
              <li key={c.isNew ? `new ${c.id}` : c.id}>
                <button
                  type="button"
                  className={classes.join(' ')}
                  onClick={() => onPick(c.id)}
                >
                  <span className="ff-pop-id">{c.id}</span>
                  <span className="ff-pop-label">{c.label}</span>
                  {i === 0 && (
                    <span className="ff-pop-enter" aria-label="Enter picks this">
                      ↵
                    </span>
                  )}
                </button>
              </li>
            )
          })}
          {candidates.length === 0 && (
            <li className="ff-pop-none">no matching address</li>
          )}
        </ul>
      </div>
    </>
  )
}

// --- Component ----------------------------------------------------------

export function LadderView() {
  const rungs = useGameStore((s) => s.rungs)
  // Tag ids joined into one string: the scan cycle replaces the whole `tags`
  // record every 50 ms, but the SET of addresses only changes when a scenario
  // loads — so this selector returns an identical string 20 times a second and
  // Zustand's Object.is check means no re-render. Never subscribe to `s.tags`.
  const tagKeys = useGameStore((s) => Object.keys(s.tags).join(','))

  const drafts = useLaptopStore((s) => s.drafts)
  const selection = useLaptopStore((s) => s.selection)
  const select = useLaptopStore((s) => s.select)
  const armed = useLaptopStore((s) => s.armed)
  const arm = useLaptopStore((s) => s.arm)
  const editing = useLaptopStore((s) => s.editing)
  const beginEdit = useLaptopStore((s) => s.beginEdit)
  const cancelEdit = useLaptopStore((s) => s.cancelEdit)
  const applyOp = useLaptopStore((s) => s.applyOp)
  const insertContact = useLaptopStore((s) => s.insertContact)
  const revert = useLaptopStore((s) => s.revert)
  const notice = useLaptopStore((s) => s.notice)
  const setNotice = useLaptopStore((s) => s.setNotice)

  const labels = useMemo<TagRow[]>(() => {
    const tags = useGameStore.getState().tags
    return tagKeys
      .split(',')
      .filter((id) => id.length > 0)
      .map((id) => ({ id, label: tags[id]?.label ?? '' }))
  }, [tagKeys])

  const labelOf = useMemo(() => {
    const map: Record<string, string> = {}
    for (const t of labels) map[t.id] = t.label
    return map
  }, [labels])

  const views = useMemo(() => buildViews(rungs, drafts), [rungs, drafts])

  const surfaceRef = useRef<HTMLDivElement>(null)

  /**
   * THE PERFORMANCE CONSTRAINT OF THIS FILE.
   *
   * `gameStore.setTags` replaces the whole tags record on every scan (20 Hz) and
   * the silo cell writes physical sensor values into it every frame (60 Hz). A
   * React subscription to that would re-render this entire SVG program — several
   * hundred elements, five rungs — sixty times a second, on top of a 3D scene
   * that wants the frame budget for itself.
   *
   * So: React renders the geometry exactly once per PROGRAM change (a download,
   * or an edit to a draft). This effect then indexes every painted SVG element
   * ONCE into a flat array, and a store subscription — coalesced through a
   * single requestAnimationFrame, so a burst of scans between two frames costs
   * one paint, not five — writes `data-s` on the elements that actually changed.
   * The `prev` cache means a steady machine costs zero DOM writes per frame.
   * Colour lives entirely in CSS attribute selectors; this loop only ever writes
   * a one-character attribute.
   */
  useEffect(() => {
    const surface = surfaceRef.current
    if (surface === null) return

    const els = Array.from(surface.querySelectorAll<SVGElement>('[data-n]'))
    const targets = els.map((el) => ({
      el,
      rung: Number(el.getAttribute('data-r')),
      node: Number(el.getAttribute('data-n')),
      hot: el.getAttribute('data-f') === '1',
      isContact: el.getAttribute('data-c') === '1',
    }))
    const prev = new Int8Array(targets.length).fill(-1)

    let raf = 0
    const paint = (): void => {
      raf = 0
      const tags = useGameStore.getState().tags
      const get = (tag: string): boolean => !!tags[tag]?.value

      // An EDITED rung gets no flow at all. The shape on screen is the draft and
      // the processor is running something else, so there is no honest answer to
      // "where is the power in this rung" — it is drawn dead and marked offline
      // (`ff-svg-offline`) instead of being animated with a program that is not
      // executing. Skipping the analysis here is also why a rung being actively
      // edited costs nothing per frame.
      const flows = views.map((v) =>
        v.geom === null || v.edited ? null : evaluateFlow(v.geom.nodes[0], get),
      )

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]
        const view = views[t.rung]
        const flow = flows[t.rung]

        // 0 is also the reset an edited rung needs: React reuses these elements
        // across a draft change and never rewrites `data-s` (it only ever
        // rendered "0"), so a rung that was live when it was edited would keep
        // its last green until something repainted it.
        let state = 0

        if (view !== undefined && view.geom !== null && flow !== null) {
          const node = view.geom.nodes[t.node]
          if (node !== undefined) {
            if (t.isContact && node.kind === 'contact') {
              // Three states, and the middle one is the point of the whole
              // display: 2 = powered, 1 = the contact is MADE but nothing is
              // feeding it, 0 = open. "Made but dead" is how a technician reads
              // a rung, and it is the one thing this editor shows that a real
              // one does not.
              const made = node.negated ? !get(node.tag) : get(node.tag)
              state = flow.hot.get(node) === true ? 2 : made ? 1 : 0
            } else {
              const live = t.hot ? flow.hot.get(node) : flow.fed.get(node)
              state = live === true ? 2 : 0
            }
          }
        }

        if (prev[i] !== state) {
          prev[i] = state
          t.el.setAttribute('data-s', String(state))
        }
      }
    }

    const schedule = (): void => {
      if (raf === 0) raf = requestAnimationFrame(paint)
    }

    paint()
    const unsubscribe = useGameStore.subscribe((s) => s.tags, schedule)
    return () => {
      unsubscribe()
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [views])

  // --- Editing ----------------------------------------------------------

  /** The contact under the cursor, resolved against what is actually drawn. */
  const selected = useMemo(() => {
    if (selection === null || selection.path === null) return null
    const view = views.find((v) => v.rung.id === selection.rungId)
    const geom = view?.geom
    if (view === undefined || geom === null || geom === undefined) return null
    const key = pathKey(selection.path)
    const shape = geom.contacts.find((c) => pathKey(c.path) === key)
    if (shape === undefined) return null
    return { view, shape }
  }, [selection, views])

  /** Display index (position in the program) of whatever the cursor is on. */
  const selectedIndex = useMemo(() => {
    if (selection === null) return null
    const view = views.find((v) => v.rung.id === selection.rungId)
    return view?.index ?? null
  }, [selection, views])

  const dropping = armed !== null

  /**
   * A drop point. `mode` decides which of the engine's insert ops runs, and the
   * armed instruction decides what lands there — a branch reproduces the
   * instruction it is branching around, which is the only default that always
   * parses.
   */
  const drop = (
    rungId: number,
    path: LadderPath | null,
    mode: 'series' | 'parallel' | 'start',
    near: ContactNode,
  ): void => {
    if (armed === null) return
    const negated = armed === 'BRANCH' ? near.negated : armed === 'XIO'
    insertContact(rungId, path, mode, near.tag, negated)
  }

  return (
    <div className="ff-ladder">
      <div className="ff-ladder-scroll" ref={surfaceRef}>
        {views.length === 0 && (
          <div className="ff-empty">No program in the processor — connect to a cell.</div>
        )}

        {views.map((view) => {
          const rungSelected =
            selection !== null && selection.rungId === view.rung.id
          // `edited`, not "there is a key in drafts": laptopStore deletes a
          // draft that lands back on the running condition, so the two agree —
          // but reading the flag keeps the gutter mark, the badge and the REVERT
          // button on one definition.
          const drafted = view.edited
          const geom = view.geom

          return (
            <section
              className={rungSelected ? 'ff-rung ff-rung-sel' : 'ff-rung'}
              key={view.rung.id}
            >
              <button
                type="button"
                className={
                  selection !== null &&
                  selection.rungId === view.rung.id &&
                  selection.path === null
                    ? 'ff-gutter ff-gutter-on'
                    : 'ff-gutter'
                }
                title="Select the whole rung"
                onClick={() => select({ rungId: view.rung.id, path: null })}
              >
                <span className="ff-gutter-no">
                  {String(view.index).padStart(4, '0')}
                </span>
                {drafted && (
                  <span className="ff-zone" title="edit held in this terminal only">
                    e
                  </span>
                )}
              </button>

              <div className="ff-rungbody">
                <div className="ff-rung-head">
                  {view.rung.description !== undefined &&
                    view.rung.description.length > 0 && (
                      <span className="ff-comment">{view.rung.description}</span>
                    )}
                  {view.edited && (
                    <>
                      <span
                        className={view.sameLogic ? 'ff-badge ff-badge-eq' : 'ff-badge'}
                        title="Held in this terminal. The processor is still scanning the downloaded rung."
                      >
                        {view.sameLogic ? 'offline edit · same logic' : 'offline edit'}
                      </span>
                      <span className="ff-offline-note">
                        not executing — download to run it
                      </span>
                    </>
                  )}
                  {drafted && (
                    <button
                      type="button"
                      className="ff-revert"
                      onClick={() => revert(view.rung.id)}
                    >
                      Revert rung
                    </button>
                  )}
                </div>

                {geom === null ? (
                  <div className="ff-parse-error">
                    Rung will not compile — {view.error}
                  </div>
                ) : (
                  <div className="ff-svgwrap">
                    <svg
                      className={view.edited ? 'ff-svg ff-svg-offline' : 'ff-svg'}
                      width={geom.width}
                      height={geom.height}
                      viewBox={`0 0 ${geom.width} ${geom.height}`}
                      role="img"
                      aria-label={
                        view.edited
                          ? `Rung ${view.index}, offline edit, not executing: ${view.condition}`
                          : `Rung ${view.index}: ${view.condition}`
                      }
                    >
                      {/* power rails */}
                      <line
                        className="ff-rail"
                        x1={RAIL_X}
                        y1={8}
                        x2={RAIL_X}
                        y2={geom.height - 8}
                      />
                      <line
                        className="ff-rail"
                        x1={geom.width - 22}
                        y1={8}
                        x2={geom.width - 22}
                        y2={geom.height - 8}
                      />

                      {geom.segs.map((s, i) => (
                        <line
                          key={i}
                          className="ff-wire"
                          data-r={view.index}
                          data-n={s.n}
                          data-f={s.hot ? '1' : '0'}
                          data-s="0"
                          x1={s.x1}
                          y1={s.y1}
                          x2={s.x2}
                          y2={s.y2}
                        />
                      ))}

                      {geom.contacts.map((c) => {
                        const isSelected =
                          selection !== null &&
                          selection.rungId === view.rung.id &&
                          selection.path !== null &&
                          pathKey(selection.path) === pathKey(c.path)
                        const [word, bit] = splitAddress(c.node.tag)
                        const symbol = labelOf[c.node.tag] ?? ''
                        return (
                          <g key={pathKey(c.path)} className="ff-contact">
                            {isSelected && (
                              <rect
                                className="ff-sel"
                                x={colLeft(c.col) + 6}
                                y={c.cy + CHIP_Y - 3}
                                width={CELL_W - 12}
                                height={-CHIP_Y + BAR_H + 8}
                                rx={2}
                              />
                            )}
                            {symbol.length > 0 && (
                              <>
                                <rect
                                  className="ff-chip"
                                  x={c.cx - chipWidth(symbol) / 2}
                                  y={c.cy + CHIP_Y}
                                  width={chipWidth(symbol)}
                                  height={CHIP_H}
                                  rx={1}
                                />
                                <text className="ff-chip-t" x={c.cx} y={c.cy + CHIP_Y + 9}>
                                  {symbol}
                                </text>
                              </>
                            )}
                            <text className="ff-addr" x={c.cx} y={c.cy + WORD_Y}>
                              {word}
                            </text>
                            {bit.length > 0 && (
                              <text className="ff-addr" x={c.cx} y={c.cy + BIT_Y}>
                                {bit}
                              </text>
                            )}
                            <line
                              className="ff-bar"
                              data-r={view.index}
                              data-n={c.n}
                              data-c="1"
                              data-s="0"
                              x1={c.cx - BAR}
                              y1={c.cy - BAR_H}
                              x2={c.cx - BAR}
                              y2={c.cy + BAR_H}
                            />
                            <line
                              className="ff-bar"
                              data-r={view.index}
                              data-n={c.n}
                              data-c="1"
                              data-s="0"
                              x1={c.cx + BAR}
                              y1={c.cy - BAR_H}
                              x2={c.cx + BAR}
                              y2={c.cy + BAR_H}
                            />
                            {c.node.negated && (
                              <line
                                className="ff-bar"
                                data-r={view.index}
                                data-n={c.n}
                                data-c="1"
                                data-s="0"
                                x1={c.cx - BAR - 2}
                                y1={c.cy + BAR_H}
                                x2={c.cx + BAR + 2}
                                y2={c.cy - BAR_H}
                              />
                            )}
                            <rect
                              className="ff-hit"
                              x={colLeft(c.col) + 6}
                              y={c.cy + CHIP_Y - 3}
                              width={CELL_W - 12}
                              height={-CHIP_Y + BAR_H + 8}
                              onClick={() => {
                                if (armed === null) {
                                  select({ rungId: view.rung.id, path: c.path })
                                } else {
                                  drop(
                                    view.rung.id,
                                    c.path,
                                    armed === 'BRANCH' ? 'parallel' : 'series',
                                    c.node,
                                  )
                                }
                              }}
                              onDoubleClick={() => {
                                if (armed === null) {
                                  beginEdit({ rungId: view.rung.id, path: c.path })
                                }
                              }}
                            >
                              <title>
                                {armed === null
                                  ? `${c.node.tag} — click to select, double-click to change the address`
                                  : `insert ${armed} here`}
                              </title>
                            </rect>
                          </g>
                        )
                      })}

                      {/* drop points, only while an instruction is armed */}
                      {dropping && geom.contacts.length > 0 && armed !== 'BRANCH' && (
                        <g
                          className="ff-slot"
                          onClick={() =>
                            drop(view.rung.id, null, 'start', geom.contacts[0].node)
                          }
                        >
                          <rect
                            x={(RAIL_X + colLeft(0)) / 2 - 9}
                            y={rowY(0) - 9}
                            width={18}
                            height={18}
                            rx={2}
                          />
                          <text x={(RAIL_X + colLeft(0)) / 2} y={rowY(0) + 4}>
                            +
                          </text>
                          <title>insert first on this rung</title>
                        </g>
                      )}

                      {dropping &&
                        geom.contacts.map((c) => (
                          <g key={`slot-${pathKey(c.path)}`}>
                            {armed !== 'BRANCH' && (
                              <g
                                className="ff-slot"
                                onClick={() =>
                                  drop(view.rung.id, c.path, 'series', c.node)
                                }
                              >
                                <rect
                                  x={colRight(c.col) - 9}
                                  y={c.cy - 9}
                                  width={18}
                                  height={18}
                                  rx={2}
                                />
                                <text x={colRight(c.col)} y={c.cy + 4}>
                                  +
                                </text>
                                <title>insert after this instruction</title>
                              </g>
                            )}
                            <g
                              className="ff-slot ff-slot-br"
                              onClick={() =>
                                drop(view.rung.id, c.path, 'parallel', c.node)
                              }
                            >
                              <rect
                                x={c.cx - 8}
                                y={c.cy + BAR_H + 3}
                                width={16}
                                height={16}
                                rx={2}
                              />
                              <text x={c.cx} y={c.cy + BAR_H + 15}>
                                +
                              </text>
                              <title>branch around this instruction</title>
                            </g>
                          </g>
                        ))}

                      {/* output coil */}
                      <path
                        className="ff-coil"
                        data-r={view.index}
                        data-n={0}
                        data-f="1"
                        data-s="0"
                        d={`M ${geom.coil.cx - 16} ${geom.coil.cy - 14} A 18 14 0 0 0 ${geom.coil.cx - 16} ${geom.coil.cy + 14}`}
                      />
                      <path
                        className="ff-coil"
                        data-r={view.index}
                        data-n={0}
                        data-f="1"
                        data-s="0"
                        d={`M ${geom.coil.cx + 16} ${geom.coil.cy - 14} A 18 14 0 0 1 ${geom.coil.cx + 16} ${geom.coil.cy + 14}`}
                      />
                      {(labelOf[view.rung.output] ?? '').length > 0 && (
                        <>
                          <rect
                            className="ff-chip"
                            x={geom.coil.cx - chipWidth(labelOf[view.rung.output]) / 2}
                            y={geom.coil.cy + CHIP_Y}
                            width={chipWidth(labelOf[view.rung.output])}
                            height={CHIP_H}
                            rx={1}
                          />
                          <text
                            className="ff-chip-t"
                            x={geom.coil.cx}
                            y={geom.coil.cy + CHIP_Y + 9}
                          >
                            {labelOf[view.rung.output]}
                          </text>
                        </>
                      )}
                      <text className="ff-addr" x={geom.coil.cx} y={geom.coil.cy + WORD_Y}>
                        {splitAddress(view.rung.output)[0]}
                      </text>
                      {splitAddress(view.rung.output)[1].length > 0 && (
                        <text className="ff-addr" x={geom.coil.cx} y={geom.coil.cy + BIT_Y}>
                          {splitAddress(view.rung.output)[1]}
                        </text>
                      )}
                      <text
                        className="ff-mn"
                        x={geom.coil.cx}
                        y={geom.coil.cy + BAR_H + 13}
                      >
                        OTE
                      </text>
                    </svg>

                    {editing !== null &&
                      selected !== null &&
                      editing.rungId === view.rung.id &&
                      pathKey(editing.path) === pathKey(selected.shape.path) && (
                        <AddressEditor
                          x={selected.shape.cx}
                          y={selected.shape.cy + BAR_H + 20}
                          current={selected.shape.node.tag}
                          tags={labels}
                          // Not `beginEdit(null)`: dismissing this popover on a
                          // contact that was inserted a moment ago has to take
                          // the insert back out, or there is no way to change
                          // your mind short of reverting the whole rung.
                          onClose={cancelEdit}
                          onPick={(id) => {
                            const at = editing
                            applyOp(at, (root, path) => setContactTag(root, path, id))
                          }}
                        />
                      )}
                  </div>
                )}
              </div>
            </section>
          )
        })}

        {views.length > 0 && (
          <section className="ff-rung ff-rung-end">
            <div className="ff-gutter ff-gutter-static">
              <span className="ff-gutter-no">
                {String(views.length).padStart(4, '0')}
              </span>
            </div>
            <div className="ff-rungbody">
              <div className="ff-end-mark">(END)</div>
            </div>
          </section>
        )}
      </div>

      {/* --- status line -------------------------------------------------- */}
      <div className="ff-status">
        {armed !== null ? (
          <>
            <span className="ff-status-armed">{armed} armed</span>
            <span className="ff-status-hint">
              click a <b>+</b> drop point, or an instruction to insert after it
            </span>
            <button type="button" className="ff-status-cancel" onClick={() => arm(null)}>
              Cancel
            </button>
          </>
        ) : selected !== null ? (
          <>
            <span className="ff-status-armed">
              Rung {String(selected.view.index).padStart(4, '0')} ·{' '}
              {selected.shape.node.negated ? 'XIO' : 'XIC'} · {selected.shape.node.tag}
            </span>
            <span className="ff-status-hint">
              double-click the instruction to change its address
            </span>
          </>
        ) : selection !== null ? (
          <span className="ff-status-armed">
            Rung {String(selectedIndex ?? 0).padStart(4, '0')} selected — pick an
            instruction from the toolbar to insert it first on the rung
          </span>
        ) : (
          <span className="ff-status-hint">
            Click an instruction to select it · double-click its address to change it ·
            edits stay offline until you download
          </span>
        )}
        {notice !== null && (
          <button
            type="button"
            className="ff-notice"
            title="dismiss"
            onClick={() => setNotice(null)}
          >
            {notice}
          </button>
        )}
      </div>
    </div>
  )
}
