"""
ST20 — Measuring Station: Linear guide rail, slide with workpiece, 
measurement arch with descending probe, colour sensor, pass/fail LEDs.
"""
from blender_bridge import run_script

run_script("""
import bpy
import math

st20 = bpy.data.objects.get('ST20')
if not st20:
    raise Exception("ST20 not found!")

def make_cyclic(obj):
    if not obj.animation_data or not obj.animation_data.action:
        return
    action = obj.animation_data.action
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    fc.modifiers.new(type='CYCLES')

# ── Linear Guide Rail ──
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.70))
rail = bpy.context.active_object
rail.name = 'ST20_Guide_Rail'
rail.scale = (0.03, 0.35, 0.015)
rail.parent = st20
m = bpy.data.materials.get('brushed_aluminum')
if m: rail.data.materials.append(m)

# Rail mounting blocks
for y in [-0.12, 0, 0.12]:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, y, 0.695))
    block = bpy.context.active_object
    block.name = f'ST20_Rail_Block_{y}'
    block.scale = (0.04, 0.025, 0.008)
    block.parent = st20
    m = bpy.data.materials.get('dark_steel')
    if m: block.data.materials.append(m)

# ── Sliding Platform (animated) ──
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, -0.14, 0.725))
slide = bpy.context.active_object
slide.name = 'ST20_Slide'
slide.scale = (0.06, 0.04, 0.01)
slide.parent = st20
m = bpy.data.materials.get('dark_steel')
if m: slide.data.materials.append(m)

# Workpiece on slide
bpy.ops.mesh.primitive_cylinder_add(radius=0.02, depth=0.022, vertices=16,
    location=(0, 0, 0.015))
wp = bpy.context.active_object
wp.name = 'ST20_Workpiece'
wp.parent = slide
m = bpy.data.materials.get('workpiece_red')
if m: wp.data.materials.append(m)

# ── Measurement Arch (T-slot frame) ──
arch_y = 0.08
# Left pillar
bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.06, arch_y, 0.88))
pL = bpy.context.active_object
pL.name = 'ST20_Arch_L'
pL.scale = (0.015, 0.015, 0.20)
pL.parent = st20
m = bpy.data.materials.get('game_trim')
if m: pL.data.materials.append(m)

# Right pillar
bpy.ops.mesh.primitive_cube_add(size=1, location=(0.06, arch_y, 0.88))
pR = bpy.context.active_object
pR.name = 'ST20_Arch_R'
pR.scale = (0.015, 0.015, 0.20)
pR.parent = st20
m = bpy.data.materials.get('game_trim')
if m: pR.data.materials.append(m)

# Crossbar
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, arch_y, 0.985))
cross = bpy.context.active_object
cross.name = 'ST20_Arch_Cross'
cross.scale = (0.075, 0.015, 0.015)
cross.parent = st20
m = bpy.data.materials.get('game_trim')
if m: cross.data.materials.append(m)

# ── Probe Assembly (animated — descends to measure) ──
# Pneumatic cylinder body
bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=0.06, vertices=10,
    location=(0, arch_y, 0.96))
pcyl = bpy.context.active_object
pcyl.name = 'ST20_Probe_Cylinder'
pcyl.parent = st20
m = bpy.data.materials.get('festo_blue')
if m: pcyl.data.materials.append(m)

# Probe tip (animated)
bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=0.10, vertices=8,
    location=(0, arch_y, 0.89))
probe = bpy.context.active_object
probe.name = 'ST20_Probe_Tip'
probe.parent = st20
m = bpy.data.materials.get('stainless_steel')
if m: probe.data.materials.append(m)

# ── Colour Sensor (bracket-mounted) ──
bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.08, -0.05, 0.745))
bracket = bpy.context.active_object
bracket.name = 'ST20_Sensor_Bracket'
bracket.scale = (0.008, 0.015, 0.03)
bracket.parent = st20
m = bpy.data.materials.get('dark_steel')
if m: bracket.data.materials.append(m)

bpy.ops.mesh.primitive_cube_add(size=1, location=(-0.08, -0.05, 0.76))
sensor = bpy.context.active_object
sensor.name = 'ST20_Colour_Sensor'
sensor.scale = (0.012, 0.012, 0.015)
sensor.parent = st20
m = bpy.data.materials.get('sensor_housing')
if m: sensor.data.materials.append(m)

# ── Pass/Fail LED Panel ──
bpy.ops.mesh.primitive_cube_add(size=1, location=(0.20, arch_y, 0.82))
panel = bpy.context.active_object
panel.name = 'ST20_LED_Panel'
panel.scale = (0.03, 0.015, 0.05)
panel.parent = st20
m = bpy.data.materials.get('game_black')
if m: panel.data.materials.append(m)

# Pass LED
bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=0.01, vertices=8,
    location=(0.215, arch_y, 0.835))
pass_led = bpy.context.active_object
pass_led.name = 'ST20_LED_Pass'
pass_led.rotation_euler = (0, math.pi/2, 0)
pass_led.parent = st20
m = bpy.data.materials.get('led_green')
if m: pass_led.data.materials.append(m)

# Fail LED  
bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=0.01, vertices=8,
    location=(0.215, arch_y, 0.805))
fail_led = bpy.context.active_object
fail_led.name = 'ST20_LED_Fail'
fail_led.rotation_euler = (0, math.pi/2, 0)
fail_led.parent = st20
m = bpy.data.materials.get('led_red')
if m: fail_led.data.materials.append(m)

# ── Valve Terminal ──
bpy.ops.mesh.primitive_cube_add(size=1, location=(0.25, -0.20, 0.72))
vt = bpy.context.active_object
vt.name = 'ST20_Valve_Terminal'
vt.scale = (0.04, 0.06, 0.025)
vt.parent = st20
m = bpy.data.materials.get('festo_blue')
if m: vt.data.materials.append(m)

# ── E-Stop ──
bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=0.015, vertices=16,
    location=(0.28, -0.35, 0.53))
es = bpy.context.active_object
es.name = 'ST20_EStop'
es.parent = st20
m = bpy.data.materials.get('btn_red')
if m: es.data.materials.append(m)

# ── LED Tower ──
for mat_name, z_off in [('led_green', 0.04), ('led_amber', 0.08), ('led_red', 0.12)]:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=0.03, vertices=12,
        location=(-0.28, -0.28, 0.70 + z_off))
    led = bpy.context.active_object
    led.name = f'ST20_Tower_{mat_name.split("_")[1].title()}'
    led.parent = st20
    m = bpy.data.materials.get(mat_name)
    if m: led.data.materials.append(m)

# Tower pole
bpy.ops.mesh.primitive_cylinder_add(radius=0.008, depth=0.15, vertices=8,
    location=(-0.28, -0.28, 0.775))
tp = bpy.context.active_object
tp.name = 'ST20_Tower_Pole'
tp.parent = st20
m = bpy.data.materials.get('dark_steel')
if m: tp.data.materials.append(m)

print("ST20 geometry complete!")

# ════════ ANIMATIONS ════════

# Slide: moves from Y=-0.14 to Y=0.14 and back (5s cycle = 150 frames)
slide = bpy.data.objects.get('ST20_Slide')
if slide:
    slide.animation_data_clear()
    bl = list(slide.location)
    
    slide.location = (bl[0], -0.14, bl[2])
    slide.keyframe_insert(data_path='location', frame=1)
    
    slide.location = (bl[0], 0.08, bl[2])
    slide.keyframe_insert(data_path='location', frame=45)
    
    # Hold under probe
    slide.keyframe_insert(data_path='location', frame=75)
    
    slide.location = (bl[0], -0.14, bl[2])
    slide.keyframe_insert(data_path='location', frame=110)
    slide.keyframe_insert(data_path='location', frame=120)
    
    make_cyclic(slide)
    print("Slide animated")

# Probe: descends when slide is under arch (frame 50-70)
probe = bpy.data.objects.get('ST20_Probe_Tip')
if probe:
    probe.animation_data_clear()
    bl = list(probe.location)
    
    probe.location = (bl[0], bl[1], 0.89)
    probe.keyframe_insert(data_path='location', frame=1)
    probe.keyframe_insert(data_path='location', frame=48)
    
    # Descend
    probe.location = (bl[0], bl[1], 0.78)
    probe.keyframe_insert(data_path='location', frame=58)
    
    # Hold (measuring)
    probe.keyframe_insert(data_path='location', frame=68)
    
    # Retract
    probe.location = (bl[0], bl[1], 0.89)
    probe.keyframe_insert(data_path='location', frame=78)
    probe.keyframe_insert(data_path='location', frame=120)
    
    make_cyclic(probe)
    print("Probe animated")

print("ST20 complete!")
""")
