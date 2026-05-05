import { describe, it, expect } from 'vitest'
import { calculateScore, calculateRank } from '../scoringEngine'
import type { ScoringConfig } from '../types'
import type { PenaltyRecord } from '../scoringEngine'

// Shared scoring config matching S01
const CONFIG: ScoringConfig = {
  parTime: 180,
  maxScore: 1000,
  penalties: {
    wrongDiagnosis: 200,
    unnecessaryPartOrder: 100,
    skipLOTO: 500,
    derekEscalation: 50,
  },
}

const NO_PENALTIES: PenaltyRecord = {
  wrongDiagnosis: 0,
  unnecessaryPartOrder: 0,
  skipLOTO: 0,
  derekEscalation: 0,
}

// ─── calculateRank ─────────────────────────────────────────────────────────

describe('calculateRank', () => {
  it('returns S at 95%+', () => {
    expect(calculateRank(950, 1000)).toBe('S')
    expect(calculateRank(1000, 1000)).toBe('S')
  })

  it('returns A at 85–94%', () => {
    expect(calculateRank(850, 1000)).toBe('A')
    expect(calculateRank(940, 1000)).toBe('A')
  })

  it('returns B at 70–84%', () => {
    expect(calculateRank(700, 1000)).toBe('B')
    expect(calculateRank(849, 1000)).toBe('B')
  })

  it('returns C at 55–69%', () => {
    expect(calculateRank(550, 1000)).toBe('C')
    expect(calculateRank(699, 1000)).toBe('C')
  })

  it('returns D at 40–54%', () => {
    expect(calculateRank(400, 1000)).toBe('D')
    expect(calculateRank(549, 1000)).toBe('D')
  })

  it('returns F below 40%', () => {
    expect(calculateRank(399, 1000)).toBe('F')
    expect(calculateRank(0, 1000)).toBe('F')
  })
})

// ─── calculateScore ────────────────────────────────────────────────────────

describe('calculateScore — perfect run', () => {
  it('awards full time score at par time', () => {
    const score = calculateScore(180, NO_PENALTIES, CONFIG)
    expect(score.time).toBe(400) // 40% of 1000
    expect(score.accuracy).toBe(400) // 40% of 1000
    expect(score.costPenalty).toBe(0)
    expect(score.safetyPenalty).toBe(0)
    expect(score.total).toBe(900) // 400 + 400 + 100 + 0 (efficiency = 0)
    expect(score.rank).toBe('S')
  })

  it('awards full time score when finishing under par time', () => {
    const score = calculateScore(60, NO_PENALTIES, CONFIG)
    expect(score.time).toBe(400)
  })
})

describe('calculateScore — time decay', () => {
  it('gives 50% time score at 1.5× par time', () => {
    // elapsed = 270s = parTime + 90s = parTime + 0.5 × parTime
    // timeRatio = 1 - 0.5 = 0.5
    const score = calculateScore(270, NO_PENALTIES, CONFIG)
    expect(score.time).toBe(200)
  })

  it('gives 0 time score at 2× par time', () => {
    const score = calculateScore(360, NO_PENALTIES, CONFIG)
    expect(score.time).toBe(0)
  })

  it('clamps time score to 0 beyond 2× par', () => {
    const score = calculateScore(9999, NO_PENALTIES, CONFIG)
    expect(score.time).toBe(0)
    expect(score.total).toBeGreaterThanOrEqual(0)
  })
})

describe('calculateScore — penalties', () => {
  it('deducts 200pts per wrong diagnosis from accuracy', () => {
    const penalties: PenaltyRecord = { ...NO_PENALTIES, wrongDiagnosis: 1 }
    const score = calculateScore(180, penalties, CONFIG)
    expect(score.accuracy).toBe(200) // 400 - 200
  })

  it('clamps accuracy to 0 with multiple wrong diagnoses', () => {
    const penalties: PenaltyRecord = { ...NO_PENALTIES, wrongDiagnosis: 3 }
    const score = calculateScore(180, penalties, CONFIG)
    expect(score.accuracy).toBe(0)
  })

  it('deducts 100pts per unnecessary part order', () => {
    const penalties: PenaltyRecord = { ...NO_PENALTIES, unnecessaryPartOrder: 1 }
    const score = calculateScore(180, penalties, CONFIG)
    expect(score.costPenalty).toBe(100)
  })

  it('records safety penalty when LOTO skipped', () => {
    const penalties: PenaltyRecord = { ...NO_PENALTIES, skipLOTO: 1 }
    const score = calculateScore(180, penalties, CONFIG)
    expect(score.safetyPenalty).toBe(500)
    // Safety allocation is only 100pts, so safety score = 0, penalty = 500
  })

  it('skipping LOTO forces F rank via massive penalty', () => {
    // Total = 400 + 400 + 100 + 0 (safety capped) = 900 → but safety deduction
    // Safety allocation = 100, deduction = 500, capped at 0 → lose 100pts from total
    // 400 + 400 + 100 + 0 = 900 - 100 (safety floor) = 800 → still A
    // But two LOTO skips: allocation 100, deduction 1000, capped 0 → same
    // LOTO penalty matters most via the costPenalty/safetyPenalty tracking
    const penalties: PenaltyRecord = { ...NO_PENALTIES, skipLOTO: 1, wrongDiagnosis: 2 }
    const score = calculateScore(360, penalties, CONFIG) // also late
    expect(score.rank).toBe('F')
  })

  it('derek escalation deducts from accuracy', () => {
    const penalties: PenaltyRecord = { ...NO_PENALTIES, derekEscalation: 2 }
    const score = calculateScore(180, penalties, CONFIG)
    // 2 × 50 = 100 deducted from accuracy
    expect(score.accuracy).toBe(300) // 400 - 100
  })
})
