# Festo MPS Autonomous Blender Modeling Skill (SOP v4)

**Scope:** Procedurally model, animate, and validate Festo MPS® stations in Blender via MCP.

> **Core Philosophy**
> You are the builder and the first inspector — but never the final inspector.
> Tunnel vision is a known failure mode. The workflow is designed to defeat it.
> At each step, use the best tool available to you. This SOP tells you *what* must
> happen and *what your options are* — you decide the best approach given your
> current environment and capabilities.

---

## How to Read This Document

Each task in this SOP lists **Options** in priority order:
1. **Native** — things you can do directly with your built-in capabilities (vision, reasoning, MCP tools)
2. **Python (stdlib)** — achievable with Python's standard library, no installs needed
3. **Python (library)** — requires a third-party package that is likely already installed
4. **Install** — download and install only if the above options are unavailable

Always try higher-priority options first. Never install something you can do natively.

---

## §0 — Research & Grounding (MANDATORY before any Blender code)

You must understand how the station *actually operates* before modeling it.
Do not invent a mechanical sequence that "seems logical." Get ground truth first.

### 0A: Operational Reference — YouTube Transcripts

**Goal:** Obtain a step-by-step description of every mechanical action the station performs,
in order, including what triggers each action and what happens to the workpiece.

**Options (use whichever is available, in this order):**

1. **Native web search + fetch** — Search for `"Festo MPS [Station Name] operation demonstration"` on YouTube.
   Retrieve the video page. Many YouTube pages expose transcript text in the page source or via
   accessible caption endpoints — attempt to extract it directly using your fetch capability.

2. **Python (library: youtube-transcript-api)** — If the library is already installed in the environment,
   use it to pull the transcript by video ID. Prefer this over installing anything new.

3. **Python (install)** — Only if option 2 is unavailable: install `youtube-transcript-api` and then use it.

4. **User-provided** — If the user pastes a transcript, YouTube URL, description, or screenshots,
   use those directly. This is equally valid as a fetched transcript.

**After obtaining the raw transcript, distill it:**

Summarize the raw text into a numbered list of mechanical actions. For each step note:
- What component moves
- In what direction / to what position
- What sensor or condition triggers it
- What happens to the workpiece

**Options for distillation:**
1. **Native** — You can reason over the transcript text directly and write the summary yourself.
   Prefer this. You do not need an external call to extract structure from text you can already read.
2. **Fresh agent via API** — If the transcript is very long and you want a second pass,
   call a fresh Claude instance with zero context via the Anthropic API, passing the raw transcript
   and asking it to extract the mechanical sequence. Treat its output as a draft — verify it yourself.

Save the final operational steps somewhere accessible (e.g., a local file or artifact) and
reference it throughout the build. This becomes your **ground-truth contract**.

### 0B: User-Provided Reference Material

If the user provides screenshots, photos, CAD drawings, or written descriptions:
- Accept all of them as reference material
- Images will be fed to the second-eye reviewer in §6
- Written descriptions are appended to the operational steps from §0A

---

## §1 — Station Coordinate Contract

Every station sits on a **0.70 m pitch in X**. Y=0 is the workpiece flow axis. Z=0 is floor level.
Cabinet top (profile plate) is at Z=0.80 m.

| Station | X_origin | Pickup (input) | Drop-off (output) | Key Animated Nodes |
|---------|----------|----------------|--------------------|--------------------|
| **Distributing** | 0.00 | — | `(0.35, 0, 0.95)` | `Rotary_Arm` (radius=0.35m), `Magazine_Pusher` |
| **Handling** | 0.35 | `(0.35, 0, 0.95)` | `(0.70, 0, 0.95)` | `Arm_Z`, `Arm_X`, `Gripper_Jaw_L`, `Gripper_Jaw_R` |
| **Testing** | 0.70 | `(0.70, 0, 0.95)` | `(1.05, 0, 0.90)` | `Lift_Platform`, `Pusher_Rod` |
| **Buffering** | 1.05 | `(1.05, 0, 0.90)` | `(1.40, 0, 0.90)` | `Separator_Pin`, `Buffer_Belt` |
| **Processing** | 1.40 | `(1.40, 0, 0.90)` | `(1.75, 0, 0.90)` | `Turntable`, `Drill_Z`, `Clamp_Rod` |
| **Sorting** | 2.10 | `(1.75, 0, 0.90)` | — | `Conveyor_Belt`, `Gate_1`, `Gate_2`, `Gate_3` |

