import { describe, it, expect } from 'vitest'
import {
  parseCondition,
  serializeCondition,
  isCanonical,
  evaluateNode,
  evaluateFlow,
  collectTags,
  equivalent,
  layout,
  nodeAt,
  contact,
  series,
  parallel,
  setContactTag,
  toggleContactType,
  insertSeries,
  insertParallel,
  removeAt,
  EQUIVALENCE_TAG_LIMIT,
  type LadderNode,
} from '../ladder'
import { evaluateCondition, createTagMap } from '../scanCycle'
import type { IOTag } from '../types'

import S01 from '../../scenarios/S01.json'
import S02 from '../../scenarios/S02.json'
import S03 from '../../scenarios/S03.json'
import S04 from '../../scenarios/S04.json'
import S05 from '../../scenarios/S05.json'
import S06 from '../../scenarios/S06.json'

interface RungLike {
  id: number
  condition: string
  output: string
}

const SCENARIOS: { id: string; rungs: RungLike[] }[] = [
  { id: 'S01', rungs: S01.rungs },
  { id: 'S02', rungs: S02.rungs },
  { id: 'S03', rungs: S03.rungs },
  { id: 'S04', rungs: S04.rungs },
  { id: 'S05', rungs: S05.rungs },
  { id: 'S06', rungs: S06.rungs },
]

const ALL_RUNGS: { scenario: string; rung: RungLike }[] = SCENARIOS.flatMap((s) =>
  s.rungs.map((rung) => ({ scenario: s.id, rung })),
)

/**
 * Hand-written cases the scenarios do not (yet) exercise: nested NOT, De Morgan
 * over a mixed expression, redundant parens, and an OR-of-ANDs that is NOT
 * canonical as written.
 */
const EDGE_CASES = [
  'A',
  'NOT A',
  '( A )',
  '((A))',
  'NOT (NOT A)',
  'NOT (NOT (NOT A))',
  'A AND B',
  'A OR B',
  'A AND B AND C',
  'A OR B OR C',
  'NOT (A AND B)',
  'NOT (A OR B)',
  'NOT (A AND NOT B)',
  'NOT ((A OR B) AND C)',
  'NOT (NOT (A OR B) AND C)',
  'A AND (B OR C) AND D',
  '(A AND B) OR (C AND D)',
  '(A OR B) AND (C OR D)',
  'NOT ((A AND B) OR (C AND NOT D))',
  '((A OR B) AND C) OR NOT D',
  'I:1/00 AND NOT I:1/01',
]

const ALL_CONDITIONS = [...ALL_RUNGS.map((r) => r.rung.condition), ...EDGE_CASES]

/** Every assignment of `tags`, as a `get` closure. */
function assignments(tags: string[]): ((tag: string) => boolean)[] {
  const out: ((tag: string) => boolean)[] = []
  for (let mask = 0; mask < 1 << tags.length; mask++) {
    const values = new Map(tags.map((t, i) => [t, (mask & (1 << i)) !== 0]))
    out.push((tag: string) => values.get(tag) ?? false)
  }
  return out
}

function boolTagMap(tags: string[], get: (tag: string) => boolean) {
  const ioTags: IOTag[] = tags.map((id) => ({
    id,
    label: id,
    type: 'BOOL',
    value: get(id),
  }))
  return createTagMap(ioTags)
}

// --- Parsing / serialisation -------------------------------------------

