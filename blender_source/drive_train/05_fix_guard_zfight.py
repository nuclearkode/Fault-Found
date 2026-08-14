"""The guard grid z-fought at every crossing -- black diamonds in the render.

Rungs and stringers were both extruded through exactly y -0.585..-0.571, so at
each intersection two pairs of faces were coplanar and the depth buffer had no
way to choose. Interpenetrating solids are fine; COPLANAR ones are not. The
stringers now sit 10 mm behind the rungs, overlapping by 4 mm, which is also
how a welded grid actually looks.
"""
import bpy, math, json
from mathutils import Vector

TAU = math.tau
C1, R1 = Vector((2.370, 0.0, 0.180)), 0.055
C2, R2 = Vector((2.910, 0.0, 0.810)), 0.090
CLEAR = 0.050
RUNG_OUT, RUNG_IN = -0.585, -0.571
STR_OUT, STR_IN   = -0.575, -0.561

d   = math.hypot(C2.x - C1.x, C2.z - C1.z)
psi = math.atan2(C2.z - C1.z, C2.x - C1.x)
U   = Vector((math.cos(psi), 0.0, math.sin(psi)))
V   = Vector((-math.sin(psi), 0.0, math.cos(psi)))
STEP = math.radians(3.0)

r1g, r2g = R1 + CLEAR, R2 + CLEAR
phig = math.acos(-(r2g - r1g) / d)
OUT = []
sw = TAU - 2*phig; k = max(4, int(sw/STEP))
for i in range(k+1):
    a = psi + phig + sw*i/k
    OUT.append((C1.x + r1g*math.cos(a), C1.z + r1g*math.sin(a)))
sw2 = 2*phig; k2 = max(4, int(sw2/STEP))
for i in range(k2+1):
    a = psi - phig + sw2*i/k2
    OUT.append((C2.x + r2g*math.cos(a), C2.z + r2g*math.sin(a)))
TS = [((Vector((x,0,z)) - C1).dot(U), (Vector((x,0,z)) - C1).dot(V)) for x, z in OUT]

def cross_range(val, idx):
    other = 1 - idx; hits = []; n = len(TS)
    for i in range(n):
        a, b = TS[i], TS[(i+1) % n]
        if (a[idx]-val)*(b[idx]-val) <= 0 and abs(b[idx]-a[idx]) > 1e-12:
            f = (val - a[idx]) / (b[idx] - a[idx])
            hits.append(a[other] + f*(b[other]-a[other]))
    return (min(hits), max(hits)) if len(hits) >= 2 else None

verts, faces = [], []
def obox(t0, t1, s0, s1, y0, y1):
    global verts, faces
    c = []
    for (t, s) in ((t0,s0),(t1,s0),(t1,s1),(t0,s1)):
        p = C1 + U*t + V*s
        c.append((p.x, p.z))
    b = len(verts)
    verts.extend([(q[0], y0, q[1]) for q in c] + [(q[0], y1, q[1]) for q in c])
    faces.extend([tuple(i+b for i in f) for f in
                  [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]])

rungs = stringers = 0
t = -0.070
while t < 0.99:
    a, b = cross_range(t, 0), cross_range(t + 0.014, 0)
    if a and b:
        s0, s1 = max(a[0], b[0]) + 0.007, min(a[1], b[1]) - 0.007
        if s1 - s0 > 0.030:
            obox(t, t + 0.014, s0, s1, RUNG_OUT, RUNG_IN); rungs += 1
    t += 0.082
for s in (-0.115, 0.0, 0.115):
    a, b = cross_range(s, 1), cross_range(s + 0.012, 1)
    if a and b:
        t0, t1 = max(a[0], b[0]) + 0.007, min(a[1], b[1]) - 0.007
        if t1 - t0 > 0.030:
            obox(t0, t1, s, s + 0.012, STR_OUT, STR_IN); stringers += 1

ob = bpy.data.objects["DRIVE_Guard_Slats"]
old = ob.data
me = bpy.data.meshes.new("DRIVE_Guard_Slats_mesh")
me.from_pydata(verts, [], faces); me.validate(); me.update()
mats = [s.material for s in ob.material_slots]
ob.data = me
bpy.data.meshes.remove(old)
for mt in mats:
    ob.data.materials.append(mt)
for p in ob.data.polygons:
    p.use_smooth = False
bpy.context.view_layer.update()

ws = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
print('@@@' + json.dumps({
    "rungs": rungs, "stringers": stringers,
    "identity_transform": (ob.location.length < 1e-9),
    "bbox": [[round(min(v[i] for v in ws), 4) for i in range(3)],
             [round(max(v[i] for v in ws), 4) for i in range(3)]]}) + '@@@')

prefs = bpy.context.preferences.filepaths
sv = prefs.save_version; prefs.save_version = 0
try:
    bpy.ops.wm.save_mainfile()
finally:
    prefs.save_version = sv
print("SAVED")
