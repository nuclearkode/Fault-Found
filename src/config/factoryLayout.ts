/**
 * Factory Layout Configuration — defines station positions and types.
 *
 * Stations are 1.5× scaled (effective cabinet size: ~1.05m × 1.05m).
 * Spacing: 1.3m centre-to-centre for a tight production line feel.
 * Rotation is in degrees around Y axis (0 = front faces +Z).
 */

export type StationType =
  | 'distributing'
  | 'measuring'
  | 'pickplace'
  | 'sorting'
  | 'separating'
  | 'joining'
  | 'packaging'
  | 'storage'
  | 'distributing_pro'
  | 'assembly_robot'

export interface StationPlacement {
  type: StationType
  position: [number, number, number]
  rotation: number  // Y-axis rotation in degrees
  id: string        // unique station ID (used for PLC tag mapping later)
  label: string     // display name
}

/**
 * Default production line layout — tight L-shaped line.
 *
 * Main line (8 stations): east-west at Z = -4, operator side faces south.
 * Standalone (2 stations): south area near player spawn.
 *
 * All stations face +Z so the player walks along the front of the line.
 * Spacing is tight (1.3m) to look like a real connected production line.
 */
export const DEFAULT_LAYOUT: StationPlacement[] = [
  // ── Main production line (east-west, tight spacing) ───────────────────────
  { type: 'distributing',     position: [-4.55, 0, -4], rotation: 0,   id: 'ST10', label: 'Distributing' },
  { type: 'measuring',        position: [-3.25, 0, -4], rotation: 0,   id: 'ST20', label: 'Measuring' },
  { type: 'pickplace',        position: [-1.95, 0, -4], rotation: 0,   id: 'ST30', label: 'Pick & Place' },
  { type: 'sorting',          position: [-0.65, 0, -4], rotation: 0,   id: 'ST40', label: 'Sorting' },
  { type: 'separating',       position: [0.65,  0, -4], rotation: 0,   id: 'ST50', label: 'Separating' },
  { type: 'joining',          position: [1.95,  0, -4], rotation: 0,   id: 'ST60', label: 'Joining' },
  { type: 'packaging',        position: [3.25,  0, -4], rotation: 0,   id: 'ST70', label: 'Packaging' },
  { type: 'storage',          position: [4.55,  0, -4], rotation: 0,   id: 'ST80', label: 'Storage' },

  // ── Experimental Stations (West wall, facing east into the room) ──────────
  { type: 'distributing_pro', position: [-13.5, 0, 3], rotation: 90, id: 'ST90', label: 'Distributing Pro (Exp)' },
  { type: 'assembly_robot',   position: [-13.5, 0, 6], rotation: 90, id: 'ST100', label: 'Assembly Robot (Exp)' },
]
