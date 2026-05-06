"""
Blender Socket Bridge — sends bpy Python code to the Blender MCP addon.
Usage:
    from blender_bridge import run_in_blender
    result = run_in_blender("import bpy; print(len(bpy.data.objects))")
"""

import socket
import json
import sys
import textwrap
import io

# Fix Windows console encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

HOST = 'localhost'
PORT = 9876
TIMEOUT = 30  # seconds — generous for heavy operations


def run_in_blender(code: str, timeout: int = TIMEOUT) -> dict:
    """Send Python code to Blender and return the parsed JSON response."""
    payload = json.dumps({"type": "execute_code", "params": {"code": code}})
    
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(timeout)
    try:
        s.connect((HOST, PORT))
        s.sendall(payload.encode('utf-8'))
        
        chunks = []
        while True:
            try:
                chunk = s.recv(65536)
                if not chunk:
                    break
                chunks.append(chunk)
                # Try to parse — if valid JSON, we're done
                try:
                    json.loads(b''.join(chunks).decode('utf-8'))
                    break
                except json.JSONDecodeError:
                    continue
            except socket.timeout:
                break
        
        raw = b''.join(chunks).decode('utf-8')
        return json.loads(raw)
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        s.close()


def run_script(code: str):
    """Run code and print result nicely."""
    code = textwrap.dedent(code).strip()
    result = run_in_blender(code)
    if result.get("status") == "success":
        output = result.get("result", {}).get("result", "")
        if output:
            print(output.strip())
        else:
            print("✓ Executed successfully (no output)")
    else:
        print(f"✗ Error: {result.get('message', 'unknown')}")
    return result


if __name__ == "__main__":
    # Quick connectivity test
    r = run_script("import bpy; print(f'Connected! Scene: {bpy.context.scene.name}, Objects: {len(bpy.data.objects)}')")
