"""
build_stations_modules.py — per-station module builders.

Executed in the same namespace as build_stations.py, which supplies the
primitives (box/cyl/pivot), the metadata helpers (tag/actuator/sensor), the
keyframers (stroke/swing) and the reusable sub-assemblies (build_belt,
build_slide, build_stopper, build_sensor_arch).
"""


def st10(root):
    """Distributing — stack magazine, push cylinder, swivel arm with vacuum."""
    p = s = "ST10"
    box(f"{p}_Mag_Platform", (-0.20, 0.0, PLATE_Z + 0.026), (0.10, 0.10, 0.006),
        "brushed_aluminum", root)
    for i, (dx, dy) in enumerate(((-0.037, 0), (0.037, 0), (0, -0.037), (0, 0.037))):
        box(f"{p}_Mag_Glass_{i}", (-0.20 + dx, dy, TRANSFER_Z + 0.075),
            (0.006 if dx else 0.080, 0.080 if dx else 0.006, 0.150), "glass", root)
    for i in range(4):
        cyl(f"{p}_Mag_Puck_{i}", (-0.20, 0.0, TRANSFER_Z + 0.016 + i * 0.032),
            PUCK_R, PUCK_H, "game_yellow" if i % 2 else "btn_red", root)
    sensor(box(f"{p}_mag_empty", (-0.20, -0.052, TRANSFER_Z + 0.020),
               (0.018, 0.014, 0.018), "sensor_housing", root), s, "I10.0", "optical")

    box(f"{p}_Push_Body", (-0.305, 0.0, TRANSFER_Z + 0.012), (0.070, 0.036, 0.036),
        "festo_blue", root)
    rod = box(f"{p}_Push_Rod", (-0.252, 0.0, TRANSFER_Z + 0.012),
              (0.045, 0.014, 0.014), "stainless_steel", root)
    actuator(rod, s, "Q10.0", "translate", "X", 0.0, 0.075, 10, 34)
    stroke(rod, 0, 0.075, 10, 34)

    piv = pivot(f"{p}_Arm_Pivot", (-0.02, 0.0, TRANSFER_Z + 0.100), root)
    actuator(piv, s, "Q10.2", "rotate", "Y", 0.0, -95.0, 38, 78)
    swing(piv, 2, 95.0, 38, 78)
    beam = box(f"{p}_Arm_Beam", (-0.11, 0.0, TRANSFER_Z + 0.100),
               (0.180, 0.020, 0.016), "brushed_aluminum", root)
    suc = cyl(f"{p}_Suction", (-0.195, 0.0, TRANSFER_Z + 0.084), 0.012, 0.014,
              "dark_steel", root)
    tag(suc, s, "Q10.1", actuator_type="vacuum")
    for o in (beam, suc):
        reparent_to_pivot(o, piv)
    cyl(f"{p}_Arm_Column", (-0.02, 0.0, TRANSFER_Z + 0.050), 0.018, 0.100,
        "brushed_aluminum", root)

    build_belt(p, root, station=s, tag_id="Q10.3")
    sensor(box(f"{p}_Belt_Sensor", (0.26, -0.062, TRANSFER_Z + 0.014),
               (0.016, 0.016, 0.024), "sensor_housing", root), s, "I10.3", "optical")


def st20(root):
    """Measuring — analogue height probe on a gantry, colour sensor, pass/fail lamps."""
    p = s = "ST20"
    build_belt(p, root, station=s, tag_id="Q20.0")
    for dy in (-0.072, 0.072):
        box(f"{p}_Frame_Post_{'A' if dy < 0 else 'B'}", (0.0, dy, TRANSFER_Z + 0.070),
            (0.018, 0.018, 0.140), "brushed_aluminum", root)
    box(f"{p}_Frame_Top", (0.0, 0.0, TRANSFER_Z + 0.148), (0.018, 0.162, 0.018),
        "brushed_aluminum", root)
    body = box(f"{p}_Probe_Body", (0.0, 0.0, TRANSFER_Z + 0.116),
               (0.040, 0.040, 0.050), "festo_blue", root)
    rod = box(f"{p}_Probe_Rod", (0.0, 0.0, TRANSFER_Z + 0.072),
              (0.012, 0.012, 0.048), "stainless_steel", root)
    actuator(rod, s, "Q20.1", "translate", "Y", 0.0, -0.034, 22, 54)
    stroke(rod, 2, -0.034, 22, 54)
    sensor(body, s, "IW20", "analogue")

    box(f"{p}_Colour_Post", (-0.16, -0.080, TRANSFER_Z + 0.045),
        (0.014, 0.014, 0.090), "brushed_aluminum", root)
    sensor(box(f"{p}_Colour_Sensor", (-0.16, -0.046, TRANSFER_Z + 0.058),
               (0.024, 0.040, 0.024), "sensor_housing", root), s, "IW22", "colour")
    for name, tg, m, dy in (("LED_Pass", "Q20.2", "led_green", -0.02),
                            ("LED_Fail", "Q20.3", "led_red", 0.02)):
        lamp = cyl(f"{p}_{name}", (0.24, dy, TRANSFER_Z + 0.020), 0.010, 0.014, m, root)
        tag(lamp, s, tg, actuator_type="led")
    build_slide(p, "Reject_Slide", root, 0.20, 0.125)


