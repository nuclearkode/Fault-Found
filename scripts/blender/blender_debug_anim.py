"""Debug: Check Blender version and Action API"""
from blender_bridge import run_script

run_script("""
import bpy

print(f"Blender version: {bpy.app.version_string}")

# Create a test animation and inspect the action
bpy.ops.mesh.primitive_cube_add(size=0.001, location=(100, 100, 100))
test = bpy.context.active_object
test.name = '_anim_test'
test.keyframe_insert(data_path='location', frame=1)
test.location = (100, 100, 101)
test.keyframe_insert(data_path='location', frame=10)

action = test.animation_data.action
print(f"Action type: {type(action)}")
print(f"Action dir: {[x for x in dir(action) if 'curve' in x.lower()]}")

# Try different ways to access fcurves
try:
    print(f"action.fcurves: {action.fcurves}")
except Exception as e:
    print(f"action.fcurves failed: {e}")

try:
    print(f"action.fcurves type: {type(action.fcurves)}")
except Exception as e:
    print(f"type failed: {e}")

# Clean up
bpy.data.objects.remove(test, do_unlink=True)
""")
