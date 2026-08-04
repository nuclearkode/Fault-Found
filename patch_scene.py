import bpy
import math

def setup_scene():
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 150
    
    # 1. Fix Cabinets
    for obj in bpy.data.objects:
        if "Cabinet" in obj.name:
            obj.dimensions = (0.35, 0.70, 0.80)
            obj.location.y = 0.0
            obj.location.z = 0.40
            obj.rotation_euler = (0, 0, 0)
        elif "Profile_Plate" in obj.name or "Plate_" in obj.name:
            obj.dimensions = (0.35, 0.70, 0.02)
            obj.location.y = 0.0
            obj.location.z = 0.81
            obj.rotation_euler = (0, 0, 0)

    # 2. Fix Rotary Arm at Distributing
    arm_pivot = bpy.data.objects.get("Rotary_Arm")
    arm_mesh = bpy.data.objects.get("Arm_Mesh")
    if not arm_pivot:
        # Create it if it doesn't exist
        bpy.ops.object.empty_add(type='ARROWS', radius=0.05, location=(0,0,0.95))
        arm_pivot = bpy.context.active_object
        arm_pivot.name = "Rotary_Arm"
        arm_pivot.parent = bpy.data.objects.get("Station_Distributing")
        
    arm_pivot.location = (0.0, 0.0, 0.95) # Pivot at 0, Z=0.95
    if arm_mesh:
        # arm goes from 0 to 0.35 => center at 0.175, length 0.35
        arm_mesh.dimensions = (0.35, 0.04, 0.02)
        arm_mesh.location = (0.175, 0.0, 0.0) # Local to pivot
        
    # 3. Fix Air Slide at Testing (from 0.85, 0.95 to 1.05, 0.90)
    slide = bpy.data.objects.get("AirSlide_Ramp")
    if slide:
        # Span X: 0.85 to 1.05 -> center at 0.95. Length = 0.20
        # Z: 0.95 to 0.90 -> center at 0.925. Drop = 0.05
        length = math.sqrt(0.20**2 + 0.05**2)
        angle = math.atan2(0.05, 0.20)
        slide.dimensions = (length, 0.1, 0.01)
        slide.location = (0.95, 0.0, 0.925)
        slide.rotation_euler = (0, angle, 0) # Slope down towards +X

    # 4. Fix Sorting Conveyor Gap (from 1.75 to 2.45)
    sort_belt = bpy.data.objects.get("Conveyor_Belt_Sort")
    sort_frame = bpy.data.objects.get("Conveyor_Frame")
    if sort_belt and sort_frame:
        sort_belt.dimensions = (0.70, 0.1, 0.01)
        sort_belt.location = (2.10, 0.0, 0.90)
        sort_frame.dimensions = (0.70, 0.12, 0.04)
        sort_frame.location = (2.10, 0.0, 0.88)

    # 5. Create Workpiece
    wp = bpy.data.objects.get("Animated_Workpiece")
    if wp:
        bpy.data.objects.remove(wp, do_unlink=True)
        
    bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=0.030)
    wp = bpy.context.active_object
    wp.name = "Animated_Workpiece"
    wp.parent = None
    
    # Material
    mat = bpy.data.materials.get("Mat_Workpiece_Red")
    if not mat:
        mat = bpy.data.materials.new(name="Mat_Workpiece_Red")
        mat.use_nodes = True
        mat.node_tree.nodes["Principled BSDF"].inputs[0].default_value = (0.8, 0.1, 0.05, 1.0)
    wp.data.materials.append(mat)
    
    # 6. Keyframe Choreography
    # Frame 1: inside magazine at X=0, Z=0.95
    def insert_kf(frame, x, y, z):
        bpy.context.scene.frame_set(frame)
        wp.location = (x, y, z)
        wp.keyframe_insert(data_path="location")
        
    # Sequence:
    # 1. Distributing Ejection (1-10) -> X=0.0 to X=0.1
    # 2. Rotary Arm swing (10-24) -> arc to X=0.35. We just approximate linear or arc via python.
    # To keep simple, let's just do linear keyframes since it says linear interpolation.
    
    # Setting interpolation to linear for workpiece
    wp.animation_data_create()
    
    # Keyframes:
    insert_kf(1,  0.00,  0.0, 0.95)   # Magazine
    insert_kf(10, 0.10,  0.0, 0.95)   # Ejected to pickup point
    
    # Rotary Arm Arc (approximate)
    insert_kf(17, 0.225, 0.15, 0.95)  # Mid arc
    insert_kf(24, 0.35,  0.0, 0.95)   # Drop off to Handling
    
    # Handling Gantry Picks
    insert_kf(30, 0.35,  0.0, 0.98)   # Gantry lifts Z
    insert_kf(40, 0.70,  0.0, 0.98)   # Gantry moves X
    insert_kf(48, 0.70,  0.0, 0.95)   # Gantry drops Z at Testing pickup
    
    # Testing Lift & Pusher
    insert_kf(55, 0.70,  0.0, 1.05)   # Lift platform goes up
    insert_kf(60, 0.70,  0.0, 0.95)   # Lift platform goes down
    insert_kf(65, 0.85,  0.0, 0.95)   # Pusher pushes workpiece to slide
    insert_kf(72, 1.05,  0.0, 0.90)   # Workpiece slides down to Buffering pickup
    
    # Buffering
    insert_kf(80, 1.05,  0.0, 0.90)   # Wait for separator
    insert_kf(96, 1.40,  0.0, 0.90)   # Buffer belt moves to Processing pickup
    
    # Processing Turntable
    insert_kf(105, 1.40, 0.15, 0.90)  # Turntable 90deg offset (approximate)
    insert_kf(115, 1.75, 0.0, 0.90)   # Ejected to Sorting pickup
    
    # Sorting
    insert_kf(130, 2.10, 0.0, 0.90)   # Conveyor moves to gate
    insert_kf(140, 2.10, 0.15, 0.88)  # Gate pushes into chute
    
    # Make all interpolation linear by default before inserting
    bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
    
    # Also keyframe the actuators to match this!
    def anim_obj(name, path, f1, v1, f2, v2, f3=None, v3=None):
        obj = bpy.data.objects.get(name)
        if obj:
            obj.animation_data_clear()
            bpy.context.scene.frame_set(f1); setattr(obj, path, v1); obj.keyframe_insert(data_path=path)
            bpy.context.scene.frame_set(f2); setattr(obj, path, v2); obj.keyframe_insert(data_path=path)
            if f3 and v3:
                bpy.context.scene.frame_set(f3); setattr(obj, path, v3); obj.keyframe_insert(data_path=path)
                    
    # Distributing
    anim_obj("Magazine_Pusher", "location", 1, (0,0,0), 10, (0.1,0,0), 20, (0,0,0))
    # Wait, Rotary_Arm is rotating around Z! It should go from 0 to -180 deg
    anim_obj("Rotary_Arm", "rotation_euler", 10, (0,0,0), 24, (0,0,-math.pi), 35, (0,0,0))
    
    # Return success
    return "Scene patched and animated successfully"

result = setup_scene()
print(result)
