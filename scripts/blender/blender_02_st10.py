"""
Phase 2: Build realistic ST10 — Distributing Station mechanical components.

Adds: valve terminal, pneumatic tubing, LED tower, belt with rollers,
suction cup detail, push cylinder rod, belt motor, sensors, E-stop mushroom.
Then animates the push cylinder and swing arm over a 4-second cycle.
"""
from blender_bridge import run_script

# ─── Part A: Add mechanical detail meshes ───
run_script("""
import bpy
import math

st10 = bpy.data.objects['ST10']

def make_mesh(name, mesh_fn, location, material_name, parent=None):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    if parent:
        obj.parent = parent
    mat = bpy.data.materials.get(material_name)
    if mat:
        obj.data.materials.append(mat)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mesh_fn(obj)
    obj.select_set(False)
    return obj

def add_cube(obj, sx, sy, sz):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.primitive_cube_add(size=1)
    bpy.ops.transform.resize(value=(sx, sy, sz))
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)

def add_cylinder(obj, radius, depth, segments=16):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=segments)
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.select_set(False)

# ── Valve Terminal (pneumatic manifold block) ──
bpy.ops.mesh.primitive_cube_add(size=1, location=(0.25, 0.20, 0.72))
valve = bpy.context.active_object
valve.name = 'ST10_Valve_Terminal'
valve.scale = (0.08, 0.05, 0.03)
valve.parent = st10
mat = bpy.data.materials.get('festo_blue')
if mat: valve.data.materials.append(mat)

# Valve solenoid indicators (3 small cubes on top)
for i in range(3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.25, 0.175 + i*0.025, 0.745))
    sol = bpy.context.active_object
    sol.name = f'ST10_Solenoid_{i}'
    sol.scale = (0.012, 0.008, 0.008)
    sol.parent = st10
    m = bpy.data.materials.get('sensor_housing')
    if m: sol.data.materials.append(m)

# ── Pneumatic tubing runs ──
# Tube from valve to push cylinder
bpy.ops.mesh.primitive_cylinder_add(radius=0.003, depth=0.35, vertices=8,
    location=(0.20, 0.10, 0.73))
tube1 = bpy.context.active_object
tube1.name = 'ST10_Tube_1'
tube1.rotation_euler = (math.pi/2, 0, 0)
tube1.parent = st10
m = bpy.data.materials.get('pneumatic_tube')
if m: tube1.data.materials.append(m)

# Tube from valve to swing arm
bpy.ops.mesh.primitive_cylinder_add(radius=0.003, depth=0.30, vertices=8,
    location=(0.10, 0.10, 0.73))
tube2 = bpy.context.active_object
tube2.name = 'ST10_Tube_2'
tube2.rotation_euler = (math.pi/2, 0, math.pi/4)
tube2.parent = st10
m = bpy.data.materials.get('pneumatic_tube')
if m: tube2.data.materials.append(m)

# ── LED Signal Tower (3 tiers: green/amber/red) ──
tower_x, tower_y, tower_z = -0.28, -0.28, 0.70
# Tower pole
bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=0.15, vertices=8,
    location=(tower_x, tower_y, tower_z + 0.075))
pole = bpy.context.active_object
pole.name = 'ST10_Tower_Pole'
pole.parent = st10
m = bpy.data.materials.get('dark_steel')
if m: pole.data.materials.append(m)

# Tower base mount
bpy.ops.mesh.primitive_cube_add(size=1, location=(tower_x, tower_y, tower_z))
base = bpy.context.active_object
base.name = 'ST10_Tower_Base'
base.scale = (0.025, 0.025, 0.01)
base.parent = st10
m = bpy.data.materials.get('game_black')
if m: base.data.materials.append(m)

# LED segments
led_colors = [('led_green', 0.04), ('led_amber', 0.08), ('led_red', 0.12)]
for mat_name, z_off in led_colors:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=0.03, vertices=12,
        location=(tower_x, tower_y, tower_z + z_off))
    led = bpy.context.active_object
    led.name = f'ST10_LED_{mat_name.split("_")[1].title()}'
    led.parent = st10
    m = bpy.data.materials.get(mat_name)
    if m: led.data.materials.append(m)

# ── Belt Module (short conveyor) ──
belt_x, belt_y, belt_z = -0.15, 0.18, 0.70

# Belt surface
bpy.ops.mesh.primitive_cube_add(size=1, location=(belt_x, belt_y, belt_z + 0.01))
belt_surf = bpy.context.active_object
belt_surf.name = 'ST10_Belt_Surface'
belt_surf.scale = (0.06, 0.15, 0.005)
belt_surf.parent = st10
m = bpy.data.materials.get('belt')
if m: belt_surf.data.materials.append(m)

# Belt side rails
for s in [-1, 1]:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(belt_x + s*0.065, belt_y, belt_z + 0.02))
    rail = bpy.context.active_object
    rail.name = f'ST10_Belt_Rail_{"L" if s<0 else "R"}'
    rail.scale = (0.005, 0.15, 0.015)
    rail.parent = st10
    m = bpy.data.materials.get('brushed_aluminum')
    if m: rail.data.materials.append(m)

# Belt rollers (ends)
for end in [-1, 1]:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=0.12, vertices=12,
        location=(belt_x, belt_y + end*0.14, belt_z))
    roller = bpy.context.active_object
    roller.name = f'ST10_Belt_Roller_{"Front" if end<0 else "Back"}'
    roller.rotation_euler = (0, 0, math.pi/2)
    roller.parent = st10
    m = bpy.data.materials.get('stainless_steel')
    if m: roller.data.materials.append(m)

# Belt motor housing
bpy.ops.mesh.primitive_cube_add(size=1, location=(belt_x - 0.08, belt_y - 0.12, belt_z - 0.02))
motor = bpy.context.active_object
motor.name = 'ST10_Belt_Motor'
motor.scale = (0.03, 0.04, 0.03)
motor.parent = st10
m = bpy.data.materials.get('dark_steel')
if m: motor.data.materials.append(m)

# ── Belt sensors (photoelectric, through-beam pair) ──
for s, suffix in [(-1, 'TX'), (1, 'RX')]:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(belt_x + s*0.07, belt_y + 0.08, belt_z + 0.035))
    sensor = bpy.context.active_object
    sensor.name = f'ST10_Belt_Sensor_{suffix}'
    sensor.scale = (0.01, 0.012, 0.015)
    sensor.parent = st10
    m = bpy.data.materials.get('sensor_housing')
    if m: sensor.data.materials.append(m)

# ── E-Stop Mushroom Button ──
bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=0.015, vertices=16,
    location=(0.28, -0.35, 0.53))
estop = bpy.context.active_object
estop.name = 'ST10_EStop_Head'
estop.parent = st10
m = bpy.data.materials.get('btn_red')
if m: estop.data.materials.append(m)

# E-stop collar
bpy.ops.mesh.primitive_cylinder_add(radius=0.018, depth=0.01, vertices=16,
    location=(0.28, -0.35, 0.52))
collar = bpy.context.active_object
collar.name = 'ST10_EStop_Collar'
collar.parent = st10
m = bpy.data.materials.get('safety_yellow')
if m: collar.data.materials.append(m)

# ── Suction cup detail at end of arm ──
arm_beam = bpy.data.objects.get('ST10_Arm_Beam')
if arm_beam:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=0.025, vertices=12,
        location=(0, 0.10, -0.01))
    cup = bpy.context.active_object
    cup.name = 'ST10_Suction_Cup'
    cup.parent = arm_beam
    m = bpy.data.materials.get('game_black')
    if m: cup.data.materials.append(m)

    # Vacuum generator (small box on arm)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.04, 0.015))
    vac = bpy.context.active_object
    vac.name = 'ST10_Vacuum_Gen'
    vac.scale = (0.01, 0.025, 0.01)
    vac.parent = arm_beam
    m = bpy.data.materials.get('festo_blue')
    if m: vac.data.materials.append(m)

# ── Push cylinder rod (visible piston rod) ──
push_body = bpy.data.objects.get('ST10_Push_Body')
if push_body:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.006, depth=0.10, vertices=8,
        location=(0, -0.06, 0))
    rod = bpy.context.active_object
    rod.name = 'ST10_Push_Rod'
    rod.rotation_euler = (math.pi/2, 0, 0)
    rod.parent = push_body
    m = bpy.data.materials.get('stainless_steel')
    if m: rod.data.materials.append(m)

print("ST10 mechanical detail complete!")
""")

