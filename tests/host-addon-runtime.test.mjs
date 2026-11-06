import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const handlers = new Map();
const outline = (depth) => ({
  nodes: [{ id: "a", parent: null, title: "相遇", content: "两人在雪地里相遇。", status: "active" }],
  settings: { inject: { enabled: true, depth } },
});
const st = {
  eventTypes: { CHAT_CHANGED: "chat_changed" },
  eventSource: {
    on: (event, fn) => handlers.set(event, [...(handlers.get(event) || []), fn]),
    removeListener: (event, fn) =>
      handlers.set(
        event,
        (handlers.get(event) || []).filter((f) => f !== fn),
      ),
  },
  registerMacro() {},
  unregisterMacro() {},
  extensionPrompts: {},
  writes: 0,
  setExtensionPrompt(key, value, position, depth) {
    st.writes++;
    st.extensionPrompts[key] = { value: String(value), position, depth };
  },
  chatMetadata: { workbench_addons: { outline: outline(2) } },
  characters: [{ avatar: "alice.png" }],
  characterId: 0,
  groupId: null,
  getCurrentChatId: () => "chat",
  chat: [],
};
globalThis.document = { getElementById: () => null };
globalThis.window = { SillyTavern: { getContext: () => st } };
// Real path: the loader checks add-on files against its own module URL, which has links resolved.
const directory = await realpath(await mkdtemp(tmpdir() + "/wb-addon-runtime-tests-"));
const { outputFiles } = await build({
  entryPoints: [new URL("../src/addons/runtime.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
await writeFile(directory + "/runtime.mjs", outputFiles[0].text);
const { addonManager, disposeAddons } = await import(directory + "/runtime.mjs");
// An installed outline add-on: its manifest (fetched) and its module (imported), with a runtime that
// records its subscribers.
await writeFile(directory + "/package.json", '{"type":"module"}');
await writeFile(
  directory + "/outline.js",
  `export const id = "outline", apiVersion = 2;
export function Workspace() {}
export function createRuntime() {
  const runtime = (globalThis.outlineRuntime = { listeners: new Set(), disposed: false });
  return {
    subscribe: (fn) => (runtime.listeners.add(fn), () => runtime.listeners.delete(fn)),
    revision: () => 0,
    state: () => ({}),
    task: () => ({ status: "idle" }),
    action: async () => {},
    stop() {},
    dispose: () => (runtime.disposed = true),
  };
}`,
);
const entry = pathToFileURL(directory + "/outline.js").href;
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ id: "outline", apiVersion: 2, version: "1", entry, css: entry.replace(/js$/, "css") }),
});

const notify = new Set();
const outlineWriters = new Set();
let prefs = { addons: {} };
const host = {
  prefs: () => prefs,
  subscribe: (fn) => (notify.add(fn), () => notify.delete(fn)),
  listen(name, fn) {
    const event = st.eventTypes[name];
    if (!event) return () => {};
    st.eventSource.on(event, fn);
    return () => st.eventSource.removeListener(event, fn);
  },
  report: (error) => assert.fail(error),
  sync: { handleOutline: (write) => (outlineWriters.add(write), () => outlineWriters.delete(write)) },
};
const prompt = () => st.extensionPrompts.noval_outline;

test("the outline prompt comes back when a reload or branch empties SillyTavern's prompt table", () => {
  addonManager(host);
  assert.equal(outlineWriters.size, 1, "the manager takes IDE outline writes for the open chat");
  assert.equal(prompt().depth, 2);
  assert.match(prompt().value, /当前节点 · 相遇/);
  const injected = prompt().value;
  // Reloading the chat: the table starts empty and the metadata is read again with the same outline.
  st.extensionPrompts = {};
  st.chatMetadata = { workbench_addons: { outline: outline(2) } };
  handlers.get("chat_changed").forEach((fn) => fn());
  assert.deepEqual(prompt(), { value: injected, position: 1, depth: 2 });
  // The same metadata object again: nothing is re-read, but an emptied table is still refilled.
  st.extensionPrompts = {};
  notify.forEach((fn) => fn());
  assert.equal(prompt().value, injected);
  const writes = st.writes;
  notify.forEach((fn) => fn());
  assert.equal(st.writes, writes, "an injected prompt is not written again");
  st.chatMetadata = { workbench_addons: { outline: outline(5) } };
  notify.forEach((fn) => fn());
  assert.equal(prompt().depth, 5);
  disposeAddons(host);
  assert.equal(prompt().value, "");
  assert.equal(outlineWriters.size, 0);
});

test("turning an add-on off ends its runtime and the subscription to it at once", async () => {
  const manager = addonManager(host);
  await manager.ensure("outline");
  const runtime = globalThis.outlineRuntime;
  assert.equal(runtime.listeners.size, 1);
  prefs = { addons: { outline: false } };
  notify.forEach((fn) => fn());
  assert.equal(manager.get("outline"), undefined);
  assert.deepEqual([runtime.disposed, runtime.listeners.size], [true, 0]);
  prefs = { addons: {} };
  disposeAddons(host);
});
