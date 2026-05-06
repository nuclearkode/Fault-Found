"""Get detailed ST10 hierarchy — every child object with type, dimensions, materials."""
from blender_bridge import run_script

run_script("""
import bpy

st10 = bpy.data.objects['ST10']
print(f"ST10 — {len(st10.children)} children")
print(f"{'Name':<30} {'Type':<8} {'Location':<35} {'Dimensions':<30} {'Material'}")
print("-" * 140)
for child in sorted(st10.children, key=lambda o: o.name):
    loc = f"({child.location.x:.3f}, {child.location.y:.3f}, {child.location.z:.3f})"
    dim = f"({child.dimensions.x:.3f}, {child.dimensions.y:.3f}, {child.dimensions.z:.3f})"
    mat = child.active_material.name if child.active_material else "—"
    print(f"  {child.name:<28} {child.type:<8} {loc:<35} {dim:<30} {mat}")
    # Show grandchildren
    for gc in child.children:
        gloc = f"({gc.location.x:.3f}, {gc.location.y:.3f}, {gc.location.z:.3f})"
        gdim = f"({gc.dimensions.x:.3f}, {gc.dimensions.y:.3f}, {gc.dimensions.z:.3f})"
        gmat = gc.active_material.name if gc.active_material else "—"
        print(f"    └─ {gc.name:<26} {gc.type:<8} {gloc:<35} {gdim:<30} {gmat}")
""")
