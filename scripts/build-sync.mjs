// Builds the workbench-sync server plug-in and links it into the local SillyTavern checkout.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "server/workbench-sync/dist");
await build({
  entryPoints: [path.join(root, "server/workbench-sync/src/index.ts")],
  outfile: path.join(plugin, "index.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  legalComments: "eof",
  // yaml resolves to CommonJS on node; the ESM bundle gives it a require.
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  logLevel: "warning",
});
// Only instances with enableServerPlugins load it (validation and visual); baseline stays official.
const plugins = path.join(root, "upstream/SillyTavern/plugins");
if (fs.existsSync(plugins)) {
  const link = path.join(plugins, "workbench-sync");
  if (fs.lstatSync(link, { throwIfNoEntry: false })) {
    if (!fs.lstatSync(link).isSymbolicLink())
      throw new Error(`${link} exists and is not a link; refusing to replace it.`);
    if (fs.readlinkSync(link) !== plugin) fs.unlinkSync(link);
  }
  if (!fs.existsSync(link)) fs.symlinkSync(plugin, link, "dir");
}
console.log("Built server/workbench-sync/dist/index.mjs");
