import { describe, it, expect } from 'vitest'
import {
  evaluateCondition,
  createTagMap,
  runScanCycle,
  applyFaults,
} from '../scanCycle'
import type { IOTag, Rung, Fault } from '../types'

// --- Helper: quick tag factory ---
function makeBoolTag(id: string, label: string, value: boolean): IOTag {
  return { id, label, type: 'BOOL', value }
}

describe('evaluateCondition', () => {
  it('reads a single tag value', () => {
    const tags = createTagMap([makeBoolTag('I0.0', 'START', true)])
    expect(evaluateCondition('I0.0', tags)).toBe(true)
  })

  it('evaluates AND', () => {
    const tags = createTagMap([
      makeBoolTag('I0.0', 'A', true),
      makeBoolTag('I0.1', 'B', false),
    ])
    expect(evaluateCondition('I0.0 AND I0.1', tags)).toBe(false)
  })

  it('evaluates OR', () => {
    const tags = createTagMap([
      makeBoolTag('I0.0', 'A', false),
      makeBoolTag('I0.1', 'B', true),
    ])
    expect(evaluateCondition('I0.0 OR I0.1', tags)).toBe(true)
  })

  it('evaluates NOT', () => {
    const tags = createTagMap([makeBoolTag('I0.0', 'A', true)])
    expect(evaluateCondition('NOT I0.0', tags)).toBe(false)
  })

  it('evaluates complex expression: A AND NOT B', () => {
    const tags = createTagMap([
      makeBoolTag('I0.0', 'A', true),
      makeBoolTag('I0.1', 'B', false),
    ])
    expect(evaluateCondition('I0.0 AND NOT I0.1', tags)).toBe(true)
  })

  it('returns false for missing tag', () => {
    const tags = createTagMap([])
    expect(evaluateCondition('I0.0', tags)).toBe(false)
  })
})

describe('applyFaults', () => {
  it('NC/NO swap inverts a boolean tag', () => {
    const tags = createTagMap([makeBoolTag('I0.0', 'SENSOR', true)])
    const faults: Fault[] = [
      {
        id: 'F1',
        type: 'wiring_nc_no_swap',
        targetTag: 'I0.0',
        effect: 'Inverts sensor reading',
        clues: ['Wiring diagram shows NC'],
        solution: 'Swap wires at terminal block',
        active: true,
      },
    ]

    applyFaults(tags, faults)
    expect(tags.get('I0.0')?.value).toBe(false)
  })

  it('open circuit forces tag to false', () => {
    const tags = createTagMap([makeBoolTag('I0.0', 'SENSOR', true)])
    const faults: Fault[] = [
      {
        id: 'F2',
        type: 'wiring_open_circuit',
        targetTag: 'I0.0',
        effect: 'No signal',
        clues: ['Infinite resistance on multimeter'],
        solution: 'Repair broken wire',
        active: true,
      },
    ]

    applyFaults(tags, faults)
    expect(tags.get('I0.0')?.value).toBe(false)
  })

  it('inactive faults are ignored', () => {
    const tags = createTagMap([makeBoolTag('I0.0', 'SENSOR', true)])
    const faults: Fault[] = [
      {
        id: 'F3',
        type: 'wiring_open_circuit',
        targetTag: 'I0.0',
        effect: 'No signal',
        clues: [],
        solution: 'Fix wire',
        active: false,
      },
    ]

    applyFaults(tags, faults)
    expect(tags.get('I0.0')?.value).toBe(true)
  })
})

describe('runScanCycle', () => {
  it('evaluates a simple rung: START → MOTOR', () => {
    const tags = createTagMap([
      makeBoolTag('I0.0', 'START_BTN', true),
      makeBoolTag('Q0.0', 'M1_RUN', false),
    ])

    const rungs: Rung[] = [
      { id: 1, condition: 'I0.0', output: 'Q0.0' },
    ]

    runScanCycle(tags, rungs, [])
    expect(tags.get('Q0.0')?.value).toBe(true)
  })

  it('fault prevents output from activating', () => {
    const tags = createTagMap([
      makeBoolTag('I0.0', 'START_BTN', true),
      makeBoolTag('Q0.0', 'M1_RUN', false),
    ])

    const rungs: Rung[] = [
      { id: 1, condition: 'I0.0', output: 'Q0.0' },
    ]

    const faults: Fault[] = [
      {
        id: 'F1',
        type: 'wiring_nc_no_swap',
        targetTag: 'I0.0',
        effect: 'Start button reads inverted',
        clues: [],
        solution: 'Fix wiring',
        active: true,
      },
    ]

    runScanCycle(tags, rungs, faults)
    // Fault inverts I0.0 from true → false, so Q0.0 stays false
    expect(tags.get('Q0.0')?.value).toBe(false)
  })
})
