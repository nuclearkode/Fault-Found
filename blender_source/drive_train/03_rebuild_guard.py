"""Replace the first guard, which the renders showed up as a garden gate.

The v1 guard was a rectangular lattice on two floor posts. It was see-through
and it was openable, but it was the wrong OBJECT: a 780 x 840 flat panel with a
quarter of its area covering bare floor, standing on its own feet, reading as a
fence rather than as anything bolted to the machine.

v2 is a real V-belt guard: its outline is the convex hull of the two pulleys
grown by 50 mm -- the 'peanut' every belt guard on earth has -- pressed as a
rim with a slotted face, carried on two stand-off brackets, one off the roller
bearing and one off the motor bed. It still shows the belt through the slots,
and it still hangs off DRIVE_Guard_Pivot so code can swing it open.
"""
import bpy, math, json
from mathutils import Vector

TAU = math.tau

# ── pulley geometry, repeated from the build so the outline stays in step ────
C1, R1 = Vector((2.370, 0.0, 0.180)), 0.055
C2, R2 = Vector((2.910, 0.0, 0.810)), 0.090
CLEAR  = 0.050                      # how far the guard stands off the pulleys
BELT_Y = -0.470
RIM_IN, RIM_OUT = -0.512, -0.585     # inboard and outboard edges of the rim
SLAT_OUT, SLAT_IN = -0.585, -0.571

r1g, r2g = R1 + CLEAR, R2 + CLEAR
d   = math.hypot(C2.x - C1.x, C2.z - C1.z)
psi = math.atan2(C2.z - C1.z, C2.x - C1.x)
phi = math.acos(-(r2g - r1g) / d)

def outline(step=math.radians(3.0)):
    pts = []
    sweep = TAU - 2*phi                       # small pulley: the minor wrap
    n = max(4, int(sweep/step))
    for i in range(n + 1):
        a = psi + phi + sweep*i/n
        pts.append((C1.x + r1g*math.cos(a), C1.z + r1g*math.sin(a)))
    sweep2 = 2*phi                            # large pulley: the major wrap
    n2 = max(4, int(sweep2/step))
    for i in range(n2 + 1):
        a = psi - phi + sweep2*i/n2
        pts.append((C2.x + r2g*math.cos(a), C2.z + r2g*math.sin(a)))
    return pts

OUT = outline()

def span_at(z):
    """x-range of the (convex) outline at height z, or None."""
    xs = []
    n = len(OUT)
    for i in range(n):
        (x0, z0), (x1, z1) = OUT[i], OUT[(i + 1) % n]
        if (z0 - z) * (z1 - z) <= 0 and abs(z1 - z0) > 1e-12:
            xs.append(x0 + (x1 - x0) * (z - z0) / (z1 - z0))
    return (min(xs), max(xs)) if len(xs) >= 2 else None


