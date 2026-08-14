"""Remove the conveyor drive train completely.

This is the whole reversibility promise in one file. Everything the feature adds
hangs off a single EMPTY named DRIVE_TRAIN, so deleting that subtree puts
silo_conveyor_cell.blend back to exactly what it was: 2611 nodes, 2604 meshes,
31 materials once re-exported. Nothing pre-existing was moved, renamed, merged
or deleted to make room for the drive train, which is why this works.

    blender --background blender_source/silo_conveyor_cell.blend \
            --python blender_source/drive_train/00_revert_drive_train.py
    blender --background blender_source/silo_conveyor_cell.blend \
            --python blender_source/drive_train/export_silo_cell.py
"""
import bpy, json

root = bpy.data.objects.get("DRIVE_TRAIN")
if root is None:
    print("@@@" + json.dumps({"removed": 0, "note": "no DRIVE_TRAIN present"}) + "@@@")
else:
    stack, doomed = [root], []
    while stack:
        o = stack.pop()
        doomed.append(o)
        stack.extend(o.children)

    # Delete objects first and only then their orphaned meshes. Removing a mesh
    # datablock takes its objects with it, which is an indirect way to delete
    # something you can name, and it hides mistakes.
    names = [o.name for o in doomed]
    data = [o.data for o in doomed if o.type == 'MESH']
    for o in doomed:
        bpy.data.objects.remove(o, do_unlink=True)
    for d in data:
        if d.users == 0:
            bpy.data.meshes.remove(d)

    left = [o.name for o in bpy.data.objects if o.name.startswith("DRIVE_")]
    print("@@@" + json.dumps({"removed": len(names), "names": sorted(names),
                              "leftover_DRIVE_objects": left}) + "@@@")

    prefs = bpy.context.preferences.filepaths
    sv = prefs.save_version
    prefs.save_version = 0
    try:
        bpy.ops.wm.save_mainfile()
    finally:
        prefs.save_version = sv
    print("SAVED")
