import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { GamePhase, IOTag, ToolType, PlayerScore, Rung, Fault } from '@/engine/types'

// --- Penalty tracking ---
interface PenaltyRecord {
  wrongDiagnosis: number
  unnecessaryPartOrder: number
  skipLOTO: number
  derekEscalation: number
}

interface GameState {
  // --- Game Phase ---
  phase: GamePhase
  setPhase: (phase: GamePhase) => void

  // --- Scenario ---
  scenarioId: string | null
  loadScenario: (id: string) => void

  // --- PLC Tags ---
  tags: Record<string, IOTag>
  setTag: (id: string, value: boolean | number) => void
  setTags: (tags: Record<string, IOTag>) => void

  // --- Ladder Logic (set by scenario loader) ---
  rungs: Rung[]
  setRungs: (rungs: Rung[]) => void
  faults: Fault[]
  setFaults: (faults: Fault[]) => void

  // --- Timer ---
  elapsedTime: number
  tickTimer: (delta: number) => void
  resetTimer: () => void

  // --- Player Tools ---
  activeTool: ToolType | null
  setActiveTool: (tool: ToolType | null) => void

  // --- Interaction ---
  hoveredInteractable: string | null
  setHoveredInteractable: (name: string | null) => void

  // --- Score ---
  score: PlayerScore
  penaltyRecord: PenaltyRecord
  applyPenalty: (type: keyof PenaltyRecord, amount: number) => void
  finalizeScore: (parTime: number, maxScore: number) => void

  // --- LOTO ---
  lotoApplied: boolean
  setLotoApplied: (applied: boolean) => void
}

const initialScore: PlayerScore = {
  time: 0,
  efficiency: 0,
  accuracy: 0,
  costPenalty: 0,
  safetyPenalty: 0,
  total: 0,
  rank: 'F',
}

const initialPenalties: PenaltyRecord = {
  wrongDiagnosis: 0,
  unnecessaryPartOrder: 0,
  skipLOTO: 0,
  derekEscalation: 0,
}

export const useGameStore = create<GameState>()(
  subscribeWithSelector((set, get) => ({
    // --- Game Phase ---
    phase: 'menu',
    setPhase: (phase) => set({ phase }),

    // --- Scenario ---
    scenarioId: null,
    loadScenario: (id) => set({ scenarioId: id, phase: 'briefing' }),

    // --- PLC Tags ---
    tags: {},
    setTag: (id, value) =>
      set((state) => ({
        tags: {
          ...state.tags,
          [id]: { ...state.tags[id], value },
        },
      })),
    setTags: (tags) => set({ tags }),

    // --- Ladder Logic ---
    rungs: [],
    setRungs: (rungs) => set({ rungs }),
    faults: [],
    setFaults: (faults) => set({ faults }),

    // --- Timer ---
    elapsedTime: 0,
    tickTimer: (delta) =>
      set((state) => ({ elapsedTime: state.elapsedTime + delta })),
    resetTimer: () => set({ elapsedTime: 0 }),

    // --- Player Tools ---
    activeTool: null,
    setActiveTool: (tool) => set({ activeTool: tool }),

    // --- Interaction ---
    hoveredInteractable: null,
    setHoveredInteractable: (name) => set({ hoveredInteractable: name }),

    // --- Score ---
    score: { ...initialScore },
    penaltyRecord: { ...initialPenalties },
    applyPenalty: (type, amount) =>
      set((state) => {
        const next = { ...state.penaltyRecord, [type]: state.penaltyRecord[type] + amount }

        // Map penalty type to the correct score field
        const safetyTypes: Array<keyof PenaltyRecord> = ['skipLOTO']
        const costTypes: Array<keyof PenaltyRecord> = ['unnecessaryPartOrder']
        const accuracyTypes: Array<keyof PenaltyRecord> = ['wrongDiagnosis', 'derekEscalation']

        const score = { ...state.score, total: state.score.total + amount }
        if (safetyTypes.includes(type)) score.safetyPenalty += amount
        else if (costTypes.includes(type)) score.costPenalty += amount
        else if (accuracyTypes.includes(type)) score.accuracy = Math.max(0, score.accuracy - amount)

        return { penaltyRecord: next, score }
      }),
    finalizeScore: (parTime, maxScore) => {
      const { elapsedTime, penaltyRecord, score } = get()

      // Time score: full marks at par, 0 at 2× par
      const timeRatio = Math.max(0, 1 - Math.max(0, elapsedTime - parTime) / parTime)
      const timeScore = Math.round(timeRatio * (maxScore * 0.4))

      // Accuracy: start at 100%, deducted by wrong diagnoses
      const accuracyScore = Math.max(0, Math.round(maxScore * 0.4) - penaltyRecord.wrongDiagnosis * 200)

      // Cost: deducted by unnecessary part orders
      const costScore = Math.max(0, Math.round(maxScore * 0.1) - penaltyRecord.unnecessaryPartOrder * 100)

      // Safety: deducted by LOTO skips (harsh penalty)
      const safetyScore = Math.max(0, Math.round(maxScore * 0.1) - penaltyRecord.skipLOTO * 300)

      const total = timeScore + accuracyScore + costScore + safetyScore
      const pct = total / maxScore

      const rank: PlayerScore['rank'] =
        pct >= 0.95 ? 'S'
        : pct >= 0.85 ? 'A'
        : pct >= 0.70 ? 'B'
        : pct >= 0.55 ? 'C'
        : pct >= 0.40 ? 'D'
        : 'F'

      set({
        score: {
          time: timeScore,
          efficiency: 0, // Extended in Phase 3 with tool-use tracking
          accuracy: accuracyScore,
          costPenalty: score.costPenalty,
          safetyPenalty: score.safetyPenalty,
          total,
          rank,
        },
      })
    },

    // --- LOTO ---
    lotoApplied: false,
    setLotoApplied: (applied) => set({ lotoApplied: applied }),
  }))
)
