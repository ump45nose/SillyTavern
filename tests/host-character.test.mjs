import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const st = {};
globalThis.document = { getElementById: () => null };
globalThis.window = { SillyTavern: { getContext: () => st } };
const { outputFiles } = await build({
  entryPoints: [new URL("../src/host/domains/character.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
});
const { characterMethods } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64")
);

// SillyTavern with the open character first, and the regex extension's delete handler, which revokes
// the open character's embedded scripts.
function setup(failing = "") {
  const log = { requests: [], removed: [], emitted: [], saves: 0, reloads: 0, invalidated: [] };
  Object.assign(st, {
    characters: [{ avatar: "open.png" }, { avatar: "a.png" }, { avatar: "b.png" }],
    characterId: "0",
    tagMap: { "open.png": ["t"], "a.png": ["t"], "b.png": ["t"] },
    accountStorage: { removeItem: (key) => log.removed.push(key) },
    extensionSettings: { character_allowed_regex: ["open.png", "a.png"] },
    eventTypes: { CHARACTER_DELETED: "characterDeleted" },
    eventSource: {
      async emit(event, { id, character }) {
        log.emitted.push([event, id, character.avatar]);
        const allowed = st.extensionSettings.character_allowed_regex;
        const index = allowed.indexOf(st.characters[st.characterId]?.avatar);
        if (index >= 0) allowed.splice(index, 1);
      },
    },
    saveSettingsDebounced: () => log.saves++,
    getCharacters: async () => log.reloads++,
  });
  const host = {
    ...characterMethods,
    snapshot: () => ({ character: { id: "open.png" } }),
    async request(path, body, failure) {
      log.requests.push([path, body]);
      if (body.avatar_url === failing) throw new Error(`${failure}（HTTP 500）。`);
    },
    invalidate: (name) => log.invalidated.push(name),
  };
  return { host, log };
}

test("each deleted card gets SillyTavern's cleanup and delete event; the open character keeps its regex permission", async () => {
  const { host, log } = setup();
  await host.deleteCharacters(["a.png", "b.png"]);
  assert.deepEqual(log.requests, [
    ["/api/characters/delete", { avatar_url: "a.png", delete_chats: false }],
    ["/api/characters/delete", { avatar_url: "b.png", delete_chats: false }],
  ]);
  assert.deepEqual(log.removed, [
    "AlertWI_a.png",
    "AlertRegex_a.png",
    "mediaWarningShown:a.png",
    "AlertWI_b.png",
    "AlertRegex_b.png",
    "mediaWarningShown:b.png",
  ]);
  assert.deepEqual(Object.keys(st.tagMap), ["open.png"]);
  assert.deepEqual(log.emitted, [
    ["characterDeleted", 1, "a.png"],
    ["characterDeleted", 2, "b.png"],
  ]);
  assert.ok(st.extensionSettings.character_allowed_regex.includes("open.png"));
  assert.deepEqual([log.saves, log.reloads, log.invalidated], [1, 1, ["characters"]]);
});

test("a failed delete stops the batch but still saves and reloads after the ones that went through", async () => {
  const { host, log } = setup("b.png");
  await assert.rejects(host.deleteCharacters(["a.png", "b.png"]), /^Error: 删除角色失败（HTTP 500）。$/);
  assert.deepEqual(log.emitted, [["characterDeleted", 1, "a.png"]]);
  assert.deepEqual(Object.keys(st.tagMap), ["open.png", "b.png"]);
  assert.deepEqual([log.saves, log.reloads, log.invalidated], [1, 1, ["characters"]]);
});

test("the open character is not deleted from here", async () => {
  const { host, log } = setup();
  await assert.rejects(host.deleteCharacters(["a.png", "open.png"]), /请先切换/);
  assert.deepEqual([log.requests, log.emitted, log.reloads], [[], [], 0]);
});
