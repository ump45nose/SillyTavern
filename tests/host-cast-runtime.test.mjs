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
const load = async (file) => {
  const { outputFiles } = await build({
    entryPoints: [new URL(file, import.meta.url).pathname],
    bundle: true,
    format: "esm",
    write: false,
  });
  return import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
};
const { CastRuntime } = await load("../src/host/cast-runtime.ts");
const { PromptTable } = await load("../src/host/prompts.ts");
const book = { entries: { 0: { comment: "Alice", key: [] }, 1: { comment: "Bob", key: [] } } };
/** A host with the real prompt table, which hears the chat switches the test announces. */
function hostWith(readBook) {
  const listeners = [];
  const host = { readBook, listen: (name, fn) => listeners.push([name, fn]) };
  host.prompts = new PromptTable(host);
  host.emit = (name) => listeners.filter(([event]) => event === name).forEach(([, fn]) => fn());
  return host;
}

test("dispose takes the cast prompt out, and a load still in flight never writes it back", async () => {
  let release;
  const host = hostWith(() => new Promise((resolve) => (release = () => resolve(book))));
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
  const cast = new CastRuntime(hostWith(async () => book));
  prompts.length = 0;
  await cast.load();
  assert.equal(prompts.length, 1);
  assert.match(prompts[0][1], /Alice（joy）/);
  cast.dispose();
});

test("a chat switch keeps the same cast's prompt and takes another cast's out before the book is read", async () => {
  let release;
  const host = hostWith(() => new Promise((resolve) => (release = () => resolve(book))));
  const cast = new CastRuntime(host);
  const first = cast.load();
  release();
  await first;
  const alice = prompts.at(-1)[1];
  assert.match(alice, /Alice（joy）/);
  // A branch: same cast, so the host's table writes the prompt into it at once.
  prompts.length = 0;
  host.emit("CHAT_CHANGED");
  const branch = cast.load();
  assert.deepEqual(prompts, [["noval_cast", alice]]);
  release();
  await branch;
  // Another chat with another cast: the old prompt goes back in with the table, and out again at once.
  st.chatMetadata = { workbenchRP: { cast: { book: "Cast", entries: ["Bob"] } } };
  prompts.length = 0;
  host.emit("CHAT_CHANGED");
  const other = cast.load();
  assert.deepEqual(prompts, [
    ["noval_cast", alice],
    ["noval_cast", ""],
  ]);
  release();
  await other;
  assert.match(prompts.at(-1)[1], /Bob（joy）/);
  cast.dispose();
  st.chatMetadata = { workbenchRP: { cast: { book: "Cast", entries: ["Alice"] } } };
});