def st30(root):
    """Pick & Place — X gantry whose rail deliberately overhangs -X to reach into
    the neighbouring station, as a real MPS handling station does."""
    p = s = "ST30"
    build_belt(p, root, station=s, tag_id="Q30.3")
    for dy in (-0.070, 0.070):
        box(f"{p}_Gantry_Post_{'A' if dy < 0 else 'B'}", (0.22, dy, TRANSFER_Z + 0.105),
            (0.020, 0.020, 0.210), "brushed_aluminum", root)
    box(f"{p}_Rail_X", (-0.06, 0.0, TRANSFER_Z + 0.200), (0.60, 0.030, 0.030),
        "brushed_aluminum", root)
    car = box(f"{p}_Carriage", (0.20, 0.0, TRANSFER_Z + 0.200),
              (0.060, 0.052, 0.046), "festo_blue", root)
    actuator(car, s, "Q30.0", "translate", "X", 0.0, -0.46, 12, 60)
    stroke(car, 0, -0.46, 12, 60)
    zbody = box(f"{p}_Z_Body", (0.20, 0.0, TRANSFER_Z + 0.164),
                (0.034, 0.034, 0.044), "festo_blue", root)
    zrod = box(f"{p}_Z_Rod", (0.20, 0.0, TRANSFER_Z + 0.120),
               (0.014, 0.014, 0.050), "stainless_steel", root)
    grip = box(f"{p}_Gripper", (0.20, 0.0, TRANSFER_Z + 0.090),
               (0.030, 0.030, 0.018), "dark_steel", root)
    actuator(zrod, s, "Q30.1", "translate", "Y", 0.0, -0.040, 18, 40)
    stroke(zrod, 2, -0.040, 18, 40)
    tag(grip, s, "Q30.2", actuator_type="vacuum")
    for o in (zbody, zrod, grip):
        reparent_to_pivot(o, car)
    sensor(box(f"{p}_Belt_Sensor", (0.26, -0.062, TRANSFER_Z + 0.014),
               (0.016, 0.016, 0.024), "sensor_housing", root), s, "I30.5", "optical")


def st40(root):
    """Sorting — to Festo manual 8046391: TWO gates, THREE slides, a pneumatic
    stopper, and a detect module of three sensors. Undeflected parts run off the
    belt end into slide 3."""
    p = s = "ST40"
    build_belt(p, root, station=s, tag_id="Q40.0")
    build_sensor_arch(p, root, -0.22, s, ["I40.6", "I40.5", "I40.4"])
    build_stopper(p, root, -0.17, 0.0, "Q40.3", s, 20, 96)

    for i, (gx, tg, f_in, f_out) in enumerate(((-0.08, "Q40.1", 26, 52),
                                               (0.06, "Q40.2", 58, 84))):
        piv = pivot(f"{p}_Gate_{i}", (gx, -0.052, TRANSFER_Z + 0.014), root)
        actuator(piv, s, tg, "rotate", "Y", 0.0, -45.0, f_in, f_out)
        swing(piv, 2, 45.0, f_in, f_out)
        # Flap must span the full 0.10 m belt width when swung 45 deg from the
        # near edge: reach = length * sin(45) must exceed 0.10, so length >= 0.142.
        flap = box(f"{p}_Gate_{i}_Flap", (gx + 0.078, -0.052, TRANSFER_Z + 0.014),
                   (0.156, 0.008, 0.026), "stainless_steel", root)
        reparent_to_pivot(flap, piv)
        sensor(box(f"{p}_gate{i}_out", (gx, -0.086, TRANSFER_Z + 0.012),
                   (0.016, 0.016, 0.020), "sensor_housing", root),
               s, f"I40.{1 + i * 2}", "inductive")
        build_slide(p, f"Chute_{i}", root, gx + 0.02, 0.125)
    build_slide(p, "Chute_2", root, 0.31, 0.0, length=0.14)
    sensor(box(f"{p}_chute_full", (0.31, 0.075, TRANSFER_Z + 0.004),
               (0.016, 0.016, 0.018), "sensor_housing", root), s, "I40.2", "optical")


