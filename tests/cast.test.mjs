import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
const { code } = await transform(await readFile(new URL("../src/host/cast.ts", import.meta.url), "utf8"), {
  loader: "ts",
  format: "esm",
});
const { parseCastTag, castTagsAsNames, matchSpeaker, pickSprite, castPrompt, isPathSafe, spriteLabel } =
  await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));

test("cast tags open a line with a name and an expression, in either colon", () => {
  assert.deepEqual(parseCastTag("张三|joy:「走吧。」"), { speaker: "张三", expr: "joy", length: 7 });
  assert.deepEqual(parseCastTag("  李四 | Anger ：滚开"), { speaker: "李四", expr: "anger", length: 14 });
  assert.equal(parseCastTag("他看着表格 a|b 的两列"), null);
  assert.equal(parseCastTag("旁白里有一个竖线|这里:不是"), null);
  assert.equal(parseCastTag("张三|开心:「走」"), null);
  assert.equal(parseCastTag("|joy:「走」"), null);
  assert.equal(castTagsAsNames("张三|joy:「走吧。」\n风停了。\n李四|anger: 滚"), "张三：「走吧。」\n风停了。\n李四：滚");
});

test("an untagged passage belongs to the name that opens a line or stands before the first quote", () => {
  const cast = [
    { name: "张三", aliases: ["三哥"] },
    { name: "张三丰", aliases: [] },
    { name: "李四", aliases: ["阿四"] },
  ];
  assert.equal(matchSpeaker("【李四】别过来。", cast), "李四");
  assert.equal(matchSpeaker("夜深了。\n张三丰：「太极。」", cast), "张三丰");
  assert.equal(matchSpeaker("张三看了李四一眼，阿四低声说：“走。”", cast), "李四");
  assert.equal(matchSpeaker("三哥笑道「好」", cast), "张三");
  assert.equal(matchSpeaker("雨下了一夜，没有人说话。", cast), null);
});

test("an expression falls back to neutral, then the host's fallback, then any image", () => {
  const sprites = [
    { label: "anger", path: "/a" },
    { label: "joy", path: "/j" },
    { label: "neutral", path: "/n" },
  ];
  assert.equal(pickSprite(sprites, "joy").path, "/j");
  assert.equal(pickSprite(sprites, "fear").path, "/n");
  assert.equal(pickSprite(sprites.slice(0, 2), "fear", "joy").path, "/j");
  assert.equal(pickSprite(sprites.slice(0, 1), null, "joy").path, "/a");
  assert.equal(pickSprite([], "joy"), null);
});

test("the injected prompt lists each member with the expressions its folder holds", () => {
  const prompt = castPrompt([
    { name: "张三", labels: ["joy", "neutral"] },
    { name: "李四", labels: [] },
  ]);
  assert.match(prompt, /张三（joy、neutral）；李四。/);
  assert.match(prompt, /名字\|表情:/);
  assert.equal(castPrompt([]), "");
});

test("only names the server keeps unchanged can be folders", () => {
  for (const name of ["张三", "Mr. Lee", "a-b_c"]) assert.equal(isPathSafe(name), true, name);
  for (const name of ["", "a/b", "a:b", "what?", "trail.", "trail ", "..", "CON", "x".repeat(256)])
    assert.equal(isPathSafe(name), false, name);
  assert.equal(spriteLabel("Joy-2.png"), "joy");
  assert.equal(spriteLabel("joy.alt.webp"), "joy");
  assert.equal(spriteLabel("neutral.png"), "neutral");
});
