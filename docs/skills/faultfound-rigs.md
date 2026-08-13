---
name: faultfound-rigs
description: >
  Building and repairing 3D machine rigs for FAULT//FOUND, the PLC troubleshooting game —
  Blender authoring driven headlessly from Python, the transform contract that decides whether a
  moving part works or flies across the map, the glTF export traps that have shipped regressions
  three times, and the numeric + visual verification discipline that catches them. Use this for
  ANY work on the game's models: adding or fixing a rig, station, sensor, actuator or prop;
  debugging a part that floats, orbits, intersects or fails to appear; re-exporting a .glb;
  wiring a model into React-Three-Fiber; or authoring a new troubleshooting scenario against a
  rig. Also use it before editing any .blend in this project, because the export step is where
  correct models become broken shipped files.
---

# FAULT//FOUND — building rigs that are actually correct

The failure mode in this project is never "the model looks bad." It is **the model looks fine and
is silently wrong**: a handle that orbits the map when rotated, a sensor 0.6 m from the arm it is
bolted to, a person standing inside a conveyor because the export filter missed him. Every one of
those shipped. Every one survived a casual look.

This skill exists to make catching them mechanical.

> **Prerequisite:** the `blender-modeling` skill carries the general Blender workflow, the bundled
> API/manual docs, `scripts/audit_transforms.py` and `scripts/measure_glb.js`, and the Blender 5.x
> gotchas. Invoke it too. This file is the project-specific layer on top.

## The project in one paragraph

FAULT//FOUND is a first-person PLC troubleshooting game. The player walks up to an industrial
machine, reads its sensors and indicator lamps, opens the control panel, **locks off the isolator**,
finds an injected fault, repairs it, re-energises, and proves the line runs — against a shift clock.
Models are not scenery. They are the diagnostic interface.

- Repo: `C:\Users\ahmed\Desktop\Fault Found`
- Blender sources: `blender_source/*.blend`
- Shipped models: `public/models/*.glb`
- Stack: Next.js + React-Three-Fiber + drei + Rapier + Zustand, TypeScript strict

## Standing rules from the user — do not negotiate these

1. **Model fixes happen in Blender and get re-exported.** Never work around a model defect in the
   React component. If a part is in the wrong place, fix the `.blend`; do not add a compensating
   offset in TSX.
2. **Never build game geometry from primitives in TSX.** Author in Blender, export, drive from code.
3. **Look at renders.** Numbers prove a part is positioned. Only an image proves it makes *sense*.
   The user has said this explicitly, after being handed a model that was numerically perfect and
   visually nonsense. Render it, `Read` the PNG, and say honestly what you see.

## Blender is driven headlessly

The MCP addon is usually **not** running. Drive Blender as a subprocess:

```bash
"/c/Program Files/Blender Foundation/Blender 5.1/blender.exe" --background "blender_source/x.blend" --python script.py
```

Return data by printing a JSON blob between sentinels and parsing it out — Blender's stdout is
full of noise:

```python
print('@@@' + json.dumps(result) + '@@@')
```

**Check whether the GUI is open first.** If the user has the file open in Blender, a headless pass
will silently lose one of your changes:

```powershell
Get-Process blender -ErrorAction SilentlyContinue
```

**One Blender process per `.blend`.** Parallel agents editing the same file corrupt it. Parallel
agents each authoring their *own new* file are fine.

## The transform contract — this is the bug

Two conventions are valid. Mixing them is what breaks.

| Convention | Mesh vertices | Object transform | Use for |
|---|---|---|---|
| **Absolute** | in final scene coordinates | identity | static geometry |
| **Origin-at-pivot** | centred on the origin | positions/rotates the part | **anything driven** |

Authoring a **rotating** part with absolute vertices means its origin is at the model root, so
`rotation.z` sweeps it around the whole model instead of turning it in place.

Real example from this project: `PLC_Isolator_Handle`, a 100 × 55 × 30 mm switch, had its geometry
centred 3.742 m from its own origin. Locking off swung it in a 3.7 m arc past the ceiling. The user
reported it as "a black thing floating around" and a full scene-graph audit found nothing — because
it was never a stray mesh, just a real part thrown somewhere absurd.

