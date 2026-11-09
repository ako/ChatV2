"""A stand-in parcel carrier that publishes parcel tracking over MCP.

The ServiceDesk app consumes it as an external MCP server (consumed MCP
service ServiceDesk.CarrierTracking), so the support agent can tell a customer
where a parcel is. It knows the tracking codes of the app's demo orders.

Run:  python3 tools/carrier-mcp/server.py        (http://127.0.0.1:8765/mcp)
Needs the Python MCP SDK 2.x:  pip install 'mcp>=2,<3'
"""
from mcp.server.mcpserver import MCPServer

server = MCPServer(
    name="CarrierTracking",
    version="1.0.0",
    instructions="Parcel tracking for the carriers PostNL, DHL and UPS.",
)

# Tracking history per code, oldest event first: (date, location, event).
PARCELS = {
    "3SABCD000101": ("PostNL", [("2026-10-10", "Utrecht", "Received at sorting centre"), ("2026-10-11", "Amsterdam", "Delivered, signed by A. Jansen")]),
    "JVGL0000000102": ("DHL", [("2026-11-03", "Leipzig", "Shipment picked up"), ("2026-11-04", "Venlo", "Arrived at hub"), ("2026-11-04", "Venlo", "Delayed: sorting backlog, expected 2026-11-10")]),
    "3SABCD000104": ("PostNL", [("2026-09-25", "Utrecht", "Received at sorting centre"), ("2026-09-26", "Rotterdam", "Delivered to neighbour, house number 12")]),
    "1Z999AA10000105": ("UPS", [("2026-10-28", "Eindhoven", "Picked up"), ("2026-10-29", "Rotterdam", "Delivered")]),
    "JVGL0000000106": ("DHL", [("2026-11-06", "Leipzig", "Shipment picked up"), ("2026-11-07", "Venlo", "Out for delivery")]),
    "3SABCD000108": ("PostNL", [("2026-10-31", "Utrecht", "Received at sorting centre"), ("2026-11-01", "Haarlem", "Delivered, parcel damaged on arrival noted by courier")]),
    "1Z999AA10000110": ("UPS", [("2026-09-10", "Eindhoven", "Picked up"), ("2026-09-11", "Delft", "Delivered")]),
    "3SABCD000111": ("PostNL", [("2026-11-04", "Utrecht", "Received at sorting centre"), ("2026-11-05", "Utrecht", "Address change requested, held at depot")]),
    "JVGL0000000112": ("DHL", [("2026-10-25", "Leipzig", "Shipment picked up"), ("2026-10-27", "Leiden", "Delivered")]),
    "1Z999AA10000113": ("UPS", [("2026-11-05", "Eindhoven", "Picked up, 2 of 3 packages scanned"), ("2026-11-06", "Groningen", "Delivered 2 of 3 packages; 1 package missing")]),
    "JVGL0000000115": ("DHL", [("2026-08-11", "Leipzig", "Shipment picked up"), ("2026-08-13", "Zwolle", "Delivered")]),
}


@server.tool(name="track_parcel", description="Tracking history of a parcel by its tracking code, with the carrier and every scan event, newest last.")
def track_parcel(tracking_code: str) -> str:
    code = tracking_code.strip().upper()
    if code not in PARCELS:
        return f"No parcel found with tracking code {tracking_code}."
    carrier, events = PARCELS[code]
    lines = [f"{carrier} parcel {code}:"] + [f"{date} {place}: {event}" for date, place, event in events]
    return "\n".join(lines)


@server.tool(name="list_carriers", description="The carriers this tracking service covers.")
def list_carriers() -> str:
    return "PostNL, DHL, UPS"


if __name__ == "__main__":
    server.run("streamable-http", host="127.0.0.1", port=8765)
