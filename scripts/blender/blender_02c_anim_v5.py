"""ST10 Animations — compatible with Blender 5.x layered action API."""
from blender_bridge import run_script

run_script("""
import bpy
import math

scene = bpy.context.scene
scene.frame_start = 1
scene.frame_end = 120
scene.render.fps = 30

def make_cyclic(obj):
    '''Add CYCLES modifier to all fcurves (Blender 5.x path).'''
    if not obj.animation_data or not obj.animation_data.action:
        return
    action = obj.animation_data.action
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in bag.fcurves:
                    fc.modifiers.new(type='CYCLES')

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
    print("Push cylinder animated")

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
    print("Swing arm animated")

# ── Puck (workpiece) ──
puck = bpy.data.objects.get('ST10_Puck')
if puck:
    puck.animation_data_clear()
    bl = list(puck.location)
    
    # At magazine
    puck.location = (bl[0], bl[1], bl[2])
    puck.keyframe_insert(data_path='location', frame=1)
    
    # Pushed out by cylinder
    puck.location = (bl[0], bl[1] - 0.10, bl[2])
    puck.keyframe_insert(data_path='location', frame=30)
    
    # Picked up, carried to belt
    puck.location = (-0.15, 0.18, 0.735)
    puck.keyframe_insert(data_path='location', frame=75)
    
    # Dropped onto belt
    puck.location = (-0.15, 0.18, 0.72)
    puck.keyframe_insert(data_path='location', frame=85)
    
    # Slides along belt
    puck.location = (-0.15, 0.32, 0.72)
    puck.keyframe_insert(data_path='location', frame=100)
    
    # Reset back to magazine
    puck.location = (bl[0], bl[1], bl[2])
    puck.keyframe_insert(data_path='location', frame=110)
    puck.keyframe_insert(data_path='location', frame=120)
    
    make_cyclic(puck)
    print("Puck animated")

# ── Belt Rollers (continuous spin) ──
for rname in ['ST10_Belt_Roller_Front', 'ST10_Belt_Roller_Back']:
    roller = bpy.data.objects.get(rname)
    if roller:
        roller.animation_data_clear()
        roller.rotation_euler = (0, 0, roller.rotation_euler[2])
        roller.keyframe_insert(data_path='rotation_euler', frame=1)
        roller.rotation_euler = (math.pi * 4, 0, roller.rotation_euler[2])
        roller.keyframe_insert(data_path='rotation_euler', frame=120)
        make_cyclic(roller)
        print(f"{rname} spinning")

print("\\nAll ST10 animations complete!")
""")
