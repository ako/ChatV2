// Unit tests for the message splitter (run: npm test). Uses a tiny TS-free copy
// built by esbuild in the test script below, so it tests the shipped logic.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitMessage, toCard } from "../build-test/segments.mjs";

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
