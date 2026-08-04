import socket
import json

def setup_materials():
    host = 'localhost'
    port = 9876
    code = """
import bpy

def create_pbr_material(name, color, metallic=0.0, roughness=0.5):
    if name in bpy.data.materials:
        mat = bpy.data.materials[name]
    else:
        mat = bpy.data.materials.new(name=name)
    
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    
    node_principled = nodes.new(type='ShaderNodeBsdfPrincipled')
    node_principled.inputs['Base Color'].default_value = color
    node_principled.inputs['Metallic'].default_value = metallic
    node_principled.inputs['Roughness'].default_value = roughness
    
    node_output = nodes.new(type='ShaderNodeOutputMaterial')
    mat.node_tree.links.new(node_principled.outputs['BSDF'], node_output.inputs['Surface'])
    return mat

# Industrial Palette
create_pbr_material('Industrial_Steel', (0.5, 0.5, 0.5, 1), metallic=1.0, roughness=0.3)
create_pbr_material('Brushed_Aluminum', (0.8, 0.8, 0.8, 1), metallic=0.9, roughness=0.4)
create_pbr_material('Festo_Blue', (0.145, 0.388, 0.784, 1), metallic=0.2, roughness=0.5)
create_pbr_material('Plastic_Black', (0.05, 0.05, 0.05, 1), metallic=0.0, roughness=0.7)
create_pbr_material('Safety_Yellow', (0.768, 0.658, 0.094, 1), metallic=0.0, roughness=0.4)
create_pbr_material('Cabinet_Cream', (0.91, 0.894, 0.875, 1), metallic=0.0, roughness=0.6)

print("Materials created successfully")
"""
    payload = {"type": "execute_python", "params": {"code": code}}
    
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(10)
        s.connect((host, port))
        s.sendall(json.dumps(payload).encode('utf-8'))
        response = s.recv(4096).decode('utf-8')
        s.close()
        return response
    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    print(setup_materials())