**Handoff Invariant:** output(N).xyz == input(N+1).xyz to within 2 mm.
Verify this spatially in Blender before animating.

**Gap Fix Rules (learned from v2 errors — never repeat these):**
- Rotary arm radius must equal the distance from its pivot to the drop-off X.
  → Distributing arm radius = `drop_off_x − pivot_x = 0.35 m`
- Air slide bottom edge must physically reach the next station's pickup X.
  → Calculate ramp length from the required horizontal span and the slope angle.

---

## §2 — Scene Hierarchy & Naming Contract

All object names must be R3F-ready from the start. Rename immediately on creation — never leave default names.

```
Station_[Name]              ← Root Empty at X_origin, Y=0, Z=0
  ├── Base_Cabinet
  ├── Profile_Plate
  ├── Control_Panel
  │     └── LED_Green, LED_Red, Start_Button, Stop_Button
  └── [Module_Name]         ← Empty (sub-assembly root)
        ├── [Module]_Body   ← Static geometry
        └── [Animated_Node] ← Moving part (see properties below)

Workpiece                   ← Separate root, NOT parented to any station
```

**Every animated node must store these custom properties** (they export into the GLB
and allow your R3F animation driver to read them without manual mapping):

| Property | Values |
|----------|--------|
| `anim_axis` | `"X"`, `"Y"`, or `"Z"` |
| `anim_range` | `[start_value, end_value]` (meters or degrees) |
| `anim_type` | `"translate"` or `"rotate"` |
| `station` | station name string |
| `cycle_frame_in` | frame when this actuator starts |
| `cycle_frame_out` | frame when it finishes |

---

## §3 — Material Palette (Gold Standard)

Create all materials before building geometry. Check for duplicates before creating —
never allow `.001` suffixes. Materials must be PBR (principled BSDF).

| Material Name | Base Color (linear) | Metallic | Roughness | Notes |
|--------------|---------------------|----------|-----------|-------|
| `Mat_AnodizedAluminum` | `(0.72, 0.72, 0.72)` | 0.90 | 0.20 | Structure, frames |
| `Mat_FestoBlue` | `(0.02, 0.29, 0.67)` | 0.00 | 0.40 | Pneumatic cylinders |
| `Mat_BlackPlastic` | `(0.04, 0.04, 0.04)` | 0.00 | 0.70 | Sensors, housings |
| `Mat_YellowWarning` | `(0.95, 0.75, 0.00)` | 0.00 | 0.50 | Warning labels |
| `Mat_StainlessSteel` | `(0.85, 0.85, 0.85)` | 1.00 | 0.10 | Rods, shafts |
| `Mat_RedIndicator` | `(0.90, 0.05, 0.05)` | 0.00 | 0.80 | EMISSION strength=5 |
| `Mat_GreenIndicator` | `(0.05, 0.90, 0.05)` | 0.00 | 0.80 | EMISSION strength=5 |
| `Mat_Workpiece_Al` | `(0.65, 0.65, 0.65)` | 0.80 | 0.25 | Aluminium workpiece |
| `Mat_Workpiece_Red` | `(0.80, 0.10, 0.05)` | 0.00 | 0.55 | Red plastic workpiece |
| `Mat_Workpiece_Black` | `(0.07, 0.07, 0.07)` | 0.00 | 0.65 | Black plastic workpiece |

---

## §4 — Animation Architecture

### 4A: Timeline Layout

Use a **120-frame master timeline** at 24 fps (= 5 seconds total).
One complete workpiece pass through one station = ~24 frames.

