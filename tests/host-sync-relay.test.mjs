import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const st = {
  getRequestHeaders: () => ({}),
  getCurrentChatId: () => "chat",
  groupId: null,
  characters: [{ avatar: "alice.png" }],
  characterId: 0,
};
const replies = [];
let source;
globalThis.document = { getElementById: () => null };
globalThis.window = { SillyTavern: { getContext: () => st } };
globalThis.fetch = async (url, options) => {
  if (String(url).endsWith("/relay")) replies.push(JSON.parse(options.body));
  return { ok: true };
};
// The plug-in's event stream: the relay listens to named events carrying JSON.
globalThis.EventSource = class {
  static CLOSED = 2;
  listeners = new Map();
  constructor() {
    source = this;
  }
  addEventListener(name, fn) {
    this.listeners.set(name, fn);
  }
  close() {}
};
const { outputFiles } = await build({
  entryPoints: [new URL("../src/host/sync-relay.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
});
const { SyncRelay } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64")
);

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
async function relay(host = {}) {
  const sync = new SyncRelay({
    database: { subscribe: () => () => {}, state: { tables: [] } },
    report: (error) => assert.fail(error),
    ...host,
  });
  await tick();
  return sync;
}
/** Sends one IDE write down the event stream and waits for the page's reply. */
async function write(request) {
  const count = replies.length;
  source.listeners.get("write")({ data: typeof request === "string" ? request : JSON.stringify(request) });
  for (let i = 0; i < 50 && replies.length === count; i++) await tick();
  return replies.at(-1);
}
const chat = (open = true) => JSON.stringify({ avatar: open ? "alice.png" : "bob.png", chat: "chat" });

test("outline writes for the open chat go to the writer the add-on manager registered", async () => {
  const sync = await relay(),
    written = [];
  const outline = { request: "o1", kind: "outline", id: chat(), base: {}, draft: { nodes: [] } };
  assert.match((await write(outline)).message, /尚未就绪/);
  const off = sync.handleOutline(async (draft) => written.push(draft));
  assert.deepEqual(await write(outline), { request: "o1", status: "done" });
  assert.deepEqual(written, [{ nodes: [] }]);
  assert.deepEqual(await write({ ...outline, id: chat(false) }), { request: "o1", status: "skip" });
  off();
  assert.equal((await write(outline)).status, "error");
  sync.dispose();
});
