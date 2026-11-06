import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Session } from "../server/resource-center-link/index.mjs";

const center = "http://center.test";
let route = () => {
  throw new TypeError("network disabled in tests");
};
globalThis.fetch = async (url, init) => route(url, init);

/** Answers every center request with `reply`; the returned log records route and parsed body. */
function serve(reply) {
  const log = [];
  route = async (url, init) => {
    const entry = { route: String(url).slice(center.length), body: init.body && JSON.parse(init.body) };
    log.push(entry);
    const answer = await reply(entry);
    return answer instanceof Response ? answer : Response.json(answer);
  };
  return log;
}
function configured(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rc-flush-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const s = new Session({ root }, "alice");
  s.s.config = { url: center, rpToken: "rp", connectorToken: "connector", instanceId: "fn" };
  return s;
}

test("a journal write failing inside a background flush never becomes an unhandled rejection", async (t) => {
  const s = configured(t);
  serve(() => {
    throw new TypeError("fetch failed");
  });
  s.journal.save = () => {
    if (s.s.error) throw new Error("ENOSPC: no space left on device");
  };
  const rejections = [];
  const record = (reason) => rejections.push(reason);
  process.on("unhandledRejection", record);
  t.after(() => process.off("unhandledRejection", record));
  t.mock.method(console, "warn", () => {});
  s.report({ eventId: "c1", result: "pending" });
  while (s.busy) await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(rejections, []);
  assert.match(s.s.error, /fetch failed/);
});
