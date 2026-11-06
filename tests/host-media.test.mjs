import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const st = {
  characters: [{ avatar: "alice.png" }],
  characterId: 0,
  groupId: null,
  chatId: "chat",
  getCurrentChatId: () => st.chatId,
  chatMetadata: {},
  chat: [],
  drawn: [],
  appendMediaToMessage: (message) => st.drawn.push(urls(message.extra)),
};
globalThis.document = { getElementById: () => null, querySelector: () => ({}) };
globalThis.window = { SillyTavern: { getContext: () => st }, jQuery: (node) => node };
const load = async (file) => {
  const { outputFiles } = await build({
    entryPoints: [new URL(file, import.meta.url).pathname],
    bundle: true,
    format: "esm",
    write: false,
  });
  return import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
};
const { AddonBridge } = await load("../src/host/addon-api.ts");
const { groupMethods } = await load("../src/host/domains/group.ts");
const urls = (extra) => extra?.media?.map((m) => m.url) ?? [];
/** The image add-on's view of a bridge whose chat file writes go to `save`. */
function imageHost(save) {
  const bridge = new AddonBridge({
    listen: () => () => {},
    subscribe: () => () => {},
    snapshot: () => ({ busy: false }),
    saveChatFile: (...args) => save(...args),
    updateMessage: () => {},
  });
  return { bridge, api: bridge.api("image-gen", () => {}) };
}

test("an attached image is in memory before the chat file is written, so a save made meanwhile has it", async () => {
  const reply = { mes: "回复", is_user: false, swipe_id: 0, swipe_info: [{ extra: {} }], extra: { note: 1 } };
  st.chat = [reply];
  const writes = [];
  const { bridge, api } = imageHost(async (metadata, messages) =>
    writes.push([urls(st.chat[0].extra), urls(messages[0].extra), urls(messages[0].swipe_info[0].extra)]),
  );
  assert.equal(await api.attach(bridge.target(0), "/user/images/a.png"), true);
  assert.deepEqual(writes, [[["/user/images/a.png"], ["/user/images/a.png"], ["/user/images/a.png"]]]);
  assert.equal(reply.extra.note, 1);
  assert.deepEqual(urls(reply.swipe_info[0].extra), ["/user/images/a.png"]);
  assert.deepEqual(st.drawn.at(-1), ["/user/images/a.png"], "the message is drawn once the write is done");
  bridge.dispose();
});

test("a failed write takes the image back out, but not over what changed meanwhile", async () => {
  const extra = { note: 1 },
    swipeExtra = { note: 1 },
    reply = { mes: "回复", is_user: false, swipe_id: 0, swipe_info: [{ extra: swipeExtra }], extra };
  st.chat = [reply];
  let during = () => {};
  const { bridge, api } = imageHost(async () => {
    during();
    throw new Error("磁盘已满");
  });
  const target = bridge.target(0);
  await assert.rejects(api.attach(target, "/user/images/b.png"), /磁盘已满/);
  assert.equal(reply.extra, extra);
  assert.equal(reply.swipe_info[0].extra, swipeExtra);
  assert.deepEqual(st.drawn.at(-1), [], "drawn again as it was");
  // The message's extra replaced during the write (as a swipe does) stays; the old swipe's comes back.
  const swiped = { swiped: true };
  during = () => (reply.extra = swiped);
  await assert.rejects(api.attach(target, "/user/images/b.png"), /磁盘已满/);
  assert.equal(reply.extra, swiped);
  assert.equal(reply.swipe_info[0].extra, swipeExtra);
  // A message that had no extra has none again.
  const bare = { mes: "回复", is_user: false };
  st.chat = [bare];
  during = () => {};
  await assert.rejects(api.attach(bridge.target(0), "/user/images/c.png"), /磁盘已满/);
  assert.equal(Object.hasOwn(bare, "extra"), false);
  bridge.dispose();
});

test("group overrides are in memory before the write; a failed one puts the old values back", async () => {
  Object.assign(st, { groupId: "g1", chatId: "g1-chat", chatMetadata: { scenario: "旧场景", other: 1 } });
  let fail = true;
  const seen = [];
  const host = {
    ...groupMethods,
    isBusy: () => false,
    saveChatFile: async () => {
      seen.push({ ...st.chatMetadata });
      if (fail) throw new Error("保存失败");
    },
  };
  const base = host.groupOverrides(),
    draft = { ...base, scenario: "新场景" };
  await assert.rejects(host.saveGroupOverrides("g1", "g1-chat", base, draft), /保存失败/);
  assert.deepEqual(seen, [{ scenario: "新场景", other: 1, mes_example: "", system_prompt: "" }]);
  assert.deepEqual(
    st.chatMetadata,
    { scenario: "旧场景", other: 1 },
    "fields that were absent are taken out again",
  );
  fail = false;
  assert.deepEqual(await host.saveGroupOverrides("g1", "g1-chat", base, draft), {
    scenario: "新场景",
    mes_example: "",
    system_prompt: "",
  });
  assert.equal(st.chatMetadata.scenario, "新场景");
  Object.assign(st, { groupId: null, chatId: "chat", chatMetadata: {} });
});