def st50(root):
    """Separating — singulates a stream: stopper holds parts, flap diverts one."""
    p = s = "ST50"
    build_belt(p, root, station=s, tag_id="Q50.0")
    build_stopper(p, root, -0.06, 0.0, "Q50.1", s, 24, 84)
    piv = pivot(f"{p}_Flap_Pivot", (0.10, -0.052, TRANSFER_Z + 0.014), root)
    actuator(piv, s, "Q50.2", "rotate", "Y", 0.0, -50.0, 40, 76)
    swing(piv, 2, 50.0, 40, 76)
    # same reach requirement as the ST40 gates
    flap = box(f"{p}_Flap", (0.168, -0.052, TRANSFER_Z + 0.014),
               (0.156, 0.008, 0.026), "stainless_steel", root)
    reparent_to_pivot(flap, piv)
    build_slide(p, "Chute", root, 0.12, 0.125)
    sensor(box(f"{p}_Belt_Sensor", (-0.14, -0.062, TRANSFER_Z + 0.014),
               (0.016, 0.016, 0.024), "sensor_housing", root), s, "I50.0", "optical")


TABLE_Y = 0.185


def st60(root):
    """Joining — rotary indexing table with three nests plus a press head."""
    p = s = "ST60"
    build_belt(p, root, station=s, tag_id="Q60.3")
    cyl(f"{p}_Table_Base", (0.0, TABLE_Y, PLATE_Z + 0.014), 0.110, 0.028,
        "brushed_aluminum", root, verts=24)
    tp = pivot(f"{p}_Table_Pivot", (0.0, TABLE_Y, TRANSFER_Z), root)
    actuator(tp, s, "Q60.0", "rotate", "Y", 0.0, 120.0, 14, 52)
    swing(tp, 2, 120.0, 14, 52)
    top = cyl(f"{p}_Table_Rot", (0.0, TABLE_Y, TRANSFER_Z - 0.005), 0.100, 0.010,
              "stainless_steel", root, verts=24)
    reparent_to_pivot(top, tp)
    for i in range(3):
        a = math.radians(i * 120)
        n = cyl(f"{p}_Table_Nest_{i}",
                (0.062 * math.cos(a), TABLE_Y + 0.062 * math.sin(a), TRANSFER_Z + 0.004),
                0.027, 0.010, "dark_steel", root, verts=16)
        reparent_to_pivot(n, tp)
    for dy in (-0.075, 0.075):
        box(f"{p}_Press_Post_{'A' if dy < 0 else 'B'}", (0.10, TABLE_Y + dy, TRANSFER_Z + 0.080),
            (0.018, 0.018, 0.160), "brushed_aluminum", root)
    box(f"{p}_Press_Top", (0.10, TABLE_Y, TRANSFER_Z + 0.168), (0.018, 0.168, 0.018),
        "brushed_aluminum", root)
    box(f"{p}_Press_Body", (0.10, TABLE_Y, TRANSFER_Z + 0.132), (0.044, 0.044, 0.052),
        "festo_blue", root)
    ram = box(f"{p}_Press_Ram", (0.10, TABLE_Y, TRANSFER_Z + 0.086),
              (0.016, 0.016, 0.052), "stainless_steel", root)
    actuator(ram, s, "Q60.1", "translate", "Y", 0.0, -0.038, 58, 88)
    stroke(ram, 2, -0.038, 58, 88)
    sensor(box(f"{p}_Part_Sensor", (-0.14, -0.062, TRANSFER_Z + 0.014),
               (0.016, 0.016, 0.022), "sensor_housing", root), s, "I60.0", "optical")


def st70(root):
    """Packaging — carton magazine over the belt with a pusher."""
    p = s = "ST70"
    build_belt(p, root, station=s, tag_id="Q70.0")
    box(f"{p}_Box_Mag_Base", (-0.16, 0.115, TRANSFER_Z + 0.010),
        (0.11, 0.09, 0.008), "brushed_aluminum", root)
    for i, (dx, dy) in enumerate(((-0.052, 0), (0.052, 0), (0, -0.042), (0, 0.042))):
        box(f"{p}_Box_Mag_Wall_{i}", (-0.16 + dx, 0.115 + dy, TRANSFER_Z + 0.062),
            (0.006 if dx else 0.104, 0.084 if dx else 0.006, 0.100), "glass", root)
    for i in range(3):
        box(f"{p}_Carton_{i}", (-0.16, 0.115, TRANSFER_Z + 0.026 + i * 0.026),
            (0.086, 0.070, 0.022), "game_yellow", root)
    box(f"{p}_Push_Body", (-0.16, 0.225, TRANSFER_Z + 0.020),
        (0.048, 0.058, 0.038), "festo_blue", root)
    rod = box(f"{p}_Push_Rod", (-0.16, 0.176, TRANSFER_Z + 0.020),
              (0.016, 0.052, 0.014), "stainless_steel", root)
    # pushes in -Y (Blender) toward the belt; Blender +Y maps to three -Z
    actuator(rod, s, "Q70.1", "translate", "Z", 0.0, 0.078, 20, 56)
    stroke(rod, 1, -0.078, 20, 56)
    sensor(box(f"{p}_Belt_Sensor", (0.22, -0.062, TRANSFER_Z + 0.014),
               (0.016, 0.016, 0.024), "sensor_housing", root), s, "I70.0", "optical")