class Mesh:
    def __init__(self):
        self.v, self.f = [], []
    def add(self, verts, faces):
        b = len(self.v); self.v.extend(verts)
        self.f.extend([tuple(i + b for i in f) for f in faces])
    def box(self, x0, x1, y0, y1, z0, z1):
        self.add([(x0,y0,z0),(x1,y0,z0),(x1,y1,z0),(x0,y1,z0),
                  (x0,y0,z1),(x1,y0,z1),(x1,y1,z1),(x0,y1,z1)],
                 [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    def band(self, pts, y_a, y_b, thick):
        """Sweep a thin, deep strip along a closed XZ polygon: the guard rim."""
        n = len(pts); rings = []
        for i, (x, z) in enumerate(pts):
            xa, za = pts[(i-1) % n]; xb, zb = pts[(i+1) % n]
            T = Vector((xb-xa, 0.0, zb-za))
            T = T.normalized() if T.length > 1e-9 else Vector((1,0,0))
            M = Vector((T.z, 0.0, -T.x))            # outward for a CCW loop
            p = Vector((x, BELT_Y, z))
            h = thick/2.0
            rings.append([p + M*h + Vector((0, y_a-BELT_Y, 0)),
                          p + M*h + Vector((0, y_b-BELT_Y, 0)),
                          p - M*h + Vector((0, y_b-BELT_Y, 0)),
                          p - M*h + Vector((0, y_a-BELT_Y, 0))])
        verts = [tuple(v) for ring in rings for v in ring]
        faces = []
        for i in range(n):
            j = (i + 1) % n
            for k in range(4):
                k2 = (k + 1) % 4
                faces.append((i*4+k, i*4+k2, j*4+k2, j*4+k))
        self.add(verts, faces)


def bake(name, mesh, mat, parent, props=None):
    me = bpy.data.meshes.new(name + "_mesh")
    me.from_pydata(mesh.v, [], mesh.f); me.validate(); me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(bpy.data.materials[mat])
    ob.parent = parent
    for p in ob.data.polygons:
        p.use_smooth = False
    for k, v in (props or {}).items():
        ob[k] = v
    return ob


# ── tear down v1 ────────────────────────────────────────────────────────────
OLD = ["DRIVE_Guard_Frame", "DRIVE_Guard_Bars", "DRIVE_Guard_Pivot",
       "DRIVE_Guard_Post", "DRIVE_Guard_PostE", "DRIVE_Guard_Foot",
       "DRIVE_Guard_Latch"]
removed = []
for n in OLD:
    o = bpy.data.objects.get(n)
    if o:
        removed.append(n)
        # remove the OBJECT first. bpy.data.meshes.remove() takes the object with
        # it, which is a very indirect way to delete something you can name.
        md = o.data if o.type == 'MESH' else None
        bpy.data.objects.remove(o, do_unlink=True)
        if md is not None and md.users == 0:
            bpy.data.meshes.remove(md)
print("REMOVED", removed)

root = bpy.data.objects["DRIVE_TRAIN"]

# ── stand-offs: one off the roller bearing, one off the motor bed ───────────
m = Mesh()
m.box(3.000, 3.032, RIM_OUT, -0.360, 0.850, 0.884)   # outboard leg, clears pulley in x
m.box(2.940, 3.005, -0.402, -0.360, 0.850, 0.884)    # inboard leg, onto the bearing
bake("DRIVE_Guard_Standoff_A", m, "galv", root)

m = Mesh()
m.box(2.280, 2.315, RIM_OUT, -0.548, 0.014, 0.142)   # post off the bed plate
m.box(2.258, 2.337, -0.600, -0.532, 0.014, 0.028)    # its foot
bake("DRIVE_Guard_Standoff_B", m, "galv", root)

m = Mesh()
m.box(2.262, 2.300, -0.601, RIM_OUT, 0.150, 0.200)
bake("DRIVE_Guard_Latch", m, "guard_yellow", root)

# ── the leaf: rim + slotted face, on the hinge ──────────────────────────────
pivot = bpy.data.objects.new("DRIVE_Guard_Pivot", None)
pivot.empty_display_size = 0.15
bpy.context.scene.collection.objects.link(pivot)
pivot.parent = root
pivot.location = (3.056, -0.549, 0.0)
for k, v in {"label": "BELT GUARD", "anim_type": "rotate", "anim_axis": "Y",
             "anim_space": "three", "anim_range": [0.0, -95.0],
             "role": "removable_guard"}.items():
    pivot[k] = v
bpy.context.view_layer.update()

m = Mesh()
m.band(OUT, RIM_IN, RIM_OUT, 0.004)
rim = bake("DRIVE_Guard_Rim", m, "guard_yellow", pivot)

m = Mesh()
slats = 0
z = 0.112
while z < 0.945:
    a, b = span_at(z), span_at(z + 0.014)
    if a and b:
        x0 = max(a[0], b[0]) + 0.008
        x1 = min(a[1], b[1]) - 0.008
        if x1 - x0 > 0.030:
            m.box(x0, x1, SLAT_OUT, SLAT_IN, z, z + 0.014)
            slats += 1
    z += 0.068
face = bake("DRIVE_Guard_Slats", m, "guard_yellow", pivot)

for ch in (rim, face):
    ch.matrix_parent_inverse = pivot.matrix_world.inverted()
bpy.context.view_layer.update()

def wbb(o):
    ws = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return ([round(min(v[i] for v in ws), 4) for i in range(3)],
            [round(max(v[i] for v in ws), 4) for i in range(3)])

rep = {"slats": slats, "outline_pts": len(OUT),
       "outline_bbox": [round(min(p[0] for p in OUT), 4), round(max(p[0] for p in OUT), 4),
                        round(min(p[1] for p in OUT), 4), round(max(p[1] for p in OUT), 4)],
       "parts": {}}
for n in ("DRIVE_Guard_Rim", "DRIVE_Guard_Slats", "DRIVE_Guard_Standoff_A",
          "DRIVE_Guard_Standoff_B", "DRIVE_Guard_Latch", "DRIVE_Belt",
          "DRIVE_Pulley_Roller", "DRIVE_Pulley_Motor"):
    rep["parts"][n] = wbb(bpy.data.objects[n])
rep["drive_train_children"] = sorted(c.name for c in root.children)
print('@@@' + json.dumps(rep) + '@@@')

prefs = bpy.context.preferences.filepaths
sv = prefs.save_version; prefs.save_version = 0
try:
    bpy.ops.wm.save_mainfile()
finally:
    prefs.save_version = sv
print("SAVED")
