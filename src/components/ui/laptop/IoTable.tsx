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
      <table className="ff-io-table">
        <thead>
          <tr>
            <th className="ff-io-addr">ADDRESS</th>
            <th>SYMBOL</th>
            <th className="ff-io-type">TYPE</th>
            <th className="ff-io-val">VALUE</th>
            <th>DESCRIPTION</th>
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
                NO I/O IMAGE — PROCESSOR NOT CONNECTED
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
