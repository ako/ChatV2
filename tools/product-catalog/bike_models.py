"""The bikes' bill of materials and 3D specs: the seed of the app's BOM data.

Generates mdlsource/26b-bike-bom-seed.mdl (and, with --json, the models as the
viewer receives them, for the geometry check in tools/product-catalog/check_models.mjs).

Three kinds of data, all stored in the app (mdlsource/26-bike-bom.mdl):
  - MOUNT SLOTS per bike: named points on the frame (down tube, rear hub, seat
    tube...), with a fit size where one matters (the seat tube's diameter).
  - BOM LINES per bike: the parts it is built with, fitted (it ships with them,
    the graph's "has component") or standard (tyres, tubes, brakes, seat post).
  - PART MODELS per part: the slot it mounts at, its fit size, which way it moves
    when the bike is exploded, and its shape as simple primitives placed relative
    to the slot.

The geometry is the procedural bike the viewer used to build in code: side view
in the XY plane, metres, wheels on the ground at y = 0, Z across the bike.
Angles are degrees.

Run:  python3 tools/product-catalog/bike_models.py [--json out.json]
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

R = 0.35                       # wheel radius
REAR = (-0.55, R, 0.0)
FRONT = (0.55, R, 0.0)
BB = (0.0, 0.3, 0.0)           # bottom bracket
SEAT = (-0.13, 0.86, 0.0)      # top of the seat tube
HEAD_TOP = (0.42, 0.93, 0.0)
HEAD_LOW = (0.46, 0.76, 0.0)


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def sub(a, b):
    return tuple(x - y for x, y in zip(a, b))


def mid(a, b):
    return tuple((x + y) / 2 for x, y in zip(a, b))


# ---- Mount slots: where parts attach on the shared frame -------------------
SLOT_POINTS = {
    "down_tube": ("Down tube (battery mount)", mid(BB, HEAD_LOW)),
    "rear_hub": ("Rear hub (hub motor)", REAR),
    "bottom_bracket": ("Bottom bracket (mid-drive motor)", BB),
    "floor": ("Beside the bike (loose items)", (-0.2, 0.0, 0.42)),
    "wheels": ("Wheels (tyres, tubes, brakes)", (0.0, R, 0.0)),
    "seat_tube": ("Seat tube (seat post)", SEAT),
    "rear_rack": ("Rear rack mount", (REAR[0], REAR[1] + R + 0.06, 0.0)),
    "handlebar": ("Handlebar", HEAD_TOP),
    "frame": ("Frame (lights, lock, rider)", (0.0, 0.0, 0.0)),
}
# which slots each bike has, and their fit sizes (mm)
BIKES = {
    "EB-200": {"slots": ["down_tube", "rear_hub", "floor", "wheels", "seat_tube", "rear_rack", "handlebar", "frame"], "fit": {"seat_tube": 27.2}},
    "EB-500": {"slots": ["down_tube", "bottom_bracket", "floor", "wheels", "seat_tube", "handlebar", "frame"], "fit": {"seat_tube": 30.9}},
    "BK-100": {"slots": ["wheels", "seat_tube", "rear_rack", "handlebar", "frame"], "fit": {"seat_tube": 27.2}},
}
# what each bike is built with: fitted (ships with it) and standard parts, with quantities
BOM = {
    "EB-200": [("BAT-418", 1, "Fitted"), ("MOT-250H", 1, "Fitted"), ("CHG-2A", 1, "Fitted"),
               ("TYR-28", 2, "Standard"), ("TUB-28", 2, "Standard"), ("BRK-PAD", 1, "Standard"), ("SSP-27", 1, "Standard")],
    "EB-500": [("BAT-500", 1, "Fitted"), ("MOT-250M", 1, "Fitted"), ("CHG-4A", 1, "Fitted"),
               ("TYR-28", 2, "Standard"), ("TUB-28", 2, "Standard"), ("BRK-PAD", 1, "Standard"), ("SSP-31", 1, "Standard")],
    "BK-100": [("TYR-28", 2, "Standard"), ("TUB-28", 2, "Standard"), ("BRK-RIM", 1, "Standard"), ("SSP-27", 1, "Standard")],
}

# ---- Shapes ----------------------------------------------------------------
DARK, METAL, RUBBER, ORANGE, PURPLE = "#2a3142", "#b9c2cf", "#1a1d24", "#d4682a", "#9b5bb5"


def shape(kind, pos, size, color, finish="Matte", rot=(0, 0, 0), segments=0, detail=0, emissive="", glow=0.0, opacity=1.0, wire=False):
    return {"kind": kind, "pos": pos, "size": size, "rot": rot, "color": color, "finish": finish, "segments": segments,
            "detail": detail, "emissive": emissive, "glow": glow, "opacity": opacity, "wire": wire}


def box(pos, w, h, d, color, **kw):
    return shape("Box", pos, (w, h, d), color, **kw)


def cyl(pos, r_top, r_bottom, length, color, segments, **kw):
    return shape("Cylinder", pos, (r_top, r_bottom, length), color, segments=segments, **kw)


def torus(center, radius, tube, color, z=0.0, radial=12, tubular=48, **kw):
    return shape("Torus", (center[0], center[1], center[2] + z), (radius, tube, 0), color, segments=tubular, detail=radial, **kw)


def tube(a, b, radius, color, **kw):
    """A cylinder from a to b (in the XY plane)."""
    d = sub(b, a)
    length = math.sqrt(sum(x * x for x in d))
    angle = math.degrees(math.atan2(-d[0], d[1]))
    return cyl(add(a, tuple(x / 2 for x in d)), radius, radius, length, color, 14, rot=(0, 0, angle), **kw)


def along(a, b, w, h, d, lift, color, lerp_to=None, lerp=0.0, **kw):
    """A box along the line a-b, `w` of its length, raised `lift` above it."""
    v = sub(b, a)
    length = math.sqrt(sum(x * x for x in v))
    theta = math.atan2(v[1], v[0])
    pos = add(a, tuple(x / 2 for x in v))
    pos = add(pos, (-math.sin(theta) * lift, math.cos(theta) * lift, 0))
    if lerp_to is not None:
        pos = add(pos, tuple((t - p) * lerp for p, t in zip(pos, lerp_to)))
    return box(pos, length * w, h, d, color, rot=(0, 0, math.degrees(theta)), **kw)


def rot_x(s):
    s["rot"] = (90, 0, 0)
    return s


PARTS = {}  # sku -> (slot, fit mm or None, explode, [shapes in absolute coordinates])

PARTS["BAT-418"] = PARTS["BAT-500"] = ("down_tube", None, (0.05, 0.35, 0.35), [
    along(BB, HEAD_LOW, 0.62, 0.075, 0.085, 0.06, "#3a4256"),
    along(BB, HEAD_LOW, 0.12, 0.078, 0.088, 0.06, "#4fd1c5", lerp_to=HEAD_LOW, lerp=0.12, emissive="#0d3b37", glow=1.0)])
PARTS["CVR-500"] = ("down_tube", None, (0.1, 0.55, 0.5), [
    along(BB, HEAD_LOW, 0.66, 0.1, 0.11, 0.06, "#5b6680", opacity=0.55)])
PARTS["MOT-250H"] = ("rear_hub", None, (-0.25, 0.25, 0.45), [
    rot_x(cyl(REAR, 0.085, 0.085, 0.075, DARK, 28)),
    torus(REAR, 0.085, 0.008, METAL, finish="Metal")])
PARTS["MOT-250M"] = ("bottom_bracket", None, (0.1, -0.2, 0.45), [
    box((BB[0] + 0.03, BB[1] - 0.02, 0), 0.17, 0.15, 0.1, DARK, rot=(0, 0, math.degrees(-0.35)))])
PARTS["CHG-2A"] = PARTS["CHG-4A"] = ("floor", None, (0, 0.15, 0.3), [
    box((-0.15, 0.02, 0.42), 0.14, 0.04, 0.08, DARK),
    rot_x(torus((-0.32, 0.01, 0.42), 0.06, 0.006, RUBBER, radial=6, tubular=24, finish="Rubber"))])
PARTS["TYR-28"] = ("wheels", None, (0, 0, 0.45), [
    torus(REAR, R - 0.02, 0.026, RUBBER, finish="Rubber"), torus(FRONT, R - 0.02, 0.026, RUBBER, finish="Rubber")])
PARTS["TUB-28"] = ("wheels", None, (0, 0, 0.8), [
    torus(REAR, R - 0.022, 0.014, "#7a4b2a"), torus(FRONT, R - 0.022, 0.014, "#7a4b2a")])
disc = []
for c in (REAR, FRONT):
    disc.append(rot_x(cyl((c[0], c[1], 0.055), 0.08, 0.08, 0.004, METAL, 32, finish="Metal")))
    disc.append(box((c[0] - 0.06, c[1] + 0.05, 0.055), 0.05, 0.035, 0.03, ORANGE))
PARTS["BRK-PAD"] = ("wheels", None, (0, 0, -0.45), disc)
PARTS["BRK-RIM"] = ("wheels", None, (0, 0.25, -0.4), [
    box((REAR[0] + 0.12, REAR[1] + R - 0.03, 0), 0.04, 0.02, 0.06, ORANGE),
    box((FRONT[0] - 0.06, FRONT[1] + R - 0.03, 0), 0.04, 0.02, 0.06, ORANGE)])
for sku, fit in (("SSP-27", 27.2), ("SSP-31", 30.9)):
    PARTS[sku] = ("seat_tube", fit, (-0.1, 0.35, 0), [
        tube(add(SEAT, (0.02, -0.08, 0)), add(SEAT, (-0.04, 0.16, 0)), 0.016, METAL, finish="Metal"),
        rot_x(torus(add(SEAT, (-0.02, 0.07, 0)), 0.022, 0.006, ORANGE))])
RACK_Y = REAR[1] + R + 0.06
PARTS["RCK-26"] = ("rear_rack", None, (-0.2, 0.35, 0), [
    box((REAR[0] + 0.02, RACK_Y, 0), 0.42, 0.015, 0.14, METAL, finish="Metal"),
    tube((REAR[0] + 0.1, RACK_Y, 0.06), (REAR[0], REAR[1], 0.06), 0.008, METAL, finish="Metal"),
    tube((REAR[0] + 0.1, RACK_Y, -0.06), (REAR[0], REAR[1], -0.06), 0.008, METAL, finish="Metal"),
    tube((REAR[0] + 0.2, RACK_Y, 0), add(SEAT, (0, -0.06, 0)), 0.007, METAL, finish="Metal")])
PARTS["BSK-FR"] = ("handlebar", None, (0.35, 0.15, 0), [
    box((HEAD_TOP[0] + 0.22, HEAD_TOP[1] - 0.02, 0), 0.28, 0.2, 0.3, PURPLE, wire=True)])
PARTS["CHS-MAXI"] = ("rear_rack", None, (-0.15, 0.55, 0), [
    box((REAR[0] + 0.02, REAR[1] + R + 0.12, 0), 0.3, 0.06, 0.28, PURPLE),
    box((REAR[0] - 0.14, REAR[1] + R + 0.28, 0), 0.06, 0.32, 0.28, PURPLE)])
PARTS["PAN-20"] = ("rear_rack", None, (-0.1, 0.1, 0.4), [
    box((REAR[0] + 0.02, REAR[1] + R - 0.12, z), 0.34, 0.3, 0.09, "#2f6f5e") for z in (0.13, -0.13)])
PARTS["LGT-USB"] = ("frame", None, (0.2, 0.25, 0), [
    cyl((HEAD_TOP[0] + 0.08, HEAD_TOP[1] + 0.02, 0), 0.025, 0.03, 0.06, "#fff3c4", 16, rot=(0, 0, 90), emissive="#ffe08a", glow=0.6),
    box(add(SEAT, (-0.06, 0.02, 0)), 0.03, 0.05, 0.03, "#ff5a5a", emissive="#c62828", glow=0.6)])
lock = torus((BB[0] - 0.06, BB[1] + 0.28, 0), 0.06, 0.012, ORANGE)
lock["rot"] = (0, 90, 0)
PARTS["LCK-CHAIN"] = ("frame", None, (-0.3, 0.1, 0.25), [lock])
PARTS["HLM-SPD"] = ("frame", None, (0, 0.3, 0.3), [
    shape("Dome", (HEAD_TOP[0] - 0.04, HEAD_TOP[1] + 0.08, 0.2), (0.12, 0, 0), "#4f6bd8", segments=24, detail=12)])


def relative(sku):
    """A part's shapes with positions relative to its slot."""
    slot, fit, explode, shapes = PARTS[sku]
    anchor = SLOT_POINTS[slot][1]
    out = []
    for s in shapes:
        s = dict(s)
        s["pos"] = tuple(round(p - a, 5) for p, a in zip(s["pos"], anchor))
        s["size"] = tuple(round(x, 5) for x in s["size"])
        s["rot"] = tuple(round(x, 4) for x in s["rot"])
        out.append(s)
    return slot, fit, explode, out


