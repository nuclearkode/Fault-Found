"""
build_stations.py — procedural module generator for the FAULT//FOUND MPS line.

Run inside Blender against blender_source/mps_stations.blend, which already holds
the shared 51-part chassis for every station (cloned from ST90 so all cabinets are
identical). This script adds the station-specific modules on top.

Design rules, all enforced here so they can't drift:

  * Geometry is authored in ABSOLUTE coordinates with an IDENTITY object transform.
    Station roots carry the layout offset; children stay at identity. The one
    exception is a rotation pivot, which is created with `pivot()`.
  * Every sensor and actuator carries custom properties that survive glTF export as
    node userData: station / tag / anim_type / anim_axis / anim_range / anim_space
    / cycle_frame_in / cycle_frame_out.
  * `anim_range` is ALWAYS [home, driven] expressed in THREE.JS space, never joint
    travel limits. Blender Z -> three Y, Blender Y -> three Z (sign flips).
  * Every transport surface tops out at TRANSFER_Z so a workpiece can cross between
    stations without a step.
  * Re-runnable: modules are deleted by name prefix before rebuild, so no .001
    duplicates accumulate.

Master timeline: 120 frames @ 24 fps, matching the existing ST90/ST100 cycle.
"""

import bpy
import math
from mathutils import Vector

# ── Contract constants ──────────────────────────────────────────────────────
PLATE_Z = 0.697          # top of the profile plate
TRANSFER_Z = 0.750       # canonical workpiece-carrying height, all stations
PUCK_R = 0.024           # 40 mm Festo workpiece, scaled to this model's world
PUCK_H = 0.030
CYCLE_END = 120

# Handoff contract. Stations butt together on the cabinet pitch, so one station's
# output coordinate IS the next station's input coordinate:
#
#     output(N) = (+EDGE, 0, TRANSFER_Z)  ==  input(N+1) = (-EDGE, 0, TRANSFER_Z)
#
# Any transport surface that stops short of +/-EDGE opens a void the workpiece
# falls through. At a 0.717 pitch a belt spanning only +/-0.30 leaves 117 mm of
# nothing between stations — more than twice the 48 mm puck.
PITCH = 0.717
EDGE = PITCH / 2         # 0.3585

# Station roots and their X offset inside this .blend (QA layout only; the export
# zeroes the root so each station lands at its own origin).
STATION_X = {"ST10": -8.0, "ST20": -7.0, "ST30": -6.0, "ST40": -5.0,
             "ST50": -4.0, "ST60": -3.0, "ST70": -2.0, "ST80": -1.0}


# ── Primitives ──────────────────────────────────────────────────────────────
def mat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        raise KeyError(f"material '{name}' missing — palette should already exist")
    return m


def _finish(obj, material, root):
    obj.data.materials.append(mat(material))
    # primitive_*_add links to whatever collection is active, so unlink from all
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    bpy.data.collections[f"{root.name}_Collection"].objects.link(obj)
    obj.parent = root
    obj.matrix_parent_inverse.identity()
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    return obj


def box(name, center, size, material, root):
    """Axis-aligned box, vertices authored at absolute `center`."""
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    for v in o.data.vertices:
        v.co.x = v.co.x * size[0] + center[0]
        v.co.y = v.co.y * size[1] + center[1]
        v.co.z = v.co.z * size[2] + center[2]
    return _finish(o, material, root)


def cyl(name, center, radius, depth, material, root, axis="Z", verts=16):
    """Cylinder authored at absolute `center`, long axis X/Y/Z."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    for v in o.data.vertices:
        c = v.co.copy()
        if axis == "X":
            v.co = Vector((c.z, c.x, c.y))
        elif axis == "Y":
            v.co = Vector((c.x, c.z, c.y))
        v.co += Vector(center)
    return _finish(o, material, root)


def pivot(name, center, root):
    """Empty used as a rotation pivot. Children get a compensating parent inverse
    so their absolute geometry still lands correctly."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'SPHERE'
    e.empty_display_size = 0.02
    bpy.data.collections[f"{root.name}_Collection"].objects.link(e)
    e.parent = root
    e.matrix_parent_inverse.identity()
    e.location = Vector(center)
    return e


