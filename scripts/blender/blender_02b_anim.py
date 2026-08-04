"""Fix and apply ST10 animations — push cylinder, swing arm, puck, LED."""
from blender_bridge import run_script

run_script("""
import bpy
import math

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 120
scene.render.fps = 30

def make_cyclic(obj):
    if obj.animation_data and obj.animation_data.action:
        action = obj.animation_data.action
        # Access fcurves from the action
        for fc in action.fcurves:
            mod = fc.modifiers.new(type='CYCLES')

# ── Push Cylinder ──
push = bpy.data.objects.get('ST10_Push_Body')
if push:
    push.animation_data_clear()
    bl = list(push.location)
    
    push.location = (bl[0], bl[1], bl[2])
    push.keyframe_insert(data_path='location', frame=1)
    push.keyframe_insert(data_path='location', frame=15)
    
    push.location = (bl[0], bl[1] - 0.12, bl[2])
    push.keyframe_insert(data_path='location', frame=30)
    
    push.location = (bl[0], bl[1], bl[2])
    push.keyframe_insert(data_path='location', frame=45)
    push.keyframe_insert(data_path='location', frame=120)
    
    make_cyclic(push)
    print(f"Push animated: rest={bl}")

# ── Swing Arm ──
arm = bpy.data.objects.get('ST10_Arm_Pivot')
if arm:
    arm.animation_data_clear()
    
    arm.rotation_euler = (0, 0, 0)
    arm.keyframe_insert(data_path='rotation_euler', frame=1)
    arm.keyframe_insert(data_path='rotation_euler', frame=45)
    
    arm.rotation_euler = (0, 0, -math.pi/2)
    arm.keyframe_insert(data_path='rotation_euler', frame=75)
    arm.keyframe_insert(data_path='rotation_euler', frame=90)
    
    arm.rotation_euler = (0, 0, 0)
    arm.keyframe_insert(data_path='rotation_euler', frame=110)
    arm.keyframe_insert(data_path='rotation_euler', frame=120)
    
    make_cyclic(arm)
    print("Arm animated")

# ── Puck (workpiece) ──
puck = bpy.data.objects.get('ST10_Puck')
if puck:
    puck.animation_data_clear()
    bl = list(puck.location)
    
    puck.location = (bl[0], bl[1], bl[2])
    puck.keyframe_insert(data_path='location', frame=1)
    
    puck.location = (bl[0], bl[1] - 0.10, bl[2])
    puck.keyframe_insert(data_path='location', frame=30)
    
    puck.location = (-0.15, 0.18, 0.735)
    puck.keyframe_insert(data_path='location', frame=75)
    
    puck.location = (-0.15, 0.18, 0.72)
    puck.keyframe_insert(data_path='location', frame=85)
    
    puck.location = (-0.15, 0.30, 0.72)
    puck.keyframe_insert(data_path='location', frame=100)
    
    puck.location = (bl[0], bl[1], bl[2])
    puck.keyframe_insert(data_path='location', frame=110)
    puck.keyframe_insert(data_path='location', frame=120)
    
    make_cyclic(puck)
    print(f"Puck animated: base={bl}")

print("All ST10 animations applied!")
""")
