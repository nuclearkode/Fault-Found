"""
DRIVE_TRAIN — a real floor-standing gearmotor, V-belt drive and guard on the
silo conveyor's head (drive) end.

Everything hangs off one EMPTY named DRIVE_TRAIN so the whole feature can be
reverted with a single "Delete Hierarchy". Nothing existing is moved, renamed,
merged or deleted.

LAYOUT REASONING (all numbers measured out of the scene, not invented):

  floor                z = 0.000   (Conv_Leg_* bottoms)
  conveyor frame       z = 0.710 .. 0.810,  y = -0.320 .. 0.320
  belt carrying face   z = 0.900
  drive roller         centre (2.910, 0, 0.810), dia 164, axis along Y
  head-end legs        x = 2.620 .. 2.680

  The pulleys have to share a plane with the drive roller's axis, so that plane
  is XZ at a fixed y, just outboard of the frame face (-0.320). y = -0.470.

  The gearmotor's output shaft therefore points -Y (outboard) and the motor body
  sits INBOARD of the belt, tucked against the frame's underside. That ordering
  matters: the player stands on the -Y side (FactoryFloor puts the operator face
  there), so belt-in-front / motor-behind is the only arrangement where the belt
  is the thing you actually see. Putting the motor outboard would hide the belt
  behind its own gearbox, and the guard would have to swallow the motor too.

  The +Y side is not available: the pre-existing Conv_Motor and Conv_Gearbox
  boxes float exactly where a driven pulley would have to go (they straddle
  x=2.91, z=0.81 at y 0.28..0.70), and this pass is not allowed to move them.
"""

import bpy, bmesh, math, json
from mathutils import Vector

TAU = math.tau

# ─────────────────────────────────────────────────────────────── measured scene
FLOOR_Z      = 0.000
ROLLER_X     = 2.910
ROLLER_Z     = 0.810     # drive-roller axis height
FRAME_FACE_Y = -0.320    # outboard face of Conv_Frame

BELT_Y       = -0.470    # the plane every pulley and the belt live in
GUARD_Y      = -0.556    # guard leaf, outboard of everything

MOT_X        = 2.370     # motor output-shaft / drive-pulley centre
MOT_Z        = 0.180     # motor output-shaft height above the floor

R_DRIVE      = 0.055     # drive (motor) pulley outside radius   -> 110 dia
R_DRIVEN     = 0.090     # driven (roller) pulley outside radius  -> 180 dia
PUL_W        = 0.040     # pulley face width
BELT_SAG     = 0.032     # how far the slack span bows off the straight line

# ───────────────────────────────────────────────────────────────── mesh toolkit

class Mesh:
    """Accumulates absolute-coordinate geometry, then bakes one object."""
    def __init__(self):
        self.v = []
        self.f = []

    def add(self, verts, faces):
        b = len(self.v)
        self.v.extend(verts)
        self.f.extend([tuple(i + b for i in f) for f in faces])

    def box(self, x0, x1, y0, y1, z0, z1):
        v = [(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),
             (x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)]
        f = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        self.add(v, f)

    def revolve(self, profile, centre, axis, segs=32):
        """profile: closed loop of (radius, axial) pairs. axis: 'X'|'Y'|'Z'."""
        cx, cy, cz = centre
        P = len(profile)
        verts = []
        for s in range(segs):
            t = TAU * s / segs
            c, sn = math.cos(t), math.sin(t)
            for (r, a) in profile:
                if axis == 'Y':
                    verts.append((cx + r*c, cy + a, cz + r*sn))
                elif axis == 'X':
                    verts.append((cx + a, cy + r*c, cz + r*sn))
                else:
                    verts.append((cx + r*c, cy + r*sn, cz + a))
        faces = []
        for s in range(segs):
            s2 = (s + 1) % segs
            for p in range(P):
                p2 = (p + 1) % P
                faces.append((s*P + p, s*P + p2, s2*P + p2, s2*P + p))
        self.add(verts, faces)

    def cylinder(self, centre, axis, r, length, segs=24, bore=0.0):
        h = length / 2.0
        eps = bore if bore > 0 else 0.0004
        prof = [(eps, -h), (r, -h), (r, h), (eps, h)]
        self.revolve(prof, centre, axis, segs)

    def tube(self, path, section, closed=True):
        """path: list of (x,y,z). section: fn(i, T, M) -> list of 4 offsets."""
        n = len(path)
        rings = []
        for i, p in enumerate(path):
            a = path[(i - 1) % n] if closed or i > 0 else path[0]
            b = path[(i + 1) % n] if closed or i < n - 1 else path[-1]
            T = Vector((b[0]-a[0], 0.0, b[2]-a[2]))
            if T.length < 1e-9:
                T = Vector((1, 0, 0))
            T.normalize()
            M = Vector((T.z, 0.0, -T.x))          # outward, for a CCW loop in XZ
            rings.append([Vector(p) + o for o in section(i, T, M)])
        verts, faces = [], []
        for ring in rings:
            verts.extend([tuple(v) for v in ring])
        m = 4
        rng = range(n) if closed else range(n - 1)
        for i in rng:
            j = (i + 1) % n
            for k in range(m):
                k2 = (k + 1) % m
                faces.append((i*m + k, i*m + k2, j*m + k2, j*m + k))
        self.add(verts, faces)


