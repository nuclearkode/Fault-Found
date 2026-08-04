"""
Build the FULL factory environment in Blender:
  - Factory floor (30m x 20m x 5m)
  - Walls, ceiling, columns
  - Ceiling beams, pipes, cable trays
  - PLC panels, workbench, shelving
  - Breaker panel, MCC
  - Supervisor office (mezzanine with stairs)
  - Floor markings (safety yellow, hazard red)
  - Epoxy zones

All dimensions match the game's FactoryFloor.tsx exactly.
"""
from blender_bridge import run_script

# ═══════════════════════════════════════════════════════════════
# Part 1: Factory Shell — Floor, Walls, Ceiling
# ═══════════════════════════════════════════════════════════════
run_script("""
import bpy
import math

# ── Create new materials for the factory environment ──
def mat(name, color, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.get(name)
    if not m:
        m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    bsdf = None
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            bsdf = n
            break
    if bsdf:
        bsdf.inputs['Base Color'].default_value = color
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Roughness'].default_value = roughness
    return m

# Factory materials
mat('floor_concrete', (0.54, 0.54, 0.54, 1), metallic=0.05, roughness=0.85)
mat('wall_cmu', (0.69, 0.67, 0.63, 1), metallic=0.3, roughness=0.8)
mat('wall_north', (0.25, 0.25, 0.28, 1), metallic=0.3, roughness=0.8)
mat('ceiling_steel', (0.60, 0.60, 0.60, 1), metallic=0.1, roughness=0.9)
mat('epoxy_green', (0.48, 0.54, 0.44, 1), metallic=0.05, roughness=0.7)
mat('epoxy_dark', (0.23, 0.23, 0.29, 1), metallic=0.05, roughness=0.7)
mat('epoxy_office', (0.33, 0.33, 0.37, 1), metallic=0.05, roughness=0.75)
mat('safety_yellow_line', (0.77, 0.66, 0.09, 1), metallic=0.1, roughness=0.6)
mat('hazard_red_line', (0.80, 0.20, 0.20, 1), metallic=0.1, roughness=0.6)
mat('column_steel', (0.33, 0.33, 0.37, 1), metallic=0.6, roughness=0.5)
mat('beam_steel', (0.35, 0.35, 0.37, 1), metallic=0.7, roughness=0.4)
mat('pipe_orange', (0.85, 0.45, 0.1, 1), metallic=0.3, roughness=0.5)
mat('cable_tray_grey', (0.4, 0.4, 0.42, 1), metallic=0.6, roughness=0.45)

# Dimensions
W, D, H = 30, 20, 5
WALL = 0.3

# Create an empty parent for the whole factory
factory = bpy.data.objects.new('Factory_Environment', None)
bpy.context.collection.objects.link(factory)
factory.empty_display_type = 'CUBE'

def add_box(name, loc, scale, material_name, parent=factory):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.parent = parent
    m = bpy.data.materials.get(material_name)
    if m: obj.data.materials.append(m)
    return obj

# ── FLOOR ──
add_box('Floor', (0, -WALL/2, 0), (W, WALL, D), 'floor_concrete')

# ── CEILING ──
add_box('Ceiling', (0, H + WALL/2, 0), (W, WALL, D), 'ceiling_steel')

# ── WALLS ──
add_box('Wall_North', (0, H/2, -(D/2 + WALL/2)), (W + WALL*2, H, WALL), 'wall_north')
add_box('Wall_South', (0, H/2, D/2 + WALL/2), (W + WALL*2, H, WALL), 'wall_cmu')
add_box('Wall_West', (-(W/2 + WALL/2), H/2, 0), (WALL, H, D), 'wall_cmu')
add_box('Wall_East', (W/2 + WALL/2, H/2, 0), (WALL, H, D), 'wall_cmu')

# ── EPOXY ZONES ──
add_box('Epoxy_Production', (0, 0.003, -4), (12, 0.005, 3), 'epoxy_green')
add_box('Epoxy_Control', (10, 0.003, -7.5), (9, 0.005, 5), 'epoxy_dark')
add_box('Epoxy_Office', (8, 0.003, 7), (8, 0.005, 6), 'epoxy_office')
add_box('Epoxy_South', (0, 0.003, 3), (8, 0.005, 3), 'epoxy_green')

# ── FLOOR MARKINGS — Safety Yellow Lines ──
for i, (pos, args) in enumerate([
    ((0, 0.005, 0), (0.1, 0.01, D)),
    ((6, 0.005, 0), (0.1, 0.01, D)),
    ((-6, 0.005, 0), (0.1, 0.01, D)),
    ((0, 0.005, -2), (W, 0.01, 0.1)),
    ((0, 0.005, 5), (W, 0.01, 0.1)),
]):
    add_box(f'SafetyLine_{i}', pos, args, 'safety_yellow_line')

# ── FLOOR MARKINGS — Hazard Red ──
for i, (pos, args) in enumerate([
    ((-13, 0.005, -5), (2, 0.01, 2)),
    ((13, 0.005, -1), (2, 0.01, 2)),
    ((8.5, 0.005, -8), (8, 0.01, 0.1)),
]):
    add_box(f'HazardLine_{i}', pos, args, 'hazard_red_line')

# ── COLUMNS ──
for x in [-W/2 + 2, W/2 - 2]:
    for z_off in range(4):
        z = -D/2 + 2.5 + z_off * 5
        add_box(f'Column_{x:.0f}_{z:.0f}', (x, H/2, z), (0.3, H, 0.3), 'column_steel')

# ── CEILING BEAMS — East-West ──
for i, z in enumerate([z for z in [D/2 * -1 + 2.5 + j*5 for j in range(4)]]):
    add_box(f'Beam_EW_{i}', (0, H - 0.15, z), (W, 0.3, 0.15), 'beam_steel')

# ── CEILING BEAMS — North-South edges ──
add_box('Beam_NS_W', (-W/2 + 2, H - 0.15, 0), (0.15, 0.3, D), 'beam_steel')
add_box('Beam_NS_E', (W/2 - 2, H - 0.15, 0), (0.15, 0.3, D), 'beam_steel')

# ── CEILING PIPES (compressed air — orange) ──
for i in range(3):
    z = -5 + i * 5
    bpy.ops.mesh.primitive_cylinder_add(radius=0.04, depth=W-4, vertices=12,
        location=(0, H - 0.5, z))
    pipe = bpy.context.active_object
    pipe.name = f'Pipe_Air_{i}'
    pipe.rotation_euler = (0, 0, math.pi/2)
    pipe.parent = factory
    m = bpy.data.materials.get('pipe_orange')
    if m: pipe.data.materials.append(m)

# ── CABLE TRAYS ──
for x_pos, name in [(5, 'CableTray_East'), (-5, 'CableTray_West')]:
    add_box(name, (x_pos, 4.2, 0), (0.3, 0.08, D - 2), 'cable_tray_grey')
    # Side lips
    for side in [-1, 1]:
        add_box(f'{name}_Lip_{side}', (x_pos + side*0.15, 4.24, 0), (0.02, 0.08, D-2), 'cable_tray_grey')

print("Factory shell complete!")
""")

