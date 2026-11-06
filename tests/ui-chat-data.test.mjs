import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const { code } = await transform(await readFile(new URL("../src/ui/chatData.ts", import.meta.url), "utf8"), {
  loader: "ts",
  format: "esm",
});
const { uniqueReplies, sceneText } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);

const reply = (set, id, list) => ({ key: `${set}:${id}`, set, id, list });

test("a set enabled in several lists shows each quick reply once, where it first appears", () => {
  const replies = uniqueReplies([
    reply("问候", 1, "global"),
    reply("动作", 1, "global"),
    reply("问候", 1, "chat"),
    reply("问候", 2, "character"),
  ]);
  assert.deepEqual(
    replies.map((r) => r.key),
    ["问候:1", "动作:1", "问候:2"],
  );
  // The first place holds the later list's copy.
  assert.equal(replies[0].list, "chat");
  assert.deepEqual(uniqueReplies([]), []);
});

test("scene fields show strings and numbers; anything else is blank", () => {
  const scene = {
    location: "灯塔",
    day: 3,
    zero: 0,
    weather: "",
    time: null,
    mood: { calm: true },
    lit: true,
  };
  assert.equal(sceneText(scene, "location"), "灯塔");
  assert.equal(sceneText(scene, "day"), "3");
  assert.equal(sceneText(scene, "zero"), "0");
  assert.equal(sceneText(scene, "weather"), "");
  assert.equal(sceneText(scene, "time"), "");
  assert.equal(sceneText(scene, "mood"), "");
  assert.equal(sceneText(scene, "lit"), "");
  assert.equal(sceneText(scene, "missing"), "");
  assert.equal(sceneText({}, "location"), "");
});
