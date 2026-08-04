"""
Phase 1: Upgrade ALL materials to realistic PBR industrial materials.
Replaces the flat game_* materials with proper metallic/roughness values.
"""
from blender_bridge import run_script

run_script("""
import bpy

def upgrade_material(name, base_color, metallic=0.0, roughness=0.5, specular=0.5):
    mat = bpy.data.materials.get(name)
    if not mat:
        mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if not bsdf:
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                bsdf = n
                break
    if not bsdf:
        bsdf = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        output = mat.node_tree.nodes.get('Material Output')
        if output:
            mat.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

    bsdf.inputs['Base Color'].default_value = base_color
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    # Specular/IOR handled by Blender defaults
    return mat

# --- Upgrade existing materials ---
# Cabinet body — powder-coated white steel
upgrade_material('game_white', (0.92, 0.90, 0.87, 1.0), metallic=0.1, roughness=0.45)

# T-slot aluminum trim
upgrade_material('game_trim', (0.75, 0.77, 0.80, 1.0), metallic=0.85, roughness=0.3)

# Profile plate — anodized aluminum
upgrade_material('game_plate', (0.65, 0.67, 0.70, 1.0), metallic=0.9, roughness=0.25)

# Black plastic / rubber
upgrade_material('game_black', (0.03, 0.03, 0.03, 1.0), metallic=0.0, roughness=0.7)

# HMI Screen — slight glow
mat_screen = upgrade_material('game_screen', (0.05, 0.15, 0.08, 1.0), metallic=0.0, roughness=0.1)
bsdf = None
for n in mat_screen.node_tree.nodes:
    if n.type == 'BSDF_PRINCIPLED':
        bsdf = n
        break
if bsdf:
    bsdf.inputs['Emission Color'].default_value = (0.1, 0.4, 0.15, 1.0)
    bsdf.inputs['Emission Strength'].default_value = 2.0

# Green button
upgrade_material('game_green', (0.05, 0.55, 0.1, 1.0), metallic=0.1, roughness=0.4)

# Yellow button
upgrade_material('game_yellow', (0.85, 0.72, 0.08, 1.0), metallic=0.1, roughness=0.4)

# Belt — black rubber
upgrade_material('belt', (0.02, 0.02, 0.02, 1.0), metallic=0.0, roughness=0.85)

# E-stop red
upgrade_material('btn_red', (0.85, 0.05, 0.05, 1.0), metallic=0.05, roughness=0.35)

# Dark structural steel
upgrade_material('dark_steel', (0.15, 0.15, 0.17, 1.0), metallic=0.95, roughness=0.35)

# Glass (for magazine tube)
mat_glass = upgrade_material('glass', (0.85, 0.92, 0.95, 1.0), metallic=0.0, roughness=0.05)
mat_glass.blend_method = 'BLEND' if hasattr(mat_glass, 'blend_method') else None
bsdf = None
for n in mat_glass.node_tree.nodes:
    if n.type == 'BSDF_PRINCIPLED':
        bsdf = n
        break
if bsdf:
    bsdf.inputs['Alpha'].default_value = 0.15
    bsdf.inputs['IOR'].default_value = 1.45
    try:
        bsdf.inputs['Transmission Weight'].default_value = 0.95
    except:
        try:
            bsdf.inputs['Transmission'].default_value = 0.95
        except:
            pass

# --- Create NEW industrial materials ---
# Festo blue (pneumatic cylinders)
upgrade_material('festo_blue', (0.12, 0.35, 0.72, 1.0), metallic=0.15, roughness=0.45)

# Brushed aluminum (rails, guides)
upgrade_material('brushed_aluminum', (0.78, 0.80, 0.82, 1.0), metallic=0.92, roughness=0.28)

# Pneumatic tubing (polyurethane blue)
upgrade_material('pneumatic_tube', (0.08, 0.25, 0.65, 1.0), metallic=0.0, roughness=0.55)

# Sensor housing (dark grey plastic)
upgrade_material('sensor_housing', (0.08, 0.08, 0.10, 1.0), metallic=0.0, roughness=0.6)

# Safety yellow
upgrade_material('safety_yellow', (0.9, 0.75, 0.05, 1.0), metallic=0.05, roughness=0.4)

# Stainless steel (shiny)
upgrade_material('stainless_steel', (0.6, 0.6, 0.62, 1.0), metallic=0.95, roughness=0.15)

# Copper (electrical)
upgrade_material('copper', (0.72, 0.45, 0.20, 1.0), metallic=0.95, roughness=0.3)

# LED green (emissive)
mat_led_g = upgrade_material('led_green', (0.1, 0.9, 0.1, 1.0), metallic=0.0, roughness=0.3)
for n in mat_led_g.node_tree.nodes:
    if n.type == 'BSDF_PRINCIPLED':
        n.inputs['Emission Color'].default_value = (0.0, 1.0, 0.0, 1.0)
        n.inputs['Emission Strength'].default_value = 5.0
        break

# LED red (emissive)
mat_led_r = upgrade_material('led_red', (0.9, 0.05, 0.05, 1.0), metallic=0.0, roughness=0.3)
for n in mat_led_r.node_tree.nodes:
    if n.type == 'BSDF_PRINCIPLED':
        n.inputs['Emission Color'].default_value = (1.0, 0.0, 0.0, 1.0)
        n.inputs['Emission Strength'].default_value = 5.0
        break

# LED amber/orange
mat_led_a = upgrade_material('led_amber', (0.95, 0.6, 0.05, 1.0), metallic=0.0, roughness=0.3)
for n in mat_led_a.node_tree.nodes:
    if n.type == 'BSDF_PRINCIPLED':
        n.inputs['Emission Color'].default_value = (1.0, 0.6, 0.0, 1.0)
        n.inputs['Emission Strength'].default_value = 5.0
        break

# Workpiece red
upgrade_material('workpiece_red', (0.75, 0.08, 0.08, 1.0), metallic=0.05, roughness=0.5)

# Workpiece silver (aluminum)
upgrade_material('workpiece_silver', (0.7, 0.72, 0.74, 1.0), metallic=0.85, roughness=0.3)

# Workpiece black (Delrin/POM)
upgrade_material('workpiece_black', (0.04, 0.04, 0.04, 1.0), metallic=0.0, roughness=0.6)

print(f"Materials upgraded! Total: {len(bpy.data.materials)}")
""")
