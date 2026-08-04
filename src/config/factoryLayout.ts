/**
 * Factory Layout Configuration — defines station positions and types.
 *
 * Stations are 1.5× scaled. Rotation is in degrees around Y axis (0 = front faces +Z).
 *
 * Station pitch is derived, not chosen. A real Festo MPS station is a 700 mm wide
 * profile plate and stations butt together with no gap, so a run of n stations is
 * n × 700 mm long. Our GLB cabinets measure 0.717 m in X, which at 1.5× scale is
 * 1.0755 m — that is the pitch. Using anything larger opens a physical gap the
 * workpiece cannot cross: at the previous 1.3 m pitch the cabinets stood 225 mm
 * apart and the 0.96 m belts left a 340 mm hole between belt end and belt start.
 *
 * Consequence of the tight pitch: ST30's gantry parks 152 mm (228 mm scaled) past
 * its own cabinet edge on the −X side. That overhang is correct MPS behaviour — the
 * handling gantry reaches over into its neighbour to collect the workpiece — and it
 * only lands on ST20's plate once the pitch is closed.
 */
const STATION_PITCH = 1.0755  // 0.717 m cabinet × 1.5 scale

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
/** Centre X of the nth station in the main line, so the run stays centred on X = 0. */
const lineX = (n: number) => +((n - 3.5) * STATION_PITCH).toFixed(4)

export const DEFAULT_LAYOUT: StationPlacement[] = [
  // ── Main production line (east-west, cabinets touching) ───────────────────
  //
  // Ordered to follow the real Festo MPS process logic, not the station numbers:
  //   feed → singulate → inspect → process → handle → process → sort → store
  //
  // Two constraints drive this. Sorting and Storage are *terminal* operations —
  // a part routed into a sorting slide or a storage slot has left the conveyor and
  // cannot continue downstream, so neither can sit mid-line. Separating singulates
  // a stream, which is only useful immediately after feeding.
  //
  // Station IDs stay bound to their hardware (ST40 is always Sorting) so PLC tags
  // in stationIO.ts and the scenario JSON keep working — only the X order changed.
  { type: 'distributing',     position: [lineX(0), 0, -4], rotation: 0, id: 'ST10', label: 'Distributing' },
  { type: 'separating',       position: [lineX(1), 0, -4], rotation: 0, id: 'ST50', label: 'Separating' },
  { type: 'measuring',        position: [lineX(2), 0, -4], rotation: 0, id: 'ST20', label: 'Measuring' },
  { type: 'joining',          position: [lineX(3), 0, -4], rotation: 0, id: 'ST60', label: 'Joining' },
  { type: 'pickplace',        position: [lineX(4), 0, -4], rotation: 0, id: 'ST30', label: 'Pick & Place' },
  { type: 'packaging',        position: [lineX(5), 0, -4], rotation: 0, id: 'ST70', label: 'Packaging' },
  { type: 'sorting',          position: [lineX(6), 0, -4], rotation: 0, id: 'ST40', label: 'Sorting' },
  { type: 'storage',          position: [lineX(7), 0, -4], rotation: 0, id: 'ST80', label: 'Storage' },

  // ── Experimental Stations ────────────────────────────────────────────────
  // Placed in the south zone (FactoryFloor's `floor_zone_south`, X −4..4 /
  // Z 1.5..4.5) flanking the walkway, facing the player spawn at [0, 2, 7].
  // They run the NominalCycle demo loop, so this is where you see fault-free
  // operation before walking north to the production line.
  // To return them to the west wall: position [-13.5, 0, 3] / [-13.5, 0, 6],
  // rotation 90.
  { type: 'distributing_pro', position: [-2, 0, 1.5], rotation: 0, id: 'ST90', label: 'Distributing Pro (Exp)' },
  { type: 'assembly_robot',   position: [2,  0, 1.5], rotation: 0, id: 'ST100', label: 'Assembly Robot (Exp)' },
]
