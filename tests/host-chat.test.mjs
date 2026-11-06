import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const st = {
  characters: [{ name: "Alice", avatar: "alice.png" }],
  characterId: "0",
  groupId: null,
  getCurrentChatId: () => (st.groupId ? "group chat" : "Alice - 1"),
};
globalThis.document = { getElementById: () => null };
globalThis.window = { SillyTavern: { getContext: () => st } };
const { outputFiles } = await build({
  entryPoints: [new URL("../src/host/domains/chat.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
});
const { chatMethods } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64")
);

test("saveChatFile writes the open chat with SillyTavern's header row, for characters and groups", async () => {
  const requests = [];
  const host = { ...chatMethods, request: async (path, body) => requests.push([path, body]) };
  const header = { chat_metadata: { note: 1 }, user_name: "unused", character_name: "unused" },
    messages = [{ mes: "hi" }];
  await host.saveChatFile({ note: 1 }, messages);
  st.groupId = "g1";
  await host.saveChatFile({ note: 1 }, messages);
  st.groupId = null;
  assert.deepEqual(requests, [
    [
      "/api/chats/save",
      {
        ch_name: "Alice",
        file_name: "Alice - 1",
        avatar_url: "alice.png",
        chat: [header, ...messages],
        force: false,
      },
    ],
    ["/api/chats/group/save", { id: "group chat", chat: [header, ...messages], force: false }],
  ]);
});
