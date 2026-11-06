import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

/** SillyTavern's formatter as far as hooks go: it keeps every hook it is given and runs a stage's in order. */
const formatter = {
  stage: { BEFORE_REGEX: "beforeRegex", AFTER_MARKDOWN: "afterMarkdown" },
  addHook(fn, { stage = "afterMarkdown" } = {}) {
    this.hooks.push({ fn, stage });
  },
  run(stage, mes, info = { isUser: false, isReasoning: false }) {
    return this.hooks.filter((hook) => hook.stage === stage).reduce((text, hook) => hook.fn(text, info), mes);
  },
};
globalThis.document = { getElementById: () => null };
globalThis.window = { SillyTavern: { getContext: () => ({ messageFormatter: formatter }) } };
const { outputFiles } = await build({
  entryPoints: [new URL("../src/host/formatter.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
});
/** Each copy is a module of its own, as the workbench is when it is installed again without a reload. */
const copy = (n) =>
  import("data:text/javascript;base64," + Buffer.from(`${outputFiles[0].text}\n// ${n}`).toString("base64"));
const fresh = () => {
  formatter.hooks = [];
  delete formatter[Symbol.for("workbench.formatter.hooks")];
};

test("a name is hooked once per page, and a later call runs its own function there", async () => {
  fresh();
  const [first, second] = [await copy(1), await copy(2)];
  const idleA = first.formatterHook("cast", (mes) => mes + "+a");
  assert.equal(formatter.run("afterMarkdown", "x"), "x+a");
  const idleB = second.formatterHook("cast", (mes) => mes + "+b");
  assert.equal(formatter.hooks.length, 1, "another copy of the module finds the hook in place");
  assert.equal(formatter.run("afterMarkdown", "x"), "x+b");
  idleA();
  assert.equal(formatter.run("afterMarkdown", "x"), "x+b", "an older idle leaves the newer function running");
  idleB();
  assert.equal(formatter.run("afterMarkdown", "x"), "x", "an idle hook passes the text through");
  first.formatterHook("cast", (mes) => mes + "+c");
  assert.equal(formatter.hooks.length, 1);
  assert.equal(formatter.run("afterMarkdown", "x"), "x+c");
});

test("each name has a hook of its own, at its stage, given the message's details", async () => {
  fresh();
  const { formatterHook } = await copy(3);
  formatterHook("cast", (mes) => mes + "+cast");
  formatterHook("options", (mes, info) => (info.isUser ? mes : mes.toUpperCase()), {
    stage: formatter.stage.BEFORE_REGEX,
  });
  assert.equal(formatter.hooks.length, 2);
  assert.equal(formatter.run("beforeRegex", "x"), "X");
  assert.equal(formatter.run("beforeRegex", "x", { isUser: true, isReasoning: false }), "x");
  assert.equal(formatter.run("afterMarkdown", "x"), "x+cast");
});
