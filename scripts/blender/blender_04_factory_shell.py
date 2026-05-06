"""
Build the FULL factory environment in Blender:
  - Factory floor (30m x 20m x 5m)
  - Walls, ceiling, columns
  - Ceiling beams, pipes, cable trays
  - Floor markings (safety yellow, hazard red)
  - Epoxy zones
  
FIXED FOR BLENDER COORDINATES: Z is UP, Y is DEPTH.
"""
from blender_bridge import run_script

run_script("""
import bpy
import math

# Cleanup existing environment if any
existing = bpy.data.objects.get('Factory_Environment')
if existing:
    bpy.ops.object.select_all(action='DESELECT')
    existing.select_set(True)
    for child in existing.children_recursive:
        child.select_set(True)
    bpy.ops.object.delete()

# ── Create materials ──
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

mat('floor_concrete', (0.54, 0.54, 0.54, 1), 0.05, 0.85)
mat('wall_cmu', (0.69, 0.67, 0.63, 1), 0.3, 0.8)
mat('wall_north', (0.25, 0.25, 0.28, 1), 0.3, 0.8)
mat('ceiling_steel', (0.60, 0.60, 0.60, 1), 0.1, 0.9)
mat('epoxy_green', (0.48, 0.54, 0.44, 1), 0.05, 0.7)
mat('epoxy_dark', (0.23, 0.23, 0.29, 1), 0.05, 0.7)
mat('epoxy_office', (0.33, 0.33, 0.37, 1), 0.05, 0.75)
mat('safety_yellow_line', (0.77, 0.66, 0.09, 1), 0.1, 0.6)
mat('hazard_red_line', (0.80, 0.20, 0.20, 1), 0.1, 0.6)
mat('column_steel', (0.33, 0.33, 0.37, 1), 0.6, 0.5)
mat('beam_steel', (0.35, 0.35, 0.37, 1), 0.7, 0.4)
mat('pipe_orange', (0.85, 0.45, 0.1, 1), 0.3, 0.5)
mat('cable_tray_grey', (0.4, 0.4, 0.42, 1), 0.6, 0.45)

# X=Width, Y=Depth, Z=Height
W, D, H, WALL = 30, 20, 5, 0.3

factory = bpy.data.objects.new('Factory_Environment', None)
bpy.context.collection.objects.link(factory)
factory.empty_display_type = 'CUBE'

def add_box(name, loc, scale, mat_name, parent=factory):
    # loc = (x, y, z)
    # scale = (size_x, size_y, size_z)
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.parent = parent
    m = bpy.data.materials.get(mat_name)
    if m: obj.data.materials.append(m)
    return obj

# Floor, Ceiling, Walls
add_box('Floor', (0, 0, -WALL/2), (W, D, WALL), 'floor_concrete')
add_box('Ceiling', (0, 0, H+WALL/2), (W, D, WALL), 'ceiling_steel')
# North wall is at -Y in Blender (matching -Z in Three.js)
add_box('Wall_North', (0, -(D/2+WALL/2), H/2), (W+WALL*2, WALL, H), 'wall_north')
add_box('Wall_South', (0, D/2+WALL/2, H/2), (W+WALL*2, WALL, H), 'wall_cmu')
add_box('Wall_West', (-(W/2+WALL/2), 0, H/2), (WALL, D, H), 'wall_cmu')
add_box('Wall_East', (W/2+WALL/2, 0, H/2), (WALL, D, H), 'wall_cmu')

# Epoxy zones
add_box('Epoxy_Production', (0, -4, 0.003), (12, 3, 0.005), 'epoxy_green')
add_box('Epoxy_Control', (10, -7.5, 0.003), (9, 5, 0.005), 'epoxy_dark')
add_box('Epoxy_Office', (8, 7, 0.003), (8, 6, 0.005), 'epoxy_office')
add_box('Epoxy_South', (0, 3, 0.003), (8, 3, 0.005), 'epoxy_green')

# Safety yellow lines
for i, (p, a) in enumerate([
    ((0, 0, 0.005), (0.1, D, 0.01)), 
    ((6, 0, 0.005), (0.1, D, 0.01)),
    ((-6, 0, 0.005), (0.1, D, 0.01)), 
    ((0, -2, 0.005), (W, 0.1, 0.01)),
    ((0, 5, 0.005), (W, 0.1, 0.01))
]):
    add_box(f'SafetyLine_{i}', p, a, 'safety_yellow_line')

# Hazard red
for i, (p, a) in enumerate([
    ((-13, -5, 0.005), (2, 2, 0.01)), 
    ((13, -1, 0.005), (2, 2, 0.01)),
    ((8.5, -8, 0.005), (8, 0.1, 0.01))
]):
    add_box(f'HazardLine_{i}', p, a, 'hazard_red_line')

# Columns
for x in [-W/2+2, W/2-2]:
    for j in range(4):
        y = -D/2+2.5+j*5
        add_box(f'Column_{int(x)}_{int(y)}', (x, y, H/2), (0.3, 0.3, H), 'column_steel')

# Ceiling beams E-W (running along X)
for j in range(4):
    y = -D/2+2.5+j*5
    add_box(f'Beam_EW_{j}', (0, y, H-0.15), (W, 0.15, 0.3), 'beam_steel')
# Ceiling beams N-S (running along Y)
add_box('Beam_NS_W', (-W/2+2, 0, H-0.15), (0.15, D, 0.3), 'beam_steel')
add_box('Beam_NS_E', (W/2-2, 0, H-0.15), (0.15, D, 0.3), 'beam_steel')

# Ceiling pipes (compressed air)
for i in range(3):
    y = -5+i*5
    bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=W-4, vertices=12, location=(0, y, H-0.5))
    p = bpy.context.active_object
    p.name = f'Pipe_Air_{i}'
    p.rotation_euler = (0, math.pi/2, 0) # Rotate along X axis
    p.parent = factory
    m = bpy.data.materials.get('pipe_orange')
    if m: p.data.materials.append(m)

# Cable trays
for xp, nm in [(5,'CableTray_E'), (-5,'CableTray_W')]:
    add_box(nm, (xp, 0, 4.2), (0.3, D-2, 0.08), 'cable_tray_grey')
    for s in [-1, 1]:
        add_box(f'{nm}_Lip_{s}', (xp+s*0.15, 0, 4.24), (0.02, D-2, 0.08), 'cable_tray_grey')

print("Factory shell complete!")
""")