print("\\n--- Building control corner + props ---")

# ═══════════════════════════════════════════════════════════════
# Part 2: Factory Props — PLC Panels, Workbench, Shelving, MCC, Breaker
# ═══════════════════════════════════════════════════════════════
run_script("""
import bpy
import math

factory = bpy.data.objects.get('Factory_Environment')

def mat(name, color, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.get(name)
    if not m:
        m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            n.inputs['Base Color'].default_value = color
            n.inputs['Metallic'].default_value = metallic
            n.inputs['Roughness'].default_value = roughness
            break
    return m

mat('plc_panel_grey', (0.55, 0.55, 0.58, 1), metallic=0.4, roughness=0.5)
mat('workbench_wood', (0.45, 0.35, 0.22, 1), metallic=0.0, roughness=0.8)
mat('shelving_metal', (0.4, 0.42, 0.45, 1), metallic=0.7, roughness=0.4)
mat('mcc_grey', (0.45, 0.45, 0.48, 1), metallic=0.5, roughness=0.45)
mat('breaker_dark', (0.15, 0.15, 0.18, 1), metallic=0.4, roughness=0.5)
mat('danger_label', (0.85, 0.15, 0.1, 1), metallic=0.0, roughness=0.6)

def add_box(name, loc, scale, material_name, parent=factory):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.parent = parent
    m = bpy.data.materials.get(material_name)
    if m: obj.data.materials.append(m)
    return obj

# ── PLC Panel 1 (North wall, east side) ──
plc1 = add_box('PLC_Panel_1', (7, 1, -9.2), (1.2, 1.8, 0.4), 'plc_panel_grey')
# Door handle
add_box('PLC1_Handle', (7.55, 1.1, -9.0), (0.03, 0.15, 0.02), 'dark_steel')
# Status LEDs
for i, color in enumerate(['led_green', 'led_amber', 'led_red']):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.02, depth=0.01, vertices=8,
        location=(6.6, 1.6 - i*0.15, -9.0))
    led = bpy.context.active_object
    led.name = f'PLC1_LED_{i}'
    led.rotation_euler = (math.pi/2, 0, 0)
    led.parent = factory
    m = bpy.data.materials.get(color)
    if m: led.data.materials.append(m)

# ── PLC Panel 2 ──
add_box('PLC_Panel_2', (10, 1, -9.2), (1.2, 1.8, 0.4), 'plc_panel_grey')
add_box('PLC2_Handle', (10.55, 1.1, -9.0), (0.03, 0.15, 0.02), 'dark_steel')

# ── Workbench ──
bench = add_box('Workbench_Top', (8, 0.9, -6.5), (2.0, 0.06, 0.8), 'workbench_wood')
# Legs
for dx, dz in [(-0.9, -0.35), (0.9, -0.35), (-0.9, 0.35), (0.9, 0.35)]:
    add_box(f'Bench_Leg_{dx}_{dz}', (8+dx, 0.45, -6.5+dz), (0.05, 0.9, 0.05), 'dark_steel')
# Pegboard (behind workbench on wall)
add_box('Pegboard', (8, 1.5, -9.0), (1.8, 1.0, 0.02), 'workbench_wood')

# ── Industrial Shelving ──
shelf_x, shelf_z = 13, -7
for i in range(4):
    y = 0.3 + i * 0.6
    add_box(f'Shelf_{i}', (shelf_x, y, shelf_z), (1.0, 0.04, 0.5), 'shelving_metal')
# Shelf uprights
for dx in [-0.48, 0.48]:
    add_box(f'Shelf_Upright_{dx}', (shelf_x + dx, 1.2, shelf_z), (0.04, 2.4, 0.04), 'shelving_metal')

# ── Motor Control Center (MCC) — east wall ──
mcc = add_box('MCC_Body', (13.2, 1.0, -1), (0.8, 2.0, 1.5), 'mcc_grey')
# 3 buckets (doors)
for i in range(3):
    add_box(f'MCC_Door_{i}', (12.8, 0.5 + i*0.6, -1), (0.02, 0.5, 0.4), 'mcc_grey')
# Danger label
add_box('MCC_Danger', (12.78, 1.5, -1), (0.01, 0.15, 0.3), 'danger_label')

# ── Breaker Panel — west wall ──
breaker = add_box('Breaker_Panel', (-14.5, 1.6, -5), (0.15, 1.2, 0.8), 'breaker_dark')
# Breaker handle (interactive element)
add_box('Breaker_Handle', (-14.35, 1.6, -5), (0.05, 0.3, 0.06), 'btn_red')
# Danger label
add_box('Breaker_Danger', (-14.35, 2.0, -5), (0.01, 0.12, 0.25), 'danger_label')

print("Control corner + props complete!")
""")

