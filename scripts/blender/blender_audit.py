"""Audit the full Blender scene — list all top-level objects + hierarchy."""
from blender_bridge import run_script

run_script("""
import bpy
import json

# Get all collections
print("=== COLLECTIONS ===")
for col in bpy.data.collections:
    print(f"  {col.name}: {len(col.objects)} objects")

print()
print("=== TOP-LEVEL EMPTIES (Station roots) ===")
for obj in bpy.data.objects:
    if obj.type == 'EMPTY' and obj.parent is None:
        children = [c.name for c in obj.children]
        print(f"  {obj.name} @ {list(obj.location)[:3]}")
        print(f"    Children ({len(children)}): {children[:10]}{'...' if len(children)>10 else ''}")

print()
print("=== ALL MATERIALS ===")
for mat in bpy.data.materials:
    print(f"  {mat.name}")

print()
print("=== OBJECT TYPE COUNTS ===")
types = {}
for obj in bpy.data.objects:
    types[obj.type] = types.get(obj.type, 0) + 1
for t, c in sorted(types.items()):
    print(f"  {t}: {c}")
""")
