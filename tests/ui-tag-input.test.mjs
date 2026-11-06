import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const { code } = await transform(await readFile(new URL("../src/ui/tags.ts", import.meta.url), "utf8"), {
  loader: "ts",
  format: "esm",
});
const { isRegexKey, splitTags, addTags } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
const separators = [",", "，"];

test("both commas end an item and the text after the last one is still being typed", () => {
  assert.deepEqual(splitTags("灯塔, 守夜人，雾", separators), { items: ["灯塔", "守夜人"], rest: "雾" });
  assert.deepEqual(splitTags("灯塔,", separators), { items: ["灯塔"], rest: "" });
  assert.deepEqual(splitTags("灯塔", separators), { items: [], rest: "灯塔" });
});

test("blank pieces between separators are dropped", () => {
  assert.deepEqual(splitTags(" , ,灯塔,", separators), { items: ["灯塔"], rest: "" });
});

test("a comma inside an unfinished regex keyword stays in it until the regex is complete", () => {
  assert.deepEqual(splitTags("/a{1,3", separators), { items: [], rest: "/a{1,3" });
  assert.deepEqual(splitTags("/a{1,3}/i, 灯塔", separators), { items: ["/a{1,3}/i"], rest: " 灯塔" });
});

test("a regex keyword is /pattern/flags that compiles, with no bare slash inside", () => {
  assert.equal(isRegexKey("/lighthouse/i"), true);
  assert.equal(isRegexKey("/a\\/b/"), true);
  assert.equal(isRegexKey("/a/b/"), false);
  assert.equal(isRegexKey("/a(/"), false);
  assert.equal(isRegexKey("/a/x"), false);
  assert.equal(isRegexKey("lighthouse"), false);
});

test("adding appends trimmed new items once and skips blanks and ones already there", () => {
  assert.deepEqual(addTags(["灯塔"], [" 雾 ", "灯塔", "雾", ""]), ["灯塔", "雾"]);
});

test("adding nothing new returns the same array", () => {
  const values = ["灯塔"];
  assert.equal(addTags(values, ["灯塔", "  "]), values);
});
