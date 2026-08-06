'use client'

/**
 * IoTable — the processor's I/O image, live.
 *
 * Same rule as LadderView, for the same reason: the tag record is replaced 20
 * times a second by the scan cycle and written every frame by the cell, so React
 * renders the ROWS once (the set of addresses only changes when a scenario
 * loads) and a rAF-coalesced store subscription writes the values straight onto
 * pre-indexed cells. Nothing here re-renders while the machine runs.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useGameStore } from '@/stores/gameStore'
import type { TagType } from '@/engine/types'

interface Row {
  id: string
  label: string
  type: TagType
  description: string
}

export function IoTable() {
  // See LadderView: this selector returns the same string on every scan, so
  // Object.is stops the re-render at the store boundary.
  const tagKeys = useGameStore((s) => Object.keys(s.tags).join(','))

  const rows = useMemo<Row[]>(() => {
    const tags = useGameStore.getState().tags
    return tagKeys
      .split(',')
      .filter((id) => id.length > 0)
      .sort()
      .map((id) => ({
        id,
        label: tags[id]?.label ?? '',
        type: tags[id]?.type ?? 'BOOL',
        description: tags[id]?.description ?? '',
      }))
  }, [tagKeys])

  const bodyRef = useRef<HTMLTableSectionElement>(null)

  useEffect(() => {
    const body = bodyRef.current
    if (body === null) return

    const cells = Array.from(body.querySelectorAll<HTMLElement>('[data-tag]'))
    const targets = cells.map((el) => ({ el, id: el.getAttribute('data-tag') ?? '' }))
    const prev: string[] = targets.map(() => '')

    let raf = 0
    const paint = (): void => {
      raf = 0
      const tags = useGameStore.getState().tags
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]
        const tag = tags[t.id]
        const value = tag?.value
        const text =
          typeof value === 'number'
            ? Number.isInteger(value) ? String(value) : value.toFixed(2)
            : value === true ? '1' : '0'
        if (prev[i] === text) continue
        prev[i] = text
        t.el.textContent = text
        t.el.setAttribute('data-s', value ? '2' : '0')
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
  }, [rows])

  return (
    <div className="ff-io">
      <div className="ff-io-head">
        Data Files — I/O image, read live from the processor
        {/*
          The key, for the same reason the ladder has one: colour is the fastest
          thing on this screen and the slowest thing to explain. Nobody hunting a
          stuck output reads the digits — they read the green column and go to
          the odd one out, which only works if the pane itself says what green
          means.

          It is deliberately TWO flat states. The ladder next door has three,
          because there a contact can be made and still starved of power, and
          that middle amber state is the best teaching device in this UI. None of
          that applies here: this table reports the I/O image, so a bit is 1 or
          it is 0 and green claims nothing beyond the value in the cell it sits
          in. Saying that plainly is what keeps the two panes from looking like
          they disagree when a bit shows 1 here and amber over there.
        */}
        <span
          className="ff-io-key"
          aria-label="Colour key: green means the bit is 1"
          title="Green is the bit's value and nothing more — it does not mean the rung driving it is satisfied."
        >
          <i className="ff-io-sw ff-io-sw-off" /> 0
          <i className="ff-io-sw ff-io-sw-on" /> 1
        </span>
        <span className="ff-io-count">{rows.length} addresses</span>
      </div>
      <table className="ff-io-table">
        <thead>
          <tr>
            <th className="ff-io-addr">Address</th>
            <th>Symbol</th>
            <th className="ff-io-type">Type</th>
            <th className="ff-io-val">Value</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="ff-io-addr">{r.id}</td>
              <td className="ff-io-sym">{r.label}</td>
              <td className="ff-io-type">{r.type}</td>
              <td className="ff-io-val" data-tag={r.id} data-s="0">
                0
              </td>
              <td className="ff-io-desc">{r.description}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="ff-io-desc" colSpan={5}>
                No I/O image — the processor is not connected.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