print("\\n--- Now adding animations ---")

# ─── Part B: Keyframe Animations ───
run_script("""
import bpy
import math

# Set up scene for animation
scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 120  # 4 seconds at 30fps
scene.render.fps = 30

# ── Animate ST10 Push Cylinder ──
# The push body slides along Y to push workpiece out of magazine
push = bpy.data.objects.get('ST10_Push_Body')
if push:
    push.animation_data_clear()
    push.keyframe_insert(data_path='location', frame=1)

    # Rest position
    base_loc = list(push.location)

    # Frame 1-15: at rest
    push.location = (base_loc[0], base_loc[1], base_loc[2])
    push.keyframe_insert(data_path='location', frame=1)

    # Frame 15-30: extend (push workpiece out)
    push.location = (base_loc[0], base_loc[1] - 0.12, base_loc[2])
    push.keyframe_insert(data_path='location', frame=30)

    # Frame 30-45: retract
    push.location = (base_loc[0], base_loc[1], base_loc[2])
    push.keyframe_insert(data_path='location', frame=45)

    # Frame 45-120: wait for arm cycle
    push.keyframe_insert(data_path='location', frame=120)

    # Make animation cyclic
    if push.animation_data and push.animation_data.action:
        for fc in push.animation_data.action.fcurves:
            mod = fc.modifiers.new(type='CYCLES')

    print("Push cylinder animated")

# ── Animate ST10 Swing Arm ──
arm_pivot = bpy.data.objects.get('ST10_Arm_Pivot')
if arm_pivot:
    arm_pivot.animation_data_clear()
    base_rot = list(arm_pivot.rotation_euler)

    # Frame 1-45: arm at pickup position (over magazine)
    arm_pivot.rotation_euler = (base_rot[0], base_rot[1], 0)
    arm_pivot.keyframe_insert(data_path='rotation_euler', frame=1)
    arm_pivot.keyframe_insert(data_path='rotation_euler', frame=45)

    # Frame 45-75: swing 90 degrees to belt
    arm_pivot.rotation_euler = (base_rot[0], base_rot[1], -math.pi/2)
    arm_pivot.keyframe_insert(data_path='rotation_euler', frame=75)

    # Frame 75-90: hold at belt (release workpiece)
    arm_pivot.keyframe_insert(data_path='rotation_euler', frame=90)

    # Frame 90-110: swing back
    arm_pivot.rotation_euler = (base_rot[0], base_rot[1], 0)
    arm_pivot.keyframe_insert(data_path='rotation_euler', frame=110)

    # Hold at rest
    arm_pivot.keyframe_insert(data_path='rotation_euler', frame=120)

    # Make cyclic
    if arm_pivot.animation_data and arm_pivot.animation_data.action:
        for fc in arm_pivot.animation_data.action.fcurves:
            mod = fc.modifiers.new(type='CYCLES')

    print("Swing arm animated")

# ── Animate ST10 Puck (workpiece follows arm after pickup) ──
puck = bpy.data.objects.get('ST10_Puck')
if puck:
    puck.animation_data_clear()
    base_loc = list(puck.location)

    # Frame 1-30: puck at magazine bottom (gets pushed)
    puck.location = (base_loc[0], base_loc[1], base_loc[2])
    puck.keyframe_insert(data_path='location', frame=1)

    # Frame 30: pushed to pickup point
    puck.location = (base_loc[0], base_loc[1] - 0.10, base_loc[2])
    puck.keyframe_insert(data_path='location', frame=30)

    # Frame 45-75: move with arm to belt area
    puck.location = (-0.15, 0.18, 0.735)
    puck.keyframe_insert(data_path='location', frame=75)

    # Frame 75-85: drop onto belt
    puck.location = (-0.15, 0.18, 0.72)
    puck.keyframe_insert(data_path='location', frame=85)

    # Frame 85-100: slide along belt
    puck.location = (-0.15, 0.30, 0.72)
    puck.keyframe_insert(data_path='location', frame=100)

    # Frame 105-120: teleport back to magazine (reset)
    puck.location = (base_loc[0], base_loc[1], base_loc[2])
    puck.keyframe_insert(data_path='location', frame=110)
    puck.keyframe_insert(data_path='location', frame=120)

    # Make cyclic
    if puck.animation_data and puck.animation_data.action:
        for fc in puck.animation_data.action.fcurves:
            mod = fc.modifiers.new(type='CYCLES')

    print("Puck animated")

# ── Animate LED tower (blink pattern) ──
led_green = bpy.data.objects.get('ST10_LED_Green')
if led_green and led_green.active_material:
    mat = led_green.active_material
    mat.use_nodes = True
    bsdf = None
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            bsdf = n
            break
    if bsdf:
        # Green LED on during operation (frame 1-100), off during reset
        bsdf.inputs['Emission Strength'].default_value = 5.0
        bsdf.inputs['Emission Strength'].keyframe_insert(data_path='default_value', frame=1)
        bsdf.inputs['Emission Strength'].keyframe_insert(data_path='default_value', frame=100)

        bsdf.inputs['Emission Strength'].default_value = 0.2
        bsdf.inputs['Emission Strength'].keyframe_insert(data_path='default_value', frame=105)
        bsdf.inputs['Emission Strength'].keyframe_insert(data_path='default_value', frame=115)

        bsdf.inputs['Emission Strength'].default_value = 5.0
        bsdf.inputs['Emission Strength'].keyframe_insert(data_path='default_value', frame=120)

        print("LED green animated")

print("\\nAll ST10 animations complete!")
""")
