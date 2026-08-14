"""The motor fins read as a slinky.

v1 built them as 7 annular RINGS around the barrel with 29 mm gaps, which in the
close render looks exactly like corrugated ducting, not a motor. Real TEFC
frames carry AXIAL fins -- ribs running the length of the barrel -- and that is
the single silhouette detail that makes an object read as an electric motor.
16 of them, standing 12 mm proud of a 156 mm barrel.
"""
import bpy, math, json
from mathutils import Vector

CY, CZ = -0.300, 0.180          # barrel axis
X0, X1 = 1.995, 2.245           # fin run, inside the barrel's 1.98..2.25
R_IN, R_OUT = 0.070, 0.090
HALF_T = 0.0028                 # fin half-thickness, tangential
N = 16

verts, faces = [], []
for i in range(N):
    a = math.tau * i / N
    nr = Vector((0.0, math.cos(a), math.sin(a)))     # radial
    tg = Vector((0.0, -math.sin(a), math.cos(a)))    # tangential
    quad = []
    for r, s in ((R_IN, -1), (R_OUT, -1), (R_OUT, 1), (R_IN, 1)):
        p = Vector((0.0, CY, CZ)) + nr*r + tg*(HALF_T*s)
        quad.append((p.y, p.z))
    b = len(verts)
    verts.extend([(X0, q[0], q[1]) for q in quad] + [(X1, q[0], q[1]) for q in quad])
    faces.extend([tuple(k+b for k in f) for f in
                  [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]])

ob = bpy.data.objects["DRIVE_Motor_Fins"]
old = ob.data
me = bpy.data.meshes.new("DRIVE_Motor_Fins_mesh")
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
    "fins": N, "faces": len(ob.data.polygons),
    "identity_transform": ob.location.length < 1e-9,
    "bbox": [[round(min(v[i] for v in ws), 4) for i in range(3)],
             [round(max(v[i] for v in ws), 4) for i in range(3)]]}) + '@@@')

prefs = bpy.context.preferences.filepaths
sv = prefs.save_version; prefs.save_version = 0
try:
    bpy.ops.wm.save_mainfile()
finally:
    prefs.save_version = sv
print("SAVED")