### The numeric test

**Orbit radius** = distance from an object's origin to its own local bounding-box centre.

```python
def orbit_radius(o):
    vs = [v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return ((lo + hi) / 2).length
```

- Driven part with orbit radius > ~0.01 → **broken**, it will orbit.
- Static part with a large orbit radius → fine, that is the absolute convention.

### The fix, and its proof

```python
bpy.ops.object.select_all(action='DESELECT')
o.select_set(True)
bpy.context.view_layer.objects.active = o
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
```

**A correct re-origin has a signature: the orbit radius goes to ~0 while the world-space centre does
not move at all.** Report both, before and after. If the world centre moved, you did not re-origin
the part — you relocated it, and the model is now wrong in a new way.

For a rotary knob with a pointer sticking out, `BOUNDS` centre is *not* the axis. Think about which
point the real object turns about and set the origin there.

## Export: where correct models become broken files

### The Worker trap — shipped three times

`silo_conveyor_cell.blend` contains a human figure used for scale. He must **not** ship; exporting
him drops a person inside the conveyor. His meshes share **no name prefix**: `Head`, `Torso`,
`Hips`, `Belt`, `Vest_Band`, `Hat_Peak`, `Boot_L`, `Shin_R`… Every prefix-based filter has failed.

Filter by **hierarchy**, which cannot drift as parts are renamed:

```python
def subtree(root):
    out, stack = set(), [root]
    while stack:
        o = stack.pop()
        out.add(o.name)
        stack.extend(o.children)
    return out

excluded = subtree(bpy.data.objects['Worker'])
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.data.objects:
    if o.name not in excluded:
        o.select_set(True)
```

Note the name collision: the Worker owns a mesh called `Belt`. Prefix any conveyor belt geometry
(`DRIVE_Belt`) so the two never confuse a filter.

### Settings that match what already ships

```python
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB',
    export_animations=False,   # engine drives motion from PLC state, not clips
    export_apply=True,         # applies modifiers
    export_extras=True,        # REQUIRED — custom props become node userData
    export_materials='EXPORT',
    export_cameras=False, export_lights=False,
    export_yup=True,
    use_selection=True,        # with the Worker deselected
)
```

Do **not** switch Draco on or off casually. `silo_cell.glb` ships uncompressed; changing that
changes load behaviour as a side effect of an unrelated fix.

The exporter dereferences `bpy.context.active_object`, which can be absent right after a file load.
Set an active object before exporting.

### Verify the artifact, not the source

A correct `.blend` does not mean a correct `.glb`. Parse the exported node table and **diff it
against the previous file**:

```js
const b = fs.readFileSync(path);
const gltf = JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString('utf8'));
// compare gltf.nodes.length, gltf.meshes.length, gltf.materials.length
// and the SET of node names — added and removed
```

An unexplained jump is a regression, not a bonus. A straight re-export once added 29 nodes and 6
materials — the entire Worker — and it would have shipped had the counts not been compared.

Baseline after the last good export: **2611 nodes, 2604 meshes, 31 materials, no Worker.**

### Axis conversion — derive it, never reason about it

Blender is Z-up, glTF is Y-up: `(x, y, z) → (x, z, −y)`. Do not hand-convert. Set the pose, export,
read the node transform back. Worked example: Blender `(-3.3, -1.33, 1.16)` exported as glTF
`(-3.3, 1.16, 1.33)`.

Consequence for driven parts: a shaft along **Blender Y** is rotated in three.js with
**`rotation.z`**.

## Naming is the API

Game code finds parts by name via `traverse()`. A renamed mesh is a broken feature with no error.

- `SCREAMING_SNAKE` with a subsystem prefix: `LEVEL_Mast`, `LEVEL_Arm`, `LEVEL_SENSOR`,
  `PLC_Isolator_Handle`, `Conv_Belt`, `Silo_Shell`, `DRIVE_Pulley`.
- Every sensor, lamp, valve and actuator is its **own named object**, because each one is driven or
  read individually.