def bake(name, mesh, mat, parent, props=None):
    me = bpy.data.meshes.new(name + "_mesh")
    me.from_pydata(mesh.v, [], mesh.f)
    me.validate(verbose=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    m = bpy.data.materials.get(mat)
    if m is None:
        raise RuntimeError("missing material: " + mat)
    ob.data.materials.append(m)
    ob.parent = parent
    for poly in ob.data.polygons:
        poly.use_smooth = False
    if props:
        for k, val in props.items():
            ob[k] = val
    return ob


# ─────────────────────────────────────────────────────── refuse to run twice
existing = [o.name for o in bpy.data.objects if o.name.startswith("DRIVE_")]
if existing:
    raise RuntimeError("DRIVE_ objects already present: %s" % existing[:8])

silo = bpy.data.objects["SiloCell"]

root = bpy.data.objects.new("DRIVE_TRAIN", None)
root.empty_display_size = 0.25
bpy.context.scene.collection.objects.link(root)
root.parent = silo
root["role"] = "drive_train"
root["label"] = "CONVEYOR DRIVE TRAIN"

made = []

def solid(name, mat, props=None, parent=None):
    m = Mesh()
    return m, (lambda: bake(name, m, mat, parent or root, props))

# ══════════════════════════════════════════════════════ 1. bed plate & anchors
m = Mesh()
m.box(1.880, 2.560, -0.600, -0.160, 0.000, 0.014)
made.append(bake("DRIVE_Base_Plate", m, "galv", root))

m = Mesh()
for bx, by in ((1.940, -0.545), (2.500, -0.545), (1.940, -0.215), (2.500, -0.215)):
    m.cylinder((bx, by, 0.024), 'Z', 0.011, 0.030, 12)      # bolt head + shank
    m.cylinder((bx, by, 0.036), 'Z', 0.016, 0.014, 6)       # washer/nut
made.append(bake("DRIVE_Base_Bolts", m, "stainless", root))

# ══════════════════════════════════════════════ 2. take-up (motor slide base)
m = Mesh(); m.box(2.060, 2.590, -0.435, -0.345, 0.014, 0.040)
made.append(bake("DRIVE_TakeUp_Rail_L", m, "galv", root))
m = Mesh(); m.box(2.060, 2.590, -0.255, -0.165, 0.014, 0.040)
made.append(bake("DRIVE_TakeUp_Rail_R", m, "galv", root))

m = Mesh(); m.box(2.560, 2.582, -0.255, -0.165, 0.040, 0.098)
made.append(bake("DRIVE_TakeUp_Lug", m, "galv", root))

# The jacking screw sits between the lug and the motor foot: screwing it in
# PUSHES the motor in -X, away from the driven pulley, which is what tensions
# the belt. Modelled backed almost all the way out — that is the slack fault.
m = Mesh()
m.cylinder((2.545, -0.210, 0.070), 'X', 0.008, 0.076, 12)
made.append(bake("DRIVE_TakeUp_Screw", m, "stainless", root,
                 {"label": "BELT TENSIONER", "role": "repair_point"}))
m = Mesh()
m.cylinder((2.522, -0.210, 0.070), 'X', 0.015, 0.014, 6)
made.append(bake("DRIVE_TakeUp_Nut", m, "stainless", root))

# ═══════════════════════════════════════════════════════════ 3. the gearmotor
m = Mesh(); m.box(2.230, 2.510, -0.420, -0.358, 0.040, 0.060)
made.append(bake("DRIVE_Foot_L", m, "motor_grey", root))
m = Mesh(); m.box(2.230, 2.510, -0.242, -0.180, 0.040, 0.060)
made.append(bake("DRIVE_Foot_R", m, "motor_grey", root))

# worm/bevel reducer: output shaft along Y, motor barrel along X off its flank
m = Mesh()
m.box(2.250, 2.490, -0.420, -0.180, 0.060, 0.300)
m.cylinder((MOT_X, -0.412, MOT_Z), 'Y', 0.046, 0.030, 20)   # output bearing boss
made.append(bake("DRIVE_Gearbox", m, "motor_grey", root,
                 {"label": "CONVEYOR GEARMOTOR", "actuator_type": "motor_ac",
                  "note": "drives O:2/00; tag still lives on Conv_Gearbox"}))

m = Mesh()
m.cylinder((2.115, -0.300, MOT_Z), 'X', 0.078, 0.270, 24)
made.append(bake("DRIVE_Motor_Body", m, "motor_grey", root))

m = Mesh()
for i in range(7):                      # TEFC cooling fins
    fx = 2.000 + i * 0.036
    m.cylinder((fx, -0.300, MOT_Z), 'X', 0.087, 0.007, 24, bore=0.070)
made.append(bake("DRIVE_Motor_Fins", m, "motor_grey", root))

m = Mesh()
m.cylinder((1.948, -0.300, MOT_Z), 'X', 0.070, 0.064, 20)
made.append(bake("DRIVE_Motor_FanCowl", m, "shroud_grey", root))

m = Mesh(); m.box(2.055, 2.185, -0.355, -0.245, 0.245, 0.316)
made.append(bake("DRIVE_Motor_TermBox", m, "panel_grey", root))

m = Mesh()
m.cylinder((2.120, -0.368, 0.280), 'Y', 0.014, 0.030, 12)
made.append(bake("DRIVE_Motor_Gland", m, "cable_black", root))

# drooping supply flex from the gland down to the floor
cable_pts = [(2.120, -0.390, 0.276), (2.126, -0.470, 0.238), (2.140, -0.545, 0.160),
             (2.152, -0.585, 0.070), (2.158, -0.600, 0.016), (2.160, -0.640, 0.011)]
m = Mesh()
for i in range(len(cable_pts) - 1):
    a, b = cable_pts[i], cable_pts[i + 1]
    c = ((a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2)
    d = Vector(b) - Vector(a)
    ax = 'Y' if abs(d.y) >= max(abs(d.x), abs(d.z)) else ('Z' if abs(d.z) > abs(d.x) else 'X')
    m.cylinder(c, ax, 0.009, d.length * 1.25, 10)
made.append(bake("DRIVE_Motor_Cable", m, "cable_black", root))

# ══════════════════════════════════════════ 4. outboard bearing on the roller
m = Mesh(); m.box(2.830, 2.990, -0.350, -0.320, 0.700, 0.900)
made.append(bake("DRIVE_Bearing_Bracket", m, "galv", root))

m = Mesh()
m.box(2.855, 2.965, -0.430, -0.350, 0.745, 0.810)
m.cylinder((ROLLER_X, -0.390, ROLLER_Z), 'Y', 0.055, 0.080, 20)
m.box(2.845, 2.870, -0.430, -0.350, 0.745, 0.795)   # base ears for the bolts
m.box(2.950, 2.975, -0.430, -0.350, 0.745, 0.795)
made.append(bake("DRIVE_Bearing_Block", m, "plate_galv", root))

# ═════════════════════════════════════════════════════════ 5. DRIVEN PARTS
# Built with ABSOLUTE vertices first, on purpose: the before/after orbit-radius
# numbers below are the proof that re-origining moved the pivot and not the part.
def vprofile(R, w, bore):
    h = w / 2.0
    return [(bore, -h), (R, -h), (R - 0.013, 0.0), (R, h), (bore, h)]

m = Mesh()
m.revolve(vprofile(R_DRIVEN, PUL_W, 0.021), (ROLLER_X, BELT_Y, ROLLER_Z), 'Y', 40)
m.cylinder((ROLLER_X, BELT_Y, ROLLER_Z), 'Y', 0.032, 0.056, 20, bore=0.021)  # hub
pulley_driven = bake("DRIVE_Pulley_Roller", m, "plate_galv", root, {
    "label": "DRIVEN PULLEY", "anim_type": "spin", "anim_axis": "Z",
    "anim_space": "three", "spin_rpm": 47.0})

m = Mesh()
m.revolve(vprofile(R_DRIVE, PUL_W, 0.015), (MOT_X, BELT_Y, MOT_Z), 'Y', 32)
m.cylinder((MOT_X, BELT_Y, MOT_Z), 'Y', 0.026, 0.052, 20, bore=0.015)
pulley_drive = bake("DRIVE_Pulley_Motor", m, "plate_galv", root, {
    "label": "DRIVE PULLEY", "anim_type": "spin", "anim_axis": "Z",
    "anim_space": "three", "spin_rpm": 77.0})

m = Mesh()
m.cylinder((ROLLER_X, -0.360, ROLLER_Z), 'Y', 0.020, 0.320, 20)
shaft_roller = bake("DRIVE_Shaft_Roller", m, "stainless", root, {
    "label": "DRIVE ROLLER SHAFT", "anim_type": "spin", "anim_axis": "Z",
    "anim_space": "three", "spin_rpm": 47.0})

m = Mesh()
m.cylinder((MOT_X, -0.462, MOT_Z), 'Y', 0.014, 0.100, 16)
shaft_motor = bake("DRIVE_Shaft_Motor", m, "stainless", root, {
    "label": "GEARMOTOR OUTPUT SHAFT", "anim_type": "spin", "anim_axis": "Z",
    "anim_space": "three", "spin_rpm": 77.0})

driven = [pulley_driven, pulley_drive, shaft_roller, shaft_motor]
made.extend(driven)

# ════════════════════════════════════════════════════════════════ 6. the belt
P1 = Vector((MOT_X, 0.0, MOT_Z))       # y is carried separately
P2 = Vector((ROLLER_X, 0.0, ROLLER_Z))
r1, r2 = R_DRIVE - 0.002, R_DRIVEN - 0.002
d = math.hypot(P2.x - P1.x, P2.z - P1.z)
psi = math.atan2(P2.z - P1.z, P2.x - P1.x)
# The common tangent's outward normal n satisfies n.(P2-P1) = r2-r1, but the
# TANGENT POINT is at -n from the centre, not +n. Getting that sign wrong hands
# the small pulley 185 deg of wrap and the big one 175 -- backwards, and it
# looks almost right, which is exactly why it needs writing down.
phi = math.acos(-(r2 - r1) / d)

def on(c, r, ang):
    return (c.x + r*math.cos(ang), BELT_Y, c.z + r*math.sin(ang))

path = []
STEP = math.radians(3.0)

# wrap on the small (drive) pulley: the MINOR arc, ψ+φ -> ψ+2π-φ
sweep = TAU - 2*phi
n = max(3, int(sweep / STEP))
for i in range(n + 1):
    path.append(on(P1, r1, psi + phi + sweep * i / n))

# slack span, drive -> driven, on the n_b side. Kept straight: this is the taut side.
A = Vector(path[-1]); B = Vector(on(P2, r2, psi - phi))
for i in range(1, 16):
    path.append(tuple(A.lerp(B, i / 16.0)))

# wrap on the driven pulley: the MAJOR arc, ψ-φ -> ψ+φ
sweep2 = 2 * phi
n2 = max(3, int(sweep2 / STEP))
for i in range(n2 + 1):
    path.append(on(P2, r2, psi - phi + sweep2 * i / n2))

# return span, driven -> drive, on the n_a side. THIS is the one that sags.
na = Vector((math.cos(psi + phi), 0.0, math.sin(psi + phi)))
A = Vector(path[-1]); B = Vector(path[0])
for i in range(1, 16):
    s = i / 16.0
    p = A.lerp(B, s) - na * (BELT_SAG * math.sin(math.pi * s))
    path.append(tuple(p))

def belt_section(i, T, M):
    Y = Vector((0, 1, 0))
    return [M*0.0035 + Y*0.0085, M*0.0035 - Y*0.0085,
            -M*0.0115 - Y*0.0045, -M*0.0115 + Y*0.0045]

m = Mesh()
m.tube(path, belt_section, closed=True)
made.append(bake("DRIVE_Belt", m, "belt_rubber", root, {
    "label": "DRIVE BELT", "role": "fault_target",
    "condition": "slack", "note": "S02 — worn lagging / slack tension"}))

# ═══════════════════════════════════════════════════════════════ 7. the guard
# Hinged on the +X post so the leaf swings out over empty floor; the motor is
# at the -X end and a leaf hinged there would sweep straight through it.
m = Mesh(); m.box(3.038, 3.062, GUARD_Y - 0.012, GUARD_Y + 0.012, 0.000, 0.945)
made.append(bake("DRIVE_Guard_Post", m, "guard_yellow", root))
m = Mesh(); m.box(2.990, 3.110, GUARD_Y - 0.060, GUARD_Y + 0.060, 0.000, 0.012)
made.append(bake("DRIVE_Guard_Foot", m, "guard_yellow", root))
# latch post sits INBOARD of the leaf so the leaf shuts against it rather than
# through it; the keeper laps the leaf's free edge from outboard.
m = Mesh(); m.box(2.258, 2.282, GUARD_Y + 0.011, GUARD_Y + 0.035, 0.014, 0.945)
made.append(bake("DRIVE_Guard_PostE", m, "guard_yellow", root))
m = Mesh(); m.box(2.252, 2.278, GUARD_Y - 0.030, GUARD_Y + 0.035, 0.470, 0.530)
made.append(bake("DRIVE_Guard_Latch", m, "guard_yellow", root))

HINGE = (3.050, GUARD_Y, 0.0)
pivot = bpy.data.objects.new("DRIVE_Guard_Pivot", None)
pivot.empty_display_size = 0.15
bpy.context.scene.collection.objects.link(pivot)
pivot.parent = root
pivot.location = HINGE
pivot["label"] = "BELT GUARD"
pivot["anim_type"] = "rotate"
pivot["anim_axis"] = "Y"          # Blender Z hinge -> three.js Y
pivot["anim_space"] = "three"
pivot["anim_range"] = [0.0, -95.0]
pivot["role"] = "removable_guard"
bpy.context.view_layer.update()

GY0, GY1 = GUARD_Y - 0.011, GUARD_Y + 0.011
GX0, GX1 = 2.270, 3.050
GZ0, GZ1 = 0.085, 0.925
m = Mesh()
m.box(GX0, GX1, GY0, GY1, GZ0, GZ0 + 0.024)          # bottom rail
m.box(GX0, GX1, GY0, GY1, GZ1 - 0.024, GZ1)          # top rail
m.box(GX0, GX0 + 0.024, GY0, GY1, GZ0, GZ1)          # stiles
m.box(GX1 - 0.024, GX1, GY0, GY1, GZ0, GZ1)
m.box(2.648, 2.672, GY0, GY1, GZ0, GZ1)              # mid stiffener
leaf_frame = bake("DRIVE_Guard_Frame", m, "guard_yellow", pivot)

m = Mesh()
for i in range(9):
    z = 0.145 + i * 0.085
    m.box(GX0 + 0.020, GX1 - 0.020, GUARD_Y - 0.007, GUARD_Y + 0.007, z, z + 0.014)
leaf_mesh = bake("DRIVE_Guard_Bars", m, "guard_yellow", pivot)

for ch in (leaf_frame, leaf_mesh):
    ch.matrix_parent_inverse = pivot.matrix_world.inverted()
made.extend([pivot, leaf_frame, leaf_mesh])

bpy.context.view_layer.update()

# ══════════════════════════════════ 8. transform contract: measure, re-origin,
#                                       measure again, and print BOTH.
def local_centre(o):
    vs = [v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return (lo + hi) / 2

def world_centre(o):
    return o.matrix_world @ local_centre(o)

report = {"driven": [], "pivots": [], "static_violations": []}

for o in driven:
    before_orbit = local_centre(o).length
    before_world = world_centre(o).copy()
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    bpy.context.view_layer.update()
    after_orbit = local_centre(o).length
    after_world = world_centre(o)
    report["driven"].append({
        "name": o.name,
        "orbit_before": round(before_orbit, 6),
        "orbit_after": round(after_orbit, 6),
        "world_before": [round(v, 6) for v in before_world],
        "world_after": [round(v, 6) for v in after_world],
        "world_moved": round((after_world - before_world).length, 9),
        "origin": [round(v, 6) for v in o.location],
    })

report["pivots"].append({
    "name": pivot.name, "location": [round(v, 6) for v in pivot.location],
    "children": [c.name for c in pivot.children]})

# every static part must have an identity object transform
for o in made:
    if o in driven or o is pivot or o.parent is pivot:
        continue
    if o.type != 'MESH':
        continue
    if (o.location.length > 1e-9 or o.scale != Vector((1, 1, 1))
            or max(abs(a) for a in o.rotation_euler) > 1e-9):
        report["static_violations"].append(o.name)

# world bounding boxes of everything added
def wbb(o):
    ws = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return ([round(min(v[i] for v in ws), 4) for i in range(3)],
            [round(max(v[i] for v in ws), 4) for i in range(3)])

report["parts"] = []
for o in sorted([x for x in made if x.type == 'MESH'], key=lambda x: x.name):
    mn, mx = wbb(o)
    report["parts"].append({"name": o.name, "min": mn, "max": mx,
                            "tris": len(o.data.polygons)})

report["counts"] = {"added_objects": len(made) + 1,
                    "added_meshes": len([x for x in made if x.type == 'MESH'])}

print('@@@' + json.dumps(report) + '@@@')

prefs = bpy.context.preferences.filepaths
sv = prefs.save_version
prefs.save_version = 0
try:
    bpy.ops.wm.save_mainfile()
finally:
    prefs.save_version = sv
print("SAVED")
