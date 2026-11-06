import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { prepend, serverImport, serverRoot } from "../server/shared/st-host.mjs";

// macOS hands out tmpdir() through a symlink, while realpath and process.cwd() report the real path.
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "st-host-")));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
const write = (file, text = "") => {
  fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
  fs.writeFileSync(path.join(temp, file), text);
};
write("server/server.js");
write("server/src/marker.js");
write("other/src/marker.js");
write("elsewhere/server.js");
fs.symlinkSync(path.join(temp, "server"), path.join(temp, "link"), "dir");

function withProcess(argv1, cwd, fn) {
  const saved = [process.argv[1], process.cwd()];
  process.argv[1] = argv1;
  process.chdir(cwd);
  try {
    return fn();
  } finally {
    process.argv[1] = saved[0];
    process.chdir(saved[1]);
  }
}

test("serverRoot prefers the real directory of argv[1] over the working directory", () => {
  withProcess(path.join(temp, "link/server.js"), path.join(temp, "other"), () =>
    assert.equal(serverRoot("src/marker.js", "missing"), path.join(temp, "server")),
  );
});

test("serverRoot falls back to the working directory and otherwise throws the caller's message", () => {
  withProcess(path.join(temp, "elsewhere/server.js"), path.join(temp, "server"), () =>
    assert.equal(serverRoot("src/marker.js", "missing"), path.join(temp, "server")),
  );
  withProcess(undefined, path.join(temp, "server"), () =>
    assert.equal(serverRoot("src/marker.js", "missing"), path.join(temp, "server")),
  );
  withProcess(path.join(temp, "elsewhere/server.js"), path.join(temp, "elsewhere"), () =>
    assert.throws(() => serverRoot("src/marker.js", "找不到酒馆运行目录"), { message: "找不到酒馆运行目录" }),
  );
});

test("serverImport yields the module instance the server already loaded", async () => {
  write("server/src/module.mjs", "export const id = Symbol('module');");
  write("server/src/startup.mjs", "export { id } from './module.mjs';");
  const startup = await import(pathToFileURL(path.join(temp, "server/src/startup.mjs")).href);
  const load = serverImport(path.join(temp, "server"));
  assert.equal((await load("src/module.mjs")).id, startup.id);
  assert.equal(await load("src/module.mjs"), await load("src/module.mjs"));
});

test("prepend moves what `add` registers ahead of the router's routes; the undo removes only that", () => {
  const router = {
    stack: [{ handle: "get" }, { handle: "all" }],
    use(handle) {
      this.stack.push({ handle });
    },
  };
  const handles = () => router.stack.map((layer) => layer.handle);
  const undo = prepend(router, () => {
    router.use("writer");
    router.use("reader");
  });
  assert.deepEqual(handles(), ["writer", "reader", "get", "all"]);
  router.stack.splice(1, 0, { handle: "other plug-in" });
  undo();
  assert.deepEqual(handles(), ["other plug-in", "get", "all"]);
  undo();
  assert.deepEqual(handles(), ["other plug-in", "get", "all"]);
});
