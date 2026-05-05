/**
 * Station I/O Registry — typed sensor/actuator definitions for each station.
 *
 * Each station's physical sensors and actuators are registered here with:
 *   - id: unique identifier (matches mesh name in the 3D component)
 *   - type: sensor category (used for interaction prompts + fault injection)
 *   - tag: PLC I/O address (wired in Phase 3 when ladder logic is added)
 *   - description: human-readable purpose
 *
 * This registry is the bridge between the 3D scene and the PLC scan cycle.
 * When a player clicks a sensor mesh, the interaction system looks up its
 * registry entry to determine what information to show.
 */

export type SensorType =
  | 'optical'        // light barrier / retroreflective
  | 'inductive'      // metal proximity
  | 'capacitive'     // any material proximity
  | 'colour'         // RGB colour detection
  | 'analogue'       // height / pressure / analogue value
  | 'encoder'        // rotary or linear encoder
  | 'limit_switch'   // mechanical end stop
  | 'pressure'       // pneumatic pressure sensor

export type ActuatorType =
  | 'cylinder_sa'    // single-acting pneumatic cylinder
  | 'cylinder_da'    // double-acting pneumatic cylinder
  | 'vacuum'         // vacuum suction cup
  | 'motor_dc'       // DC motor (belt drive)
  | 'motor_stepper'  // stepper motor
  | 'motor_servo'    // servo motor (robot joints)
  | 'solenoid'       // solenoid valve
  | 'led'            // indicator LED

export interface SensorDef {
  id: string
  type: SensorType
  tag: string          // PLC input address (e.g., "I0.0")
  description: string
  meshName: string     // must match the `name` prop on the 3D mesh
}

export interface ActuatorDef {
  id: string
  type: ActuatorType
  tag: string          // PLC output address (e.g., "Q0.0")
  description: string
  meshName: string
}

export interface StationIO {
  sensors: SensorDef[]
  actuators: ActuatorDef[]
}

/**
 * Full I/O map for all 10 MPS stations.
 *
 * Tag addresses follow Festo convention:
 *   Inputs:  I<station_byte>.<bit>   e.g., I10.0
 *   Outputs: Q<station_byte>.<bit>   e.g., Q10.0
 *
 * Station bytes: ST10=10, ST20=20, ST30=30, etc.
 */
