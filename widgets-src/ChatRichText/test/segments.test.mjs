// Unit tests for the message splitter (run: npm test). Uses a tiny TS-free copy
// built by esbuild in the test script below, so it tests the shipped logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitMessage, toCard, cleanRef, cleanPlace } from "../build-test/segments.mjs";

test("plain markdown is one segment", () => {
  assert.deepEqual(splitMessage("Hello **world**").map(s => s.kind), ["markdown"]);
});
test("a card block between text", () => {
  const s = splitMessage('Your order:\n\n```card\n{"type":"order","title":"SO-10002","status":"Shipped","tone":"warning","fields":[{"label":"Total","value":"EUR 89.50"}]}\n```\n\nAnything else?');
  assert.deepEqual(s.map(x => x.kind), ["markdown", "cards", "markdown"]);
  assert.equal(s[1].cards[0].title, "SO-10002");
  assert.equal(s[1].cards[0].tone, "warning");
  assert.equal(s[1].cards[0].fields[0].value, "EUR 89.50");
});
test("a cards block holds several", () => {
  const s = splitMessage('```cards\n[{"title":"A"},{"title":"B"}]\n```');
  assert.equal(s[0].cards.length, 2);
});
test("an unclosed card block while streaming is pending", () => {
  const s = splitMessage('Looking it up\n```card\n{"type":"order","ti');
  assert.deepEqual(s.map(x => x.kind), ["markdown", "pending"]);
});
test("invalid JSON falls back to a visible code block", () => {
  const s = splitMessage('```card\nnot json\n```');
  assert.deepEqual(s.map(x => x.kind), ["markdown"]);
  assert.match(s[0].text, /not json/);
});
test("markup in card values stays data", () => {
  const c = toCard({ title: "<img src=x onerror=alert(1)>", tone: "evil" });
  assert.equal(c.title, "<img src=x onerror=alert(1)>");
  assert.equal(c.tone, "neutral");
});
test("an ordinary code block is left alone", () => {
  const s = splitMessage('```json\n{"a":1}\n```');
  assert.deepEqual(s.map(x => x.kind), ["markdown"]);
});
test("numbers become text and empty cards are dropped", () => {
  assert.equal(toCard({ title: "X", fields: [{ label: "Qty", value: 2 }] }).fields[0].value, "2");
  assert.equal(toCard({}), undefined);
});

test("chart data becomes points; bad values and kinds are dropped", () => {
    const [seg] = splitMessage('```card\n{"type":"chart","title":"Where the time goes","chart":"stacked","unit":"days","highlight":"At the hub","data":[{"label":"Warehouse","value":1.5},{"label":"At the hub","value":"1.4","share":42},{"label":"Bad","value":-1},{"label":"NaN","value":"x"}]}\n```');
    assert.equal(seg.kind, "cards");
    const c = seg.cards[0].chart;
    assert.equal(c.kind, "stacked");
    assert.deepEqual(c.points.map(p => [p.label, p.value]), [["Warehouse", 1.5], ["At the hub", 1.4]]);
    assert.equal(c.highlight, "At the hub");
    assert.equal(c.points[1].share, 42);
    assert.equal(c.points[0].share, undefined);
});

test("an unknown chart kind falls back to bars, and a card with only a chart is kept", () => {
    const card = toCard({ type: "chart", chart: "pie", data: [{ label: "A", value: 1 }] });
    assert.equal(card.chart.kind, "bars");
});

test("outline nodes nest, carry refs, and stop at four levels", () => {
    const deep = { label: "1", children: [{ label: "2", children: [{ label: "3", children: [{ label: "4", children: [{ label: "5" }] }] }] }] };
    const card = toCard({ type: "outline", title: "EB-200", outline: [{ label: "Components", children: [{ label: "BAT-418 Battery", ref: "BAT-418" }] }, deep] });
    assert.equal(card.outline[0].children[0].ref, "BAT-418");
    assert.equal(card.outline[1].children[0].children[0].children[0].children.length, 0);
});

test("refs must be plain identifiers", () => {
    assert.equal(cleanRef("SO-10002"), "SO-10002");
    assert.equal(cleanRef("ISS-CHG-80"), "ISS-CHG-80");
    assert.equal(cleanRef("../admin"), undefined);
    assert.equal(cleanRef("a b"), undefined);
    assert.equal(cleanRef("<x>"), undefined);
    const card = toCard({ title: "x", fields: [{ label: "Supplier", value: "CellPower", ref: "CellPower" }], items: [{ title: "Bad", ref: "../x" }] });
    assert.equal(card.fields[0].ref, "CellPower");
    assert.equal(card.items[0].ref, undefined);
});