print("\\n--- Building supervisor office ---")

# ═══════════════════════════════════════════════════════════════
# Part 3: Supervisor Office — Mezzanine with stairs
# ═══════════════════════════════════════════════════════════════
run_script("""
import bpy
import math

factory = bpy.data.objects.get('Factory_Environment')

def mat(name, color, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.get(name)
    if not m:
        m = bpy.data.materials.new(name=name)
    m.use_nodes = True
    for n in m.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            n.inputs['Base Color'].default_value = color
            n.inputs['Metallic'].default_value = metallic
            n.inputs['Roughness'].default_value = roughness
            break
    return m

mat('office_wall', (0.85, 0.83, 0.80, 1), metallic=0.05, roughness=0.7)
mat('office_floor', (0.35, 0.30, 0.25, 1), metallic=0.0, roughness=0.8)
mat('stair_metal', (0.35, 0.35, 0.38, 1), metallic=0.8, roughness=0.35)
mat('railing_metal', (0.45, 0.45, 0.48, 1), metallic=0.7, roughness=0.4)
mat('office_glass', (0.7, 0.8, 0.9, 1), metallic=0.0, roughness=0.05)
mat('desk_wood', (0.4, 0.28, 0.15, 1), metallic=0.0, roughness=0.75)

# Glass material - make transparent
gmat = bpy.data.materials.get('office_glass')
if gmat:
    for n in gmat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            n.inputs['Alpha'].default_value = 0.2
            try:
                n.inputs['Transmission Weight'].default_value = 0.85
            except:
                try:
                    n.inputs['Transmission'].default_value = 0.85
                except:
                    pass
            n.inputs['IOR'].default_value = 1.5
            break

def add_box(name, loc, scale, material_name, parent=factory):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.parent = parent
    m = bpy.data.materials.get(material_name)
    if m: obj.data.materials.append(m)
    return obj

ox, oz = 6, 8  # Office base position

# ── Office Platform (elevated 3m) ──
add_box('Office_Floor', (ox, 3.0, oz), (6, 0.15, 4), 'office_floor')

# ── Office Walls ──
# Back wall (south = factory wall)
add_box('Office_Wall_Back', (ox, 3.75, oz + 2), (6, 1.5, 0.15), 'office_wall')
# Side walls
add_box('Office_Wall_Left', (ox - 3, 3.75, oz), (0.15, 1.5, 4), 'office_wall')
add_box('Office_Wall_Right', (ox + 3, 3.75, oz), (0.15, 1.5, 4), 'office_wall')

# ── Glass Front (overlooking factory) ──
add_box('Office_Glass_Front', (ox, 3.75, oz - 2), (6, 1.5, 0.05), 'office_glass')

# ── Office Interior ──
# Desk
add_box('Derek_Desk', (ox + 1, 3.45, oz), (1.5, 0.06, 0.7), 'desk_wood')
# Desk legs
for dx, dz in [(-0.7, -0.3), (0.7, -0.3), (-0.7, 0.3), (0.7, 0.3)]:
    add_box(f'Desk_Leg', (ox+1+dx, 3.22, oz+dz), (0.04, 0.45, 0.04), 'dark_steel')

# Monitor on desk
add_box('Desk_Monitor', (ox + 1, 3.7, oz + 0.1), (0.5, 0.35, 0.03), 'game_black')
add_box('Desk_Screen', (ox + 1, 3.7, oz + 0.085), (0.46, 0.31, 0.01), 'game_screen')

# Chair (simple)
add_box('Derek_Chair', (ox + 1, 3.35, oz - 0.4), (0.45, 0.06, 0.45), 'game_black')
add_box('Derek_Chair_Back', (ox + 1, 3.6, oz - 0.6), (0.45, 0.5, 0.04), 'game_black')

# Whiteboard on side wall
add_box('Whiteboard', (ox + 2.9, 3.8, oz + 0.5), (0.02, 0.8, 1.2), 'game_white')

# ── Metal Staircase ──
# Stair stringers (two angled beams)
stair_length = 5.0
stair_angle = math.atan2(3.0, 4.0)  # Rise 3m, Run 4m
stair_center_x = ox - 3
stair_center_z = oz - 0.5

for side in [-1, 1]:
    bpy.ops.mesh.primitive_cube_add(size=1, 
        location=(stair_center_x, 1.5, stair_center_z + side * 0.5))
    stringer = bpy.context.active_object
    stringer.name = f'Stair_Stringer_{"L" if side<0 else "R"}'
    stringer.scale = (stair_length, 0.04, 0.15)
    stringer.rotation_euler = (0, 0, stair_angle)
    stringer.parent = factory
    m = bpy.data.materials.get('stair_metal')
    if m: stringer.data.materials.append(m)

# Stair treads (10 steps)
for i in range(10):
    t = i / 9.0
    step_x = stair_center_x - 2.0 + t * 4.0
    step_y = 0.3 + t * 2.7
    add_box(f'Stair_Tread_{i}', (step_x, step_y, stair_center_z), 
            (0.4, 0.03, 1.0), 'stair_metal')

# Railing
for side in [-1, 1]:
    # Railing posts
    for i in range(5):
        t = i / 4.0
        post_x = stair_center_x - 2.0 + t * 4.0
        post_y = 0.3 + t * 2.7 + 0.5
        bpy.ops.mesh.primitive_cylinder_add(radius=0.015, depth=1.0, vertices=8,
            location=(post_x, post_y, stair_center_z + side * 0.55))
        post = bpy.context.active_object
        post.name = f'Railing_Post_{i}_{side}'
        post.parent = factory
        m = bpy.data.materials.get('railing_metal')
        if m: post.data.materials.append(m)

# Balcony railing (along front of office)
for i in range(8):
    x = ox - 3 + i * 0.85
    bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=1.0, vertices=8,
        location=(x, 3.5, oz - 2.1))
    post = bpy.context.active_object
    post.name = f'Balcony_Post_{i}'
    post.parent = factory
    m = bpy.data.materials.get('railing_metal')
    if m: post.data.materials.append(m)

# Balcony handrail
add_box('Balcony_Rail', (ox, 3.95, oz - 2.1), (6.5, 0.04, 0.04), 'railing_metal')

# ── Office Door ──
add_box('Office_Door', (ox - 2.5, 3.75, oz - 2), (0.8, 1.5, 0.06), 'stair_metal')

print("Supervisor office complete!")
""")

print("\\n--- Full factory environment built in Blender! ---")
