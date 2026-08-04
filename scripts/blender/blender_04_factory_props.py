"""
Build Factory Props: PLC Panels, Workbench, Shelving, MCC, Breaker
FIXED FOR BLENDER COORDINATES (Z is UP, Y is DEPTH)
"""
from blender_bridge import run_script

run_script("""
import bpy
import math

factory = bpy.data.objects.get('Factory_Environment')

def mat(name, color, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.get(name)
    if not m:
        m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            n.inputs['Base Color'].default_value = color
            n.inputs['Metallic'].default_value = metallic
            n.inputs['Roughness'].default_value = roughness
            break
    return m

mat('plc_panel_grey', (0.55, 0.55, 0.58, 1), 0.4, 0.5)
mat('workbench_wood', (0.45, 0.35, 0.22, 1), 0.0, 0.8)
mat('shelving_metal', (0.4, 0.42, 0.45, 1), 0.7, 0.4)
mat('mcc_grey', (0.45, 0.45, 0.48, 1), 0.5, 0.45)
mat('breaker_dark', (0.15, 0.15, 0.18, 1), 0.4, 0.5)
mat('danger_label', (0.85, 0.15, 0.1, 1), 0.0, 0.6)

def add_box(name, loc, scale, mat_name, parent=factory):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.parent = parent
    m = bpy.data.materials.get(mat_name)
    if m: obj.data.materials.append(m)
    return obj

# PLC Panel 1
# loc: (x, y, z) -> scale: (x, y, z)
add_box('PLC_Panel_1', (7, -9.2, 1), (1.2, 0.4, 1.8), 'plc_panel_grey')
add_box('PLC1_Handle', (7.55, -9.0, 1.1), (0.03, 0.02, 0.15), 'metal_dark')
for i, c in enumerate(['led_green', 'led_amber', 'led_red']):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.02, depth=0.01, vertices=8, location=(6.6, -9.0, 1.6-i*0.15))
    led = bpy.context.active_object
    led.name = f'PLC1_LED_{i}'
    led.rotation_euler = (math.pi/2, 0, 0) # point towards +Y
    led.parent = factory
    m = bpy.data.materials.get(c)
    if m: led.data.materials.append(m)

# PLC Panel 2
add_box('PLC_Panel_2', (10, -9.2, 1), (1.2, 0.4, 1.8), 'plc_panel_grey')
add_box('PLC2_Handle', (10.55, -9.0, 1.1), (0.03, 0.02, 0.15), 'metal_dark')

# Workbench
add_box('Workbench_Top', (8, -6.5, 0.9), (2.0, 0.8, 0.06), 'workbench_wood')
for dx, dy in [(-0.9,-0.35), (0.9,-0.35), (-0.9,0.35), (0.9,0.35)]:
    add_box(f'Bench_Leg_{dx}_{dy}', (8+dx, -6.5+dy, 0.45), (0.05, 0.05, 0.9), 'metal_dark')
add_box('Pegboard', (8, -9.0, 1.5), (1.8, 0.02, 1.0), 'workbench_wood')

# Shelving
sx, sy = 13, -7
for i in range(4):
    add_box(f'Shelf_{i}', (sx, sy, 0.3+i*0.6), (1.0, 0.5, 0.04), 'shelving_metal')
for dx in [-0.48, 0.48]:
    add_box(f'Shelf_Upright_{dx}', (sx+dx, sy, 1.2), (0.04, 0.04, 2.4), 'shelving_metal')

# MCC
add_box('MCC_Body', (13.2, -1, 1.0), (0.8, 1.5, 2.0), 'mcc_grey')
for i in range(3):
    add_box(f'MCC_Door_{i}', (12.8, -1, 0.5+i*0.6), (0.02, 0.4, 0.5), 'mcc_grey')
add_box('MCC_Danger', (12.78, -1, 1.5), (0.01, 0.3, 0.15), 'danger_label')

# Breaker
add_box('Breaker_Panel', (-14.5, -5, 1.6), (0.15, 0.8, 1.2), 'breaker_dark')
add_box('Breaker_Handle', (-14.35, -5, 1.6), (0.05, 0.06, 0.3), 'led_red')
add_box('Breaker_Danger', (-14.35, -5, 2.0), (0.01, 0.25, 0.12), 'danger_label')

print("Props complete!")
""")
