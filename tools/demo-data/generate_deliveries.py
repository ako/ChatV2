"""Generates the demo delivery history, deterministically.

Writes two files that must agree with each other:
  tools/carrier-mcp/parcels.json        the carrier's tracking data (served by
                                        tools/carrier-mcp/server.py over MCP and REST)
  mdlsource/15-order-history-seed.mdl   the app's microflow that seeds the matching
                                        historical orders (SO-10101 and up)

The 11 parcels of the original demo orders (SO-10001..SO-10015) are written by
hand below so their stories stay as the tickets describe them. The historical
orders are generated: picked up from the shop's warehouse in Tilburg, through
the carrier's hub, out for delivery, delivered. DHL's Venlo hub is slow on
purpose, so "where is most time spent" has an answer.

Run:  python3 tools/demo-data/generate_deliveries.py
"""
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
rng = random.Random(2026)

# Stage codes. The app maps each event to the delivery leg it ends:
# PICKED_UP ends "Warehouse", AT_HUB ends "In transit", EXCEPTION and
# OUT_FOR_DELIVERY end "At hub", DELIVERED ends "Last mile".


def ev(at, location, stage, text):
    return {"at": at, "location": location, "stage": stage, "text": text}


# The original demo orders' parcels, as before but with stages and times.
FIXED = [
    ("3SABCD000101", "PostNL", "SO-10001", [ev("2026-10-09T16:10:00Z", "Tilburg", "PICKED_UP", "Picked up at the shop"), ev("2026-10-10T06:40:00Z", "Utrecht", "AT_HUB", "Received at sorting centre"), ev("2026-10-11T08:05:00Z", "Utrecht", "OUT_FOR_DELIVERY", "Out for delivery"), ev("2026-10-11T13:20:00Z", "Amsterdam", "DELIVERED", "Delivered, signed by A. Jansen")]),
    ("JVGL0000000102", "DHL", "SO-10002", [ev("2026-11-03T15:30:00Z", "Leipzig", "PICKED_UP", "Shipment picked up"), ev("2026-11-04T09:15:00Z", "Venlo", "AT_HUB", "Arrived at hub"), ev("2026-11-04T18:00:00Z", "Venlo", "EXCEPTION", "Delayed: sorting backlog, expected 2026-11-10")]),
    ("3SABCD000104", "PostNL", "SO-10004", [ev("2026-09-24T16:00:00Z", "Tilburg", "PICKED_UP", "Picked up at the shop"), ev("2026-09-25T05:50:00Z", "Utrecht", "AT_HUB", "Received at sorting centre"), ev("2026-09-26T07:45:00Z", "Utrecht", "OUT_FOR_DELIVERY", "Out for delivery"), ev("2026-09-26T11:30:00Z", "Rotterdam", "DELIVERED", "Delivered to neighbour, house number 12")]),
    ("1Z999AA10000105", "UPS", "SO-10005", [ev("2026-10-28T14:00:00Z", "Eindhoven", "PICKED_UP", "Picked up"), ev("2026-10-28T21:30:00Z", "Eindhoven", "AT_HUB", "Arrived at UPS hub"), ev("2026-10-29T07:10:00Z", "Eindhoven", "OUT_FOR_DELIVERY", "Out for delivery"), ev("2026-10-29T12:45:00Z", "Rotterdam", "DELIVERED", "Delivered")]),
    ("JVGL0000000106", "DHL", "SO-10006", [ev("2026-11-06T15:10:00Z", "Leipzig", "PICKED_UP", "Shipment picked up"), ev("2026-11-07T04:20:00Z", "Venlo", "AT_HUB", "Arrived at hub"), ev("2026-11-07T08:30:00Z", "Venlo", "OUT_FOR_DELIVERY", "Out for delivery")]),
    ("3SABCD000108", "PostNL", "SO-10008", [ev("2026-10-30T16:20:00Z", "Tilburg", "PICKED_UP", "Picked up at the shop"), ev("2026-10-31T06:10:00Z", "Utrecht", "AT_HUB", "Received at sorting centre"), ev("2026-11-01T08:00:00Z", "Utrecht", "OUT_FOR_DELIVERY", "Out for delivery"), ev("2026-11-01T14:40:00Z", "Haarlem", "DELIVERED", "Delivered, parcel damaged on arrival noted by courier")]),
    ("1Z999AA10000110", "UPS", "SO-10010", [ev("2026-09-10T13:30:00Z", "Eindhoven", "PICKED_UP", "Picked up"), ev("2026-09-10T22:00:00Z", "Eindhoven", "AT_HUB", "Arrived at UPS hub"), ev("2026-09-11T07:20:00Z", "Eindhoven", "OUT_FOR_DELIVERY", "Out for delivery"), ev("2026-09-11T10:55:00Z", "Delft", "DELIVERED", "Delivered")]),
    ("3SABCD000111", "PostNL", "SO-10011", [ev("2026-11-03T16:00:00Z", "Tilburg", "PICKED_UP", "Picked up at the shop"), ev("2026-11-04T06:30:00Z", "Utrecht", "AT_HUB", "Received at sorting centre"), ev("2026-11-05T09:00:00Z", "Utrecht", "EXCEPTION", "Address change requested, held at depot")]),
    ("JVGL0000000112", "DHL", "SO-10012", [ev("2026-10-25T15:00:00Z", "Leipzig", "PICKED_UP", "Shipment picked up"), ev("2026-10-26T05:40:00Z", "Venlo", "AT_HUB", "Arrived at hub"), ev("2026-10-27T08:15:00Z", "Venlo", "OUT_FOR_DELIVERY", "Out for delivery"), ev("2026-10-27T15:30:00Z", "Leiden", "DELIVERED", "Delivered")]),
    ("1Z999AA10000113", "UPS", "SO-10013", [ev("2026-11-05T13:50:00Z", "Eindhoven", "PICKED_UP", "Picked up, 2 of 3 packages scanned"), ev("2026-11-05T21:10:00Z", "Eindhoven", "AT_HUB", "Arrived at UPS hub"), ev("2026-11-06T07:30:00Z", "Eindhoven", "OUT_FOR_DELIVERY", "Out for delivery"), ev("2026-11-06T13:05:00Z", "Groningen", "DELIVERED", "Delivered 2 of 3 packages; 1 package missing")]),
    ("3SABCD000116", "PostNL", "SO-10016", [ev("2026-11-05T16:00:00Z", "Tilburg", "PICKED_UP", "Picked up at the shop"), ev("2026-11-06T06:00:00Z", "Utrecht", "AT_HUB", "Received at sorting centre"), ev("2026-11-06T08:00:00Z", "Utrecht", "OUT_FOR_DELIVERY", "Out for delivery"), ev("2026-11-06T13:10:00Z", "Amsterdam", "DELIVERED", "Delivered, signed by A. Jansen")]),
    ("JVGL0000000115", "DHL", "SO-10015", [ev("2026-08-11T15:20:00Z", "Leipzig", "PICKED_UP", "Shipment picked up"), ev("2026-08-12T06:00:00Z", "Venlo", "AT_HUB", "Arrived at hub"), ev("2026-08-13T08:10:00Z", "Venlo", "OUT_FOR_DELIVERY", "Out for delivery"), ev("2026-08-13T16:25:00Z", "Zwolle", "DELIVERED", "Delivered")]),
]

