import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versionOf = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8")).version;
// The plugin and the extension ship as one pair; the plugin package.json names the bundle.
const version = versionOf("server/resource-center-link/package.json");
if (versionOf("resource-center-extension/manifest.json") !== version)
  throw new Error(
    "resource-center-extension/manifest.json 与 server/resource-center-link/package.json 版本不一致",
  );
const output = path.join(root, "outputs/resource-center-link"),
  archive = `outputs/resource-center-link-${version}.tar.gz`;
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const [source, dest] of [
  ["resource-center-extension", "extension"],
  ["server/resource-center-link", "server"],
])
  fs.cpSync(path.join(root, source), path.join(output, dest), { recursive: true });
execFileSync("tar", ["-czf", path.join(root, archive), "-C", output, "extension", "server"]);
console.log(`Built ${archive}`);
