import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The plugin imports the tavern's own modules from the server root, which it finds through process.cwd().
const tavern = fs.mkdtempSync(path.join(os.tmpdir(), "rc-plugin-"));
process.on("exit", () => fs.rmSync(tavern, { recursive: true, force: true }));
const data = path.join(tavern, "data");
const write = (file, text) => {
  fs.mkdirSync(path.dirname(path.join(tavern, file)), { recursive: true });
  fs.writeFileSync(path.join(tavern, file), text);
};
const fakeRouter = "export const router = { stack: [], use(fn) { this.stack.push(fn); } };";
write("package.json", '{"type":"module"}');
write("src/endpoints/secrets.js", "export class SecretManager { readSecret() { return ''; } }");
write("src/endpoints/settings.js", fakeRouter);
write("src/endpoints/backends/chat-completions.js", fakeRouter);
write(
  "src/users.js",
  `export const getAllUserHandles = () => globalThis.tavernUsers();
export const getUserDirectories = (handle) => ({ root: ${JSON.stringify(data)} + "/" + handle });`,
);
write(
  "src/util.js",
  "export const mergeObjectWithYaml = () => {}; export const excludeKeysByYaml = () => {};",
);
process.chdir(tavern);
globalThis.fetch = async () => {
  throw new TypeError("network disabled in tests");
};
const plugin = await import("../server/resource-center-link/index.mjs");
const load = (file) => import(pathToFileURL(path.join(tavern, file)).href);
const { router: settings } = await load("src/endpoints/settings.js");
const { router: chat } = await load("src/endpoints/backends/chat-completions.js");

const user = (handle) => ({ profile: { handle }, directories: { root: path.join(data, handle) } });
function pluginRouter() {
  const routes = {};
  return {
    routes,
    get: (p, handler) => (routes[`GET ${p}`] = handler),
    post: (p, handler) => (routes[`POST ${p}`] = handler),
  };
}
function routeResponse() {
  return {
    setHeader() {},
    status(code) {
      this.code = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
}
function nativeResponse() {
  return Object.assign(new EventEmitter(), {
    statusCode: 200,
    write: () => true,
    end() {
      this.writableFinished = true;
      this.emit("finish");
    },
  });
}

test("a journal without its key is quarantined at startup and the plugin still loads", async (t) => {
  t.mock.method(console, "warn", () => {});
  const dir = path.join(data, "bob", "resource-center-link");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(data, "bob", "settings.json"), "{}");
  fs.writeFileSync(path.join(dir, "state.enc"), Buffer.alloc(64, 7));
  globalThis.tavernUsers = async () => ["bob"];
  const router = pluginRouter();
  await plugin.init(router);
  try {
    assert.equal(settings.stack.length, 1);
    assert.equal(chat.stack.length, 1);
    assert.equal(fs.existsSync(path.join(dir, "state.enc")), false);
    assert.ok(fs.readdirSync(dir).some((f) => f.startsWith("state.enc.corrupt-")));
    const res = routeResponse();
    await router.routes["GET /status"]({ user: user("bob"), body: {} }, res);
    assert.equal(res.code, undefined);
    assert.equal(res.body.configured, false);
    assert.match(res.body.coverage, /state\.enc\.corrupt-/);
  } finally {
    await plugin.exit();
  }
  assert.equal(settings.stack.length, 0);
  assert.equal(chat.stack.length, 0);
});

test("a failed init leaves no observers in the tavern routers", async () => {
  globalThis.tavernUsers = async () => {
    throw new Error("users unavailable");
  };
  await assert.rejects(plugin.init(pluginRouter()), /users unavailable/);
  assert.equal(settings.stack.length, 0);
  assert.equal(chat.stack.length, 0);
});

test("the native settings save observer never throws into the tavern", async (t) => {
  t.mock.method(console, "warn", () => {});
  globalThis.tavernUsers = async () => [];
  await plugin.init(pluginRouter());
  try {
    // carol's journal cannot be read at all; dave's cannot be decrypted with his key.
    fs.mkdirSync(path.join(data, "carol", "resource-center-link", "state.enc"), { recursive: true });
    const dave = path.join(data, "dave", "resource-center-link");
    fs.mkdirSync(dave, { recursive: true });
    fs.writeFileSync(path.join(dave, "vault.key"), Buffer.alloc(32, 1));
    fs.writeFileSync(path.join(dave, "state.enc"), Buffer.alloc(64, 2));
    for (const handle of ["carol", "dave"]) {
      const res = nativeResponse();
      let passed = 0;
      settings.stack[0]({ path: "/save", user: user(handle) }, res, () => passed++);
      assert.equal(passed, 1);
      assert.doesNotThrow(() => res.emit("finish"), handle);
    }
    assert.ok(fs.readdirSync(dave).some((f) => f.startsWith("state.enc.corrupt-")));
  } finally {
    await plugin.exit();
  }
});