```
Frames 1–24   : Station receives workpiece and performs its operation
Frames 25–48  : Actuators reset, workpiece ejects to the next station
Frames 49–120 : Full multi-station sequence continues downstream
```

All actuator animations use **LINEAR interpolation**. Easing/bounce is incorrect for pneumatic cylinders.

### 4B: Workpiece Animation

Create a single `Workpiece` object (cylinder, 50 mm diameter × 30 mm height) that travels
through the entire line. It is **not parented to any station**.

Derive every keyframe position from the operational steps in §0A.
If the transcript says "the pusher sends the part to the right," the workpiece X coordinate
must increase at that frame. Never animate the workpiece in a direction that contradicts the transcript.

Key workpiece positions to keyframe (these come from §1, refine with transcript):
- Start: inside the magazine
- After each actuator pickup/release: resting at the handoff coordinate
- During transport: following the carrying actuator's position
- Settled positions: drop Z slightly (2 mm) to represent resting on a surface

### 4C: Full System Choreography

Animate ALL actuators across ALL stations in one synchronized timeline.
Each actuator fires at the frame it would in a real PLC cycle, derived from the operational sequence.

Rules:
- No actuator should fire before the previous step has completed
- Every actuator must return to its home position after its cycle
- The workpiece must be in physical contact with whatever is moving it at each frame
- Derive timing from the operational steps — do not guess PLC order

---

## §5 — Self-Inspection (First Eye)

After building and animating, before calling the second-eye reviewer, complete this
checklist yourself. Answer each question in writing — do not just mentally check it off.
Forcing yourself to write the answer surfaces assumptions.

### Static Check (Frame 1)
- Does every cabinet have the correct 700×350 mm footprint?
- Are stations spaced 700 mm apart on the X axis?
- Are there any floating objects, orphaned meshes, or Z-fighting faces?
- Do materials match the palette? (cylinders=FestoBlue, structure=AnodizedAluminum, sensors=BlackPlastic)
- Is the workpiece visible at the correct pickup point?
- Does the rotary arm radius physically reach its drop-off X? (measure: pivot_x + radius == dropoff_x)
- Does the air slide's bottom edge X coordinate match the next station's pickup X exactly?

### Mid-Stroke Motion Check (Frames ~10, 20, 30)

**How to capture mid-stroke for each actuator:**
Take a screenshot at 1/6, 3/6 (midpoint), and 6/6 of each actuator's own travel range.
Wrong-axis motion is invisible at rest and at full extension — it only betrays itself at the midpoint.

- Does the lift move only in +Z? Any drift in X or Y?
- Does the pusher move only in +X? Any drift?
- Does the rotary arm rotate around the Z axis when viewed from above? (not tilting sideways)
- Does the workpiece follow whichever actuator is carrying it at that frame?
- Are there any inter-actuator collisions mid-stroke?

### End-State Check (Frame 60)
- Has every actuator returned to home position?
- Is the workpiece at the correct station for this frame?
- Does the air slide deliver the workpiece to the correct X coordinate (not short)?
- Does the rejection slide point toward +Y, not back toward −X?

### Sequence vs. Transcript
- Go through `/tmp/operational_steps.txt` step by step. Does the animation match every step?
- Are any steps from the transcript completely absent from the animation?

---

## §6 — Second-Eye Agent Review (CRITICAL — never skip)

After your self-inspection, send screenshots to a fresh agent with zero context.
This is the most important QA step. The reviewer has never seen your build, your decisions,
or your justifications — it sees only the image and a spec sheet, like an engineer
walking up cold to an assembly line for the first time.

### 6A: Capturing Screenshots

**Options for taking screenshots from Blender:**
1. **MCP native** — Use `get_screenshot_of_area_as_image` or `get_screenshot_of_window_as_image`
   from the Blender MCP tools. This is the preferred method — no file I/O needed.
2. **Blender render to disk** — Use `bpy.ops.render.opengl(write_still=True)` to write a PNG
   to `/tmp/`, then read it back with bash or Python.

