'use client'

import { create } from 'zustand'
import { useGameStore } from './gameStore'
import {
  contact,
  insertParallel,
  insertSeries,
  layout,
  nodeAt,
  parseCondition,
  series,
  serializeCondition,
  setContactTag,
} from '@/engine/ladder'
import type { LadderNode, LadderPath } from '@/engine/ladder'

export type LaptopTab = 'ladder' | 'io'

/**
 * What the instruction toolbar has ARMED.
 *
 * The editor is modal in the same way a real ladder editor is: you pick an
 * instruction off the palette, then you click where it goes. `null` is the
 * ordinary select-and-inspect mode.
 *
 * OTE is in the palette because the palette would look wrong without it, but it
 * can never be armed — the coils are wired in the panel, not from the laptop
 * (see `download`, which only ever writes conditions).
 */
export type Instruction = 'XIC' | 'XIO' | 'BRANCH'

/** A contact, addressed the way ladder.ts addresses. */
export interface LadderTarget {
  rungId: number
  path: LadderPath
}

/** What the cursor is on. `path: null` means the whole rung is selected. */
export interface LadderSelection {
  rungId: number
  path: LadderPath | null
}

/** Where a new instruction goes, relative to the target the player clicked. */
export type InsertMode = 'series' | 'parallel' | 'start'

/**
 * Placeholder tag for a freshly inserted contact.
 *
 * The edit ops in `@/engine/ladder` clone what they insert and then
 * re-canonicalise the tree, so the new node's identity — and therefore its path
 * — is gone by the time the op returns. Inserting under a tag no real address
 * can collide with lets the new contact be found again by a layout scan, which
 * is what makes "insert, then immediately open the address editor on the thing
 * you just inserted" possible. It never reaches a draft: it is replaced with the
 * real address before the tree is serialised.
 */
const PLACEHOLDER = '\u0001NEW'

/**
 * Re-settle a path after an edit.
 *
 * Canonicalisation can turn the node a path pointed at into a group — inserting
 * a branch around a contact does exactly that — so a path is walked down to the
 * first contact at or below it rather than left dangling.
 */