def st80(root):
    """Storage — infeed belt plus an X-Z gantry serving a three-shelf rack."""
    p = s = "ST80"
    build_belt(p, root, station=s, tag_id="Q80.3")
    for i in range(3):
        box(f"{p}_Rack_Shelf_{i}", (0.20, 0.06, TRANSFER_Z + 0.020 + i * 0.058),
            (0.180, 0.150, 0.008), "brushed_aluminum", root)
        for j in range(2):
            box(f"{p}_Rack_Slot_{i}_{j}", (0.14 + j * 0.10, 0.06,
                TRANSFER_Z + 0.032 + i * 0.058), (0.058, 0.130, 0.016),
                "dark_steel", root)
    for dy in (-0.018, 0.138):
        box(f"{p}_Rack_Post_{'A' if dy < 0 else 'B'}", (0.20, dy, TRANSFER_Z + 0.090),
            (0.014, 0.014, 0.180), "brushed_aluminum", root)
    box(f"{p}_Rail_X", (-0.05, -0.13, TRANSFER_Z + 0.180), (0.56, 0.026, 0.026),
        "brushed_aluminum", root)
    for dx in (-0.30, 0.22):
        box(f"{p}_Gantry_Post_{'A' if dx < 0 else 'B'}", (dx, -0.13, TRANSFER_Z + 0.090),
            (0.020, 0.020, 0.180), "brushed_aluminum", root)
    car = box(f"{p}_Carriage", (-0.26, -0.13, TRANSFER_Z + 0.180),
              (0.054, 0.046, 0.042), "festo_blue", root)
    actuator(car, s, "Q80.0", "translate", "X", 0.0, 0.44, 14, 62)
    stroke(car, 0, 0.44, 14, 62)
    zrod = box(f"{p}_Z_Rod", (-0.26, -0.13, TRANSFER_Z + 0.136),
               (0.014, 0.014, 0.052), "stainless_steel", root)
    grip = box(f"{p}_Gripper", (-0.26, -0.13, TRANSFER_Z + 0.104),
               (0.030, 0.030, 0.018), "dark_steel", root)
    actuator(zrod, s, "Q80.1", "translate", "Y", 0.0, -0.042, 22, 44)
    stroke(zrod, 2, -0.042, 22, 44)
    tag(grip, s, "Q80.2", actuator_type="vacuum")
    for o in (zrod, grip):
        reparent_to_pivot(o, car)
    sensor(box(f"{p}_Slot_Sensor", (0.20, -0.030, TRANSFER_Z + 0.020),
               (0.016, 0.016, 0.022), "sensor_housing", root), s, "I80.0", "optical")


BUILDERS = {"ST10": st10, "ST20": st20, "ST30": st30, "ST40": st40,
            "ST50": st50, "ST60": st60, "ST70": st70, "ST80": st80}

# Shared chassis parts, matched on the de-prefixed name. Anything else under a
# station root is a module and gets wiped before rebuild, so this stays re-runnable.
CHASSIS_MARKERS = ("Skirt", "Cabinet", "Vent_", "HMI_", "Btn_", "Key_", "EStop",
                   "Plate_", "Grid_", "Tower_", "LED_Red", "LED_Amber", "LED_Green",
                   "Solenoid", "Valve", "Tube_")


def wipe_modules(root):
    stack, doomed = list(root.children), []
    while stack:
        o = stack.pop()
        stack.extend(o.children)
        base = o.name[len(root.name) + 1:] if o.name.startswith(root.name + "_") else o.name
        if not any(c in base for c in CHASSIS_MARKERS):
            doomed.append(o)
    for o in doomed:
        bpy.data.objects.remove(o, do_unlink=True)
    return len(doomed)


def build_all():
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, CYCLE_END
    scene.render.fps = 24
    report = []
    for name, fn in BUILDERS.items():
        root = bpy.data.objects[name]
        removed = wipe_modules(root)
        before = len(bpy.data.objects)
        fn(root)
        report.append({"station": name, "wiped": removed,
                       "added": len(bpy.data.objects) - before})
    # purge meshes orphaned by the wipe
    for m in [m for m in bpy.data.meshes if m.users == 0]:
        bpy.data.meshes.remove(m)
    bpy.context.view_layer.update()
    return report
