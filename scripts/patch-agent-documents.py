#!/usr/bin/env python3
"""Fill in the Agent Editor agent-document fields mxcli does not write yet.

Stop-gap until mxcli writes them (issues linked in FINDINGS.md). Studio Pro
stores these in an agent document; mxcli's `create agent` leaves them out:

  selectedModel          {id, name}: the model ID within a multi-model Mendix
                         Cloud GenAI resource. Without it the Agent Editor
                         import refuses the agent ("Model with name  is
                         referenced but could not be found for the Agent").
  tools[].document       {documentId, qualifiedName} of the tool microflow.
                         Without it the connector sends the tool without a
                         toolSpec and the model call fails with HTTP 400.
  tools[].id             a stable UUID per tool.
  tools[].userAccessApproval  VisibleForUser | HiddenForUser | UserConfirmationRequired
                         (import defaults to HiddenForUser when absent).
  enableBackendStreaming / enableUIStreaming

The values per agent are in scripts/agent-document-fields.json. A later
`create or modify agent` drops them again, so scripts/apply-agents.sh runs
mdlsource/07-agents.mdl and then this script.

Usage:
  python3 scripts/patch-agent-documents.py <project.mpr> <fields.json>

Only the agent unit's Contents string is rewritten; the BSON length prefixes
and the unit's ContentsHash (base64 SHA-256) in the .mpr are updated to match.
Running it again with the same values changes nothing.
"""
import base64
import hashlib
import json
import os
import sqlite3
import struct
import sys
import uuid

AGENT_MARKER = b"ReadableTypeName\x00\x06\x00\x00\x00Agent\x00"


def read_cstring(b, pos):
    end = b.index(b"\x00", pos)
    return b[pos:end].decode("utf-8"), end + 1


def top_level_strings(b):
    """Return {name: (offset of the int32 length, length)} for top-level BSON strings."""
    found = {}
    pos = 4
    while pos < len(b) - 1:
        t = b[pos]
        name, pos = read_cstring(b, pos + 1)
        if t == 0x02:
            length = struct.unpack("<i", b[pos:pos + 4])[0]
            found.setdefault(name, (pos, length))
            pos += 4 + length
        elif t in (0x03, 0x04):
            pos += struct.unpack("<i", b[pos:pos + 4])[0]
        elif t == 0x05:
            pos += 5 + struct.unpack("<i", b[pos:pos + 4])[0]
        elif t == 0x08:
            pos += 1
        elif t in (0x06, 0x0A, 0x7F, 0xFF):
            pass
        elif t == 0x07:
            pos += 12
        elif t == 0x10:
            pos += 4
        elif t in (0x01, 0x09, 0x11, 0x12):
            pos += 8
        else:
            raise ValueError(f"unsupported BSON type 0x{t:02x} at {pos}")
    return found


def string_value(b, field):
    o, l = field
    return b[o + 4:o + 4 + l - 1].decode("utf-8")


def units(project_dir):
    for root, _, files in os.walk(os.path.join(project_dir, "mprcontents")):
        for f in files:
            if f.endswith(".mxunit"):
                path = os.path.join(root, f)
                yield path, open(path, "rb").read()


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    mpr, spec_path = sys.argv[1:3]
    spec = json.load(open(spec_path))
    project_dir = os.path.dirname(os.path.abspath(mpr))

    # Index units by name: agent documents, and microflows for tool references.
    agents, microflows = {}, {}
    for path, b in units(project_dir):
        try:
            fields = top_level_strings(b)
        except ValueError:
            continue
        if "Name" not in fields:
            continue
        name = string_value(b, fields["Name"])
        unit_id = os.path.splitext(os.path.basename(path))[0]
        if b"extension/agent-editor" in b and AGENT_MARKER in b:
            agents.setdefault(name, []).append((path, b, fields))
        elif "$Type" in fields and string_value(b, fields["$Type"]) == "Microflows$Microflow":
            microflows.setdefault(name, []).append(unit_id)

    con = sqlite3.connect(mpr)
    status = 0
    for qualified_name, wanted in spec.items():
        short = qualified_name.split(".", 1)[1]
        if short not in agents:
            print(f"{qualified_name}: no agent document found")
            status = 1
            continue
        for path, b, fields in agents[short]:
            o, l = fields["Contents"]
            contents = json.loads(string_value(b, fields["Contents"]))
            before = json.dumps(contents, sort_keys=True)

            if "selectedModel" in wanted:
                contents["selectedModel"] = wanted["selectedModel"]
            for key in ("enableBackendStreaming", "enableUIStreaming"):
                if key in wanted:
                    contents[key] = wanted[key]
            for tool in contents.get("tools", []):
                tool_spec = wanted.get("tools", {}).get(tool.get("name"))
                if not tool_spec:
                    continue
                mf_module, mf_name = tool_spec["microflow"].split(".", 1)
                ids = microflows.get(mf_name, [])
                if len(ids) != 1:
                    print(f"{qualified_name}: tool {tool['name']}: expected one microflow {tool_spec['microflow']}, found {len(ids)}")
                    status = 1
                    continue
                tool["document"] = {"documentId": ids[0], "qualifiedName": tool_spec["microflow"]}
                if not tool.get("id"):
                    tool["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, qualified_name + "/" + tool["name"]))
                tool["userAccessApproval"] = tool_spec.get("userAccessApproval", "VisibleForUser")
                tool.setdefault("displayDescription", "")

            if json.dumps(contents, sort_keys=True) == before:
                print(f"{qualified_name}: already up to date")
                continue
            new = json.dumps(contents, ensure_ascii=False, indent=2).encode("utf-8") + b"\x00"
            out = bytearray(b[:o]) + struct.pack("<i", len(new)) + new + b[o + 4 + l:]
            out[0:4] = struct.pack("<i", len(out))
            with open(path, "wb") as fh:
                fh.write(out)
            digest = base64.b64encode(hashlib.sha256(bytes(out)).digest()).decode()
            unit = uuid.UUID(os.path.splitext(os.path.basename(path))[0])
            rows = 0
            for key in (unit.bytes_le, unit.bytes):
                rows = con.execute("update Unit set ContentsHash = ? where UnitID = ?", (digest, key)).rowcount
                if rows:
                    break
            con.commit()
            print(f"{qualified_name}: updated ({path}; index rows: {rows})")
            if rows != 1:
                status = 1
    con.close()
    return status


if __name__ == "__main__":
    sys.exit(main())
