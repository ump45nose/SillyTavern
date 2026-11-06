import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

// A preset manager in either list shape: keyed APIs list names, the others map names to indexes.
function presetManager({ keyed = false, selected = "" } = {}) {
  const presets = [{ temperature: 1 }],
    preset_names = keyed ? ["A"] : { A: 0 },
    saves = [];
  return {
    select: { id: "presets" },
    presets,
    preset_names,
    saves,
    getPresetList: () => ({ presets, preset_names }),
    getSelectedPresetName: () => selected,
    async savePreset(name, data, options) {
      saves.push([name, data, options]);
    },
  };
}
const st = {};
const appended = [];
globalThis.document = { getElementById: () => null };
globalThis.window = {
  SillyTavern: { getContext: () => st },
  jQuery: (target) => ({ append: (option) => appended.push({ target, option }) }),
};
globalThis.Option = class {
  constructor(text, value) {
    Object.assign(this, { text, value, selected: false });
  }
};
const { outputFiles } = await build({
  entryPoints: [new URL("../src/host/domains/preset.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
});
const { presetIndex, presetMethods } = await import(
  "data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64")
);
const host = (manager) => {
  st.getPresetManager = () => manager;
  appended.length = 0;
  return { ...presetMethods, invalidate() {} };
};

test("presetIndex reads both list shapes and ignores inherited names", () => {
  const map = { getPresetList: () => ({ preset_names: { A: 0, B: 2 } }) },
    list = { getPresetList: () => ({ preset_names: ["A", "B"] }) };
  assert.equal(presetIndex(map, "B"), 2);
  assert.equal(presetIndex(map, "C"), undefined);
  assert.equal(presetIndex(map, "constructor"), undefined);
  assert.equal(presetIndex(list, "B"), 1);
  assert.equal(presetIndex(list, "C"), undefined);
});

test("writing an existing preset replaces the page's copy and selects nothing", async () => {
  const manager = presetManager(),
    data = { temperature: 0.5 };
  await host(manager).writePresetFile("A", data);
  assert.deepEqual(manager.saves, [["A", data, { skipUpdate: true }]]);
  assert.deepEqual(manager.presets, [data]);
  assert.notEqual(manager.presets[0], data, "the list keeps its own copy");
  assert.equal(appended.length, 0);
});

test("a new preset joins the list unselected, by index or by name", async () => {
  const mapped = presetManager();
  await host(mapped).writePresetFile("B", { temperature: 2 });
  assert.equal(mapped.preset_names.B, 1);
  assert.deepEqual(mapped.presets[1], { temperature: 2 });
  assert.equal(appended[0].target, mapped.select);
  assert.deepEqual({ ...appended[0].option }, { text: "B", value: "1", selected: false });

  const keyed = presetManager({ keyed: true });
  await host(keyed).writePresetFile("B", { temperature: 2 });
  assert.deepEqual(keyed.preset_names, ["A", "B"]);
  assert.deepEqual({ ...appended[0].option }, { text: "B", value: "B", selected: false });
});

test("saving a draft goes through SillyTavern's list update only for the running preset", async () => {
  const base = { temperature: 1 },
    draft = { temperature: 0.7 };
  const running = presetManager({ selected: "A" });
  assert.deepEqual(await host(running).savePreset("A", base, draft), draft);
  assert.deepEqual(running.saves, [["A", draft, undefined]], "the list update applies the file");

  const other = presetManager({ selected: "Default" });
  assert.deepEqual(await host(other).savePreset("A", base, draft), draft);
  assert.deepEqual(other.saves, [["A", draft, { skipUpdate: true }]]);
  assert.deepEqual(other.presets, [draft]);
});
