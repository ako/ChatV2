#!/usr/bin/env python3
"""Asks an agent of the app over the agent bus, the way an agent outside the app
would: only through duckgraphlake's MCP server (tools `produce` and `read_topic`).

    python3 tools/agent-bus/ask.py CatalogAgent "Does the SSP-31 seat post fit the EB-200?"

It puts an A2A-shaped task on the bus topic (AgentMessage, Kind 'task', the text
in parts of at most 200 characters), then reads the topic until the result for
that task id is complete and prints it. Options: --from NAME (default ClaudeCode),
--mcp URL (default http://127.0.0.1:9495/mcp), --topic NAME (default agent-bus),
--timeout SECONDS (default 120).
"""
import argparse, json, sys, time, urllib.request, uuid

PART = 200


def mcp(url, name, args, _id=[0]):
    _id[0] += 1
    body = json.dumps({"jsonrpc": "2.0", "id": _id[0], "method": "tools/call",
                       "params": {"name": name, "arguments": args}}).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/json",
                                             "Accept": "application/json, text/event-stream"})
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.loads(r.read())
    if "error" in out:
        raise SystemExit(f"MCP {name}: {out['error']}")
    res = out["result"]
    if res.get("isError"):
        raise SystemExit(f"MCP {name}: {res['content'][0]['text']}")
    text = res["content"][0]["text"]
    try:
        return json.loads(text)
    except ValueError:
        return text


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("agent")
    ap.add_argument("question")
    ap.add_argument("--from", dest="sender", default="ClaudeCode")
    ap.add_argument("--mcp", default="http://127.0.0.1:9495/mcp")
    ap.add_argument("--topic", default="agent-bus")
    ap.add_argument("--timeout", type=int, default=120)
    a = ap.parse_args()

    task = str(uuid.uuid4())
    parts = [a.question[i:i + PART] for i in range(0, len(a.question), PART)] or [""]
    messages = []
    for n, text in enumerate(parts, 1):
        value = {"TaskId": task, "ContextId": task, "FromAgent": a.sender, "ToAgent": a.agent,
                 "Kind": "task", "Status": "submitted", "Part": n, "Parts": len(parts), "Text": text}
        messages.append({"key": task, "value": json.dumps(value), "headers": {
            "ce_type": "AgentMessage", "ce_source": f"/{a.sender}/", "ce_id": str(uuid.uuid4()),
            "ce_specversion": "1.0", "content-type": "application/json"}})
    mcp(a.mcp, "produce", {"topic": a.topic, "messages": messages})
    print(f"task {task} -> {a.agent}", file=sys.stderr)

    got, deadline = {}, time.time() + a.timeout
    while time.time() < deadline:
        time.sleep(2)
        page = mcp(a.mcp, "read_topic", {"topic": a.topic, "limit": 200})
        for m in page.get("messages", []) if isinstance(page, dict) else []:
            try:
                v = json.loads(m["value"])
            except (ValueError, TypeError, KeyError):
                continue
            if v.get("TaskId") == task and v.get("Kind") == "result":
                got[v["Part"]] = v
        if got and len(got) == next(iter(got.values()))["Parts"]:
            first = got[1] if 1 in got else next(iter(got.values()))
            print(f"[{first['Status']}] {first['FromAgent']}:", file=sys.stderr)
            print("".join(got[k]["Text"] for k in sorted(got)))
            return 0 if first["Status"] == "completed" else 1
    print(f"no answer from {a.agent} within {a.timeout} s", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
