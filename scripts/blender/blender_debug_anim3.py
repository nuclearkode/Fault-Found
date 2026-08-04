"""Blender 5.x — raw dir dump to find fcurves path"""
from blender_bridge import run_script

run_script("""
import bpy

bpy.ops.mesh.primitive_cube_add(size=0.001, location=(100, 100, 100))
test = bpy.context.active_object
test.name = '_test3'
test.keyframe_insert(data_path='location', frame=1)
test.location = (100, 100, 101)
test.keyframe_insert(data_path='location', frame=10)

action = test.animation_data.action

# Dump layers
print(f"Layers: {len(action.layers)}")
for i, layer in enumerate(action.layers):
    print(f"  Layer[{i}] attrs: {[a for a in dir(layer) if not a.startswith('_')]}")
    if hasattr(layer, 'strips'):
        print(f"    Strips: {len(layer.strips)}")
        for j, strip in enumerate(layer.strips):
            print(f"    Strip[{j}] attrs: {[a for a in dir(strip) if not a.startswith('_')]}")
            if hasattr(strip, 'channelbags'):
                print(f"      Channelbags: {len(strip.channelbags)}")
                for k, bag in enumerate(strip.channelbags):
                    print(f"      Bag[{k}] attrs: {[a for a in dir(bag) if not a.startswith('_')]}")
                    if hasattr(bag, 'fcurves'):
                        print(f"        fcurves count: {len(bag.fcurves)}")
                        for fc in bag.fcurves:
                            print(f"        fc: {fc.data_path}[{fc.array_index}]")
                            print(f"          fc modifiers attrs: {[a for a in dir(fc.modifiers) if not a.startswith('_')]}")

bpy.data.objects.remove(test, do_unlink=True)
""")