export const STATION_IO: Record<string, StationIO> = {
  ST10: {  // Distributing
    sensors: [
      { id: 'ST10_S1', type: 'optical',    tag: 'I10.0', description: 'Magazine empty sensor',     meshName: 'ST10_magazine_sensor' },
      { id: 'ST10_S2', type: 'inductive',  tag: 'I10.1', description: 'Cylinder retracted',        meshName: 'ST10_cyl_retracted' },
      { id: 'ST10_S3', type: 'inductive',  tag: 'I10.2', description: 'Cylinder extended',          meshName: 'ST10_cyl_extended' },
      { id: 'ST10_S4', type: 'optical',    tag: 'I10.3', description: 'Arm at pick position',       meshName: 'ST10_arm_pick' },
      { id: 'ST10_S5', type: 'optical',    tag: 'I10.4', description: 'Arm at place position',      meshName: 'ST10_arm_place' },
      { id: 'ST10_S6', type: 'pressure',   tag: 'I10.5', description: 'Vacuum switch (part held)',   meshName: 'ST10_vacuum_sw' },
    ],
    actuators: [
      { id: 'ST10_A1', type: 'cylinder_da', tag: 'Q10.0', description: 'Push cylinder extend',     meshName: 'ST10_cylinder' },
      { id: 'ST10_A2', type: 'vacuum',      tag: 'Q10.1', description: 'Vacuum generator on',       meshName: 'ST10_suction' },
      { id: 'ST10_A3', type: 'motor_dc',    tag: 'Q10.2', description: 'Rotary arm motor',          meshName: 'ST10_arm' },
      { id: 'ST10_A4', type: 'motor_dc',    tag: 'Q10.3', description: 'Belt motor forward',        meshName: 'ST10_belt' },
    ],
  },

  ST20: {  // Measuring
    sensors: [
      { id: 'ST20_S1', type: 'optical',    tag: 'I20.0', description: 'Workpiece present',          meshName: 'ST20_wp_sensor' },
      { id: 'ST20_S2', type: 'analogue',   tag: 'IW20',  description: 'Height measurement value',    meshName: 'ST20_probe' },
      { id: 'ST20_S3', type: 'colour',     tag: 'IW22',  description: 'Colour sensor RGB value',     meshName: 'ST20_colour_sensor' },
      { id: 'ST20_S4', type: 'limit_switch', tag: 'I20.1', description: 'Slide at start position',   meshName: 'ST20_slide_home' },
      { id: 'ST20_S5', type: 'limit_switch', tag: 'I20.2', description: 'Slide at measure position', meshName: 'ST20_slide_end' },
    ],
    actuators: [
      { id: 'ST20_A1', type: 'cylinder_da', tag: 'Q20.0', description: 'Slide cylinder extend',    meshName: 'ST20_slide' },
      { id: 'ST20_A2', type: 'cylinder_sa', tag: 'Q20.1', description: 'Probe descend',             meshName: 'ST20_probe' },
      { id: 'ST20_A3', type: 'led',         tag: 'Q20.2', description: 'Pass indicator LED',        meshName: 'ST20_pass_led' },
      { id: 'ST20_A4', type: 'led',         tag: 'Q20.3', description: 'Fail indicator LED',        meshName: 'ST20_fail_led' },
    ],
  },

  ST30: {  // Pick & Place
    sensors: [
      { id: 'ST30_S1', type: 'limit_switch', tag: 'I30.0', description: 'X-axis at pick position',  meshName: 'ST30_x_pick' },
      { id: 'ST30_S2', type: 'limit_switch', tag: 'I30.1', description: 'X-axis at place position', meshName: 'ST30_x_place' },
      { id: 'ST30_S3', type: 'limit_switch', tag: 'I30.2', description: 'Z-axis at top',            meshName: 'ST30_z_top' },
      { id: 'ST30_S4', type: 'limit_switch', tag: 'I30.3', description: 'Z-axis at bottom',         meshName: 'ST30_z_bottom' },
      { id: 'ST30_S5', type: 'pressure',     tag: 'I30.4', description: 'Vacuum switch',             meshName: 'ST30_vacuum_sw' },
      { id: 'ST30_S6', type: 'optical',      tag: 'I30.5', description: 'Belt workpiece present',    meshName: 'ST30_belt_sensor' },
    ],
    actuators: [
      { id: 'ST30_A1', type: 'cylinder_da', tag: 'Q30.0', description: 'X-axis cylinder',           meshName: 'ST30_carriage' },
      { id: 'ST30_A2', type: 'cylinder_da', tag: 'Q30.1', description: 'Z-axis cylinder',           meshName: 'ST30_gripper' },
      { id: 'ST30_A3', type: 'vacuum',      tag: 'Q30.2', description: 'Vacuum generator',           meshName: 'ST30_vacuum' },
      { id: 'ST30_A4', type: 'motor_dc',    tag: 'Q30.3', description: 'Belt motor',                 meshName: 'ST30_belt' },
    ],
  },

  ST40: {  // Sorting
    sensors: [
      { id: 'ST40_S1', type: 'optical',     tag: 'I40.0', description: 'Workpiece at sensor bridge', meshName: 'ST40_bridge_sensor' },
      { id: 'ST40_S2', type: 'colour',      tag: 'IW40',  description: 'Colour sensor value',        meshName: 'ST40_colour' },
      { id: 'ST40_S3', type: 'inductive',   tag: 'I40.1', description: 'Metal detection',            meshName: 'ST40_metal' },
      { id: 'ST40_S4', type: 'optical',     tag: 'I40.2', description: 'Chute 1 full',               meshName: 'ST40_chute1_full' },
      { id: 'ST40_S5', type: 'optical',     tag: 'I40.3', description: 'Chute 2 full',               meshName: 'ST40_chute2_full' },
      { id: 'ST40_S6', type: 'optical',     tag: 'I40.4', description: 'Chute 3 full',               meshName: 'ST40_chute3_full' },
    ],
    actuators: [
      { id: 'ST40_A1', type: 'motor_dc',    tag: 'Q40.0', description: 'Belt motor forward',        meshName: 'ST40_belt' },
      { id: 'ST40_A2', type: 'cylinder_sa', tag: 'Q40.1', description: 'Gate 1 deflector',          meshName: 'ST40_gate_0' },
      { id: 'ST40_A3', type: 'cylinder_sa', tag: 'Q40.2', description: 'Gate 2 deflector',          meshName: 'ST40_gate_1' },
      { id: 'ST40_A4', type: 'cylinder_sa', tag: 'Q40.3', description: 'Gate 3 deflector',          meshName: 'ST40_gate_2' },
    ],
  },

  ST50: {  // Separating
    sensors: [
      { id: 'ST50_S1', type: 'optical',     tag: 'I50.0', description: 'Workpiece at sensor bridge', meshName: 'ST50_bridge_sensor' },
      { id: 'ST50_S2', type: 'inductive',   tag: 'I50.1', description: 'Stopper retracted',          meshName: 'ST50_stopper_ret' },
      { id: 'ST50_S3', type: 'optical',     tag: 'I50.2', description: 'Workpiece at diverter',      meshName: 'ST50_divert_sensor' },
    ],
    actuators: [
      { id: 'ST50_A1', type: 'motor_dc',    tag: 'Q50.0', description: 'Belt motor',                 meshName: 'ST50_belt' },
      { id: 'ST50_A2', type: 'cylinder_sa', tag: 'Q50.1', description: 'Stopper cylinder',           meshName: 'ST50_stopper' },
      { id: 'ST50_A3', type: 'cylinder_sa', tag: 'Q50.2', description: 'Diverter flap',              meshName: 'ST50_diverter' },
    ],
  },

  ST60: {  // Joining
    sensors: [
      { id: 'ST60_S1', type: 'inductive',   tag: 'I60.0', description: 'Table at position 1',       meshName: 'ST60_pos1' },
      { id: 'ST60_S2', type: 'inductive',   tag: 'I60.1', description: 'Table at position 2',       meshName: 'ST60_pos2' },
      { id: 'ST60_S3', type: 'optical',     tag: 'I60.2', description: 'Workpiece oriented correctly', meshName: 'ST60_orient' },
      { id: 'ST60_S4', type: 'limit_switch', tag: 'I60.3', description: 'Press at top',              meshName: 'ST60_press_top' },
      { id: 'ST60_S5', type: 'limit_switch', tag: 'I60.4', description: 'Press at bottom',           meshName: 'ST60_press_bot' },
    ],
    actuators: [
      { id: 'ST60_A1', type: 'motor_dc',    tag: 'Q60.0', description: 'Indexing table motor',      meshName: 'ST60_table' },
      { id: 'ST60_A2', type: 'cylinder_da', tag: 'Q60.1', description: 'Press cylinder',             meshName: 'ST60_press' },
      { id: 'ST60_A3', type: 'cylinder_sa', tag: 'Q60.2', description: 'Transfer slide',             meshName: 'ST60_slide' },
    ],
  },

  ST70: {  // Packaging
    sensors: [
      { id: 'ST70_S1', type: 'optical',     tag: 'I70.0', description: 'Tray present',               meshName: 'ST70_tray_sensor' },
      { id: 'ST70_S2', type: 'encoder',     tag: 'IW70',  description: 'Stepper motor position',     meshName: 'ST70_stepper_enc' },
      { id: 'ST70_S3', type: 'limit_switch', tag: 'I70.1', description: 'Lid closed',                meshName: 'ST70_lid_closed' },
      { id: 'ST70_S4', type: 'optical',     tag: 'I70.2', description: 'Label applied',               meshName: 'ST70_label_done' },
    ],
    actuators: [
      { id: 'ST70_A1', type: 'motor_dc',      tag: 'Q70.0', description: 'Tray conveyor motor',     meshName: 'ST70_conveyor' },
      { id: 'ST70_A2', type: 'motor_stepper',  tag: 'Q70.1', description: 'Lid stepper motor',      meshName: 'ST70_lid' },
      { id: 'ST70_A3', type: 'cylinder_sa',    tag: 'Q70.2', description: 'Label applicator arm',   meshName: 'ST70_label_arm' },
    ],
  },

  ST80: {  // Storage
    sensors: [
      { id: 'ST80_S1', type: 'encoder',     tag: 'IW80',  description: 'X-axis position',            meshName: 'ST80_x_enc' },
      { id: 'ST80_S2', type: 'encoder',     tag: 'IW82',  description: 'Z-axis position',            meshName: 'ST80_z_enc' },
      { id: 'ST80_S3', type: 'optical',     tag: 'I80.0', description: 'Extractor at cell',          meshName: 'ST80_at_cell' },
      { id: 'ST80_S4', type: 'optical',     tag: 'I80.1', description: 'Workpiece on extractor',     meshName: 'ST80_wp_present' },
    ],
    actuators: [
      { id: 'ST80_A1', type: 'motor_servo',  tag: 'Q80.0', description: 'X-axis servo',              meshName: 'ST80_gantry_x' },
      { id: 'ST80_A2', type: 'motor_servo',  tag: 'Q80.1', description: 'Z-axis servo',              meshName: 'ST80_gantry_z' },
      { id: 'ST80_A3', type: 'cylinder_da',  tag: 'Q80.2', description: 'Extractor arm',             meshName: 'ST80_extractor' },
    ],
  },

  ST90: {  // Distributing Pro
    sensors: [
      { id: 'ST90_S1', type: 'optical',     tag: 'I90.0', description: 'Magazine 1 empty',           meshName: 'ST90_mag1_empty' },
      { id: 'ST90_S2', type: 'optical',     tag: 'I90.1', description: 'Magazine 2 empty',           meshName: 'ST90_mag2_empty' },
      { id: 'ST90_S3', type: 'optical',     tag: 'I90.2', description: 'Magazine 3 empty',           meshName: 'ST90_mag3_empty' },
      { id: 'ST90_S4', type: 'inductive',   tag: 'I90.3', description: 'Belt workpiece detected',    meshName: 'ST90_belt_sensor' },
      { id: 'ST90_S5', type: 'colour',      tag: 'IW90',  description: 'Workpiece colour',           meshName: 'ST90_colour' },
    ],
    actuators: [
      { id: 'ST90_A1', type: 'cylinder_da', tag: 'Q90.0', description: 'Magazine 1 push cylinder',  meshName: 'ST90_push1' },
      { id: 'ST90_A2', type: 'cylinder_da', tag: 'Q90.1', description: 'Magazine 2 push cylinder',  meshName: 'ST90_push2' },
      { id: 'ST90_A3', type: 'cylinder_da', tag: 'Q90.2', description: 'Magazine 3 push cylinder',  meshName: 'ST90_push3' },
      { id: 'ST90_A4', type: 'motor_dc',    tag: 'Q90.3', description: 'Belt forward',               meshName: 'ST90_belt_fwd' },
      { id: 'ST90_A5', type: 'motor_dc',    tag: 'Q90.4', description: 'Belt reverse',               meshName: 'ST90_belt_rev' },
    ],
  },

  ST100: {  // Assembly Robot
    sensors: [
      { id: 'ST100_S1', type: 'encoder',     tag: 'IW100', description: 'Joint 1 angle',            meshName: 'ST100_j1_enc' },
      { id: 'ST100_S2', type: 'encoder',     tag: 'IW102', description: 'Joint 2 angle',            meshName: 'ST100_j2_enc' },
      { id: 'ST100_S3', type: 'encoder',     tag: 'IW104', description: 'Joint 3 angle',            meshName: 'ST100_j3_enc' },
      { id: 'ST100_S4', type: 'encoder',     tag: 'IW106', description: 'Joint 4 angle',            meshName: 'ST100_j4_enc' },
      { id: 'ST100_S5', type: 'optical',     tag: 'I100.0', description: 'Part in fixture',         meshName: 'ST100_fixture_sensor' },
      { id: 'ST100_S6', type: 'pressure',    tag: 'I100.1', description: 'Gripper closed',           meshName: 'ST100_grip_sensor' },
    ],
    actuators: [
      { id: 'ST100_A1', type: 'motor_servo', tag: 'Q100.0', description: 'Joint 1 servo',          meshName: 'ST100_joint1' },
      { id: 'ST100_A2', type: 'motor_servo', tag: 'Q100.1', description: 'Joint 2 servo',          meshName: 'ST100_joint2' },
      { id: 'ST100_A3', type: 'motor_servo', tag: 'Q100.2', description: 'Joint 3 servo',          meshName: 'ST100_joint3' },
      { id: 'ST100_A4', type: 'motor_servo', tag: 'Q100.3', description: 'Joint 4 servo',          meshName: 'ST100_joint4' },
      { id: 'ST100_A5', type: 'vacuum',      tag: 'Q100.4', description: 'Gripper vacuum',          meshName: 'ST100_gripper' },
      { id: 'ST100_A6', type: 'led',         tag: 'Q100.5', description: 'Safety light curtain',    meshName: 'ST100_safety_light' },
    ],
  },
}
