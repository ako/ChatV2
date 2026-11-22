#!/usr/bin/env python3
"""BikeFitAgent: an agent outside the app that answers on the agent bus with UI.

    python3 tools/agent-bus/fit_agent.py            # runs until stopped

It talks to the bus only through duckgraphlake's MCP server (`read_topic`,
`produce`), like any agent from elsewhere. It reads tasks addressed to it and
answers each with an A2UI surface, which the app's assistant passes into the
chat unchanged and the chat draws:

- a question without measurements gets a form (height, inseam, riding style and
  a "Check my size" button); the button sends the values back as the user's
  next message, which the assistant forwards to this agent;
- a question with a height and an inseam gets the frame size, drawn as one of
  the app's own cards through its A2UI catalog (ServiceDeskCard).

No model is involved: the agent is a few rules, so the bus and the A2UI round
trip can be checked without one. Options: --mcp URL, --topic NAME, --name NAME.
"""
import argparse, json, re, sys, time, urllib.request, uuid

PART = 200
BASIC = "https://a2ui.org/specification/v1_0/basic_catalog.json"
APP = "https://servicedesk.example/a2ui/catalog/v1"


def mcp(url, name, args, _id=[0]):
    _id[0] += 1
    body = json.dumps({"jsonrpc": "2.0", "id": _id[0], "method": "tools/call",
                       "params": {"name": name, "arguments": args}}).encode()
    req = urllib.request.Request(url, body, {"Content-Type": "application/json",
                                             "Accept": "application/json, text/event-stream"})
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.loads(r.read())
    res = out.get("result") or {}
    if "error" in out or res.get("isError"):
        raise RuntimeError(f"MCP {name}: {out.get('error') or res['content'][0]['text']}")
    text = res["content"][0]["text"]
    try:
        return json.loads(text)
    except ValueError:
        return text


def a2ui(*messages):
    return "```a2ui\n" + "\n".join(json.dumps(m, separators=(",", ":")) for m in messages) + "\n```"


def form():
    sid = "fit-" + uuid.uuid4().hex[:8]
    comps = [
        {"id": "root", "component": "Column", "children": ["title", "hint", "sizes", "style", "check"]},
        {"id": "title", "component": "Text", "text": "Find your frame size", "variant": "h3"},
        {"id": "hint", "component": "Text", "variant": "caption",
         "text": "Measure your inseam barefoot, from the floor to your crotch, in centimetres."},
        {"id": "sizes", "component": "Row", "children": ["height", "inseam"]},
        {"id": "height", "component": "TextField", "label": "Height (cm)", "variant": "number",
         "value": {"@path": "/fit/height"}, "weight": 1},
        {"id": "inseam", "component": "TextField", "label": "Inseam (cm)", "variant": "number",
         "value": {"@path": "/fit/inseam"}, "weight": 1},
        {"id": "style", "component": "ChoicePicker", "label": "How do you ride?", "displayStyle": "chips",
         "variant": "mutuallyExclusive", "value": {"@path": "/fit/style"},
         "options": [{"label": "City", "value": "city"}, {"label": "Trekking", "value": "trekking"},
                     {"label": "Sporty", "value": "sporty"}]},
        {"id": "check", "component": "Button", "variant": "primary", "child": "checkLabel",
         "action": {"event": {"name": "checkFit", "userMessage": "Check my frame size with the BikeFitAgent",
                              "context": {"height": {"@path": "/fit/height"}, "inseam": {"@path": "/fit/inseam"},
                                          "style": {"@path": "/fit/style"}}}}},
        {"id": "checkLabel", "component": "Text", "text": "Check my size"},
    ]
    return ("Here is a short form to work out the frame size.\n\n" + a2ui(
        {"version": "1.0", "createSurface": {"surfaceId": sid, "catalogId": BASIC}},
        {"version": "1.0", "updateComponents": {"surfaceId": sid, "components": comps}},
        {"version": "1.0", "updateDataModel": {"surfaceId": sid, "path": "/fit", "value": {"style": ["city"]}}}))


