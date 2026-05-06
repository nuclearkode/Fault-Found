import socket
import json

def test_blender_mcp():
    host = 'localhost'
    port = 9876
    payload = {"type": "get_scene_info", "params": {}}
    
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.connect((host, port))
        s.sendall(json.dumps(payload).encode('utf-8'))
        
        data = s.recv(4096)
        print(f"Received: {data.decode('utf-8')}")
        s.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_blender_mcp()