describe('parseCondition', () => {
  it('parses a bare tag into a single contact', () => {
    expect(parseCondition('I:1/04')).toEqual(contact('I:1/04', false))
  })

  it('parses NOT into a negated contact — no NOT node survives', () => {
    expect(parseCondition('NOT I:1/01')).toEqual(contact('I:1/01', true))
  })

  it('flattens same-kind nesting: series(series(a,b),c) becomes series(a,b,c)', () => {
    const tree = parseCondition('A AND B AND C')
    expect(tree).toEqual(
      series(contact('A'), contact('B'), contact('C')),
    )
    expect(tree.kind === 'series' && tree.children).toHaveLength(3)
  })

  it('collapses redundant parentheses', () => {
    expect(parseCondition('((A))')).toEqual(contact('A'))
  })

  it('never yields a node outside contact | series | parallel', () => {
    const kinds = new Set<string>()
    const walk = (n: LadderNode): void => {
      kinds.add(n.kind)
      if (n.kind !== 'contact') n.children.forEach(walk)
    }
    for (const condition of ALL_CONDITIONS) walk(parseCondition(condition))
    expect([...kinds].sort()).toEqual(['contact', 'parallel', 'series'])
  })

  it('rejects malformed conditions loudly', () => {
    expect(() => parseCondition('')).toThrow()
    expect(() => parseCondition('A AND')).toThrow()
    expect(() => parseCondition('(A OR B')).toThrow()
    expect(() => parseCondition('A B')).toThrow()
    expect(() => parseCondition('NOT NOT A')).toThrow()
    expect(() => parseCondition('AND A')).toThrow()
  })
})

describe('De Morgan normalisation', () => {
  it('NOT (a AND b) becomes a parallel of negated contacts', () => {
    expect(parseCondition('NOT (A AND B)')).toEqual(
      parallel(contact('A', true), contact('B', true)),
    )
  })

  it('NOT (a OR b) becomes a series of negated contacts', () => {
    expect(parseCondition('NOT (A OR B)')).toEqual(
      series(contact('A', true), contact('B', true)),
    )
  })

  it('NOT (NOT a) cancels', () => {
    expect(parseCondition('NOT (NOT A)')).toEqual(contact('A', false))
    expect(parseCondition('NOT (NOT (NOT A))')).toEqual(contact('A', true))
  })

  it('pushes NOT through a mixed expression', () => {
    // NOT((A OR B) AND C) -> (NOT A AND NOT B) OR NOT C
    expect(parseCondition('NOT ((A OR B) AND C)')).toEqual(
      parallel(
        series(contact('A', true), contact('B', true)),
        contact('C', true),
      ),
    )
  })
})

describe('serializeCondition', () => {
  it('emits the minimum parentheses (AND binds tighter than OR)', () => {
    expect(serializeCondition(parseCondition('(A AND B) OR (C AND D)'))).toBe(
      'A AND B OR C AND D',
    )
    expect(serializeCondition(parseCondition('(A OR B) AND C'))).toBe(
      '(A OR B) AND C',
    )
    expect(serializeCondition(parseCondition('((A))'))).toBe('A')
  })

  it('round-trips: parse(serialize(t)) equals t', () => {
    for (const condition of ALL_CONDITIONS) {
      const tree = parseCondition(condition)
      expect(parseCondition(serializeCondition(tree))).toEqual(tree)
    }
  })

  it('is idempotent: serialising twice equals serialising once', () => {
    for (const condition of ALL_CONDITIONS) {
      const once = serializeCondition(parseCondition(condition))
      const twice = serializeCondition(parseCondition(once))
      expect(twice).toBe(once)
    }
  })
})

// --- Canonicality guard -------------------------------------------------

describe('CANONICALITY GUARD — scenario JSON', () => {
  // If this fails, FIX THE JSON, not the test. The laptop badges a rung as
  // EDITED when its stored condition does not round-trip, which would send the
  // player hunting a fault that is not there.
  it.each(ALL_RUNGS)(
    '$scenario rung $rung.id is stored in canonical form',
    ({ rung }) => {
      expect(serializeCondition(parseCondition(rung.condition))).toBe(
        rung.condition,
      )
      expect(isCanonical(rung.condition)).toBe(true)
    },
  )
})

// --- Agreement with the live scan-cycle evaluator ----------------------

