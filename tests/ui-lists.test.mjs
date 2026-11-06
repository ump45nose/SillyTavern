import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const { code } = await transform(await readFile(new URL("../src/ui/lists.ts", import.meta.url), "utf8"), {
  loader: "ts",
  format: "esm",
});
const { matchQuery, matchItem, toggleIds } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);

test("an empty or blank query matches everything", () => {
  assert.equal(matchQuery("", "灯塔"), true);
  assert.equal(matchQuery("   ", undefined), true);
});

test("the query is matched without regard to case or surrounding spaces", () => {
  assert.equal(matchQuery("  lighthouse ", "The LightHouse"), true);
  assert.equal(matchQuery("灯", "灯塔"), true);
  assert.equal(matchQuery("海", "灯塔"), false);
});

test("missing fields are skipped and the rest read as one line", () => {
  assert.equal(matchQuery("三国", null, undefined, "", "三国"), true);
  assert.equal(matchQuery("Alice 三国", "Alice", undefined, "三国"), true);
  assert.equal(matchQuery("x", null, undefined), false);
});

test("a resource matches by name, detail line or group", () => {
  const item = { id: "a", name: "Claude", detail: "Sonnet 4.6", group: "工作" };
  assert.equal(matchItem("claude", item), true);
  assert.equal(matchItem("sonnet", item), true);
  assert.equal(matchItem("工作", item), true);
  assert.equal(matchItem("闲聊", item), false);
  assert.equal(matchItem("x", { id: "b", name: "Bare" }), false);
});

test("turning ids on appends the missing ones once, keeping the existing order", () => {
  assert.deepEqual(toggleIds(["b", "a"], ["a", "c", "d", "c"], true), ["b", "a", "c", "d"]);
  assert.deepEqual(toggleIds([], ["x"], true), ["x"]);
});

test("turning ids off removes only those ids", () => {
  assert.deepEqual(toggleIds(["a", "b", "c"], ["b", "z"], false), ["a", "c"]);
  assert.deepEqual(toggleIds(["a"], [], false), ["a"]);
});

test("toggling never mutates the selection it is given", () => {
  const selected = Object.freeze(["a"]);
  toggleIds(selected, ["b"], true);
  toggleIds(selected, ["a"], false);
  assert.deepEqual(selected, ["a"]);
});
