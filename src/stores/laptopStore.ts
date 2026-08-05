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
 * The canonical spelling of a condition string.
 *
 * Drafts are always `serializeCondition` output. The running program's condition
 * is whatever the scenario JSON spells, which may differ purely typographically
 * (`NOT A AND (B OR C)` vs extra spaces, redundant parens). Comparing a draft to
 * the raw text would therefore call a cosmetic round trip an edit, so both sides
 * are put through the parser before anything is compared.
 *
 * Unparseable text can only be the scenario's own — a draft is serialised from a
 * tree — so falling back to the trimmed string is safe and keeps the comparison
 * total.
 */
function canonical(condition: string): string {
  try {
    return serializeCondition(parseCondition(condition))
  } catch {
    return condition.trim()
  }
}

/**
 * Does this draft say exactly what the processor is already running?
 *
 * A draft that survives a round trip back to the program it started from is not
 * an edit, and must not be counted as one anywhere: not in the pending count on
 * the online bar, not on the DOWNLOAD button, and not as the EDITED badge on the
 * rung. Toggling a contact type twice is the ordinary way to produce one.
 */
export function isNoOpDraft(draft: string, condition: string): boolean {
  return draft === canonical(condition)
}

/**
 * Store an edited condition, or drop the entry entirely when the edit undid
 * itself. This is the single place the "a rung with no entry in `drafts` is
 * untouched" invariant is enforced.
 */
function withDraft(
  drafts: Record<number, string>,
  rungId: number,
  next: string,
  condition: string,
): Record<number, string> {
  const out = { ...drafts }
  if (isNoOpDraft(next, condition)) delete out[rungId]
  else out[rungId] = next
  return out
}

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
 * A rung with no entry in `drafts` is untouched. That is the whole EDITED test,
 * and it holds in both directions: an edit that lands back on the running
 * condition REMOVES the entry (see `withDraft`), so the pending count, the
 * DOWNLOAD button and the per-rung badge can never disagree about whether a rung
 * has been changed.
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
   * An insert that has been placed but not yet accepted.
   *
   * Dropping an instruction writes a draft immediately — it has to, because the
   * contact must be drawn before its address can be picked off it. Without a way
   * back that makes the insert unconditional: closing the address popover would
   * leave a contact carrying its neighbour's address in the program, and the only
   * escape would be REVERT RUNG, which also throws away every other edit on that
   * rung. So the draft as it stood BEFORE the insert is kept here (`null` meaning
   * "there was no draft"), and dismissing the popover puts it back exactly.
   *
   * Picking an address — or any other edit — accepts the insert and clears this.
   */
  pendingInsert: { rungId: number; path: LadderPath; restore: string | null } | null
  /**
   * Dismiss the address popover. Undoes a still-unaccepted insert; on an existing
   * contact it just closes.
   */
  cancelEdit: () => void

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
  /** Epoch ms of the last successful download; 0 if none THIS RUN. */
  lastDownload: number

  /**
   * Put the terminal back the way a fresh job finds it.
   *
   * `clearDrafts` is not enough: it is also the DISCARD ALL EDITS button and the
   * "the program was replaced" handler, so it deliberately leaves the download
   * stamp and the open document alone. A new run, though, must not inherit the
   * previous job's "Last download 21:14:07" — the processor it refers to is gone.
   */
  resetForRun: () => void

  /** One line of feedback in the status bar — an error, or a confirmation. */
  notice: string | null
  setNotice: (n: string | null) => void
}

/**
 * The state patch that undoes a still-unaccepted insert.
 *
 * Written as a patch rather than an action so `select` and `cancelEdit` — the
 * two ways the address popover can go away without an address being picked —
 * cannot drift apart.
 */
function rollback(s: LaptopState): Partial<LaptopState> {
  const pending = s.pendingInsert
  if (pending === null) return { editing: null, pendingInsert: null }
  const drafts = { ...s.drafts }
  if (pending.restore === null) delete drafts[pending.rungId]
  else drafts[pending.rungId] = pending.restore
  return { drafts, editing: null, pendingInsert: null }
}

export const useLaptopStore = create<LaptopState>()((set, get) => ({
  tab: 'ladder',
  setTab: (t) => set({ tab: t }),

  drafts: {},
  selection: null,
  select: (sel) => set((s) => ({ ...rollback(s), selection: sel })),

  armed: null,
  arm: (i) => set((s) => ({ armed: s.armed === i ? null : i, notice: null })),

  editing: null,
  beginEdit: (t) => set({ editing: t }),

  pendingInsert: null,
  cancelEdit: () =>
    set((s) => {
      const pending = s.pendingInsert
      return {
        ...rollback(s),
        // The contact the cursor was on has just stopped existing. Leaving the
        // rung itself selected keeps the player where they were.
        selection:
          pending === null ? s.selection : { rungId: pending.rungId, path: null },
        notice: null,
      }
    }),

  applyOp: (target, op) => {
    const rung = useGameStore.getState().rungs.find((r) => r.id === target.rungId)
    if (rung === undefined) return
    const source = get().drafts[target.rungId] ?? rung.condition
    try {
      const next = op(parseCondition(source), target.path)
      const settled = settle(next, target.path)
      const text = serializeCondition(next)
      set((s) => ({
        drafts: withDraft(s.drafts, target.rungId, text, rung.condition),
        selection: { rungId: target.rungId, path: settled },
        editing: null,
        // Any deliberate edit accepts whatever was pending, including the
        // address pick that closes the popover on a fresh insert.
        pendingInsert: null,
        notice: null,
      }))
    } catch (e) {
      set({ notice: message(e) })
    }
  },

  insertContact: (rungId, path, mode, tag, negated) => {
    const rung = useGameStore.getState().rungs.find((r) => r.id === rungId)
    if (rung === undefined) return
    const before = get().drafts[rungId]
    const source = before ?? rung.condition
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
        drafts: withDraft(s.drafts, rungId, serializeCondition(landed), rung.condition),
        selection: { rungId, path: at },
        editing: { rungId, path: at },
        // Provisional until an address is picked — see `pendingInsert`.
        pendingInsert: { rungId, path: at, restore: before ?? null },
        notice: null,
      }))
    } catch (e) {
      set({ notice: message(e) })
    }
  },

  setDraft: (rungId, tree) =>
    set((s) => {
      const rung = useGameStore.getState().rungs.find((r) => r.id === rungId)
      if (rung === undefined) return {}
      return {
        drafts: withDraft(s.drafts, rungId, serializeCondition(tree), rung.condition),
        pendingInsert: null,
        notice: null,
      }
    }),

  revert: (rungId) =>
    set((s) => {
      const drafts = { ...s.drafts }
      delete drafts[rungId]
      const clears = s.selection?.rungId === rungId
      return {
        drafts,
        selection: clears ? null : s.selection,
        editing: s.editing?.rungId === rungId ? null : s.editing,
        pendingInsert: s.pendingInsert?.rungId === rungId ? null : s.pendingInsert,
        notice: null,
      }
    }),

  clearDrafts: () =>
    set({
      drafts: {},
      selection: null,
      editing: null,
      armed: null,
      pendingInsert: null,
      notice: null,
    }),

  lastDownload: 0,
  resetForRun: () =>
    set({
      tab: 'ladder',
      drafts: {},
      selection: null,
      editing: null,
      armed: null,
      pendingInsert: null,
      lastDownload: 0,
      notice: null,
    }),
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
      pendingInsert: null,
      lastDownload: Date.now(),
      notice: null,
    })
    return ids.length
  },

  notice: null,
  setNotice: (n) => set({ notice: n }),
}))
