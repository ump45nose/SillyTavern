import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const observers = [];
const frames = [];
let present = [];
globalThis.MutationObserver = class {
  nodes = [];
  constructor(callback) {
    this.callback = callback;
    observers.push(this);
  }
  observe(node) {
    this.nodes.push(node);
  }
  disconnect() {
    this.nodes = [];
  }
};
globalThis.Element = class {};
globalThis.document = { body: { id: "body" }, querySelectorAll: () => present };
globalThis.requestAnimationFrame = (fn) => frames.push(fn);
globalThis.cancelAnimationFrame = () => {};
const { outputFiles } = await build({
  entryPoints: [new URL("../src/host/chat-observer.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
});
const { ChatObserver, MediaObserver } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64")
);
const runFrames = () => frames.splice(0).forEach((fn) => fn());

test("a sprite wrapper that leaves the page is no longer watched, and its departure is announced", () => {
  const expression = { id: "expression-wrapper" },
    novel = { id: "visual-novel-wrapper" };
  present = [expression, novel];
  const media = new MediaObserver(),
    [inner, outer] = observers.slice(-2);
  let heard = 0;
  media.subscribe(() => heard++);
  assert.deepEqual(inner.nodes, [expression, novel]);
  runFrames();
  assert.equal(heard, 1);
  present = [expression];
  outer.callback();
  assert.deepEqual(inner.nodes, [expression]);
  runFrames();
  assert.equal(heard, 2);
  outer.callback();
  assert.deepEqual(inner.nodes, [expression], "an unchanged page re-observes nothing");
  runFrames();
  assert.equal(heard, 2);
  media.disconnect();
});

test("a floor's is_system flip is reported as hidden; other attribute changes re-number the floors", () => {
  const chat = new ChatObserver({ contains: () => false }),
    observer = observers.at(-1),
    heard = [];
  chat.subscribe((change) => heard.push([change.nodes, change.hidden]));
  const changed = (attributeName) => ({ type: "attributes", attributeName, target: { parentElement: null } });
  observer.callback([changed("is_system")]);
  runFrames();
  observer.callback([changed("mesid")]);
  runFrames();
  assert.deepEqual(heard, [
    [false, true],
    [true, false],
  ]);
  chat.disconnect();
});
