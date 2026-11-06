import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// chatId and getCurrentChatId read the same place, as in SillyTavern's context.
const st = {
  chat: [],
  characters: [{ avatar: "a.png", name: "Alice", data: { tags: [] }, chat: "Alice - 1" }],
  characterId: "0",
  groupId: null,
  groups: [{ id: "g1", name: "Party", chat_id: "Party - 1" }],
  get chatId() {
    return st.groupId
      ? st.groups.find((g) => g.id === st.groupId)?.chat_id
      : st.characters[st.characterId]?.chat;
  },
  getCurrentChatId: () => st.chatId,
  onlineStatus: "Valid",
  mainApi: "openai",
  extensionSettings: { workbench: {}, connectionManager: { profiles: [], selectedProfile: "" } },
  powerUserSettings: { personas: {} },
  getPresetManager: () => ({ getAllPresets: () => [], getSelectedPresetName: () => "" }),
  getWorldInfoNames: () => [],
  getThumbnailUrl: (kind, id) => `${kind}/${id}`,
};
globalThis.document = { getElementById: () => null };
globalThis.window = { SillyTavern: { getContext: () => st } };
const { outputFiles } = await build({
  entryPoints: [new URL("../src/host/core.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
});
const { HostCore } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64")
);
const character = () => Object.assign(st, { groupId: null, characterId: "0" });

test("the chat key names the group or the character's avatar, and the chat file", () => {
  character();
  const host = new HostCore();
  assert.equal(host.chatKey(), "a.png:Alice - 1");
  assert.equal(host.snapshot().chatKey, "a.png:Alice - 1");
  Object.assign(st, { groupId: "g1", characterId: undefined });
  host.invalidate("characters");
  assert.equal(host.chatKey(), "g1:Party - 1");
  assert.equal(host.snapshot().chatKey, "g1:Party - 1");
  character();
});

test("read live the key follows a switch at once; the snapshot's moves with the session it was read with", () => {
  character();
  const host = new HostCore();
  assert.equal(host.snapshot().chatKey, "a.png:Alice - 1");
  // SillyTavern has switched; the host has not heard CHAT_CHANGED yet.
  st.characters[0].chat = "Alice - 2";
  assert.equal(host.chatKey(), "a.png:Alice - 2");
  assert.deepEqual([host.snapshot().chatKey, host.snapshot().chatName], ["a.png:Alice - 1", "Alice - 1"]);
  host.invalidate("session");
  assert.deepEqual([host.snapshot().chatKey, host.snapshot().chatName], ["a.png:Alice - 2", "Alice - 2"]);
  st.characters[0].chat = "Alice - 1";
});