describe('evaluateNode agrees with scanCycle.evaluateCondition', () => {
  it.each(ALL_RUNGS)(
    '$scenario rung $rung.id over every tag assignment',
    ({ rung }) => {
      const tree = parseCondition(rung.condition)
      const tags = collectTags(tree)
      expect(tags.length).toBeLessThanOrEqual(12)
      for (const get of assignments(tags)) {
        expect(evaluateNode(tree, get)).toBe(
          evaluateCondition(rung.condition, boolTagMap(tags, get)),
        )
      }
    },
  )

  it('holds for the De Morgan edge cases too', () => {
    for (const condition of EDGE_CASES) {
      const tree = parseCondition(condition)
      const tags = collectTags(tree)
      for (const get of assignments(tags)) {
        expect({ condition, value: evaluateNode(tree, get) }).toEqual({
          condition,
          value: evaluateCondition(condition, boolTagMap(tags, get)),
        })
      }
    }
  })
})

// --- Power flow ---------------------------------------------------------

describe('evaluateFlow', () => {
  const tree = parseCondition('(A OR B) AND NOT C')

  it('a contact on a dead branch is not fed', () => {
    // A=false, B=false, C=false
    const { fed, hot } = evaluateFlow(tree, () => false)
    const cNode = nodeAt(tree, [1])
    expect(cNode).toEqual(contact('C', true))
    // C is examine-off and C is false, so the contact is MADE — but the branch
    // ahead of it never delivered power, so it must not light.
    expect(fed.get(cNode)).toBe(false)
    expect(hot.get(cNode)).toBe(false)
    expect(hot.get(tree)).toBe(false)
  })

  it('feeds the whole rung when the branch conducts', () => {
    const get = (tag: string) => tag === 'A'
    const { fed, hot } = evaluateFlow(tree, get)
    const branch = nodeAt(tree, [0])
    const cNode = nodeAt(tree, [1])
    expect(fed.get(branch)).toBe(true)
    expect(hot.get(branch)).toBe(true)
    expect(fed.get(cNode)).toBe(true)
    expect(hot.get(cNode)).toBe(true)
    expect(hot.get(tree)).toBe(true)
  })

  it('records every node, even ones downstream of a break', () => {
    const nodes: LadderNode[] = []
    const walk = (n: LadderNode): void => {
      nodes.push(n)
      if (n.kind !== 'contact') n.children.forEach(walk)
    }
    walk(tree)
    const { fed, hot } = evaluateFlow(tree, () => false)
    for (const n of nodes) {
      expect(fed.has(n)).toBe(true)
      expect(hot.has(n)).toBe(true)
    }
  })

  it('the root hot bit equals evaluateNode', () => {
    for (const condition of ALL_CONDITIONS) {
      const t = parseCondition(condition)
      for (const get of assignments(collectTags(t))) {
        expect(evaluateFlow(t, get).hot.get(t)).toBe(evaluateNode(t, get))
      }
    }
  })

  it('a parallel leg is fed even when a sibling leg carries the power', () => {
    const t = parseCondition('A OR B')
    const { fed, hot } = evaluateFlow(t, (tag) => tag === 'A')
    expect(fed.get(nodeAt(t, [1]))).toBe(true)
    expect(hot.get(nodeAt(t, [1]))).toBe(false)
  })
})

// --- Equivalence --------------------------------------------------------

