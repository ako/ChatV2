#!/usr/bin/env python3
"""Set the selected model of Agent Editor agent documents.

Stop-gap until mxcli can write it (ako/mxcli#2031). Since Mendix Cloud GenAI
multi-model resources (Studio Pro 11.12), an agent document stores
`selectedModel: {id, name}`: the model ID within the model resource. The Agent
Editor import refuses an agent without it ("Model with name  is referenced but
could not be found for the Agent"), and that aborts the import of every agent.

Since mxcli nightly 2026-11-09 (ako/mxcli#2037, #2038), `create agent` writes
tool microflow references, ids, tool approval and streaming, and `create or
modify` keeps fields it does not model. So a new agent needs this script once,
and later runs of mdlsource/07-agents.mdl keep the field. The script can still
fill `tools` and the streaming switches from the spec file, for older mxcli
builds, but scripts/agent-document-fields.json now holds only selectedModel.

Usage:
  python3 scripts/patch-agent-documents.py <project.mpr> <fields.json>

A consumed MCP service entry ({"endpoint": "Module.UrlConstant",
"authenticationMicroflow": "Module.Microflow"}) sets the service's endpoint
constant and optional credentials microflow, which mxcli cannot write either.

Only the document's Contents string is rewritten; the BSON length prefixes
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
MCP_MARKER = b"ReadableTypeName\x00\x15\x00\x00\x00Consumed MCP service\x00"


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


def write_contents(con, path, b, fields, contents, label):
    """Store new Contents JSON in a unit and update its ContentsHash; returns 0 on success."""
    o, l = fields["Contents"]
    new = json.dumps(contents, ensure_ascii=False).encode("utf-8") + b"\x00"
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
    print(f"{label}: updated ({path}; index rows: {rows})")
    return 0 if rows == 1 else 1


def patch_mcp_service(con, qualified_name, short, wanted, mcp_services, constants, microflows):
    """Consumed MCP service: set the endpoint constant and, optionally, the credentials microflow."""
    if short not in mcp_services:
        print(f"{qualified_name}: no consumed MCP service document found")
        return 1
    status = 0
    for path, b, fields in mcp_services[short]:
        contents = json.loads(string_value(b, fields["Contents"]))
        before = json.dumps(contents, sort_keys=True)
        for key, index in (("endpoint", constants), ("authenticationMicroflow", microflows)):
            if key not in wanted:
                continue
            ids = index.get(wanted[key].split(".", 1)[1], [])
            if len(ids) != 1:
                print(f"{qualified_name}: {key}: expected one document {wanted[key]}, found {len(ids)}")
                status = 1
                continue
            contents[key] = {"qualifiedName": wanted[key], "documentId": ids[0]}
        if json.dumps(contents, sort_keys=True) == before:
            print(f"{qualified_name}: already up to date")
            continue
        status |= write_contents(con, path, b, fields, contents, qualified_name)
    return status


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    mpr, spec_path = sys.argv[1:3]
    spec = json.load(open(spec_path))
    project_dir = os.path.dirname(os.path.abspath(mpr))

    # Index units by name: agent documents, and microflows for tool references.
    agents, microflows, constants, mcp_services = {}, {}, {}, {}
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
        elif b"extension/agent-editor" in b and MCP_MARKER in b:
            mcp_services.setdefault(name, []).append((path, b, fields))
        elif "$Type" in fields and string_value(b, fields["$Type"]) == "Constants$Constant":
            constants.setdefault(name, []).append(unit_id)
        elif "$Type" in fields and string_value(b, fields["$Type"]) == "Microflows$Microflow":
            microflows.setdefault(name, []).append(unit_id)

    con = sqlite3.connect(mpr)
    status = 0
    for qualified_name, wanted in spec.items():
        short = qualified_name.split(".", 1)[1]
        if "endpoint" in wanted:
            status |= patch_mcp_service(con, qualified_name, short, wanted, mcp_services, constants, microflows)
            continue
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
