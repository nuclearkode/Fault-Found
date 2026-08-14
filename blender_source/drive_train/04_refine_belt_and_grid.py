"""Three things the v2 renders showed were still wrong.

1. THE SAG DIDN'T READ. 32 mm of bow over an 830 mm span is invisible at the
   distance a player stands. The entire point of this feature is that S02's
   slack belt becomes something you SEE rather than something the briefing
   tells you, so the sag goes to 70 mm -- still 75 mm clear of the taut span.

2. THE BELT WAS A HAIRLINE. 17 mm top width is a correct A-section and a
   useless game asset. 22 mm (B-section), in a groove that now has flat rims
   either side instead of a V across the whole 40 mm face.

3. THE GUARD READ AS A LADDER. Horizontal rungs on a guard whose long axis runs
   at 49 degrees look like an escalator. The slots now run with the guard, as a
   grid: rungs across it, plus three stringers along it placed at perpendicular
   offsets 0 and +/-115 mm -- deliberately clear of the belt spans, which sit at
   +/-53..88 mm, so no stringer ever lies along a span and hides it.
"""
import bpy, math, json
from mathutils import Vector

TAU = math.tau

C1, R1 = Vector((2.370, 0.0, 0.180)), 0.055
C2, R2 = Vector((2.910, 0.0, 0.810)), 0.090
BELT_Y = -0.470
PUL_W  = 0.040
GROOVE = 0.024                      # groove width at the rim
SAG    = 0.070
SLAT_OUT, SLAT_IN = -0.585, -0.571
CLEAR  = 0.050

