"""
Add Lighting to the Blender Scene
"""
from blender_bridge import run_script

run_script("""
import bpy
import math

# Clear existing lights
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type == 'LIGHT':
        obj.select_set(True)
bpy.ops.object.delete()

# Set world background (ambient light)
world = bpy.data.worlds['World']
world.use_nodes = True
bg_node = world.node_tree.nodes.get('Background')
if bg_node:
    bg_node.inputs['Color'].default_value = (0.05, 0.05, 0.055, 1) # Dim ambient
    bg_node.inputs['Strength'].default_value = 1.0

factory = bpy.data.objects.get('Factory_Environment')

# Add a strong Sun light
bpy.ops.object.light_add(type='SUN', radius=1, align='WORLD', location=(10, -10, 20))
sun = bpy.context.active_object
sun.name = "Sun_Light"
sun.data.energy = 5.0
sun.data.color = (1.0, 0.95, 0.9)
# Angle it to shine through the factory diagonally
sun.rotation_euler = (math.radians(45), math.radians(0), math.radians(45))
if factory:
    sun.parent = factory

# Add overhead Area lights (like the fluorescent tubes)
W, D, H = 30, 20, 5
for j in range(4):
    y = -D/2 + 2.5 + j*5
    for x in [-10, 0, 10]:
        bpy.ops.object.light_add(type='AREA', align='WORLD', location=(x, y, H - 0.5))
        area = bpy.context.active_object
        area.name = f"AreaLight_{j}_{x}"
        area.data.shape = 'RECTANGLE'
        area.data.size = 5.0
        area.data.size_y = 1.0
        area.data.energy = 500.0  # Bright for interior
        area.data.color = (0.9, 0.95, 1.0)
        # Point straight down
        area.rotation_euler = (0, 0, 0)
        if factory:
            area.parent = factory

# Also enable Eevee features for better preview
bpy.context.scene.render.engine = 'BLENDER_EEVEE'
try:
    bpy.context.scene.eevee.use_gtao = True
    bpy.context.scene.eevee.use_bloom = True
    bpy.context.scene.eevee.use_ssr = True
except:
    pass

print("Added lights to Blender scene!")
""")
