import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { build } from "esbuild";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const json = (file) => JSON.parse(read(file));
const pkg = json("package.json");
const workbench = json("extension/manifest.json");
const lock = json("baseline.lock.json");
// The workbench and wb-perf are released together under the repository version; the resource-center link
// (resource-center-extension/) and each add-on carry their own versions. All three SillyTavern extensions
// require the locked upstream release.
const released = ["extension/manifest.json", "perf-extension/manifest.json"];
const extensions = [...released, "resource-center-extension/manifest.json"];

test("package.json, the workbench and wb-perf manifests share one release version", () => {
  for (const file of released) assert.equal(json(file).version, pkg.version, file);
});

test("extension/index.js cache keys follow the workbench manifest version", () => {
  const source = read("extension/index.js");
  assert.equal(source.match(/\?v=([\w.-]+)/)?.[1], workbench.version, "fallback ?v= key");
  assert.equal(
    source.match(/searchParams\.set\(\s*["']wb["']\s*,\s*["']([\w.-]+)["']/)?.[1],
    workbench.version,
    "wb= key",
  );
});

test("every add-on in the catalog shows the version its manifest loads", async () => {
  const { outputFiles } = await build({
    entryPoints: [new URL("../src/addons/catalog.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    write: false,
  });
  const { addons } = await import(
    "data:text/javascript;base64," + Buffer.from(outputFiles[0].text).toString("base64")
  );
  assert.ok(addons.length > 0);
  for (const addon of addons) {
    const manifest = json(`extension/addons/${addon.id}/manifest.json`);
    assert.equal(manifest.id, addon.id);
    assert.equal(manifest.version, addon.version, addon.id);
  }
});

test("every extension manifest requires the locked upstream release", () => {
  for (const file of extensions) assert.equal(json(file).minimum_client_version, lock.upstream.release, file);
});
