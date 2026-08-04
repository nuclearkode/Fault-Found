import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { GamePhase, IOTag, ToolType, PlayerScore, Rung, Fault } from '@/engine/types'

/** Equipment rigs that can occupy the warehouse floor. One at a time. */
export type RigId = 'none' | 'mps_line' | 'silo_cell'

/**
 * What the supervisor is doing.
 *
 * 'patrol'    pacing his office, the normal state
 * 'chasing'   the shift clock hit zero — he is coming for the player
 * 'jumpscare' he has caught up and is in the player's face
 * 'caught'    the scare has played out; the loss screen owns the frame now
 */
export type SupervisorState = 'patrol' | 'chasing' | 'jumpscare' | 'caught'

/** How a run ended. 'playing' while it is still live. */
export type RunOutcome = 'playing' | 'won' | 'lost'

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
  /**
   * The operator's account of what they saw, from the scenario JSON.
   *
   * Lifted into the store because the pre-shift screen renders it and the store
   * is the only thing that outlives the loader's async import.
   */
  briefing: string

  /**
   * Which equipment rig is currently spawned in the warehouse.
   *
   * The warehouse shell (floor, walls, lighting, office, ceiling services) is
   * permanent; the machinery is not. Only one rig exists at a time and it is
   * chosen by the scenario, so a silo job doesn't ship an MPS line the player
   * will never touch. 'none' leaves an empty bay.
   */
  activeRig: RigId
  setActiveRig: (rig: RigId) => void

  // --- PLC Tags ---
  tags: Record<string, IOTag>
  setTag: (id: string, value: boolean | number) => void
  setTags: (tags: Record<string, IOTag>) => void

  // --- Ladder Logic (set by scenario loader) ---
  rungs: Rung[]
  setRungs: (rungs: Rung[]) => void
  faults: Fault[]
  setFaults: (faults: Fault[]) => void
  /** Deactivate one fault — the player has repaired it. */
  clearFault: (id: string) => void
  /**
   * Break the machine.
   *
   * A scenario now loads with its faults DORMANT so the pre-shift sequence can
   * show the line running correctly first. This is the moment it goes wrong, on
   * camera, which is the whole point of that sequence — the player sees the
   * symptom happen instead of being told about it.
   */
  armFaults: () => void
  /**
   * Has this run's fault ever been armed?
   *
   * The win test is "no fault is active", which is also true of a scenario that
   * has been loaded but not yet broken. Without this, any path that reaches the
   * active phase before PreShift arms the fault wins the job on the first scan.
   */
  faultsArmed: boolean

  // --- Timer ---
  /** Seconds since the job started. Counts UP; feeds scoring. */
  elapsedTime: number
  /**
   * Seconds left before the supervisor comes looking. Counts DOWN, and it is
   * this — not `elapsedTime` — that the shift clock on the office displays.
   * Starts at the scenario's `timeLimit` when the fault is injected.
   */
  remainingTime: number
  timeLimit: number
  timerRunning: boolean
  /** Begin the countdown. Called at fault injection, i.e. when the job starts. */
  startTimer: (limit: number) => void
  tickTimer: (delta: number) => void
  resetTimer: () => void

  // --- Outcome ---
  outcome: RunOutcome
  /** Why the run ended — shown at the top of the debrief. */
  failReason: string | null
  /**
   * A rendered view of the thing the player should have fixed, as a data URL.
   * Captured off a second camera the moment the run is lost, so the debrief can
   * show the fault rather than describe it.
   */
  failShot: string | null
  setFailShot: (url: string | null) => void
  supervisor: SupervisorState
  setSupervisor: (state: SupervisorState) => void
  /**
   * How far gone he is, 0 (working) to ~1.5 (on top of you). Ramped by the
   * supervisor each frame and read by the lighting, which is why it lives here
   * rather than in his own component — the whole shed reacts to it.
   *
   * Written every frame, so nothing may subscribe to it through React.
   */
  anger: number
  setAnger: (v: number) => void
  /** End the run badly. Idempotent — the first caller's reason wins. */
  loseRun: (reason: string) => void
  /** End the run well. Stops the clock and calls off the chase. */
  winRun: () => void
  /**
   * Wipe every per-run value and bump `runNonce`, which is what the scenario
   * bootstrap watches to reload the job. Called on the way back to the menu.
   */
  resetRun: () => void
  /** Increments once per run. Anything that must re-arm keys off this. */
  runNonce: number
  /**
   * Which scenario the next run should load.
   *
   * The bootstrap used to hardcode one id, so every restart — including the one
   * behind the debrief's NEXT button — reloaded the job just finished. Setting
   * this and bumping `runNonce` is how you move on.
   */
  queuedScenario: string
  setQueuedScenario: (id: string) => void

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
    briefing: '',
    // Phase is set by the loader afterwards — this only records which job it is.
    loadScenario: (id) => set({ scenarioId: id }),

    // Empty floor until a scenario declares its rig. The MPS line is still
    // available via setActiveRig('mps_line') — its models and components are
    // untouched, just not spawned by any scenario yet.
    activeRig: 'none',
    setActiveRig: (rig) => set({ activeRig: rig }),

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
    clearFault: (id) =>
      set((state) => ({
        faults: state.faults.map((f) => (f.id === id ? { ...f, active: false } : f)),
      })),
    faultsArmed: false,
    armFaults: () =>
      set((state) => ({
        faults: state.faults.map((f) => ({ ...f, active: true })),
        faultsArmed: true,
      })),

    // --- Timer ---
    elapsedTime: 0,
    remainingTime: 0,
    timeLimit: 0,
    timerRunning: false,
    startTimer: (limit) =>
      set({ timeLimit: limit, remainingTime: limit, elapsedTime: 0, timerRunning: true }),
    tickTimer: (delta) => {
      const s = get()
      // Nothing accrues before the shift starts. The scan cycle runs during the
      // pre-shift sequence so the line can be seen working, and counting that
      // against the player's time would charge them for watching the briefing.
      if (!s.timerRunning) return
      const elapsedTime = s.elapsedTime + delta

      const remainingTime = Math.max(0, s.remainingTime - delta)
      set({ elapsedTime, remainingTime })

      // Hitting zero doesn't end the run — it starts the chase. The player can
      // still fix the fault while the supervisor is crossing the floor, which is
      // the whole point of giving him a walk rather than a fade-to-black.
      if (remainingTime === 0 && s.supervisor === 'patrol' && s.outcome === 'playing') {
        set({
          timerRunning: false,
          supervisor: 'chasing',
          failReason: 'You ran out of time. The line never restarted.',
        })
      }
    },
    resetTimer: () => set({ elapsedTime: 0, remainingTime: 0, timerRunning: false }),

    // --- Outcome ---
    outcome: 'playing',
    failReason: null,
    failShot: null,
    setFailShot: (url) => set({ failShot: url }),
    supervisor: 'patrol',
    setSupervisor: (state) => set({ supervisor: state }),
    anger: 0,
    setAnger: (v) => { if (v !== get().anger) set({ anger: v }) },
    loseRun: (reason) => {
      if (get().outcome !== 'playing') return   // first reason wins
      set({
        outcome: 'lost',
        phase: 'debrief',
        timerRunning: false,
        supervisor: 'caught',
        failReason: get().failReason ?? reason,
      })
    },
    winRun: () => {
      const s = get()
      if (s.outcome !== 'playing') return
      // Guarded here, not just at the call site. A job can only be won during a
      // shift you are actually working: the pre-shift sequence deliberately runs
      // with the faults dormant, and "no active faults" there is the machine
      // being healthy, not the player having fixed it. Without this the banner
      // fired on the title screen and over the briefing animation.
      if (s.phase !== 'active') return
      // Nor before the machine was ever broken — see `faultsArmed`.
      if (!s.faultsArmed) return
      // Nor with the cell still locked out. The banner claims the line is
      // running; it cannot be, with the isolator open and a padlock on it.
      if (s.lotoApplied) return
      // Calling off a chase in progress is deliberate: repairing the fault with
      // the supervisor halfway across the floor should save you.
      set({ outcome: 'won', timerRunning: false, supervisor: 'patrol', failReason: null })
    },
    runNonce: 0,
    // Overwritten by the dev bootstrap on first mount; only meaningful after that.
    queuedScenario: 'S02',
    setQueuedScenario: (id) => set({ queuedScenario: id }),
    resetRun: () =>
      set((state) => ({
        outcome: 'playing',
        failReason: null,
        failShot: null,
        supervisor: 'patrol',
        anger: 0,
        faultsArmed: false,
        elapsedTime: 0,
        remainingTime: 0,
        timeLimit: 0,
        timerRunning: false,
        lotoApplied: false,
        score: { ...initialScore },
        penaltyRecord: { ...initialPenalties },
        phase: 'menu',
        runNonce: state.runNonce + 1,
      })),

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
