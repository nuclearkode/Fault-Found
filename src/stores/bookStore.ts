'use client'

import { create } from 'zustand'

/**
 * Where the reference manual is open.
 *
 * It lives in a store rather than in the component because the book unmounts:
 * ReferenceBook renders `null` whenever `overlay !== 'book'`, so a `useState`
 * page index would be thrown away every time the player closed the manual and
 * they would land back on the contents each time they reopened it. A technician
 * who has the isolation page open, walks to the cabinet and comes back expects
 * the isolation page, and the project rule is that game state lives in Zustand.
 *
 * `spreadCount` is set by the book on mount rather than imported from the
 * content module, so this store stays free of JSX and the two can never
 * disagree about how many spreads there actually are.
 */
interface BookState {
  /** Index of the open spread. 0 is the front matter (title + contents). */
  spread: number
  /** Total spreads, front matter included. Never less than 1. */
  spreadCount: number
  setSpreadCount: (n: number) => void
  /** Jump — used by the contents list. Clamped, so a stale index is harmless. */
  goTo: (i: number) => void
  /** Turn a page. +1 forward, -1 back. Stops at the covers rather than wrapping. */
  turn: (delta: number) => void
}

const clamp = (i: number, count: number) => Math.max(0, Math.min(count - 1, i))

export const useBookStore = create<BookState>()((set) => ({
  spread: 0,
  spreadCount: 1,

  setSpreadCount: (n) =>
    set((s) => {
      const count = Math.max(1, n)
      return { spreadCount: count, spread: clamp(s.spread, count) }
    }),

  goTo: (i) => set((s) => ({ spread: clamp(i, s.spreadCount) })),

  turn: (delta) => set((s) => ({ spread: clamp(s.spread + delta, s.spreadCount) })),
}))