def models():
    """Each bike as the viewer receives it, with every part model (for the geometry check)."""
    out = {}
    for bike, b in BIKES.items():
        slots = [{"code": c, "name": SLOT_POINTS[c][0], "pos": SLOT_POINTS[c][1], "fit": b["fit"].get(c)} for c in b["slots"]]
        out[bike] = {"ref": bike, "slots": slots, "bom": [{"ref": s, "quantity": q, "role": r} for s, q, r in BOM[bike]]}
    out["parts"] = {}
    for sku in PARTS:
        slot, fit, explode, shapes = relative(sku)
        out["parts"][sku] = {"slot": slot, "fit": fit, "explode": explode, "shapes": shapes}
    out["slotPoints"] = {c: v[1] for c, v in SLOT_POINTS.items()}
    return out


def mdl():
    def q(s):
        return "empty" if s in (None, "") else "'" + str(s).replace("'", "''") + "'"

    def n(x):
        return "empty" if x is None else repr(round(float(x), 5))

    calls = []
    for bike, b in BIKES.items():
        for code in b["slots"]:
            name, p = SLOT_POINTS[code]
            calls.append(f'call microflow "ServiceDesk"."SUB_MountSlot_SeedOne" (BikeSku = {q(bike)}, Code = {q(code)}, Name = {q(name)}, '
                         f'X = {n(p[0])}, Y = {n(p[1])}, Z = {n(p[2])}, FitDiameterMm = {n(b["fit"].get(code))});')
    for bike in BIKES:
        for sku, qty, role in BOM[bike]:
            calls.append(f'call microflow "ServiceDesk"."SUB_BomLine_SeedOne" (BikeSku = {q(bike)}, PartSku = {q(sku)}, Quantity = {qty}, Role = ServiceDesk.ENUM_BomRole.{role});')
    for sku in PARTS:
        slot, fit, explode, shapes = relative(sku)
        calls.append(f'call microflow "ServiceDesk"."SUB_PartModel_SeedOne" (Sku = {q(sku)}, MountsAt = {q(slot)}, FitDiameterMm = {n(fit)}, '
                     f'ExplodeX = {n(explode[0])}, ExplodeY = {n(explode[1])}, ExplodeZ = {n(explode[2])});')
        for i, s in enumerate(shapes, 1):
            calls.append(
                f'call microflow "ServiceDesk"."SUB_ShapePart_SeedOne" (Sku = {q(sku)}, Seq = {i}, Kind = ServiceDesk.ENUM_ShapeKind.{s["kind"]}, '
                f'Finish = ServiceDesk.ENUM_ShapeFinish.{s["finish"]}, Color = {q(s["color"])}, Emissive = {q(s["emissive"])}, Glow = {n(s["glow"])}, '
                f'Opacity = {n(s["opacity"])}, Wireframe = {"true" if s["wire"] else "false"}, '
                f'X = {n(s["pos"][0])}, Y = {n(s["pos"][1])}, Z = {n(s["pos"][2])}, '
                f'SizeA = {n(s["size"][0])}, SizeB = {n(s["size"][1])}, SizeC = {n(s["size"][2])}, '
                f'RotX = {n(s["rot"][0])}, RotY = {n(s["rot"][1])}, RotZ = {n(s["rot"][2])}, Segments = {s["segments"]}, Detail = {s["detail"]});')
    out = ["mdl 1;", "", "-- GENERATED by tools/product-catalog/bike_models.py: do not edit by hand.", ""]
    batch = 20
    parts = [calls[i:i + batch] for i in range(0, len(calls), batch)]
    for k, chunk in enumerate(parts, 1):
        out.append(f"/** Seeds part {k} of {len(parts)} of the bikes' mount slots, BOM and part models. Generated. */")
        out.append(f'create or modify microflow "ServiceDesk"."SUB_BikeBom_Seed_{k}" ()\nfolder \'Bike BOM\'\nbegin')
        out.extend("  " + c for c in chunk)
        out.append("end;\n")
    out.append("/** Seeds the mount slots, BOM lines and part models unless there are BOM lines already. Generated. */")
    out.append('create or modify microflow "ServiceDesk"."SUB_BikeBom_Seed" ()\nreturns Boolean as $Seeded\nfolder \'Bike BOM\'\nbegin')
    out.append('  retrieve $Any from "ServiceDesk"."BomLine" first;\n  if $Any != empty then\n    return false;\n  end if;')
    out.extend(f'  call microflow "ServiceDesk"."SUB_BikeBom_Seed_{k}" ();' for k in range(1, len(parts) + 1))
    out.append("  log info node 'ServiceDesk' 'Seeded the bikes'' mount slots, BOM and part models.';\n  return true;\nend;")
    return "\n".join(out) + "\n"


if __name__ == "__main__":
    if "--json" in sys.argv:
        with open(sys.argv[sys.argv.index("--json") + 1], "w") as fh:
            json.dump(models(), fh, indent=1)
    with open(os.path.join(ROOT, "mdlsource", "26b-bike-bom-seed.mdl"), "w") as fh:
        fh.write(mdl())
    print("wrote mdlsource/26b-bike-bom-seed.mdl")
