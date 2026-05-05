/**
 * PLC Engine Type Definitions
 *
 * Core types for the scan cycle engine. These types are used
 * by both the engine and the store — never import Three.js here.
 */

// --- I/O Tag System ---

export type TagType = 'BOOL' | 'INT' | 'FLOAT'

export interface IOTag {
  id: string           // PLC address: I0.0, Q0.0, M0.0
  label: string        // Human name: START_BTN, M1_RUN, TEMP_SENSOR
  type: TagType
  value: boolean | number
  description?: string
}

export type TagMap = Map<string, IOTag>

// --- Ladder Logic ---

export interface Rung {
  id: number
  description?: string
  /** Boolean expression referencing tag IDs, e.g. "I0.0 AND NOT I0.1" */
  condition: string
  /** Tag ID to set when condition evaluates true */
  output: string
}

// --- Fault System ---

export type FaultType =
  | 'wiring_nc_no_swap'
  | 'wiring_open_circuit'
  | 'wiring_short_circuit'
  | 'sensor_drift'
  | 'sensor_fail_high'
  | 'sensor_fail_low'
  | 'config_param_wrong'
  | 'config_address_swap'
  | 'mechanical_jam'
  | 'power_phase_loss'
  | 'network_timeout'
  | 'emi_interference'

export interface Fault {
  id: string
  type: FaultType
  targetTag: string
  effect: string
  clues: string[]
  solution: string
  active: boolean
}

// --- Scenario ---

export interface ScenarioConfig {
  id: string             // S01, S02, etc.
  title: string
  difficulty: number     // 1–5
  tier: number           // Derek urgency: 1–3
  environment: string
  briefing: string
  nominalVideo?: string
  timeLimit: number      // seconds
  tags: IOTag[]
  rungs: Rung[]
  faults: Fault[]
  redHerrings?: RedHerring[]
  derekScript?: DerekScript
  scoring: ScoringConfig
}

export interface RedHerring {
  description: string
  location: string
  whyMisleading: string
}

export interface DerekScript {
  initialCall: string
  checkIn5min?: string
  impatient10min?: string
  angry15min?: string
  resolution: string
}

export interface ScoringConfig {
  parTime: number        // seconds for A rank
  maxScore: number
  penalties: {
    wrongDiagnosis: number
    unnecessaryPartOrder: number
    skipLOTO: number
    derekEscalation: number
  }
}

// --- Game State ---

export type GamePhase = 'menu' | 'briefing' | 'nominal' | 'active' | 'paused' | 'debrief'

export type ToolType = 'multimeter' | 'forceTable' | 'laptop' | 'phone' | 'flashlight'

export interface PlayerScore {
  time: number
  efficiency: number
  accuracy: number
  costPenalty: number
  safetyPenalty: number
  total: number
  rank: 'S' | 'A' | 'B' | 'C' | 'D' | 'F'
}