# Carrier profiles for the generated history: hub, and (min, max) hours per leg.
CARRIERS = {
    "PostNL": {"weight": 5, "hub": "Utrecht", "transit": (9, 16), "hub_hours": (20, 34), "last_mile": (3, 8), "code": lambda n: f"3SABCD{n:06d}"},
    "DHL": {"weight": 3, "hub": "Venlo", "transit": (10, 18), "hub_hours": (40, 90), "last_mile": (4, 9), "code": lambda n: f"JVGL{n:010d}"},
    "UPS": {"weight": 2, "hub": "Eindhoven", "transit": (6, 10), "hub_hours": (8, 14), "last_mile": (3, 7), "code": lambda n: f"1Z999AA1{n:07d}"},
}
CUSTOMERS = [("ada.jansen@example.com", 8), ("bram.devries@example.com", 12), ("chloe.martin@example.com", 9), ("daan.bakker@example.com", 9), ("emma.visser@example.com", 10)]
CITIES = ["Amsterdam", "Rotterdam", "Utrecht", "Den Haag", "Haarlem", "Leiden", "Delft", "Zwolle", "Groningen", "Arnhem", "Nijmegen", "Breda"]
AMOUNTS = [18.00, 27.10, 32.75, 44.90, 54.20, 75.00, 89.50, 129.00, 249.95, 410.00, 549.00, 899.00, 1299.00, 2150.00]


