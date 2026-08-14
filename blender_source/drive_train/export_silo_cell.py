import bpy, json

OUT = r"C:\Users\ahmed\Desktop\Fault Found\public\models\silo_cell.glb"

def subtree(root):
    out, stack = set(), [root]
    while stack:
        o = stack.pop()
        out.add(o.name)
        stack.extend(o.children)
    return out

worker = bpy.data.objects.get("Worker")
if worker is None:
    raise RuntimeError("no object named Worker — refusing to export blind")
excluded = subtree(worker)
print("EXCLUDING %d Worker objects: %s ..." % (len(excluded), sorted(excluded)[:8]))

bpy.ops.object.select_all(action='DESELECT')
sel = 0
active = None
for o in bpy.context.scene.objects:
    if o.name in excluded:
        continue
    if o.type in {'CAMERA', 'LIGHT'}:
        continue
    o.select_set(True)
    sel += 1
    if active is None:
        active = o
bpy.context.view_layer.objects.active = active
print("SELECTED", sel, "active:", active.name)

# sanity: nothing from the Worker may be selected
leaked = [o.name for o in bpy.context.scene.objects if o.select_get() and o.name in excluded]
if leaked:
    raise RuntimeError("Worker leaked into the selection: %s" % leaked)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_animations=False,
    export_apply=True,
    export_extras=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_yup=True,
)
print("EXPORTED", OUT)
