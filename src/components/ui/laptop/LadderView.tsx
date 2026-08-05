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
 * 2. EDITS GO TO A DRAFT, NOT TO THE PROCESSOR. Every operation here produces a
 *    new tree via the pure ops in `@/engine/ladder` and hands it to
 *    `laptopStore.setDraft`. `gameStore.rungs` — what the scan cycle is actually
 *    executing on the live machine — changes only when the player presses
 *    DOWNLOAD TO PLC.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { useLaptopStore } from '@/stores/laptopStore'
import {
  contact,
  equivalent,
  evaluateFlow,
  insertParallel,
  insertSeries,
  layout,
  nodeAt,
  parseCondition,
  removeAt,
  setContactTag,
  toggleContactType,
} from '@/engine/ladder'
import type {
  ContactNode,
  LadderCell,
  LadderNode,
  LadderPath,
} from '@/engine/ladder'
import type { Rung } from '@/engine/types'

// --- Geometry -----------------------------------------------------------

const CELL_W = 128
const CELL_H = 58
const BAR = 9      // half the gap between a contact's two bars
const BAR_H = 14   // half a contact bar's height
const RAIL_X = 18
const FIRST_X = 46 // left edge of column 0
const ROW0_Y = 36  // centre line of row 0 — the main rung line
const COIL_W = 168

