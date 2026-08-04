"""Blender 5.x Action API discovery"""
from blender_bridge import run_script

run_script("""
import bpy

# Check full Action attributes
bpy.ops.mesh.primitive_cube_add(size=0.001, location=(100, 100, 100))
test = bpy.context.active_object
test.name = '_test2'
test.keyframe_insert(data_path='location', frame=1)
test.location = (100, 100, 101)
test.keyframe_insert(data_path='location', frame=10)

action = test.animation_data.action
print("=== Action attributes ===")
for attr in sorted(dir(action)):
    if not attr.startswith('_'):
        try:
            val = getattr(action, attr)
            if not callable(val):
                print(f"  {attr} = {val}")
            else:
                print(f"  {attr}()")
        except:
            print(f"  {attr} = <error>")

# Check if fcurves are in layers/slots
print("\\n=== Checking slots/layers ===")
if hasattr(action, 'slots'):
    for slot in action.slots:
        print(f"  Slot: {slot.name}")
        for attr in dir(slot):
            if not attr.startswith('_') and 'curve' in attr.lower():
                print(f"    {attr}")

if hasattr(action, 'layers'):
    for layer in action.layers:
        print(f"  Layer: {layer.name}")
        if hasattr(layer, 'strips'):
            for strip in layer.strips:
                print(f"    Strip: {strip.name}, type: {type(strip)}")
                if hasattr(strip, 'channelbags'):
                    for bag in strip.channelbags:
                        print(f"      Channelbag: {bag}")
                        if hasattr(bag, 'fcurves'):
                            print(f"      FOUND fcurves: {bag.fcurves}")
                            for fc in bag.fcurves:
                                print(f"        fcurve: {fc.data_path} [{fc.array_index}]")

bpy.data.objects.remove(test, do_unlink=True)
""")