describe('equivalent', () => {
  it('is order-insensitive across a commutative operator', () => {
    expect(equivalent('A AND B', 'B AND A')).toBe(true)
    expect(equivalent('A OR B', 'B OR A')).toBe(true)
  })

  it('separates AND from OR', () => {
    expect(equivalent('A AND B', 'A OR B')).toBe(false)
  })

  it('sees through De Morgan', () => {
    expect(equivalent('NOT (A AND B)', 'NOT A OR NOT B')).toBe(true)
    expect(equivalent('NOT (A OR B)', 'NOT A AND NOT B')).toBe(true)
  })

  it('counts tags one side does not mention', () => {
    expect(equivalent('A', 'A AND B')).toBe(false)
    expect(equivalent('A', 'A OR (B AND NOT B)')).toBe(true)
  })

  it('accepts trees as well as strings', () => {
    expect(
      equivalent(parseCondition('A AND B'), series(contact('B'), contact('A'))),
    ).toBe(true)
  })

  it('bails out rather than hanging past the tag cap', () => {
    const many = Array.from(
      { length: EQUIVALENCE_TAG_LIMIT + 1 },
      (_, i) => `T${i}`,
    ).join(' AND ')
    expect(equivalent(many, many)).toBe(false)
    const atCap = Array.from(
      { length: EQUIVALENCE_TAG_LIMIT },
      (_, i) => `T${i}`,
    ).join(' AND ')
    expect(equivalent(atCap, atCap)).toBe(true)
  })

  it('confirms the silo rungs are pairwise distinct', () => {
    const conditions = [...new Set(S02.rungs.map((r) => r.condition))]
    for (let i = 0; i < conditions.length; i++) {
      for (let j = i + 1; j < conditions.length; j++) {
        expect(equivalent(conditions[i], conditions[j])).toBe(false)
      }
    }
  })
})

// --- Edit operations ----------------------------------------------------

describe('edit operations', () => {
  const source = '(I:1/00 OR O:2/02) AND NOT I:1/01 AND NOT I:1/02'
  const root = parseCondition(source)

  function expectCanonical(tree: LadderNode) {
    const text = serializeCondition(tree)
    expect(isCanonical(text)).toBe(true)
    expect(parseCondition(text)).toEqual(tree)
    return text
  }

  it('never mutates the input tree', () => {
    const before = JSON.stringify(root)
    setContactTag(root, [1], 'I:1/09')
    toggleContactType(root, [1])
    insertSeries(root, [1], contact('X'))
    insertParallel(root, [1], contact('X'))
    removeAt(root, [1])
    expect(JSON.stringify(root)).toBe(before)
  })

  it('setContactTag retags in place and keeps the contact type', () => {
    const next = setContactTag(root, [1], 'I:1/09')
    expect(nodeAt(next, [1])).toEqual(contact('I:1/09', true))
    expect(expectCanonical(next)).toBe(
      '(I:1/00 OR O:2/02) AND NOT I:1/09 AND NOT I:1/02',
    )
  })

  it('toggleContactType flips examine-on / examine-off', () => {
    const next = toggleContactType(root, [1])
    expect(expectCanonical(next)).toBe(
      '(I:1/00 OR O:2/02) AND I:1/01 AND NOT I:1/02',
    )
    expect(expectCanonical(toggleContactType(next, [1]))).toBe(source)
  })

  it('insertSeries splices into the parent series rather than nesting', () => {
    const next = insertSeries(root, [1], contact('I:1/07'))
    expect(next.kind).toBe('series')
    expect(next.kind === 'series' && next.children).toHaveLength(4)
    expect(expectCanonical(next)).toBe(
      '(I:1/00 OR O:2/02) AND NOT I:1/01 AND I:1/07 AND NOT I:1/02',
    )
  })

  it('insertSeries into a branch leg parenthesises correctly', () => {
    const next = insertSeries(root, [0, 0], contact('I:1/08'))
    expect(expectCanonical(next)).toBe(
      '(I:1/00 AND I:1/08 OR O:2/02) AND NOT I:1/01 AND NOT I:1/02',
    )
  })

  it('insertParallel branches around a single contact', () => {
    const next = insertParallel(root, [1], contact('I:1/07', true))
    expect(expectCanonical(next)).toBe(
      '(I:1/00 OR O:2/02) AND (NOT I:1/01 OR NOT I:1/07) AND NOT I:1/02',
    )
  })

  it('insertParallel into an existing branch flattens instead of nesting', () => {
    const next = insertParallel(root, [0, 0], contact('I:1/06'))
    const branch = nodeAt(next, [0])
    expect(branch.kind).toBe('parallel')
    expect(branch.kind === 'parallel' && branch.children).toHaveLength(3)
    expect(expectCanonical(next)).toBe(
      '(I:1/00 OR I:1/06 OR O:2/02) AND NOT I:1/01 AND NOT I:1/02',
    )
  })

  it('removeAt collapses the group it empties', () => {
    const next = removeAt(root, [0, 1])
    // The branch drops to one leg, so the branch itself disappears.
    expect(expectCanonical(next)).toBe(
      'I:1/00 AND NOT I:1/01 AND NOT I:1/02',
    )
  })

  it('removeAt of a whole branch leaves the rest of the rung', () => {
    expect(expectCanonical(removeAt(root, [0]))).toBe(
      'NOT I:1/01 AND NOT I:1/02',
    )
  })

  it('refuses to empty the rung', () => {
    expect(() => removeAt(contact('A'), [])).toThrow()
  })

  it('rejects paths that leave the tree', () => {
    expect(() => nodeAt(root, [9])).toThrow()
    expect(() => setContactTag(root, [1, 0], 'X')).toThrow()
    expect(() => setContactTag(root, [0], 'X')).toThrow()
    expect(() => toggleContactType(root, [0])).toThrow()
  })

  it('every edit op preserves canonicality on every scenario rung', () => {
    const probe = contact('I:1/07', true)
    for (const { rung } of ALL_RUNGS) {
      const tree = parseCondition(rung.condition)
      const paths = layout(tree).cells.map((c) => c.path)
      for (const path of paths) {
        expectCanonical(setContactTag(tree, path, 'I:1/09'))
        expectCanonical(toggleContactType(tree, path))
        expectCanonical(insertSeries(tree, path, probe))
        expectCanonical(insertParallel(tree, path, probe))
        if (paths.length > 1) expectCanonical(removeAt(tree, path))
      }
    }
  })

  it('inserted nodes are cloned, so node identity stays unique', () => {
    const probe = contact('X')
    const next = insertSeries(insertSeries(root, [1], probe), [1], probe)
    const contacts = layout(next).cells.map((c) => c.node)
    expect(new Set(contacts).size).toBe(contacts.length)
  })
})

