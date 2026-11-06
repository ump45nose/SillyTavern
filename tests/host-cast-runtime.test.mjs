import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const prompts = [];
const st = {
  chatMetadata: { workbenchRP: { cast: { book: "Cast", entries: ["Alice"] } } },
  getRequestHeaders: () => ({}),
  setExtensionPrompt: (key, value) => prompts.push([key, value]),
};
globalThis.document = { getElementById: () => null };
globalThis.window = { SillyTavern: { getContext: () => st } };
globalThis.fetch = async () => ({
  ok: true,
  json: async () => [{ label: "joy", path: "/characters/Cast/Alice/joy.png" }],
});
const { outputFiles } = await build({
  entryPoints: [new URL("../src/host/cast-runtime.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
});
const { CastRuntime } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64")
);
const book = { entries: { 0: { comment: "Alice", key: [] } } };

test("dispose takes the cast prompt out, and a load still in flight never writes it back", async () => {
  let release;
  const host = { readBook: () => new Promise((resolve) => (release = () => resolve(book))) };
  const cast = new CastRuntime(host);
  let heard = 0;
  cast.subscribe(() => heard++);
  const loading = cast.load();
  assert.equal(heard, 1, "the load announces it is loading");
  prompts.length = 0;
  cast.dispose();
  assert.deepEqual(prompts, [["noval_cast", ""]]);
  release();
  await loading;
  assert.deepEqual(prompts, [["noval_cast", ""]]);
  assert.equal(heard, 1);
  await cast.load();
  assert.deepEqual(prompts, [["noval_cast", ""]], "a disposed cast does not load again");
});

test("a live load injects the prompt for the chosen entries", async () => {
  const cast = new CastRuntime({ readBook: async () => book });
  prompts.length = 0;
  await cast.load();
  assert.equal(prompts.length, 1);
  assert.match(prompts[0][1], /Alice（joy）/);
  cast.dispose();
});