def reparent_to_pivot(obj, piv):
    """Move `obj` under a pivot without shifting its geometry."""
    obj.parent = piv
    obj.matrix_parent_inverse = piv.matrix_basis.inverted()


def tag(obj, station, plc_tag, **extra):
    obj["station"] = station
    obj["tag"] = plc_tag
    for k, v in extra.items():
        obj[k] = v
    return obj


def actuator(obj, station, plc_tag, anim_type, axis, home, driven, f_in, f_out):
    """Tag a driven actuator. `home`/`driven` are already in Three.js space:
    metres for translate, degrees for rotate."""
    return tag(obj, station, plc_tag,
               anim_type=anim_type, anim_axis=axis,
               anim_range=[float(home), float(driven)],
               anim_space="three",
               cycle_frame_in=int(f_in), cycle_frame_out=int(f_out))


def sensor(obj, station, plc_tag, sensor_type):
    return tag(obj, station, plc_tag, sensor_type=sensor_type)


# ── Keyframing ──────────────────────────────────────────────────────────────
def key_linear(obj, data_path, index, frames_values):
    """Keyframe one channel with LINEAR interpolation — pneumatics don't ease."""
    for f, v in frames_values:
        if data_path == "location":
            obj.location[index] = v
        else:
            obj.rotation_euler[index] = v
        obj.keyframe_insert(data_path=data_path, index=index, frame=f)
    ad = obj.animation_data
    act = ad.action
    curves = []
    if hasattr(act, "fcurves"):
        curves = list(act.fcurves)
    else:                                     # Blender 4.4+ slotted actions
        for layer in act.layers:
            for strip in layer.strips:
                cb = strip.channelbag(ad.action_slot) if ad.action_slot else None
                if cb:
                    curves.extend(cb.fcurves)
    for fc in curves:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'