// --- Layout -------------------------------------------------------------

describe('layout', () => {
  it('advances the column for series elements', () => {
    const { cells, rows, cols } = layout(parseCondition('A AND B AND C'))
    expect(rows).toBe(1)
    expect(cols).toBe(3)
    expect(cells.map((c) => [c.row, c.col])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ])
  })

  it('stacks parallel branches on consecutive rows', () => {
    const { cells, rows, cols } = layout(parseCondition('A OR B OR C'))
    expect(rows).toBe(3)
    expect(cols).toBe(1)
    expect(cells.map((c) => [c.row, c.col])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ])
  })

  it('lays out a real silo rung', () => {
    const { cells, rows, cols } = layout(
      parseCondition('(I:1/00 OR O:2/02) AND NOT I:1/01 AND NOT I:1/02'),
    )
    expect(rows).toBe(2)
    expect(cols).toBe(3)
    expect(cells).toEqual([
      { row: 0, col: 0, node: contact('I:1/00'), path: [0, 0] },
      { row: 1, col: 0, node: contact('O:2/02'), path: [0, 1] },
      { row: 0, col: 1, node: contact('I:1/01', true), path: [1] },
      { row: 0, col: 2, node: contact('I:1/02', true), path: [2] },
    ])
  })

  it('sizes a branch of unequal legs by its widest and its total height', () => {
    const { rows, cols } = layout(parseCondition('(A AND B) OR C OR (D AND E)'))
    expect(rows).toBe(3)
    expect(cols).toBe(2)
  })

  it('emits one cell per contact, with paths that resolve', () => {
    for (const condition of ALL_CONDITIONS) {
      const tree = parseCondition(condition)
      const { cells } = layout(tree)
      expect(cells.length).toBe(
        serializeCondition(tree).split(/\bAND\b|\bOR\b/).length,
      )
      for (const cell of cells) {
        expect(nodeAt(tree, cell.path)).toBe(cell.node)
      }
    }
  })
})
