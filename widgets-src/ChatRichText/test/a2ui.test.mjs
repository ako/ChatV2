// Unit tests for the A2UI side of the chat cards (run: npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseA2ui, buildSurfaces, getPath, setPath, resolve, childEntries } from "../build-test/a2ui.mjs";
import { splitMessage } from "../build-test/segments.mjs";

const create = '{"version":"1.0","createSurface":{"surfaceId":"fit","catalogId":"https://a2ui.org/specification/v1_0/basic_catalog.json"}}';
const comps = '{"version":"1.0","updateComponents":{"surfaceId":"fit","components":[{"id":"root","component":"Column","children":["t","h"]},{"id":"t","component":"Text","text":{"@path":"/title"}},{"id":"h","component":"TextField","label":"Height","value":{"@path":"/fit/height"}}]}}';
const data = '{"version":"1.0","updateDataModel":{"surfaceId":"fit","path":"/title","value":"Frame size"}}';

test("JSONL and a JSON array both parse", () => {
  assert.equal(parseA2ui([create, comps, data].join("\n")).length, 3);
  assert.equal(parseA2ui("[" + [create, comps].join(",") + "]").length, 2);
  assert.equal(parseA2ui("not json"), undefined);
});
test("messages build one surface with its components and data", () => {
  const [s] = buildSurfaces(parseA2ui([create, comps, data].join("\n")));
  assert.equal(s.id, "fit");
  assert.equal(s.components.size, 3);
  assert.equal(s.components.get("root").component, "Column");
  assert.equal(getPath(s.data, "/title"), "Frame size");
});
test("deleteSurface removes it, null removes a data key", () => {
  const del = '{"version":"1.0","deleteSurface":{"surfaceId":"fit"}}';
  assert.equal(buildSurfaces(parseA2ui([create, comps, del].join("\n"))).length, 0);
  const rm = '{"version":"1.0","updateDataModel":{"surfaceId":"fit","path":"/title","value":null}}';
  const [s] = buildSurfaces(parseA2ui([create, data, rm].join("\n")));
  assert.equal(getPath(s.data, "/title"), undefined);
});
test("setPath creates the objects on the way and does not change the original", () => {
  const before = { a: 1 };
  const after = setPath(before, "/fit/height", 182);
  assert.deepEqual(after, { a: 1, fit: { height: 182 } });
  assert.deepEqual(before, { a: 1 });
});
test("bindings: 1.0 @path, 0.9.1 path, relative to a template item, and formatString", () => {
  const d = { user: { name: "Ada" }, items: [{ name: "BAT-418" }] };
  assert.equal(resolve({ "@path": "/user/name" }, d, ""), "Ada");
  assert.equal(resolve({ path: "/user/name" }, d, ""), "Ada");
  assert.equal(resolve({ "@path": "name" }, d, "/items/0"), "BAT-418");
  assert.equal(resolve({ "@call": "formatString", args: { value: "Hi ${/user/name}" } }, d, ""), "Hi Ada");
  assert.equal(resolve("plain", d, ""), "plain");
});
test("a template repeats its component per item, with the item as base", () => {
  const d = { parts: [{ sku: "A" }, { sku: "B" }] };
  assert.deepEqual(childEntries({ path: "/parts", componentId: "row" }, d, ""), [{ id: "row", base: "/parts/0" }, { id: "row", base: "/parts/1" }]);
  assert.deepEqual(childEntries(["x", "bad id!"], d, "/b"), [{ id: "x", base: "/b" }]);
});
test("the splitter turns an a2ui block into an a2ui segment, pending while it streams", () => {
  const s = splitMessage("Here:\n\n```a2ui\n" + [create, comps].join("\n") + "\n```\n\nDone.");
  assert.deepEqual(s.map(x => x.kind), ["markdown", "a2ui", "markdown"]);
  assert.equal(s[1].messages.length, 2);
  assert.deepEqual(splitMessage("```a2ui\n" + create).map(x => x.kind), ["pending"]);
  assert.deepEqual(splitMessage("```a2ui\nnot json\n```").map(x => x.kind), ["markdown"]);
});
