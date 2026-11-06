import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Every icon becomes its own export name, so a mapping is checked by the name the code picks.
const names = [
  ...(await readFile(new URL("../src/ui/icons.tsx", import.meta.url), "utf8")).matchAll(
    /^export const (\w+)/gm,
  ),
].map((m) => m[1]);
const iconsByName = {
  name: "icons-by-name",
  setup(build) {
    build.onResolve({ filter: /\/icons$/ }, () => ({ path: "icons", namespace: "icons-by-name" }));
    build.onLoad({ filter: /.*/, namespace: "icons-by-name" }, () => ({
      contents: names.map((name) => `export const ${name} = ${JSON.stringify(name)};`).join("\n"),
      loader: "js",
    }));
  },
};
const { outputFiles } = await build({
  stdin: {
    contents: 'export * from "./src/ui/glyphs"; export { toolIcon } from "./src/ui/ToolIcon";',
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
    loader: "ts",
  },
  bundle: true,
  format: "esm",
  write: false,
  plugins: [iconsByName],
});
const m = await import("data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64"));

// The mappings as they were before glyphs.ts.
function formerToolIcon(id, label = "") {
  if (id === "builtin:continue") return "Play";
  if (id === "builtin:regenerate") return "RotateCcw";
  if (id === "builtin:quick") return "MessagesSquare";
  if (id === "builtin:impersonate") return "UserRoundPen";
  if (id === "builtin:options") return "Lightbulb";
  if (id === "builtin:database") return "Table2";
  if (id === "wb:export") return "FileOutput";
  const key = (id + " " + label).toLowerCase();
  if (/bank|manageattachments/.test(key)) return "Database";
  if (/toggle_an|作者注释/.test(key)) return "NotebookPen";
  if (/cfg|logprobs/.test(key)) return "SlidersHorizontal";
  if (/new_bookmark/.test(key)) return "Bookmark";
  if (/back_to_main/.test(key)) return "ChevronRight";
  if (/attach|file/.test(key)) return "Paperclip";
  if (/caption/.test(key)) return "Captions";
  if (/sd_gen|image|gallery/.test(key)) return "Image";
  if (/tts|narrate/.test(key)) return "Volume2";
  if (/translate/.test(key)) return "Languages";
  if (/token/.test(key)) return "Binary";
  if (/prompt|提示词/.test(key)) return "TextSearch";
  if (/variable|变量/.test(key)) return "Braces";
  if (/日志|log/.test(key)) return "ScrollText";
  return "Puzzle";
}
function formerActionIcon(s) {
  if (/delete|trash|remove/.test(s)) return "Trash2";
  if (/import|upload/.test(s)) return "Upload";
  if (/export|download/.test(s)) return "Download";
  if (/new|create|add/.test(s)) return "Plus";
  if (/refresh|update/.test(s)) return "RefreshCw";
  if (/restore|reset/.test(s)) return "RotateCcw";
  if (/copy|duplicate/.test(s)) return "Copy";
  if (/save/.test(s)) return "Save";
  if (/rename|edit/.test(s)) return "PencilLine";
  if (/key|secret/.test(s)) return "KeyRound";
  if (/audio|sound/.test(s)) return "Volume2";
  return "Settings";
}
const formerNativeGlyphs = {
  "fa-plus": "Plus",
  "fa-minus": "Minus",
  "fa-pencil": "PencilLine",
  "fa-pen": "PencilLine",
  "fa-pen-to-square": "PencilLine",
  "fa-trash": "Trash2",
  "fa-trash-can": "Trash2",
  "fa-copy": "Copy",
  "fa-clone": "Copy",
  "fa-truck-arrow-right": "ArrowRightLeft",
  "fa-scissors": "Scissors",
  "fa-file-import": "Upload",
  "fa-upload": "Upload",
  "fa-file-arrow-up": "Upload",
  "fa-file-export": "Download",
  "fa-download": "Download",
  "fa-file-arrow-down": "Download",
  "fa-floppy-disk": "Save",
  "fa-save": "Save",
  "fa-file-circle-plus": "FilePlus",
  "fa-folder-plus": "FolderPlus",
  "fa-folder": "Folder",
  "fa-rotate": "RefreshCw",
  "fa-arrows-rotate": "RefreshCw",
  "fa-sync": "RefreshCw",
  "fa-clock-rotate-left": "RotateCcw",
  "fa-rotate-left": "RotateCcw",
  "fa-undo": "RotateCcw",
  "fa-recycle": "RotateCcw",
  "fa-link": "Link",
  "fa-key": "KeyRound",
  "fa-gear": "Settings",
  "fa-cog": "Settings",
  "fa-tags": "Tag",
  "fa-wand-magic": "WandSparkles",
  "fa-wand-magic-sparkles": "WandSparkles",
  "fa-right-left": "ArrowRightLeft",
};
const formerMessageGlyph = (classes) => classes.map((name) => formerNativeGlyphs[name]).find(Boolean);
const formerSettingsGlyph = (classes) =>
  Object.entries(formerNativeGlyphs).find(([name]) => classes.includes(name))?.[1];