test("a graph card needs a clean ref", () => {
    assert.equal(toCard({ type: "graph", title: "BAT-418", ref: "BAT-418" }).graph.ref, "BAT-418");
    assert.equal(toCard({ type: "graph", title: "x", ref: "../etc" }).graph, undefined);
    assert.equal(toCard({ type: "order", title: "x", ref: "BAT-418" }).graph, undefined);
});

test("a tilde details fence becomes a collapsible section that can hold code blocks", () => {
    const segs = splitMessage("before\n~~~details Input and result of find_product\n**Input**\n```json\n{\"search\": \"EB\"}\n```\n~~~\nafter");
    assert.deepEqual(segs.map(s => s.kind), ["markdown", "details", "markdown"]);
    assert.equal(segs[1].summary, "Input and result of find_product");
    assert.match(segs[1].text, /```json/);
});

test("a map card keeps its route stops and points, by place name", () => {
  const c = toCard({ type: "map", title: "Route", route: [{ place: "Leipzig", date: "2026-11-03", text: "Picked up" }, { place: "Venlo", text: "Delayed", tone: "warning" }], points: [{ place: "Venlo", value: "2.9", label: "DHL hub" }], unit: "days" });
  assert.equal(c.map.route.length, 2);
  assert.equal(c.map.route[1].tone, "warning");
  assert.equal(c.map.points[0].value, 2.9);
  assert.equal(c.map.unit, "days");
});
test("a route may be a list of plain place names", () => {
  const c = toCard({ title: "Parcel", route: ["Leipzig", "Venlo", "Utrecht"] });
  assert.deepEqual(c.map.route.map(s => s.place), ["Leipzig", "Venlo", "Utrecht"]);
});
test("place names that are not plain names are dropped", () => {
  assert.equal(cleanPlace("Den Haag"), "Den Haag");
  assert.equal(cleanPlace("'s-Hertogenbosch"), undefined);
  assert.equal(cleanPlace("<img src=x onerror=alert(1)>"), undefined);
  assert.equal(cleanPlace("52.37, 4.90"), undefined);
  const c = toCard({ title: "x", route: [{ place: "<b>x</b>" }], points: [{ place: "Venlo", value: -1 }] });
  assert.equal(c.map.route.length, 0);
  assert.equal(c.map.points[0].value, undefined);
});
test("a map card with no usable places has no map", () => {
  assert.equal(toCard({ type: "map", route: [{ place: "" }] }), undefined);
});

test("a model card names a product and the parts to highlight", () => {
  const c = toCard({ type: "model", title: "EB-200", ref: "EB-200", highlight: ["BAT-418", "MOT-250H"], tone: "critical" });
  assert.equal(c.model.ref, "EB-200");
  assert.deepEqual(c.model.highlight, ["BAT-418", "MOT-250H"]);
});
test("a model card accepts one highlight as a string, and drops refs that are not refs", () => {
  assert.deepEqual(toCard({ type: "model", ref: "EB-500", highlight: "BAT-500" }).model.highlight, ["BAT-500"]);
  assert.deepEqual(toCard({ type: "model", ref: "EB-500", highlight: ["<script>", "BAT-500"] }).model.highlight, ["BAT-500"]);
  assert.equal(toCard({ type: "model", ref: "bad ref!" }), undefined);
});

test("a suggestions block becomes follow-up chips", () => {
  const s = splitMessage('Here you go.\n\n```suggestions\n["Why is it delayed?", "Show it on a map"]\n```');
  assert.deepEqual(s.map(x => x.kind), ["markdown", "suggestions"]);
  assert.deepEqual(s[1].items, ["Why is it delayed?", "Show it on a map"]);
});
test("a suggestions block that is not a list of strings is left out", () => {
  assert.deepEqual(splitMessage('```suggestions\n{"a":1}\n```').map(x => x.kind), []);
});
test("a compare card names two or three products", () => {
  assert.deepEqual(toCard({ type: "compare", title: "EB-200 vs EB-500", refs: ["EB-200", "EB-500"] }).compare.refs, ["EB-200", "EB-500"]);
  assert.equal(toCard({ type: "compare", refs: ["EB-200"] }), undefined);
});

test("card actions are limited to the known kinds and need a ref", () => {
  const c = toCard({ title: "SO-10016", actions: [
    { label: "Start a return", action: "return", ref: "SO-10016", values: { item: "LGT-USB USB light set", reason: "Never used" } },
    { label: "Delete my account", action: "delete", ref: "SO-10016" },
    { label: "No ref", action: "ticket" } ] });
  assert.equal(c.actions.length, 1);
  assert.equal(c.actions[0].values.item, "LGT-USB USB light set");
});
test("citations need a quote of some length", () => {
  const c = toCard({ type: "policy", title: "Returns", citations: [{ doc: "Returns and refunds", quote: "within 30 days of delivery" }, { doc: "x", quote: "short" }] });
  assert.equal(c.citations.length, 1);
  assert.equal(c.citations[0].doc, "Returns and refunds");
});
