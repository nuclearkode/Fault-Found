# Blender Direct Socket Automation Scripts

This folder contains the Python scripts used to programmatically generate the 3D assets for the FAULT//FOUND game directly inside Blender.

Because the standard Blender MCP integration had instabilities with large script execution, we use a **direct TCP socket connection** (on port `9876`) to pipe Python scripts directly to a listening Blender addon.

## How it works
`blender_bridge.py` contains the `run_script()` wrapper which establishes the socket connection and evaluates code directly in Blender's Python context.

## Workflow Pipeline
The scripts should be run in the following sequence to reconstruct the entire scene from scratch:

1. **Materials**: `python blender_01_materials.py` (generates the PBR industrial material library)
2. **ST10 Station**: `python blender_02_st10.py` and `blender_02c_anim_v5.py` (geometry and animations)
3. **ST20 Station**: `python blender_03_st20.py` (geometry and animations)
4. **Export ST10/ST20**: `python blender_export.py` (exports to `public/models/factory_line.glb`)

5. **Factory Shell**: `python blender_04_factory_shell.py`
6. **Factory Props**: `python blender_04_factory_props.py`
7. **Supervisor Office**: `python blender_04_factory_office.py`
8. **Export Environment**: `python blender_04_export_env.py` (exports to `public/models/factory_env.glb`)

## Debugging
- If running headless or you need to see what the environment looks like inside Blender's viewport, run `python blender_04_add_lights.py` to add temporary interior lighting to the Blender scene (do NOT export these lights to the game, as Three.js handles its own lighting).
