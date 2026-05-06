"""
Build Supervisor Office (Mezzanine and Stairs)
FIXED FOR BLENDER COORDINATES (Z is UP, Y is DEPTH)
"""
from blender_bridge import run_script

run_script("""
import bpy
import math

factory = bpy.data.objects.get('Factory_Environment')

def mat(name, color, metallic=0.0, roughness=0.5, alpha=1.0):
    m = bpy.data.materials.get(name)
    if not m:
        m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    m.blend_method = 'BLEND' if alpha < 1.0 else 'OPAQUE'
    
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            n.inputs['Base Color'].default_value = color
            n.inputs['Metallic'].default_value = metallic
            n.inputs['Roughness'].default_value = roughness
            n.inputs['Alpha'].default_value = alpha
            if alpha < 1.0:
                try: n.inputs['Transmission Weight'].default_value = 0.85
                except: 
                    try: n.inputs['Transmission'].default_value = 0.85
                    except: pass
                n.inputs['IOR'].default_value = 1.5
            break
    return m

mat('office_wall', (0.85, 0.83, 0.80, 1), 0.05, 0.7)
mat('office_floor', (0.35, 0.30, 0.25, 1), 0.0, 0.8)
mat('stair_metal', (0.35, 0.35, 0.38, 1), 0.8, 0.35)
mat('railing_metal', (0.45, 0.45, 0.48, 1), 0.7, 0.4)
mat('office_glass', (0.7, 0.8, 0.9, 1), 0.0, 0.05, alpha=0.2)
mat('desk_wood', (0.4, 0.28, 0.15, 1), 0.0, 0.75)
mat('game_black', (0.1, 0.1, 0.1, 1), 0.1, 0.8)
mat('game_screen', (0.8, 0.9, 1.0, 1), 0.0, 0.2) 
mat('game_white', (0.9, 0.9, 0.9, 1), 0.0, 0.9)

def add_box(name, loc, scale, mat_name, parent=factory):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.parent = parent
    m = bpy.data.materials.get(mat_name)
    if m: obj.data.materials.append(m)
    return obj

ox, oy = 6, 8

# Office structure
# loc=(x, y, z) scale=(x, y, z)
add_box('Office_Floor', (ox, oy, 3.0), (6, 4, 0.15), 'office_floor')
add_box('Office_Wall_Back', (ox, oy+2, 3.75), (6, 0.15, 1.5), 'office_wall')
add_box('Office_Wall_Left', (ox-3, oy, 3.75), (0.15, 4, 1.5), 'office_wall')
add_box('Office_Wall_Right', (ox+3, oy, 3.75), (0.15, 4, 1.5), 'office_wall')
add_box('Office_Glass_Front', (ox, oy-2, 3.75), (6, 0.05, 1.5), 'office_glass')
add_box('Office_Door', (ox-2.5, oy-2, 3.75), (0.8, 0.06, 1.5), 'stair_metal')

# Interior
add_box('Derek_Desk', (ox+1, oy, 3.45), (1.5, 0.7, 0.06), 'desk_wood')
for dx, dy in [(-0.7,-0.3), (0.7,-0.3), (-0.7,0.3), (0.7,0.3)]:
    add_box('Desk_Leg', (ox+1+dx, oy+dy, 3.22), (0.04, 0.04, 0.45), 'metal_dark')
add_box('Desk_Monitor', (ox+1, oy+0.1, 3.7), (0.5, 0.03, 0.35), 'game_black')
add_box('Desk_Screen', (ox+1, oy+0.085, 3.7), (0.46, 0.01, 0.31), 'game_screen')
add_box('Derek_Chair', (ox+1, oy-0.4, 3.35), (0.45, 0.45, 0.06), 'game_black')
add_box('Derek_Chair_Back', (ox+1, oy-0.6, 3.6), (0.45, 0.04, 0.5), 'game_black')
add_box('Whiteboard', (ox+2.9, oy+0.5, 3.8), (0.02, 1.2, 0.8), 'game_white')

# Stairs
scx, scy = ox-3, oy-0.5
ang = math.atan2(3.0, 4.0)
for side in [-1, 1]:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(scx, scy+side*0.5, 1.5))
    s = bpy.context.active_object
    s.name = f'Stair_Stringer_{side}'
    s.scale = (5.0, 0.15, 0.04) # (x, y, z)
    s.rotation_euler = (0, -ang, 0) # Rotate around Y
    s.parent = factory
    m = bpy.data.materials.get('stair_metal')
    if m: s.data.materials.append(m)

for i in range(10):
    t = i/9.0
    add_box(f'Stair_Tread_{i}', (scx-2.0+t*4.0, scy, 0.3+t*2.7), (0.4, 1.0, 0.03), 'stair_metal')

# Railings
for side in [-1, 1]:
    for i in range(5):
        t = i/4.0
        bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=1.0, vertices=8, location=(scx-2.0+t*4.0, scy+side*0.55, 0.3+t*2.7+0.5))
        p = bpy.context.active_object
        p.name = f'Rail_Post_{i}_{side}'
        p.rotation_euler = (math.pi/2, 0, 0) # align z up
        p.parent = factory
        m = bpy.data.materials.get('railing_metal')
        if m: p.data.materials.append(m)

for i in range(8):
    x = ox-3+i*0.85
    bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=1.0, vertices=8, location=(x, oy-2.1, 3.5))
    p = bpy.context.active_object
    p.name = f'Balc_Post_{i}'
    p.rotation_euler = (math.pi/2, 0, 0)
    p.parent = factory
    m = bpy.data.materials.get('railing_metal')
    if m: p.data.materials.append(m)
    
add_box('Balc_Rail', (ox, oy-2.1, 3.95), (6.5, 0.04, 0.04), 'railing_metal')

print("Office complete!")
""")