const colLeft = (c: number) => FIRST_X + c * CELL_W
const colRight = (c: number) => FIRST_X + (c + 1) * CELL_W
const rowY = (r: number) => ROW0_Y + r * CELL_H

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
  const railRight = width - 20
  const coilCx = (lastX + railRight) / 2

  segs.push({ x1: RAIL_X, y1: rowY(0), x2: colLeft(0), y2: rowY(0), n: rootN, hot: false })
  segs.push({ x1: lastX, y1: rowY(0), x2: coilCx - 15, y2: rowY(0), n: rootN, hot: true })
  segs.push({ x1: coilCx + 15, y1: rowY(0), x2: railRight, y2: rowY(0), n: rootN, hot: true })

  return {
    nodes,
    segs,
    contacts,
    coil: { cx: coilCx, cy: rowY(0) },
    width,
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
    const edited = draft !== undefined && draft !== rung.condition
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

/**
 * Where the selection should land after an edit.
 *
 * Canonicalisation can turn the node a path pointed at into a group — inserting
 * a parallel around a contact does exactly that — so a path is re-settled onto
 * the first contact at or below it rather than left dangling.
 */
function settlePath(root: LadderNode, path: LadderPath): LadderPath | null {
  let node: LadderNode
  try {
    node = nodeAt(root, path)
  } catch {
    return null
  }
  const settled = [...path]
  while (node.kind !== 'contact') {
    node = node.children[0]
    settled.push(0)
  }
  return settled
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
  const setDraft = useLaptopStore((s) => s.setDraft)
  const revert = useLaptopStore((s) => s.revert)
  const notice = useLaptopStore((s) => s.notice)
  const setNotice = useLaptopStore((s) => s.setNotice)

  const labels = useMemo(() => {
    const tags = useGameStore.getState().tags
    return tagKeys
      .split(',')
      .filter((id) => id.length > 0)
      .map((id) => ({ id, label: tags[id]?.label ?? '', type: tags[id]?.type ?? 'BOOL' }))
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

      const flows = views.map((v) =>
        v.geom === null ? null : evaluateFlow(v.geom.nodes[0], get),
      )

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]
        const view = views[t.rung]
        const flow = flows[t.rung]
        if (view === undefined || flow === null || view.geom === null) continue
        const node = view.geom.nodes[t.node]
        if (node === undefined) continue

        let state: number
        if (t.isContact && node.kind === 'contact') {
          // Three states, and the middle one is the point of the whole display:
          // 2 = powered, 1 = the contact is MADE but nothing is feeding it,
          // 0 = open. "Made but dead" is how a technician reads a rung.
          const made = node.negated ? !get(node.tag) : get(node.tag)
          state = flow.hot.get(node) === true ? 2 : made ? 1 : 0
        } else {
          const live = t.hot ? flow.hot.get(node) : flow.fed.get(node)
          state = live === true ? 2 : 0
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

  const selected = useMemo(() => {
    if (selection === null) return null
    const view = views.find((v) => v.rung.id === selection.rungId)
    const geom = view?.geom
    if (view === undefined || geom === null || geom === undefined) return null
    const key = pathKey(selection.path)
    const shape = geom.contacts.find((c) => pathKey(c.path) === key)
    if (shape === undefined) return null
    return { view, shape, geom }
  }, [selection, views])

  const applyOp = (op: (root: LadderNode, path: LadderPath) => LadderNode): void => {
    if (selected === null || selection === null) return
    const root = selected.geom.nodes[0]
    try {
      const next = op(root, selection.path)
      setDraft(selection.rungId, next)
      const settled = settlePath(next, selection.path)
      select(settled === null ? null : { rungId: selection.rungId, path: settled })
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e))
    }
  }

  const canDelete = selected !== null && selected.geom.cellCount > 1

  return (
    <div className="ff-ladder">
      <div className="ff-ladder-scroll" ref={surfaceRef}>
        {views.length === 0 && (
          <div className="ff-empty">NO PROGRAM IN PROCESSOR — CONNECT TO A CELL</div>
        )}

        {views.map((view) => (
          <section className="ff-rung" key={view.rung.id}>
            <header className="ff-rung-head">
              <span className="ff-rung-no">
                RUNG {String(view.index).padStart(3, '0')}
              </span>
              <span className="ff-rung-desc">{view.rung.description ?? ''}</span>
              {view.edited && (
                <span className={view.sameLogic ? 'ff-badge ff-badge-eq' : 'ff-badge'}>
                  {view.sameLogic ? 'EDITED · SAME LOGIC' : 'EDITED'}
                </span>
              )}
              {drafts[view.rung.id] !== undefined && (
                <button className="ff-mini" onClick={() => revert(view.rung.id)}>
                  REVERT
                </button>
              )}
            </header>

            {view.geom === null ? (
              <div className="ff-parse-error">
                RUNG WILL NOT COMPILE — {view.error}
              </div>
            ) : (
              <svg
                className="ff-svg"
                width={view.geom.width}
                height={view.geom.height}
                viewBox={`0 0 ${view.geom.width} ${view.geom.height}`}
                role="img"
                aria-label={`Rung ${view.index}: ${view.condition}`}
              >
                {/* power rails */}
                <line
                  className="ff-rail"
                  x1={RAIL_X}
                  y1={6}
                  x2={RAIL_X}
                  y2={view.geom.height - 6}
                />
                <line
                  className="ff-rail"
                  x1={view.geom.width - 20}
                  y1={6}
                  x2={view.geom.width - 20}
                  y2={view.geom.height - 6}
                />

                {view.geom.segs.map((s, i) => (
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

                {view.geom.contacts.map((c) => {
                  const isSelected =
                    selection !== null &&
                    selection.rungId === view.rung.id &&
                    pathKey(selection.path) === pathKey(c.path)
                  return (
                    <g key={pathKey(c.path)} className="ff-contact">
                      {isSelected && (
                        <rect
                          className="ff-sel"
                          x={colLeft(c.col) + 8}
                          y={c.cy - 26}
                          width={CELL_W - 16}
                          height={54}
                          rx={3}
                        />
                      )}
                      <text className="ff-addr" data-r={view.index} data-n={c.n} data-c="1" data-s="0" x={c.cx} y={c.cy - 20}>
                        {c.node.tag}
                      </text>
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
                      <text className="ff-label" x={c.cx} y={c.cy + 28}>
                        {labelOf[c.node.tag] ?? ''}
                      </text>
                      <rect
                        className="ff-hit"
                        x={colLeft(c.col) + 8}
                        y={c.cy - 26}
                        width={CELL_W - 16}
                        height={54}
                        onClick={() => select({ rungId: view.rung.id, path: c.path })}
                      />
                    </g>
                  )
                })}

                {/* output coil */}
                <path
                  className="ff-coil"
                  data-r={view.index}
                  data-n={0}
                  data-f="1"
                  data-s="0"
                  d={`M ${view.geom.coil.cx - 15} ${view.geom.coil.cy - 15} A 17 15 0 0 0 ${view.geom.coil.cx - 15} ${view.geom.coil.cy + 15}`}
                />
                <path
                  className="ff-coil"
                  data-r={view.index}
                  data-n={0}
                  data-f="1"
                  data-s="0"
                  d={`M ${view.geom.coil.cx + 15} ${view.geom.coil.cy - 15} A 17 15 0 0 1 ${view.geom.coil.cx + 15} ${view.geom.coil.cy + 15}`}
                />
                <text
                  className="ff-addr"
                  data-r={view.index}
                  data-n={0}
                  data-f="1"
                  data-s="0"
                  x={view.geom.coil.cx}
                  y={view.geom.coil.cy - 22}
                >
                  {view.rung.output}
                </text>
                <text className="ff-label" x={view.geom.coil.cx} y={view.geom.coil.cy + 28}>
                  {labelOf[view.rung.output] ?? ''}
                </text>
              </svg>
            )}
          </section>
        ))}
      </div>

      {/* --- editor ------------------------------------------------------- */}
      <div className="ff-editor">
        {selected === null ? (
          <span className="ff-editor-idle">
            SELECT A CONTACT TO EDIT · CHANGES STAY OFFLINE UNTIL YOU DOWNLOAD
          </span>
        ) : (
          <>
            <span className="ff-editor-tag">
              RUNG {String(selected.view.index).padStart(3, '0')} ·{' '}
              {selected.shape.node.negated ? 'XIO' : 'XIC'} ·{' '}
              {selected.shape.node.tag}
            </span>

            <label className="ff-field">
              ADDRESS
              <select
                value={selected.shape.node.tag}
                onChange={(e) => {
                  const tag = e.target.value
                  applyOp((root, path) => setContactTag(root, path, tag))
                }}
              >
                {labels.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} — {t.label}
                  </option>
                ))}
              </select>
            </label>

            <button className="ff-op" onClick={() => applyOp(toggleContactType)}>
              {selected.shape.node.negated ? 'MAKE XIC  -| |-' : 'MAKE XIO  -|/|-'}
            </button>
            <button
              className="ff-op"
              onClick={() =>
                applyOp((root, path) =>
                  insertSeries(root, path, contact(selected.shape.node.tag)),
                )
              }
            >
              + SERIES
            </button>
            <button
              className="ff-op"
              onClick={() =>
                applyOp((root, path) =>
                  insertParallel(root, path, contact(selected.shape.node.tag)),
                )
              }
            >
              + BRANCH
            </button>
            <button
              className="ff-op ff-op-danger"
              disabled={!canDelete}
              title={canDelete ? '' : 'a rung must keep at least one contact'}
              onClick={() => applyOp(removeAt)}
            >
              DELETE
            </button>
            <button className="ff-op" onClick={() => select(null)}>
              DESELECT
            </button>
          </>
        )}
        {notice !== null && <span className="ff-notice">{notice}</span>}
      </div>
    </div>
  )
}