def iso(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def generate():
    orders, parcels = [], []
    for code, carrier, order_number, events in FIXED:
        parcels.append({"trackingCode": code, "carrier": carrier, "orderNumber": order_number, "events": events})
    names = list(CARRIERS)
    weights = [CARRIERS[c]["weight"] for c in names]
    number = 10101
    slots = [email for email, n in CUSTOMERS for _ in range(n)]
    rng.shuffle(slots)
    start = datetime(2026, 6, 1, 9, 0)
    for i, email in enumerate(slots):
        carrier = rng.choices(names, weights)[0]
        p = CARRIERS[carrier]
        ordered = start + timedelta(days=i * 2 + rng.randint(0, 1), hours=rng.randint(0, 9), minutes=rng.choice([0, 15, 30, 45]))
        picked = ordered + timedelta(hours=rng.uniform(14, 60))
        hub = picked + timedelta(hours=rng.uniform(*p["transit"]))
        out = hub + timedelta(hours=rng.uniform(*p["hub_hours"]))
        city = rng.choice(CITIES)
        delivered = out + timedelta(hours=rng.uniform(*p["last_mile"]))
        pickup_place = "Leipzig" if carrier == "DHL" else ("Eindhoven" if carrier == "UPS" else "Tilburg")
        events = [ev(iso(picked), pickup_place, "PICKED_UP", "Picked up"), ev(iso(hub), p["hub"], "AT_HUB", "Arrived at hub")]
        if carrier == "DHL" and rng.random() < 0.35:
            events.append(ev(iso(hub + timedelta(hours=rng.uniform(8, 20))), p["hub"], "EXCEPTION", "Delayed: sorting backlog"))
        events += [ev(iso(out), p["hub"], "OUT_FOR_DELIVERY", "Out for delivery"), ev(iso(delivered), city, "DELIVERED", "Delivered")]
        order_number = f"SO-{number}"
        parcels.append({"trackingCode": p["code"](number), "carrier": carrier, "orderNumber": order_number, "events": events})
        orders.append((order_number, email, ordered, rng.choice(AMOUNTS), carrier, p["code"](number)))
        number += 1
    return orders, parcels


def write_mdl(orders, batch=20):
    lines = [
        "mdl 1;",
        "",
        "-- GENERATED by tools/demo-data/generate_deliveries.py: do not edit by hand.",
        "-- Seeds the historical delivered orders whose parcels the carrier knows",
        "-- (tools/carrier-mcp/parcels.json), so delivery statistics have some volume.",
        "-- In batches, so no microflow grows past the size lint allows.",
        "",
    ]
    batches = [orders[i:i + batch] for i in range(0, len(orders), batch)]
    for n, chunk in enumerate(batches, 1):
        lines += [
            f"/** Seeds historical orders {chunk[0][0]} to {chunk[-1][0]}. Generated. */",
            f'create or modify microflow "ServiceDesk"."SUB_SeedOrderHistory_{n}" ($Ada: "ServiceDesk"."Customer", $Bram: "ServiceDesk"."Customer", $Chloe: "ServiceDesk"."Customer", $Daan: "ServiceDesk"."Customer", $Emma: "ServiceDesk"."Customer")',
            "folder 'Setup'",
            "begin",
        ]
        for order_number, email, ordered, amount, carrier, code in chunk:
            var = "$" + email.split(".")[0].capitalize()
            lines.append(
                f"  create \"ServiceDesk\".\"Order\" (\"OrderNumber\" = '{order_number}', \"OrderDate\" = parseDateTimeUTC('{ordered:%Y-%m-%d %H:%M}', 'yyyy-MM-dd HH:mm'), "
                f"\"Status\" = ServiceDesk.ENUM_OrderStatus.Delivered, \"TotalAmount\" = {amount:.2f}, \"Carrier\" = '{carrier}', \"TrackingCode\" = '{code}', "
                f"\"ServiceDesk\".\"Order_Customer\" = {var}) commit;"
            )
        lines += ["end;", ""]
    lines += [
        "/** Seeds SO-10016, Ada's recent delivered order (a USB light set) that the returns walkthrough uses, once. Generated. */",
        'create or modify microflow "ServiceDesk"."SUB_SeedRecentDemoOrder" ()',
        "folder 'Setup'",
        "begin",
        "  retrieve $Existing from \"ServiceDesk\".\"Order\" where [OrderNumber = 'SO-10016'] first;",
        "  if $Existing != empty then",
        "    return;",
        "  end if;",
        "  retrieve $Ada from \"ServiceDesk\".\"Customer\" where [Email = 'ada.jansen@example.com'] first;",
        "  create \"ServiceDesk\".\"Order\" (\"OrderNumber\" = 'SO-10016', \"OrderDate\" = parseDateTimeUTC('2026-11-04 09:00', 'yyyy-MM-dd HH:mm'), \"Status\" = ServiceDesk.ENUM_OrderStatus.Delivered, \"TotalAmount\" = 44.90, \"Carrier\" = 'PostNL', \"TrackingCode\" = '3SABCD000116', \"ServiceDesk\".\"Order_Customer\" = $Ada) commit;",
        "end;",
        "",
    ]
    lines += [
        f"/** Seeds {len(orders)} historical delivered orders (SO-10101 and up), once. Generated from tools/demo-data/generate_deliveries.py. */",
        'create or modify microflow "ServiceDesk"."SUB_SeedOrderHistory" ()',
        "folder 'Setup'",
        "begin",
        '  call microflow "ServiceDesk"."SUB_SeedRecentDemoOrder" ();',
        "  retrieve $Seeded from \"ServiceDesk\".\"Order\" where [OrderNumber = 'SO-10101'] first;",
        "  if $Seeded != empty then",
        "    return;",
        "  end if;",
    ]
    for email, _ in CUSTOMERS:
        var = "$" + email.split(".")[0].capitalize()
        lines.append(f"  retrieve {var} from \"ServiceDesk\".\"Customer\" where [Email = '{email}'] first;")
    for n in range(1, len(batches) + 1):
        lines.append(f'  call microflow "ServiceDesk"."SUB_SeedOrderHistory_{n}" (Ada = $Ada, Bram = $Bram, Chloe = $Chloe, Daan = $Daan, Emma = $Emma);')
    lines += ["end;", ""]
    (ROOT / "mdlsource/15-order-history-seed.mdl").write_text("\n".join(lines))


if __name__ == "__main__":
    orders, parcels = generate()
    (ROOT / "tools/carrier-mcp/parcels.json").write_text(json.dumps({"parcels": parcels}, indent=1, ensure_ascii=False) + "\n")
    write_mdl(orders)
    print(f"{len(parcels)} parcels, {len(orders)} historical orders")
