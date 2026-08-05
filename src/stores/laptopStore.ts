'use client'

import { create } from 'zustand'
import { useGameStore } from './gameStore'
import { serializeCondition } from '@/engine/ladder'
import type { LadderNode, LadderPath } from '@/engine/ladder'

export type LaptopTab = 'ladder' | 'io'

/** Which contact the player has picked, addressed the way ladder.ts addresses. */
export interface LadderSelection {
  rungId: number
  path: LadderPath
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
 * A rung with no entry in `drafts` is untouched. That is the whole EDITED test.
 */
interface LaptopState {
  tab: LaptopTab
  setTab: (t: LaptopTab) => void

  /** rung id -> edited condition string. Absent means "as downloaded". */
  drafts: Record<number, string>
  selection: LadderSelection | null
  select: (sel: LadderSelection | null) => void

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

  /** One line of feedback under the editor — an error, or a confirmation. */
  notice: string | null
  setNotice: (n: string | null) => void
}

export const useLaptopStore = create<LaptopState>()((set, get) => ({
  tab: 'ladder',
  setTab: (t) => set({ tab: t }),

  drafts: {},
  selection: null,
  select: (sel) => set({ selection: sel }),

  setDraft: (rungId, tree) =>
    set((s) => ({
      drafts: { ...s.drafts, [rungId]: serializeCondition(tree) },
      notice: null,
    })),

  revert: (rungId) =>
    set((s) => {
      const drafts = { ...s.drafts }
      delete drafts[rungId]
      return {
        drafts,
        selection: s.selection?.rungId === rungId ? null : s.selection,
        notice: null,
      }
    }),

  clearDrafts: () => set({ drafts: {}, selection: null, notice: null }),

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
    set({ drafts: {}, selection: null, lastDownload: Date.now(), notice: null })
    return ids.length
  },

  notice: null,
  setNotice: (n) => set({ notice: n }),
}))