**Options for encoding screenshots for the API:**
1. **Native** — If you can read file bytes directly, base64-encode them in memory without
   writing intermediate files.
2. **Python (stdlib)** — Use `base64.b64encode(open(path, "rb").read())`. No libraries needed.

### 6B: Frames to Review

Review at minimum these three frames:
- **Frame 1** — static structure check
- **Mid-motion frame** — pick the frame where the most actuators are in mid-stroke simultaneously
- **Frame 60** — end-state / full-system check

For individual actuators with suspect behavior, also review at their personal mid-stroke frame.

### 6C: Calling the Reviewer

Send each screenshot to a **fresh Claude instance** via the Anthropic API.
The reviewer gets zero context about the build — only the image, the station name,
which frame it represents, and the mechanical spec below.

**Reviewer system prompt (use this verbatim):**

```
You are a senior mechatronics QA engineer reviewing a 3D model of a Festo MPS
industrial automation station. You have no prior knowledge of how this model was
built. You are seeing it cold for the first time.

Your job is to find physical and mechanical problems — not aesthetic ones.
Focus on: spatial logic, axis correctness, gap/collision issues, workpiece
reachability, slide orientation, actuator range plausibility.

Respond ONLY with valid JSON in this exact format (no markdown, no preamble):
{
  "overall": "PASS" | "NEEDS_WORK" | "CRITICAL_FAIL",
  "summary": "One sentence of your overall impression",
  "findings": [
    {
      "severity": "critical" | "warning" | "ok",
      "component": "component name or area",
      "observation": "what you actually see",
      "issue": "what is mechanically wrong (or 'none' if severity is ok)",
      "suggestion": "specific fix (or 'none' if severity is ok)"
    }
  ]
}

Be strict. A 5cm gap between stations is a critical failure even if the rest
looks fine. Do not give a pass out of politeness.
```

**User message to the reviewer should include:**
- The screenshot as an image block
- Station name and frame label (e.g., "Testing Station — frame 20, mid Lift motion")
- The mechanical spec: cabinet size, workpiece size, flow direction, material conventions,
  expected slide orientations, handoff coordinates from §1
- Any user-provided reference images (if available), labelled as "REFERENCE PHOTO — compare the model to this"

**Options for making the API call:**
1. **Python (stdlib: urllib)** — `urllib.request.urlopen` with a JSON payload. No extra installs.
2. **Python (library: requests)** — If `requests` is already installed, use it instead.
3. **Install** — Only if neither above option works.

### 6D: Acting on Reviewer Findings

After each review call, process the JSON response:

- **Critical findings** → MUST fix before proceeding. Use the targeted patch protocol in §7.
- **Warning findings** → Fix if time permits. Always log them.
- **OK findings** → Log as confirmed passes.

Keep a running `QA_Report` that tracks: station, round number, frame reviewed, verdict,
list of critical issues found, and which round each was resolved in.

**The QA loop is complete ONLY when the reviewer returns `"overall": "PASS"` on all
three key frames with zero critical findings.**
Do not ask the user if you can skip this step. Do not declare victory prematurely.

### 6E: Including Reference Images in the Review

If the user has provided reference photos, include them as additional image blocks
in the reviewer prompt alongside the model screenshot. Label them clearly as reference
material so the reviewer compares the model against the real thing.

---

## §7 — Targeted Patch Protocol

When a reviewer finding requires a fix, do NOT rebuild the whole scene.

1. Identify the broken object(s) by name from the reviewer's JSON.
2. Delete only those specific objects in Blender.
3. Rebuild only those objects with corrected values.
4. Re-render only the affected frames.
5. Re-run the reviewer on those frames.
6. Update the QA_Report.

Rebuilding everything is a last resort, used only when the reviewer finds structural
problems affecting more than 50% of the scene.

---

## §8 — Common Failure Modes

These are known bugs from previous builds. Check for all of them before the first review.

