import { build } from "esbuild";
import { mkdir, readdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
const directory = path.resolve("extension/dist");
const result = await build({
  entryPoints: ["src/index.tsx"],
  outdir: directory,
  bundle: true,
  splitting: true,
  format: "esm",
  target: "es2022",
  minify: true,
  sourcemap: true,
  legalComments: "eof",
  write: false,
});
await mkdir(directory, { recursive: true });
for (const file of result.outputFiles)
  await writeFile(file.path, file.contents);
const current = new Set(
  result.outputFiles.map((file) => path.basename(file.path)),
);
for (const name of await readdir(directory))
  if (!current.has(name) && /\.(js|css)(\.map)?$/.test(name))
    await unlink(path.join(directory, name));
console.log(`Built ${result.outputFiles.length} assets into extension/dist`);