- Group a reversible feature under one parent (`DRIVE_TRAIN`) so it can be removed by deleting the
  parent. The user often wants to see a change before committing to it.
- Never ship `Cube.003`.

Before renaming anything, grep the repo for the old name.

## What a rig must have to be playable

A rig is a diagnostic surface, not a prop. It needs:

- **A control panel** with START / STOP / E-STOP and indicator lamps.
- **A lockable isolator** in a cabinet with a door that opens. Lock-out/tag-out is the one procedure
  the game enforces on every rig, and the refusal path depends on this geometry existing.
- **Sensors that read as sensors** — a downward-looking diffuse sensor needs a mast, an arm, a
  bracket, a foot, a cable gland and a lens. A bare box floating near a conveyor does not say
  "sensor" to anyone, and the user will (correctly) reject it.
- **Somewhere to stand.** If a technician cannot reach the thing they must open, the model is wrong.

Ground truth for Festo MPS stations — official dimensions, I/O maps, sequences — is in the
`blender-modeling` skill's `references/festo-mps.md`. Use it instead of inventing mechanisms.

## Collision is code, not model

Physics colliders live in the R3F component, not the `.blend`. Two hard-won rules:

- **Do not use `colliders="trimesh"` on a rig with moving parts.** react-three-rapier walks with
  `traverseVisible()`, so state-hidden meshes contribute nothing — and a `fixed` body bakes its
  colliders at the pose it finds, so moving cartons leave invisible blocks hanging where they
  started. Hand-place `<CuboidCollider>` / `<CylinderCollider>` on the static structure.
- **Mount the `RigidBody` as a sibling carrying the same `position`/`rotation`, not nested inside
  the transformed group.** Nesting put colliders in the middle of the map once already.

Verify colliders in the running physics world, not by reading the JSX:

```js
window.__world.forEachCollider(c => { /* c.translation(), c.shape */ })
```

## Verification checklist

Before claiming a model is done:

- [ ] Every **driven** part: orbit radius ~0, world centre unchanged by the re-origin. Numbers quoted.
- [ ] Nothing floats: parts that rest on something have `bottom == surface`, not "about right".
- [ ] Nothing intersects anything it should not.
- [ ] **Rendered from ≥3 angles and the images actually read**, with an honest review. Say what is
      still imperfect rather than declaring success.
- [ ] GLB node/mesh/material counts diffed against the previous export; every change explained.
- [ ] No Worker in the shipped file.
- [ ] `npx tsc --noEmit` clean, `npx vitest run` all passing.

## Dev-time inspection from inside the game

Dev builds expose live handles (stripped in production):

```js
__scene     // three.js scene graph
__world     // Rapier physics world
__camera
__game      // Zustand game store: __game.getState().startTimer(5)
__settings
```

Use them to answer "what *is* that thing?" by measurement instead of guessing. Walking the scene
graph for world-space bounding boxes is how several mystery objects were identified — and how one
was proven *not* to be a mesh at all.

## Authoring a scenario against a rig

Scenarios are JSON in `src/scenarios/S##.json`: `tags` (address, symbol, type, description),
`rungs` (ladder), optionally `sfc` (an S7-GRAPH chart), `faults`, `redHerrings`, `scoring`.

- Addresses follow the rig's controller: Allen-Bradley/LogixPro `I:1/00`, `O:2/00`; Siemens `I0.0`,
  `Q4.0`, `M0.0`.
- **Every tag a transition or rung depends on must be driven by something.** A scenario whose
  inputs nothing writes reads perfectly and does nothing — S07 was authored with 14 such operands
  and parks on step 1 forever. Trace each one to its writer before calling it playable.
- Keep briefings short. The call-out screen was cut from ~20 lines to the symptom alone, because a
  wall of text before the pointer is captured gets skimmed entirely. Teach controls at the moment
  they are needed, not upfront.

## Voice

This codebase writes real prose in comments — why a thing is the way it is, and what was tried and
rejected. Match it. `// set the value` is noise; the comment that says *"a fixed body bakes its
colliders at the pose it finds, and the cartons MOVE"* is why the next person does not reintroduce
the bug.