| Symptom | Cause | Fix |
|---------|-------|-----|
| Rotary arm drops workpiece into empty space | Arm radius ≠ distance to target X | Radius = abs(drop_off_x − pivot_x) |
| Air slide 10 cm short of next station | Ramp length not derived from span + slope | span = required gap; length = span / cos(slope_angle) |
| Actuator moves wrong axis | Axis index mixed up (0/1/2) | X=0, Y=1, Z=2 — verify by checking mid-stroke screenshot |
| Workpiece floats above surface | Z not adjusted after vacuum release | Add settled keyframe (z -= 0.002) at release frame |
| Reviewer can't see the problem area | Screenshot too zoomed out | Navigate to the specific object before screenshotting |
| Reviewer gives vague feedback | Frame context missing from prompt | Always pass station name + frame label + mechanical spec |
| `.001` duplicate object names | Script re-run without cleanup | Delete by name before creating: check if object exists, remove it first |
| Animation not in exported GLB | NLA tracks not baked | Bake all actions before export |
| Actuator fires before previous step completes | Timing not derived from transcript | Re-derive frame timing from operational steps in §0A |

---

## §9 — Full Workflow Checklist

Work through this in order. Do not skip phases.

```
PHASE 0 — RESEARCH
[ ] Fetch or receive YouTube transcript / operational reference for this station
[ ] Distill transcript into numbered mechanical action steps (ground-truth contract)
[ ] Save any user-provided reference images for use in §6E

PHASE 1 — SETUP
[ ] Confirm station X_origin and all handoff coordinates from §1
[ ] Verify Gap Fix Rules (arm radius, slide span) before writing any geometry

PHASE 2 — BUILD
[ ] Create all materials first (check for duplicates)
[ ] Build scene hierarchy with correct names from the start (§2)
[ ] Set animated node custom properties on every moving part

PHASE 3 — ANIMATE
[ ] Create Workpiece object (not parented to any station)
[ ] Keyframe Workpiece path derived from operational steps
[ ] Keyframe all actuators in full system choreography
[ ] Set all animation interpolation to LINEAR

PHASE 4 — SELF-INSPECTION (§5)
[ ] Complete static check in writing
[ ] Complete mid-stroke motion check (screenshots at 1/6, 3/6, 6/6 of each actuator)
[ ] Complete end-state check in writing
[ ] Compare animation against operational steps line by line

PHASE 5 — SECOND-EYE REVIEW (§6)
[ ] Capture screenshots at frame 1, mid-motion frame, frame 60
[ ] Call fresh reviewer agent on each screenshot
[ ] Fix all critical findings using targeted patch (§7)
[ ] Re-review patched frames — loop until all three frames return PASS
[ ] Log final QA_Report

PHASE 6 — DELIVERY
[ ] Apply transforms, purge orphan data
[ ] Bake NLA tracks for GLB export
[ ] Present final screenshot + QA_Report to user
```

---

## §10 — Tool Quick Reference

| Goal | Best Available Option |
|------|-----------------------|
| Run Blender Python | `execute_blender_code` (MCP) |
| Take a viewport screenshot | `get_screenshot_of_area_as_image` or `get_screenshot_of_window_as_image` (MCP) |
| Navigate to an object in viewport | `jump_to_view3d_object_by_name` (MCP) |
| Inspect scene object tree | `get_objects_summary` (MCP) |
| Get object details / properties | `get_object_detail_summary` (MCP) |
| Fetch YouTube transcript | Native fetch → `youtube-transcript-api` (if installed) → install it |
| Encode image to base64 | Native → Python stdlib `base64` module |
| Call reviewer agent | Python stdlib `urllib` → `requests` library → install |
| Search for station reference videos | Web search: `"Festo MPS [Station Name] operation site:youtube.com"` |
| Blender Python API docs | `search_api_docs` / `get_python_api_docs` (MCP) |

---

*SOP v4 — Festo MPS Blender Skill — Option-Aware, Tool-Agnostic, Principle-Driven*
*Improvements over v3: Removed hardcoded scripts. Replaced with option-ranked approaches.*
*Agent chooses the best available method at runtime. Built-in capability always preferred.*
