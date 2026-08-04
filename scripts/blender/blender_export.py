"""Export the current Blender scene as GLB for the game."""
from blender_bridge import run_script

run_script("""
import bpy
import os

# Export path — into the game's public folder
export_path = r'C:/Users/musta/OneDrive/Desktop/Kode/fault-found/public/models/factory_line.glb'

# Ensure directory exists
os.makedirs(os.path.dirname(export_path), exist_ok=True)

# Export as GLB with animations
bpy.ops.export_scene.gltf(
    filepath=export_path,
    export_format='GLB',
    export_animations=True,
    export_apply=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
)

print(f"Exported to: {export_path}")
file_size = os.path.getsize(export_path)
print(f"File size: {file_size / 1024:.1f} KB")
""")
