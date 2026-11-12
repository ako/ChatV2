// Unit tests for the message splitter (run: npm test). Uses a tiny TS-free copy
// built by esbuild in the test script below, so it tests the shipped logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitMessage, toCard, cleanRef } from "../build-test/segments.mjs";

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
