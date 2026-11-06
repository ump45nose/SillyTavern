import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

/** The native input and send button, as far as the host touches them. */
const input = {
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent(event) {
    this.heard.push([event.type, event.bubbles, this.value]);
  },
  setSelectionRange(start, end) {
    [this.selectionStart, this.selectionEnd] = [start, end];
  },
  focus() {
    this.focused = true;
  },
};
const reset = (value = "", start = value.length, end = start) =>
  Object.assign(input, { value, selectionStart: start, selectionEnd: end, focused: false, heard: [] });
const send = { clicks: 0, click: () => send.clicks++ };
const classes = new Set();
globalThis.document = {
  body: { classList: { contains: (name) => classes.has(name) } },
  getElementById: (id) => ({ send_textarea: input, send_but: send })[id] ?? null,
};
globalThis.window = { SillyTavern: { getContext: () => ({}) } };
const load = async (file) => {
  const { outputFiles } = await build({
    entryPoints: [new URL(file, import.meta.url).pathname],
    bundle: true,
    format: "esm",
    write: false,
  });
  return import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));
};
const { chatMethods } = await load("../src/host/domains/chat.ts");
const { AddonBridge } = await load("../src/host/addon-api.ts");

test("setInput writes the input as typing would, caret at the end; the phone leaves focus to a tap", () => {
  const host = { ...chatMethods };
  reset("old", 1);
  host.setInput("hello");
  assert.deepEqual(input.heard, [["input", true, "hello"]]);
  assert.deepEqual([input.focused, input.selectionStart, input.selectionEnd], [true, 5, 5]);
  classes.add("wb-mobile");
  reset("old", 1);
  host.setInput("hi");
  assert.deepEqual([input.value, input.heard.length, input.focused], ["hi", 1, false]);
  classes.delete("wb-mobile");
});

test("setInput with a range puts a draft and its selection back without taking focus", () => {
  const host = { ...chatMethods };
  reset();
  host.setInput("a draft", [2, 5]);
  assert.deepEqual(input.heard, [["input", true, "a draft"]]);
  assert.deepEqual([input.focused, input.selectionStart, input.selectionEnd], [false, 2, 5]);
});

test("sendInput clicks SillyTavern's send button", () => {
  ({ ...chatMethods }).sendInput();
  assert.equal(send.clicks, 1);
});

test("an add-on's insert replaces the input or goes in over the selection, caret after it", () => {
  const bridge = new AddonBridge({ ...chatMethods, listen: () => () => {} });
  reset("Hello world", 0, 5);
  bridge.insert("Hi", "caret");
  assert.deepEqual(input.heard, [["input", true, "Hi world"]]);
  assert.deepEqual([input.focused, input.selectionStart, input.selectionEnd], [true, 2, 2]);
  reset("Hello world", 0, 5);
  bridge.insert("New", "replace");
  assert.deepEqual([input.value, input.selectionStart, input.focused], ["New", 3, true]);
  classes.add("wb-image-input-mode");
  assert.throws(() => bridge.insert("x", "replace"), /退出手动生图输入/);
  classes.delete("wb-image-input-mode");
  bridge.dispose();
});
