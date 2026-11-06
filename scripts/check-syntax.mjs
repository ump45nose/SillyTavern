import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Plain scripts no tsc project covers: [directory, extension, recursive]. Built output lives in ignored subdirectories (extension/dist). */
const sources = [
  ["extension", ".js", false],
  ["perf-extension", ".js", true],
  ["resource-center-extension", ".js", false],
  ["server/resource-center-link", ".mjs", false],
  ["server/shared", ".mjs", false],
  ["fixtures", ".mjs", false],
  ["scripts", ".mjs", true],
];

const list = (dir, extension, recursive) =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return recursive ? list(file, extension, recursive) : [];
    return entry.name.endsWith(extension) ? [file] : [];
  });

const files = sources.flatMap((source) => list(...source));
if (fs.existsSync(path.join(root, "deploy.mjs"))) files.push("deploy.mjs");

const failed = files.filter((file) => {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: root, stdio: "inherit" });
  if (result.status !== 0 && result.signal) console.error(`${file}: node --check ended by ${result.signal}`);
  return result.status !== 0;
});
if (failed.length) {
  console.error(`node --check failed for ${failed.length} of ${files.length} files:\n${failed.join("\n")}`);
  process.exit(1);
}
console.log(`node --check passed for ${files.length} files.`);
