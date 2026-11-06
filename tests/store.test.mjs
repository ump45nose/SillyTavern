import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// Minimal SillyTavern context: enough for the slice builders.
const st = {
  chat: [],
  characters: [{ avatar: "a.png", name: "Alice", data: { tags: [] } }],
  characterId: "0",
  chatId: "Alice - 1.jsonl",
  getCurrentChatId: () => st.chatId,
  groups: [],
  onlineStatus: "Valid",
  mainApi: "openai",
  extensionSettings: { workbench: {}, connectionManager: { profiles: [], selectedProfile: "" } },
  powerUserSettings: { personas: {} },
  getPresetManager: () => ({ getAllPresets: () => [], getSelectedPresetName: () => "" }),
  getWorldInfoNames: () => [],
  getThumbnailUrl: (kind, id) => `${kind}/${id}`,
  saveSettingsDebounced() {},
};
globalThis.document = { getElementById: () => null };
globalThis.window = { SillyTavern: { getContext: () => st } };
const { outputFiles } = await build({
  entryPoints: [new URL("../src/host/core.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
});
const { HostCore, messagePreview } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64")
);
const message = (mes, is_user = false) => ({ name: is_user ? "You" : "Alice", is_user, mes, send_date: 1 });

test("slices are cached until invalidated, and dependents go stale with them", () => {
  const host = new HostCore();
  const session = host.slice("session"),
    resources = host.slice("resources");
  assert.equal(host.slice("session"), session);
  assert.equal(session.character.name, "Alice");
  host.invalidate("characters");
  assert.notEqual(host.slice("session"), session, "session embeds the active character");
  assert.equal(host.slice("resources"), resources);
  host.invalidate("prefs");
  assert.notEqual(host.slice("resources"), resources, "connection grouping reads prefs");
});

test("revalidate notifies only the slices whose content changed", () => {
  const host = new HostCore();
  const heard = { session: 0, characters: 0, resources: 0, prefs: 0, all: 0 };
  for (const name of ["session", "characters", "resources", "prefs"]) {
    host.slice(name);
    host.subscribeSlice(name, () => heard[name]++);
  }
  host.subscribe(() => heard.all++);
  const characters = host.slice("characters");
  host.revalidate("characters", "prefs", "session", "resources");
  assert.deepEqual(
    heard,
    { session: 0, characters: 0, resources: 0, prefs: 0, all: 0 },
    "a save that changed nothing",
  );
  assert.equal(host.slice("characters"), characters);
  st.characters[0].data.extensions = { fav: true };
  host.revalidate("characters", "prefs", "session", "resources");
  assert.equal(heard.characters, 1, "a favourite lives in the card object but shows in lists");
  assert.equal(heard.all, 1);
  st.characterId = "";
  host.revalidate("characters", "prefs", "session", "resources");
  assert.equal(heard.session, 1, "the active character moved");
  st.characterId = "0";
  delete st.characters[0].data.extensions;
});

test("slice subscribers only hear their own slices; global subscribers hear everything", () => {
  const host = new HostCore();
  const heard = { session: 0, chat: 0, all: 0 };
  host.subscribeSlice("session", () => heard.session++);
  host.subscribeSlice("chat", () => heard.chat++);
  host.subscribe(() => heard.all++);
  host.invalidate("chat");
  assert.deepEqual(heard, { session: 0, chat: 1, all: 1 });
  host.invalidate("characters");
  assert.deepEqual(heard, { session: 1, chat: 1, all: 2 });
  host.refresh();
  assert.deepEqual(heard, { session: 2, chat: 2, all: 3 });
});

test("updateMessage re-indexes one floor and appends new ones without rebuilding the rest", () => {
  const host = new HostCore();
  st.chat = [message("<p>Hello   there</p>"), message("hi", true)];
  const first = host.slice("chat");
  assert.equal(first[0].preview, "Hello there");
  st.chat[1] = message("edited", true);
  st.chat.push(message("reply"));
  host.updateMessage(1);
  const next = host.slice("chat");
  assert.notEqual(next, first);
  assert.equal(next[0], first[0], "untouched floors keep their identity");
  assert.equal(next[1].preview, "edited");
  assert.equal(next[2].preview, "reply");
  st.chat.splice(0, 1);
  host.updateMessage(0);
  assert.equal(host.slice("chat").length, 2, "a shorter chat falls back to a full rebuild");
});

test("syncHidden re-indexes only the floors whose hidden flag changed", () => {
  const host = new HostCore();
  st.chat = [message("a"), message("b", true), message("c")];
  const first = host.slice("chat");
  let heard = 0;
  host.subscribeSlice("chat", () => heard++);
  host.syncHidden();
  assert.equal(heard, 0, "nothing changed");
  st.chat[0].is_system = true;
  st.chat[2].is_system = true;
  host.syncHidden();
  const next = host.slice("chat");
  assert.equal(heard, 1, "one notification for the whole hidden range");
  assert.deepEqual(
    next.map((m) => !!m.hidden),
    [true, false, true],
  );
  assert.equal(next[1], first[1]);
  st.chat[0].is_system = false;
  host.syncHidden();
  assert.equal(host.slice("chat")[0].hidden, undefined);
});

test("listen warns once about an event SillyTavern lacks, and returns the removal either way", (t) => {
  const listeners = new Map();
  st.eventTypes = { CHAT_CHANGED: "chat_id_changed" };
  st.eventSource = {
    on: (event, fn) => listeners.set(event, fn),
    removeListener: (event, fn) => listeners.get(event) === fn && listeners.delete(event),
  };
  const warn = t.mock.method(console, "warn", () => {});
  const host = new HostCore();
  const fn = () => {};
  const off = host.listen("CHAT_CHANGED", fn);
  assert.equal(listeners.get("chat_id_changed"), fn);
  off();
  assert.equal(listeners.size, 0);
  assert.equal(host.cleanup.length, 1, "destroy removes it too");
  host.listen("NO_SUCH_EVENT", fn)();
  host.listen("NO_SUCH_EVENT", fn);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /NO_SUCH_EVENT/);
  assert.equal(host.cleanup.length, 1);
});

test("snapshot assembles the slices and keeps identity until something changes", () => {
  const host = new HostCore();
  const snap = host.snapshot();
  assert.equal(host.snapshot(), snap);
  assert.equal(snap.messages, host.slice("chat"));
  assert.equal(snap.chatName, "Alice - 1");
  host.invalidate("chat");
  assert.notEqual(host.snapshot(), snap);
  assert.equal(host.snapshot().characters, snap.characters);
});

test("a failed request names what failed, or keeps the editor's draft message by default", async (t) => {
  st.getRequestHeaders = () => ({});
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 404 }));
  const host = new HostCore();
  await assert.rejects(host.request("/api/x", {}), /^Error: 保存或读取失败（HTTP 404），草稿已保留。$/);
  await assert.rejects(host.request("/api/x", {}, "删除聊天失败"), /^Error: 删除聊天失败（HTTP 404）。$/);
});

test("previews strip markup and collapse whitespace", () => {
  assert.equal(messagePreview("<b>a</b>\n\n  b"), "a b");
  assert.equal(messagePreview(undefined), "");
  assert.equal(messagePreview("x".repeat(200)).length, 120);
});
