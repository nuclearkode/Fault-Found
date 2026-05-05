/**
 * scoringEngine — Pure TypeScript scoring calculation.
 *
 * No React, no Three.js, no Zustand — fully testable in isolation.
 *
 * Scoring breakdown (max 1000 by default):
 *   40% Time     — full marks at par time, scales to 0 at 2× par
 *   40% Accuracy — deducted by wrong diagnoses (200pts each)
 *   10% Cost     — deducted by unnecessary part orders (100pts each)
 *   10% Safety   — deducted by LOTO skips (500pts each — capped at 0)
 */

import type { PlayerScore, ScoringConfig } from './types'

export interface PenaltyRecord {
  wrongDiagnosis: number
  unnecessaryPartOrder: number
  skipLOTO: number
  derekEscalation: number
}

/**
 * Calculate a full player score at scenario end.
 *
 * @param elapsed     Total time in seconds the player took
 * @param penalties   Accumulated penalty counts per category
 * @param config      Scenario scoring configuration from JSON
 */
export function calculateScore(
  elapsed: number,
  penalties: PenaltyRecord,
  config: ScoringConfig
): PlayerScore {
  const { parTime, maxScore } = config

  // --- Time score (40% of max) ---
  // Full marks at parTime, linear decay to 0 at 2× parTime, floored at 0
  const timeAllocation = maxScore * 0.4
  const timeRatio = Math.max(0, 1 - Math.max(0, elapsed - parTime) / parTime)
  const timeScore = Math.round(timeRatio * timeAllocation)

  // --- Accuracy score (40% of max) ---
  // Each wrong diagnosis costs 200pts, Derek escalations cost 50pts
  const accuracyAllocation = maxScore * 0.4
  const accuracyDeductions =
    penalties.wrongDiagnosis * config.penalties.wrongDiagnosis +
    penalties.derekEscalation * config.penalties.derekEscalation
  const accuracyScore = Math.max(0, Math.round(accuracyAllocation - accuracyDeductions))

  // --- Cost score (10% of max) ---
  const costAllocation = maxScore * 0.1
  const costDeductions = penalties.unnecessaryPartOrder * config.penalties.unnecessaryPartOrder
  const costScore = Math.max(0, Math.round(costAllocation - costDeductions))
  const costPenalty = penalties.unnecessaryPartOrder * config.penalties.unnecessaryPartOrder

  // --- Safety score (10% of max) ---
  const safetyAllocation = maxScore * 0.1
  const safetyDeductions = penalties.skipLOTO * config.penalties.skipLOTO
  const safetyScore = Math.max(0, Math.round(safetyAllocation - safetyDeductions))
  const safetyPenalty = penalties.skipLOTO * config.penalties.skipLOTO

  // --- Total & rank ---
  const total = timeScore + accuracyScore + costScore + safetyScore
  const rank = calculateRank(total, maxScore)

  return {
    time: timeScore,
    efficiency: 0, // Extended in Phase 3 with tool-use tracking
    accuracy: accuracyScore,
    costPenalty,
    safetyPenalty,
    total,
    rank,
  }
}

/**
 * Map a total score to a letter rank.
 * Thresholds are % of maxScore:
 *   S ≥ 95%, A ≥ 85%, B ≥ 70%, C ≥ 55%, D ≥ 40%, F < 40%
 */
export function calculateRank(total: number, maxScore: number): PlayerScore['rank'] {
  const pct = total / maxScore
  if (pct >= 0.95) return 'S'
  if (pct >= 0.85) return 'A'
  if (pct >= 0.70) return 'B'
  if (pct >= 0.55) return 'C'
  if (pct >= 0.40) return 'D'
  return 'F'
}
