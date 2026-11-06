import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const st = {
  extensionPrompts: {},
  writes: [],
  setExtensionPrompt(key, value, position, depth, scan, role) {
    st.extensionPrompts[key] = { value, position, depth, scan, role };
    st.writes.push(key);
  },
};
globalThis.document = { getElementById: () => null };
globalThis.window = { SillyTavern: { getContext: () => st } };
const { outputFiles } = await build({
  entryPoints: [new URL("../src/host/prompts.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
});
const { PromptTable } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64")
);

/** A table on a host whose events the test fires, as SillyTavern's emitter would. */
function table() {
  const listeners = new Map();
  const prompts = new PromptTable({
    listen: (name, fn) => listeners.set(name, [...(listeners.get(name) || []), fn]),
  });
  const emit = (name, ...args) => (listeners.get(name) || []).forEach((fn) => fn(...args));
  return { prompts, emit, listeners };
}

test("an entry goes in the chat as a system prompt unless it says otherwise; empty text clears it", () => {
  const { prompts } = table();
  prompts.set("a", "Alpha", { depth: 1 });
  assert.deepEqual(st.extensionPrompts.a, { value: "Alpha", position: 1, depth: 1, scan: false, role: 0 });
  prompts.set("b", "Beta", { depth: 4, position: 0, role: 2, scan: true });
  assert.deepEqual(st.extensionPrompts.b, { value: "Beta", position: 0, depth: 4, scan: true, role: 2 });
  prompts.set("a", "", { depth: 1 });
  assert.equal(st.extensionPrompts.a.value, "");
  prompts.clear("b");
  assert.equal(st.extensionPrompts.b.value, "", "a cleared entry stays in SillyTavern's table, empty");
  prompts.dispose();
});

test("the whole table goes back in on a chat switch and when a generation starts, dry runs included", () => {
  const { prompts, emit, listeners } = table();
  assert.deepEqual([...listeners.keys()].sort(), ["CHAT_CHANGED", "GENERATION_STARTED"]);
  prompts.set("a", "Alpha", { depth: 1 });
  prompts.set("b", "Beta", { depth: 0 });
  prompts.clear("b");
  const live = structuredClone(st.extensionPrompts.a);
  // SillyTavern starts a new table whenever it loads, reloads or branches a chat.
  st.extensionPrompts = {};
  emit("CHAT_CHANGED");
  assert.deepEqual(st.extensionPrompts, { a: live }, "cleared entries stay out");
  st.extensionPrompts = {};
  emit("GENERATION_STARTED", "normal", {}, true);
  assert.deepEqual(st.extensionPrompts, { a: live });
  emit("GENERATION_STARTED", "normal", {}, false);
  assert.deepEqual(st.extensionPrompts, { a: live }, "writing the same table again changes nothing");
  prompts.dispose();
});

test("dispose empties every entry, and nothing set afterwards is written", () => {
  const { prompts, emit } = table();
  prompts.set("a", "Alpha", { depth: 1 });
  prompts.set("b", "Beta", { depth: 2 });
  prompts.dispose();
  assert.deepEqual([st.extensionPrompts.a.value, st.extensionPrompts.b.value], ["", ""]);
  st.writes.length = 0;
  prompts.set("a", "Again", { depth: 1 });
  prompts.clear("b");
  emit("CHAT_CHANGED");
  assert.deepEqual(st.writes, []);
});
