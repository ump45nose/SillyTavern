import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * SillyTavern's own root: the directory of server.js (argv[1]) or the working directory, whichever
 * holds `marker`. A plug-in loaded through a symlink cannot use its own URL for this.
 * @param {string} marker a file only the server checkout has, relative to its root
 * @param {string} message the error when neither candidate holds it
 * @returns {string}
 */
export function serverRoot(marker, message) {
  const candidates = [process.argv[1] && path.dirname(fs.realpathSync(process.argv[1])), process.cwd()];
  const root = candidates.find((dir) => dir && fs.existsSync(path.join(dir, marker)));
  if (!root) throw new Error(message);
  return root;
}

/**
 * Imports server modules by their path under `root`. Node resolves the server's own imports to real
 * paths, so the same file URL yields the module instance the server already loaded.
 * @param {string} root
 * @returns {(file: string) => Promise<any>}
 */
export const serverImport = (root) => (file) => import(pathToFileURL(path.join(root, file)).href);

/**
 * Runs `add`, which registers handlers on an Express 4 router, and moves the layers it added ahead
 * of the router's own routes. Returns the undo.
 * @param {{ stack: unknown[] }} router
 * @param {() => void} add
 * @returns {() => void}
 */
export function prepend(router, add) {
  const before = router.stack.length;
  add();
  const added = router.stack.splice(before);
  router.stack.unshift(...added);
  return () => {
    for (const layer of added) {
      const at = router.stack.indexOf(layer);
      if (at >= 0) router.stack.splice(at, 1);
    }
  };
}