def stroke(obj, axis_index, travel, f_in, f_out, dwell=4):
    """Extend to `travel` then return home, as a pneumatic cylinder does."""
    mid_out = f_in + max(2, (f_out - f_in) // 3)
    mid_back = f_out - max(2, (f_out - f_in) // 4)
    key_linear(obj, "location", axis_index, [
        (1, 0.0), (f_in, 0.0), (mid_out, travel),
        (mid_back, travel), (f_out, 0.0), (CYCLE_END, 0.0),
    ])


def swing(obj, axis_index, degrees, f_in, f_out):
    r = math.radians(degrees)
    mid_out = f_in + max(2, (f_out - f_in) // 3)
    mid_back = f_out - max(2, (f_out - f_in) // 4)
    key_linear(obj, "rotation_euler", axis_index, [
        (1, 0.0), (f_in, 0.0), (mid_out, r),
        (mid_back, r), (f_out, 0.0), (CYCLE_END, 0.0),
    ])


# ── Reusable sub-assemblies ─────────────────────────────────────────────────
def build_belt(prefix, root, x0=None, x1=None, y=0.0, width=0.10, station=None, tag_id=None):
    """Conveyor whose rubber surface tops out exactly at TRANSFER_Z.

    Defaults to spanning the FULL station pitch so output(N) meets input(N+1).
    Every dimension below is derived from TRANSFER_Z / PLATE_Z rather than picked,
    because the earlier hand-picked version produced four separate defects: rollers
    standing proud of the belt, feet floating clear of the frame, a motor sitting in
    the workpiece corridor, and a surface stopping short of the station edge.
    """
    if x0 is None:
        x0 = -EDGE
    if x1 is None:
        x1 = EDGE

    SURF_T = 0.006
    belt_cz = TRANSFER_Z - SURF_T / 2          # rubber top lands exactly on TRANSFER_Z
    frame_top = TRANSFER_Z - SURF_T            # frame sits under the rubber
    FRAME_H = 0.030
    frame_cz = frame_top - FRAME_H / 2
    frame_bot = frame_top - FRAME_H
    ROLL_R = 0.014

    box(f"{prefix}_Belt_Rubber", ((x0 + x1) / 2, y, belt_cz),
        (x1 - x0, width, SURF_T), "belt", root)
    box(f"{prefix}_Belt_Frame", ((x0 + x1) / 2, y, frame_cz),
        (x1 - x0, width + 0.014, FRAME_H), "brushed_aluminum", root)

    # tangent to the belt: roller crown == TRANSFER_Z, not above it
    for i, xx in enumerate((x0 + ROLL_R, x1 - ROLL_R)):
        cyl(f"{prefix}_Belt_Roller_{i}", (xx, y, TRANSFER_Z - ROLL_R), ROLL_R, width,
            "stainless_steel", root, axis="Y")

    # feet inset from the belt ends so they sit UNDER the frame, and grounded on the plate
    inset = min(0.045, (x1 - x0) / 4)
    foot_h = frame_bot - PLATE_Z
    for i, (fx, fy) in enumerate(((x0 + inset, -1), (x0 + inset, 1),
                                  (x1 - inset, -1), (x1 - inset, 1))):
        box(f"{prefix}_Belt_Foot_{i}", (fx, y + fy * (width / 2), PLATE_Z + foot_h / 2),
            (0.014, 0.010, foot_h), "brushed_aluminum", root)

    # drive hangs outboard of the belt and below the transfer plane, clear of the
    # workpiece corridor, and inside the station envelope
    m = box(f"{prefix}_Belt_Motor", (x1 - 0.06, y + width / 2 + 0.042, frame_cz),
            (0.05, 0.05, 0.05), "dark_steel", root)
    if station and tag_id:
        tag(m, station, tag_id, actuator_type="motor_dc")
    return m


def build_slide(prefix, name, root, x, y, length=0.13, drop=0.030, angle_w=0.09):
    """Gravity slide/chute — a ramp falling away in +Y from the belt."""
    o = box(f"{prefix}_{name}", (x, y, TRANSFER_Z - drop / 2 - 0.004),
            (angle_w, length, 0.006), "brushed_aluminum", root)
    for v in o.data.vertices:
        # tilt: far edge (+Y) sits lower, so parts run down and away
        t = (v.co.y - (y - length / 2)) / length
        v.co.z -= t * drop
    o.data.update()
    for s in (-1, 1):
        box(f"{prefix}_{name}_Wall_{'L' if s < 0 else 'R'}",
            (x + s * angle_w / 2, y, TRANSFER_Z - drop / 2 + 0.004),
            (0.005, length, 0.022), "brushed_aluminum", root)
    return o


def build_stopper(prefix, root, x, y, tag_id, station, f_in, f_out):
    """Pneumatic stopper (Festo 'Sperre') that holds a part at a detect point."""
    box(f"{prefix}_Stopper_Body", (x, y - 0.055, TRANSFER_Z + 0.010),
        (0.030, 0.030, 0.040), "festo_blue", root)
    rod = box(f"{prefix}_Stopper", (x, y - 0.030, TRANSFER_Z + 0.008),
              (0.010, 0.030, 0.010), "stainless_steel", root)
    # retracts in -Y to release the part; three-space Y maps from Blender -Z... but
    # this is a horizontal move: Blender +Y -> three -Z
    actuator(rod, station, tag_id, "translate", "Z", 0.0, 0.022, f_in, f_out)
    stroke(rod, 1, -0.022, f_in, f_out)
    return rod


def build_sensor_arch(prefix, root, x, station, tags):
    """Festo 'Modul Erkennen' — inductive + reflex + through-beam fork."""
    for s, tg, ty, dy in ((-1, tags[0], "inductive", -0.062),
                          (1, tags[1], "optical", 0.062)):
        box(f"{prefix}_Detect_Post_{'A' if s < 0 else 'B'}",
            (x, dy, TRANSFER_Z + 0.045), (0.014, 0.014, 0.090),
            "brushed_aluminum", root)
    box(f"{prefix}_Detect_Bridge", (x, 0.0, TRANSFER_Z + 0.092),
        (0.014, 0.138, 0.014), "brushed_aluminum", root)
    heads = []
    for i, (tg, ty, dy) in enumerate(((tags[0], "inductive", -0.030),
                                      (tags[1], "optical", 0.0),
                                      (tags[2], "optical", 0.030))):
        h = box(f"{prefix}_Detect_{i}", (x, dy, TRANSFER_Z + 0.062),
                (0.016, 0.016, 0.030), "sensor_housing", root)
        sensor(h, station, tg, ty)
        heads.append(h)
    return heads