function settle(root: LadderNode, path: LadderPath): LadderPath | null {
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

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * The maintenance laptop's own state.
 *
 * The important idea here is the DRAFT. Editing a rung must never touch
 * `gameStore.rungs`, because those rungs are what the scan cycle is executing
 * twenty times a second on a live machine: a half-finished edit applied
 * immediately would drop the conveyor mid-carton, and the player would have no
 * way to try something and change their mind. So edits accumulate here as
 * condition strings keyed by rung id, the ladder view draws the draft, and
 * DOWNLOAD TO PLC is the single moment the running program changes — exactly
 * the way a real processor works, and exactly where the player should feel the
 * commitment.
 *
 * A rung with no entry in `drafts` is untouched. That is the whole EDITED test.
 *
 * Every tree operation lives HERE rather than in the view, because two views —
 * the ladder and the instruction toolbar — issue the same edits and they must
 * settle the cursor identically. Parsing the condition per click is free; it is
 * a click, not a frame.
 */
interface LaptopState {
  tab: LaptopTab
  setTab: (t: LaptopTab) => void

  /** rung id -> edited condition string. Absent means "as downloaded". */
  drafts: Record<number, string>
  selection: LadderSelection | null
  select: (sel: LadderSelection | null) => void

  /** The instruction picked off the palette, waiting for a place to go. */
  armed: Instruction | null
  /** Arm an instruction. Arming the armed one disarms, like a real palette. */
  arm: (i: Instruction | null) => void

  /** The contact whose address is being typed, if any. */
  editing: LadderTarget | null
  beginEdit: (t: LadderTarget | null) => void

  /**
   * Run a pure op from `@/engine/ladder` against one rung's current tree and
   * store the result as a draft. Re-settles the cursor onto whatever the edit
   * left behind; a throw becomes a notice rather than a broken rung.
   */
  applyOp: (
    target: LadderTarget,
    op: (root: LadderNode, path: LadderPath) => LadderNode,
  ) => void

  /**
   * Drop a new contact onto a rung and leave the cursor on it with the address
   * editor open — insert-then-address, which is the whole point of a palette.
   *
   * `mode: 'start'` ignores `target.path` and puts the contact first on the
   * rung, which is the one position no relative op can reach.
   */
  insertContact: (
    rungId: number,
    path: LadderPath | null,
    mode: InsertMode,
    tag: string,
    negated: boolean,
  ) => void

  /** Store an edited tree for one rung, serialised back to the engine dialect. */
  setDraft: (rungId: number, tree: LadderNode) => void
  /** Throw one rung's edits away. */
  revert: (rungId: number) => void
  /** Throw everything away — also called when the running program is replaced. */
  clearDrafts: () => void

  /**
   * Commit every draft into the running program.
   *
   * Returns the number of rungs written so the caller can say so. No-op when
   * there is nothing pending, which keeps the button idempotent.
   */
  download: () => number
  /** Epoch ms of the last successful download; 0 if none this session. */
  lastDownload: number

  /** One line of feedback in the status bar — an error, or a confirmation. */
  notice: string | null
  setNotice: (n: string | null) => void
}

export const useLaptopStore = create<LaptopState>()((set, get) => ({
  tab: 'ladder',
  setTab: (t) => set({ tab: t }),

  drafts: {},
  selection: null,
  select: (sel) => set({ selection: sel, editing: null }),

  armed: null,
  arm: (i) => set((s) => ({ armed: s.armed === i ? null : i, notice: null })),

  editing: null,
  beginEdit: (t) => set({ editing: t }),

  applyOp: (target, op) => {
    const rung = useGameStore.getState().rungs.find((r) => r.id === target.rungId)
    if (rung === undefined) return
    const source = get().drafts[target.rungId] ?? rung.condition
    try {
      const next = op(parseCondition(source), target.path)
      const settled = settle(next, target.path)
      set((s) => ({
        drafts: { ...s.drafts, [target.rungId]: serializeCondition(next) },
        selection: { rungId: target.rungId, path: settled },
        editing: null,
        notice: null,
      }))
    } catch (e) {
      set({ notice: message(e) })
    }
  },

  insertContact: (rungId, path, mode, tag, negated) => {
    const rung = useGameStore.getState().rungs.find((r) => r.id === rungId)
    if (rung === undefined) return
    const source = get().drafts[rungId] ?? rung.condition
    try {
      const root = parseCondition(source)
      const fresh = contact(PLACEHOLDER, negated)

      let next: LadderNode
      if (mode === 'start') next = series(fresh, root)
      else if (path === null) next = series(root, fresh)
      else if (mode === 'parallel') next = insertParallel(root, path, fresh)
      else next = insertSeries(root, path, fresh)

      // Find where canonicalisation actually put it, then give it its address.
      // If it somehow isn't there the edit is abandoned rather than written —
      // a draft containing the placeholder would be a rung nobody can read.
      const cell = layout(next).cells.find((c) => c.node.tag === PLACEHOLDER)
      if (cell === undefined) {
        set({ notice: 'The instruction could not be placed there.' })
        return
      }
      const landed = setContactTag(next, cell.path, tag)
      const at = cell.path

      set((s) => ({
        drafts: { ...s.drafts, [rungId]: serializeCondition(landed) },
        selection: { rungId, path: at },
        editing: { rungId, path: at },
        notice: null,
      }))
    } catch (e) {
      set({ notice: message(e) })
    }
  },

  setDraft: (rungId, tree) =>
    set((s) => ({
      drafts: { ...s.drafts, [rungId]: serializeCondition(tree) },
      notice: null,
    })),

  revert: (rungId) =>
    set((s) => {
      const drafts = { ...s.drafts }
      delete drafts[rungId]
      const clears = s.selection?.rungId === rungId
      return {
        drafts,
        selection: clears ? null : s.selection,
        editing: s.editing?.rungId === rungId ? null : s.editing,
        notice: null,
      }
    }),

  clearDrafts: () =>
    set({ drafts: {}, selection: null, editing: null, armed: null, notice: null }),

  lastDownload: 0,
  download: () => {
    const drafts = get().drafts
    const ids = Object.keys(drafts)
    if (ids.length === 0) return 0

    const g = useGameStore.getState()
    // Only the condition is the player's to change. Rung order, ids, outputs and
    // descriptions are the machine builder's, and a laptop that let you rewire
    // the coils would be a different (and much less diagnostic) game.
    g.setRungs(
      g.rungs.map((r) =>
        drafts[r.id] === undefined ? r : { ...r, condition: drafts[r.id] },
      ),
    )
    set({
      drafts: {},
      selection: null,
      editing: null,
      armed: null,
      lastDownload: Date.now(),
      notice: null,
    })
    return ids.length
  },

  notice: null,
  setNotice: (n) => set({ notice: n }),
}))
