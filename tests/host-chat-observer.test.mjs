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
globalThis.document = { body: { id: "body" }, querySelectorAll: () => present };
globalThis.requestAnimationFrame = (fn) => frames.push(fn);
globalThis.cancelAnimationFrame = () => {};
const { outputFiles } = await build({
  entryPoints: [new URL("../src/host/chat-observer.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
});
const { MediaObserver } = await import(
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
