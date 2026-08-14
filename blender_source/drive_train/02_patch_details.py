"""Rebuild two DRIVE_ parts the bounding-box dump caught out.

  DRIVE_Base_Bolts   — two of the four anchors were sunk through the take-up
                       rail's footprint instead of the bare plate.
  DRIVE_Motor_Cable  — the flex stopped 4.9 mm above the floor and ended in
                       mid air. It now lands on the slab and runs to the base
                       plate edge, which is where a real one goes.
"""
import bpy, math, json
from mathutils import Vector

TAU = math.tau

class Mesh:
    def __init__(self):
        self.v, self.f = [], []
    def add(self, verts, faces):
        b = len(self.v); self.v.extend(verts)
        self.f.extend([tuple(i + b for i in f) for f in faces])
    def revolve(self, profile, centre, axis, segs=24):
        cx, cy, cz = centre; P = len(profile); verts = []
        for s in range(segs):
            t = TAU * s / segs; c, sn = math.cos(t), math.sin(t)
            for (r, a) in profile:
                if axis == 'Y':   verts.append((cx + r*c, cy + a, cz + r*sn))
                elif axis == 'X': verts.append((cx + a, cy + r*c, cz + r*sn))
                else:             verts.append((cx + r*c, cy + r*sn, cz + a))
        faces = []
        for s in range(segs):
            s2 = (s + 1) % segs
            for p in range(P):
                p2 = (p + 1) % P
                faces.append((s*P+p, s*P+p2, s2*P+p2, s2*P+p))
        self.add(verts, faces)
    def cylinder(self, centre, axis, r, length, segs=24, bore=0.0):
        h = length/2.0; eps = bore if bore > 0 else 0.0004
        self.revolve([(eps,-h),(r,-h),(r,h),(eps,h)], centre, axis, segs)

def replace(name, mesh):
    old = bpy.data.objects[name]
    mat = old.data.materials[0]
    parent, props = old.parent, {k: old[k] for k in old.keys()}
    me = bpy.data.meshes.new(name + "_mesh")
    me.from_pydata(mesh.v, [], mesh.f); me.validate(); me.update()
    olddata = old.data
    old.data = me
    bpy.data.meshes.remove(olddata)
    old.data.materials.append(mat)
    for p in old.data.polygons:
        p.use_smooth = False
    return old

# ── anchors: plate corners, in the bands the rails do not cover ──────────────
# plate y -0.600..-0.160; rail_L -0.435..-0.345; rail_R -0.255..-0.165
m = Mesh()
for bx, by in ((1.940, -0.560), (2.500, -0.560), (1.940, -0.300), (2.500, -0.300)):
    m.cylinder((bx, by, 0.024), 'Z', 0.011, 0.030, 12)
    m.cylinder((bx, by, 0.036), 'Z', 0.016, 0.014, 6)
replace("DRIVE_Base_Bolts", m)

# ── supply flex: gland -> droop -> floor -> away along the slab ──────────────
pts = [(2.120, -0.390, 0.276), (2.126, -0.472, 0.240), (2.140, -0.548, 0.164),
       (2.154, -0.596, 0.078), (2.162, -0.616, 0.024), (2.170, -0.628, 0.009),
       (2.260, -0.634, 0.009), (2.420, -0.634, 0.009)]
m = Mesh()
for i in range(len(pts) - 1):
    a, b = Vector(pts[i]), Vector(pts[i+1])
    d = b - a
    ax = 'Y' if abs(d.y) >= max(abs(d.x), abs(d.z)) else ('Z' if abs(d.z) > abs(d.x) else 'X')
    m.cylinder(tuple((a + b) / 2), ax, 0.009, d.length * 1.22, 10)
replace("DRIVE_Motor_Cable", m)

bpy.context.view_layer.update()

def wbb(o):
    ws = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return ([round(min(v[i] for v in ws), 4) for i in range(3)],
            [round(max(v[i] for v in ws), 4) for i in range(3)])

out = {n: wbb(bpy.data.objects[n]) for n in ("DRIVE_Base_Bolts", "DRIVE_Motor_Cable")}
print('@@@' + json.dumps(out) + '@@@')

prefs = bpy.context.preferences.filepaths
sv = prefs.save_version; prefs.save_version = 0
try:
    bpy.ops.wm.save_mainfile()
finally:
    prefs.save_version = sv
print("SAVED")