def size(height, inseam, style):
    factor = {"sporty": 0.68, "trekking": 0.665}.get(style, 0.66)
    frame = round(inseam * factor)
    label = "S" if frame <= 50 else "M" if frame <= 54 else "L" if frame <= 58 else "XL"
    sid = "fitresult-" + uuid.uuid4().hex[:8]
    card = {"type": "product", "title": f"Frame size {label}", "subtitle": f"about {frame} cm", "tone": "good",
            "fields": [{"label": "Height", "value": f"{height} cm"}, {"label": "Inseam", "value": f"{inseam} cm"},
                       {"label": "Riding style", "value": style or "city"},
                       {"label": "Frame (seat tube)", "value": f"{frame} cm"}],
            "note": "From the inseam times a factor for the riding style; a test ride settles it."}
    return (f"A frame of about {frame} cm, size {label}, fits a height of {height} cm and an inseam of {inseam} cm "
            f"for {style or 'city'} riding.\n\n" + a2ui(
                {"version": "1.0", "createSurface": {"surfaceId": sid, "catalogId": APP}},
                {"version": "1.0", "updateComponents": {"surfaceId": sid, "components": [
                    {"id": "root", "component": "ServiceDeskCard", "card": card}]}}))


def answer(question):
    q = question.lower()
    h = re.search(r"height\D{0,12}(\d{3})", q)
    i = re.search(r"inseam\D{0,12}(\d{2,3})", q)
    if h and i:
        style = next((s for s in ("sporty", "trekking", "city") if s in q), "city")
        return size(int(h.group(1)), int(i.group(1)), style)
    return form()


def produce_result(a, task, ctx, to, text):
    parts = [text[k:k + PART] for k in range(0, len(text), PART)] or [""]
    msgs = []
    for n, t in enumerate(parts, 1):
        v = {"TaskId": task, "ContextId": ctx, "FromAgent": a.name, "ToAgent": to, "Kind": "result",
             "Status": "completed", "Part": n, "Parts": len(parts), "Text": t}
        msgs.append({"key": task, "value": json.dumps(v), "headers": {
            "ce_type": "AgentMessage", "ce_source": f"/{a.name}/", "ce_id": str(uuid.uuid4()),
            "ce_specversion": "1.0", "content-type": "application/json"}})
    mcp(a.mcp, "produce", {"topic": a.topic, "messages": msgs})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mcp", default="http://127.0.0.1:9495/mcp")
    ap.add_argument("--topic", default="agent-bus")
    ap.add_argument("--name", default="BikeFitAgent")
    a = ap.parse_args()

    first = mcp(a.mcp, "read_topic", {"topic": a.topic, "limit": 1})
    nxt = max((p["end"] for p in first.get("partitions", [])), default=0) if isinstance(first, dict) else 0
    print(f"{a.name}: listening on {a.topic} from offset {nxt}", flush=True)
    pending = {}
    while True:
        try:
            page = mcp(a.mcp, "read_topic", {"topic": a.topic, "offset": nxt, "limit": 200})
        except Exception as e:   # broker restarting: try again
            print(f"{a.name}: {e}", file=sys.stderr, flush=True)
            time.sleep(5)
            continue
        for m in page.get("messages", []) if isinstance(page, dict) else []:
            nxt = max(nxt, m["offset"] + 1)
            try:
                v = json.loads(m["value"])
            except (ValueError, TypeError):
                continue
            if v.get("Kind") != "task" or v.get("ToAgent") != a.name:
                continue
            got = pending.setdefault(v["TaskId"], {})
            got[v.get("Part", 1)] = v
            if len(got) < v.get("Parts", 1):
                continue
            question = "".join(got[k]["Text"] for k in sorted(got))
            del pending[v["TaskId"]]
            print(f"{a.name}: task {v['TaskId']} from {v['FromAgent']}: {question[:80]}", flush=True)
            produce_result(a, v["TaskId"], v.get("ContextId") or v["TaskId"], v["FromAgent"], answer(question))
        time.sleep(1.5)


if __name__ == "__main__":
    sys.exit(main())
