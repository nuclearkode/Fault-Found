import socket
import json

def get_blender_data():
    host = 'localhost'
    port = 9876
    payload = {"type": "execute_python", "params": {"code": """
import bpy
import json
data = []
for obj in bpy.data.objects:
    if obj.name.startswith("ST"):
        data.append({
            "name": obj.name,
            "type": obj.type,
            "location": list(obj.location),
            "parent": obj.parent.name if obj.parent else None,
            "children": [child.name for child in obj.children]
        })
print(json.dumps(data))
"""}}
    
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        s.connect((host, port))
        s.sendall(json.dumps(payload).encode('utf-8'))
        
        response = ""
        while True:
            chunk = s.recv(4096).decode('utf-8')
            if not chunk:
                break
            response += chunk
        
        s.close()
        return response
    except Exception as e:
        return f"Error: {e}"

if __name__ == "__main__":
    result = get_blender_data()
    print(result)