// Every alternative of every rule, alone and in each ordered pair, so rule order is exercised too.
const pairs = (words) => [...words.map((a) => [a, ""]), ...words.flatMap((a) => words.map((b) => [a, b]))];
const toolWords = [
  ...[
    "bank",
    "manageattachments",
    "toggle_an",
    "作者注释",
    "cfg",
    "logprobs",
    "new_bookmark",
    "back_to_main",
  ],
  ...["attach", "file", "caption", "sd_gen", "image", "gallery", "tts", "narrate", "translate", "token"],
  ...["prompt", "提示词", "variable", "变量", "日志", "log", "Gallery", "TTS", "stscript", ""],
];
const actionWords = [
  ...["delete", "trash", "remove", "import", "upload", "export", "download", "new", "create", "add"],
  ...["refresh", "update", "restore", "reset", "copy", "duplicate", "save", "rename", "edit", "key"],
  ...["secret", "audio", "sound", "menu_button", "additional parameters", ""],
];

test("composer tools keep their icons, built-in ids first, then the first matching rule", () => {
  const builtins = ["continue", "regenerate", "quick", "impersonate", "attachment", "options", "database"];
  for (const id of [...builtins.map((name) => "builtin:" + name), "wb:export", "Builtin:continue"])
    assert.equal(m.toolIcon(id, "附件"), formerToolIcon(id, "附件"), id);
  for (const [a, b] of pairs(toolWords)) {
    assert.equal(m.toolIcon("ext:" + a, b), formerToolIcon("ext:" + a, b), `${a} / ${b}`);
    assert.equal(m.glyphFor(`${a} ${b}`.toLowerCase(), m.toolGlyphs, "Puzzle"), formerToolIcon(a, b));
  }
  assert.equal(m.toolIcon("ext:manageattachments"), "Database");
  assert.equal(m.toolIcon("ext:logprobs"), "SlidersHorizontal");
  assert.equal(m.toolIcon("ext:stscript", "Quick Reply"), "Puzzle");
});

test("connection page actions keep their icons, the first matching rule first", () => {
  for (const [a, b] of pairs(actionWords)) {
    const key = `${a} ${b}`.toLowerCase();
    assert.equal(m.glyphFor(key, m.actionGlyphs, "Settings"), formerActionIcon(key), key);
  }
  assert.equal(m.glyphFor("additional parameters", m.actionGlyphs, "Settings"), "Plus");
  assert.equal(m.glyphFor("api_key_openai menu_button", m.actionGlyphs, "Settings"), "KeyRound");
});

test("rules carry no flag that would keep state between keys", () => {
  for (const [pattern] of [...m.toolGlyphs, ...m.actionGlyphs]) {
    assert.equal(pattern.global, false, String(pattern));
    assert.equal(pattern.sticky, false, String(pattern));
  }
});

test("a native control takes the icon of its first Font Awesome class that has one", () => {
  const icons = Object.keys(formerNativeGlyphs);
  for (const name of icons) {
    for (const classes of [[name], ["menu_button", "fa-solid", name, "fa-fw"], [name, "interactable"]]) {
      assert.equal(m.glyphOf(classes), formerMessageGlyph(classes));
      assert.equal(m.glyphOf(classes), formerSettingsGlyph(classes));
      assert.equal(m.glyphOf(new Set(classes)), formerNativeGlyphs[name]);
    }
  }
  for (const a of icons)
    for (const b of icons) {
      const classes = ["fa-solid", a, b];
      assert.equal(m.glyphOf(classes), formerMessageGlyph(classes));
      // The settings scan went by table order; it parts only on a node with two differently drawn icons.
      if (formerNativeGlyphs[a] === formerNativeGlyphs[b])
        assert.equal(m.glyphOf(classes), formerSettingsGlyph(classes));
    }
  assert.equal(m.glyphOf(["fa-solid", "fa-circle-question"]), undefined);
  assert.equal(m.glyphOf([]), undefined);
});

test("class names that are object keys do not read as icons", () => {
  assert.equal(m.glyphOf(["constructor"]), undefined);
  assert.equal(m.glyphOf(["toString", "__proto__", "fa-plus"]), "Plus");
  assert.equal(typeof formerMessageGlyph(["constructor"]), "function");
});
