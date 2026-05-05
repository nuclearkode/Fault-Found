/**
 * PLC Scan Cycle Engine
 *
 * Evaluates ladder logic rungs top-to-bottom in a single scan cycle.
 * This module is PURE TypeScript — no React, no Three.js.
 *
 * The scan cycle mirrors a real PLC:
 * 1. Read inputs (from tag map)
 * 2. Apply active faults (modify tag values)
 * 3. Evaluate rungs (condition → output)
 * 4. Return updated tag map
 */

import type { IOTag, TagMap, Rung, Fault } from './types'

/**
 * Parse and evaluate a simple boolean expression against tags.
 * Supports: AND, OR, NOT, parentheses, tag IDs
 *
 * Examples:
 *   "I0.0"                → value of I0.0
 *   "I0.0 AND I0.1"       → both true
 *   "NOT I0.0"            → inverted
 *   "I0.0 AND NOT I0.1"   → first true and second false
 */
export function evaluateCondition(condition: string, tags: TagMap): boolean {
  // Tokenize
  const tokens = condition
    .replace(/\(/g, ' ( ')
    .replace(/\)/g, ' ) ')
    .trim()
    .split(/\s+/)

  let pos = 0

  function parseOr(): boolean {
    let result = parseAnd()
    while (pos < tokens.length && tokens[pos] === 'OR') {
      pos++
      result = parseAnd() || result // Short-circuit but evaluate both sides
    }
    return result
  }

  function parseAnd(): boolean {
    let result = parseNot()
    while (pos < tokens.length && tokens[pos] === 'AND') {
      pos++
      result = parseNot() && result
    }
    return result
  }

  function parseNot(): boolean {
    if (pos < tokens.length && tokens[pos] === 'NOT') {
      pos++
      return !parsePrimary()
    }
    return parsePrimary()
  }

  function parsePrimary(): boolean {
    if (pos < tokens.length && tokens[pos] === '(') {
      pos++ // skip '('
      const result = parseOr()
      pos++ // skip ')'
      return result
    }

    // It's a tag ID
    const tagId = tokens[pos]
    pos++
    const tag = tags.get(tagId)
    if (!tag) return false
    return !!tag.value
  }

  return parseOr()
}

/**
 * Apply active faults to the tag map (mutates tag values).
 */
export function applyFaults(tags: TagMap, faults: Fault[]): void {
  for (const fault of faults) {
    if (!fault.active) continue
    const tag = tags.get(fault.targetTag)
    if (!tag) continue

    switch (fault.type) {
      case 'wiring_nc_no_swap':
        // Invert boolean value
        if (tag.type === 'BOOL') {
          tag.value = !tag.value
        }
        break

      case 'wiring_open_circuit':
        // Force to false/0
        tag.value = tag.type === 'BOOL' ? false : 0
        break

      case 'wiring_short_circuit':
        // Force to true/high
        tag.value = tag.type === 'BOOL' ? true : 1
        break

      case 'sensor_drift':
        // Add random noise to analog values
        if (tag.type === 'FLOAT' || tag.type === 'INT') {
          const drift = (Math.random() - 0.5) * 10
          tag.value = (tag.value as number) + drift
        }
        break

      case 'sensor_fail_high':
        if (tag.type === 'FLOAT') tag.value = 9999.0
        else if (tag.type === 'INT') tag.value = 32767
        else tag.value = true
        break

      case 'sensor_fail_low':
        tag.value = tag.type === 'BOOL' ? false : 0
        break

      case 'mechanical_jam':
        // Output stuck OFF
        tag.value = tag.type === 'BOOL' ? false : 0
        break

      default:
        // config_param_wrong, config_address_swap, etc.
        // These are handled by scenario-specific logic
        break
    }
  }
}

/**
 * Run a single PLC scan cycle.
 *
 * @param tags    - Current I/O tag map
 * @param rungs   - Ladder logic rungs to evaluate
 * @param faults  - Active faults to apply
 * @returns Updated tag map (same reference, mutated)
 */
export function runScanCycle(
  tags: TagMap,
  rungs: Rung[],
  faults: Fault[]
): TagMap {
  // Step 1: Apply faults to input tags
  applyFaults(tags, faults)

  // Step 2: Evaluate rungs top-to-bottom
  for (const rung of rungs) {
    const result = evaluateCondition(rung.condition, tags)
    const outputTag = tags.get(rung.output)
    if (outputTag) {
      outputTag.value = result
    }
  }

  return tags
}

/**
 * Create a TagMap from an array of IOTag definitions.
 */
export function createTagMap(tags: IOTag[]): TagMap {
  const map: TagMap = new Map()
  for (const tag of tags) {
    map.set(tag.id, { ...tag })
  }
  return map
}