d   = math.hypot(C2.x - C1.x, C2.z - C1.z)
psi = math.atan2(C2.z - C1.z, C2.x - C1.x)
U   = Vector((math.cos(psi), 0.0, math.sin(psi)))
V   = Vector((-math.sin(psi), 0.0, math.cos(psi)))


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
    def obox(self, t0, t1, s0, s1, y0, y1):
        """Box in the guard's own (along-axis, across-axis) frame."""
        corners = []
        for (t, s) in ((t0,s0), (t1,s0), (t1,s1), (t0,s1)):
            p = C1 + U*t + V*s
            corners.append((p.x, p.z))
        v = [(c[0], y0, c[1]) for c in corners] + [(c[0], y1, c[1]) for c in corners]
        self.add(v, [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
    def revolve(self, profile, centre, axis, segs=32):
        cx, cy, cz = centre; P = len(profile); verts = []
        for s in range(segs):
            t = TAU*s/segs; c, sn = math.cos(t), math.sin(t)
            for (r, a) in profile:
                if axis == 'Y':   verts.append((cx + r*c, cy + a, cz + r*sn))
                elif axis == 'X': verts.append((cx + a, cy + r*c, cz + r*sn))
                else:             verts.append((cx + r*c, cy + r*sn, cz + a))
        faces = []
        for s in range(segs):
            s2 = (s+1) % segs
            for p in range(P):
                p2 = (p+1) % P
                faces.append((s*P+p, s*P+p2, s2*P+p2, s2*P+p))
        self.add(verts, faces)
    def cylinder(self, centre, axis, r, length, segs=24, bore=0.0):
        h = length/2.0; eps = bore if bore > 0 else 0.0004
        self.revolve([(eps,-h),(r,-h),(r,h),(eps,h)], centre, axis, segs)
    def tube(self, path, section, closed=True):
        n = len(path); rings = []
        for i, p in enumerate(path):
            a, b = path[(i-1) % n], path[(i+1) % n]
            T = Vector((b[0]-a[0], 0.0, b[2]-a[2]))
            T = T.normalized() if T.length > 1e-9 else Vector((1,0,0))
            M = Vector((T.z, 0.0, -T.x))
            rings.append([Vector(p) + o for o in section(T, M)])
        verts = [tuple(v) for ring in rings for v in ring]
        faces = []
        for i in range(n):
            j = (i+1) % n
            for k in range(4):
                k2 = (k+1) % 4
                faces.append((i*4+k, i*4+k2, j*4+k2, j*4+k))
        self.add(verts, faces)


def swap(name, mesh):
    ob = bpy.data.objects[name]
    old = ob.data
    me = bpy.data.meshes.new(name + "_mesh")
    me.from_pydata(mesh.v, [], mesh.f); me.validate(); me.update()
    mats = [s.material for s in ob.material_slots]
    ob.data = me
    bpy.data.meshes.remove(old)
    for mt in mats:
        ob.data.materials.append(mt)
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


report = {"driven": [], "notes": []}

def local_centre(o):
    vs = [v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return (lo + hi) / 2

def world_centre(o):
    return o.matrix_world @ local_centre(o)

# ── pulleys: real V-groove with flat rims, rebuilt ABSOLUTE then re-origined ──
def vprofile(R, bore):
    h, g = PUL_W/2.0, GROOVE/2.0
    return [(bore, -h), (R, -h), (R, -g), (R - 0.013, 0.0), (R, g), (R, h), (bore, h)]

for name, C, R, bore, hub_r, segs in (
        ("DRIVE_Pulley_Roller", C2, R2, 0.021, 0.032, 40),
        ("DRIVE_Pulley_Motor",  C1, R1, 0.015, 0.026, 32)):
    ob = bpy.data.objects[name]
    m = Mesh()
    m.revolve(vprofile(R, bore), (C.x, BELT_Y, C.z), 'Y', segs)
    m.cylinder((C.x, BELT_Y, C.z), 'Y', hub_r, PUL_W + 0.016, 20, bore=bore)
    swap(name, m)
    ob.location = (0.0, 0.0, 0.0)          # absolute verts -> transform must be identity
    bpy.context.view_layer.update()
    before_orbit = local_centre(ob).length
    before_world = world_centre(ob).copy()
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
    bpy.context.view_layer.update()
    report["driven"].append({
        "name": name,
        "orbit_before": round(before_orbit, 6),
        "orbit_after": round(local_centre(ob).length, 9),
        "world_before": [round(v, 6) for v in before_world],
        "world_after": [round(v, 6) for v in world_centre(ob)],
        "world_moved": round((world_centre(ob) - before_world).length, 9),
        "origin": [round(v, 6) for v in ob.location]})

# ── the belt ────────────────────────────────────────────────────────────────
r1, r2 = R1 - 0.002, R2 - 0.002
phi = math.acos(-(r2 - r1) / d)

def on(c, r, a):
    return (c.x + r*math.cos(a), BELT_Y, c.z + r*math.sin(a))

path = []
STEP = math.radians(3.0)
sweep = TAU - 2*phi
n = max(4, int(sweep/STEP))
for i in range(n + 1):
    path.append(on(C1, r1, psi + phi + sweep*i/n))
A, B = Vector(path[-1]), Vector(on(C2, r2, psi - phi))
for i in range(1, 18):
    path.append(tuple(A.lerp(B, i/18.0)))
sweep2 = 2*phi
n2 = max(4, int(sweep2/STEP))
for i in range(n2 + 1):
    path.append(on(C2, r2, psi - phi + sweep2*i/n2))
na = Vector((math.cos(psi + phi), 0.0, math.sin(psi + phi)))
A, B = Vector(path[-1]), Vector(path[0])
for i in range(1, 24):
    s = i/24.0
    path.append(tuple(A.lerp(B, s) - na * (SAG * math.sin(math.pi*s))))

YV = Vector((0, 1, 0))
def belt_section(T, M):
    return [M*0.0045 + YV*0.011, M*0.0045 - YV*0.011,
            -M*0.0135 - YV*0.006, -M*0.0135 + YV*0.006]

m = Mesh(); m.tube(path, belt_section, closed=True)
swap("DRIVE_Belt", m)

# how far the slack span ends up from the taut one, measured not assumed
def midpoint_gap():
    ta = Vector(on(C1, r1, psi + phi)); tb = Vector(on(C2, r2, psi + phi))
    mid_a = (ta + tb)/2 - na*SAG
    tc = Vector(on(C1, r1, psi - phi)); td = Vector(on(C2, r2, psi - phi))
    mid_b = (tc + td)/2
    return (mid_a - mid_b).length
report["notes"].append({"slack_to_taut_midspan_gap_m": round(midpoint_gap(), 4),
                        "sag_m": SAG})

# ── guard face: a grid that runs with the guard, not with the world ─────────
r1g, r2g = R1 + CLEAR, R2 + CLEAR
phig = math.acos(-(r2g - r1g) / d)
OUT = []
sw = TAU - 2*phig; k = max(4, int(sw/STEP))
for i in range(k + 1):
    a = psi + phig + sw*i/k
    OUT.append((C1.x + r1g*math.cos(a), C1.z + r1g*math.sin(a)))
sw2 = 2*phig; k2 = max(4, int(sw2/STEP))
for i in range(k2 + 1):
    a = psi - phig + sw2*i/k2
    OUT.append((C2.x + r2g*math.cos(a), C2.z + r2g*math.sin(a)))

TS = [((Vector((x, 0, z)) - C1).dot(U), (Vector((x, 0, z)) - C1).dot(V)) for x, z in OUT]

def cross_range(val, idx):
    """idx 0 -> fix t, return s-range. idx 1 -> fix s, return t-range."""
    other = 1 - idx
    hits = []
    n = len(TS)
    for i in range(n):
        a, b = TS[i], TS[(i+1) % n]
        if (a[idx]-val)*(b[idx]-val) <= 0 and abs(b[idx]-a[idx]) > 1e-12:
            f = (val - a[idx]) / (b[idx] - a[idx])
            hits.append(a[other] + f*(b[other] - a[other]))
    return (min(hits), max(hits)) if len(hits) >= 2 else None

m = Mesh()
rungs = stringers = 0
t = -0.070
while t < 0.99:                                   # rungs ACROSS the guard
    a, b = cross_range(t, 0), cross_range(t + 0.014, 0)
    if a and b:
        s0, s1 = max(a[0], b[0]) + 0.007, min(a[1], b[1]) - 0.007
        if s1 - s0 > 0.030:
            m.obox(t, t + 0.014, s0, s1, SLAT_OUT, SLAT_IN); rungs += 1
    t += 0.082
for s in (-0.115, 0.0, 0.115):                    # stringers ALONG it
    a, b = cross_range(s, 1), cross_range(s + 0.012, 1)
    if a and b:
        t0, t1 = max(a[0], b[0]) + 0.007, min(a[1], b[1]) - 0.007
        if t1 - t0 > 0.030:
            m.obox(t0, t1, s, s + 0.012, SLAT_OUT, SLAT_IN); stringers += 1
swap("DRIVE_Guard_Slats", m)
report["notes"].append({"rungs": rungs, "stringers": stringers,
                        "belt_span_offsets_s": [0.053, 0.088]})

bpy.context.view_layer.update()

def wbb(o):
    ws = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return ([round(min(v[i] for v in ws), 4) for i in range(3)],
            [round(max(v[i] for v in ws), 4) for i in range(3)])

report["bbox"] = {n: wbb(bpy.data.objects[n]) for n in
                  ("DRIVE_Belt", "DRIVE_Pulley_Roller", "DRIVE_Pulley_Motor",
                   "DRIVE_Guard_Slats", "DRIVE_Guard_Rim")}
print('@@@' + json.dumps(report) + '@@@')

prefs = bpy.context.preferences.filepaths
sv = prefs.save_version; prefs.save_version = 0
try:
    bpy.ops.wm.save_mainfile()
finally:
    prefs.save_version = sv
print("SAVED")
