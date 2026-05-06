"""
Export the Factory Environment
"""
from blender_bridge import run_script

run_script("""
import bpy
import os

# Select only the Factory_Environment and its children
bpy.ops.object.select_all(action='DESELECT')
env = bpy.data.objects.get('Factory_Environment')
if env:
    env.select_set(True)
    for child in env.children_recursive:
        child.select_set(True)

# Export path
export_path = r'C:/Users/musta/OneDrive/Desktop/Kode/fault-found/public/models/factory_env.glb'

bpy.ops.export_scene.gltf(
    filepath=export_path,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
)

print(f"Exported to: {export_path}")
file_size = os.path.getsize(export_path)
print(f"File size: {file_size / 1024:.1f} KB")
""")
