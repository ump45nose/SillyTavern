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
const bind = (s, ...ids) => {
  for (const id of ids) s.s.mappings[id] = { nativeConnectionId: id, version: 1, channelVersion: 1 };
};
const snapshot = {
  name: "Main",
  baseUrl: "https://api.example.com",
  protocol: "OpenAI",
  selectedModel: "model",
  order: 0,
  enabled: true,
  note: "",
  credentialFingerprint: "fp-local",
};
const save = (eventId, nativeConnectionId, [channel, binding] = [1, 1], extra = {}) => ({
  kind: "save",
  eventId,
  body: {
    nativeConnectionId,
    localRevision: 1,
    snapshot,
    baseChannelVersion: channel,
    baseBindingVersion: binding,
  },
  ...extra,
});
const accepted = (nativeConnectionId) => ({
  state: "accepted",
  connection: { nativeConnectionId, version: 2, channelVersion: 2 },
});
const failure = (status) => Response.json({ error: "rejected" }, { status });
const call = (eventId, result = "success") => ({
  event: { eventId, result },
  revision: 1,
  acknowledged: false,
});
const queued = (s) => s.s.queue.map((q) => q.eventId);

test("an HTML error page is classified by its status instead of failing to parse", async (t) => {
  const s = configured(t);
  bind(s, "A", "D");
  s.s.queue.push(save("a", "A"), save("d", "D"));
  const log = serve(({ body }) =>
    body.eventId === "a"
      ? new Response("<html><body>Forbidden</body></html>", {
          status: 403,
          headers: { "Content-Type": "text/html" },
        })
      : accepted("D"),
  );
  await s.flush();
  assert.deepEqual(s.s.problems, { A: { error: "中心请求未完成（HTTP 403）" } });
  assert.deepEqual(queued(s), ["a"]);
  assert.equal(log.length, 2);
  assert.equal(s.s.error, undefined);
});

test("an entry the center keeps rejecting backs off without blocking, then moves to problems", async (t) => {
  for (const status of [404, 413, 422, 500]) {
    const s = configured(t);
    bind(s, "A", "D");
    s.s.queue.push(save("a", "A"), save("d", "D"));
    s.s.calls.c1 = call("c1");
    const log = serve(({ route, body }) =>
      route === "/api/v2/ingest/rp-calls"
        ? { acknowledgedIds: [body.events[0].eventId] }
        : body.eventId === "a"
          ? failure(status)
          : accepted("D"),
    );
    await s.flush();
    assert.deepEqual(queued(s), ["a"], `HTTP ${status}`);
    assert.deepEqual(s.s.calls, {}, `HTTP ${status}`);
    assert.equal(s.s.queue[0].attempts, 1);
    assert.ok(s.s.queue[0].retryAt > Date.now());
    const sent = log.length;
    await s.flush();
    assert.equal(log.length, sent, "an entry waiting for its retry is not sent");
    for (let i = 0; i < 20 && s.s.queue.length; i++) {
      s.s.queue[0].retryAt = 0;
      await s.flush();
    }
    assert.deepEqual(s.s.queue, []);
    assert.equal(s.s.problems.A.error, `中心请求未完成（HTTP ${status}）`);
    assert.equal(s.s.problems.A.event.eventId, "a");
    assert.ok(s.s.problems.A.event.attempts >= 3);
    assert.equal(log.filter(({ body }) => body.eventId === "a").length, s.s.problems.A.event.attempts);
  }
});

test("an unreachable or unavailable center pauses the batch without spending attempts", async (t) => {
  const replies = [
    () => {
      throw new TypeError("fetch failed");
    },
    () => failure(401),
    () => failure(429),
    () => failure(503),
  ];
  for (const reply of replies) {
    const s = configured(t);
    bind(s, "A", "D");
    s.s.queue.push(save("a", "A"), save("d", "D"));
    s.s.calls.c1 = call("c1");
    const log = serve(reply);
    await s.flush();
    assert.equal(log.length, 1);
    assert.deepEqual(queued(s), ["a", "d"]);
    assert.equal(s.s.queue[0].attempts, undefined);
    assert.equal(s.s.calls.c1.attempts, undefined);
    assert.ok(s.s.error);
  }
});

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

test("calls waiting for the center stay bounded and the oldest are dropped first", (t) => {
  const s = configured(t);
  s.s.config = null;
  for (let i = 0; i < 510; i++) s.report({ eventId: `call-${i}`, result: "success" });
  const ids = Object.keys(s.s.calls);
  assert.equal(ids.length, 500);
  assert.equal(ids[0], "call-10");
  assert.equal(ids.at(-1), "call-509");
  assert.match(s.s.coverage, /上限/);
});

test("a call the center never accepts is retried with backoff and then dropped as a coverage gap", async (t) => {
  const s = configured(t);
  s.s.calls.rejected = call("rejected");
  s.s.calls.ignored = call("ignored");
  s.s.calls.good = call("good");
  serve(({ body }) => {
    const id = body.events[0].eventId;
    return id === "rejected" ? failure(422) : { acknowledgedIds: id === "good" ? ["good"] : [] };
  });
  await s.flush();
  assert.deepEqual(Object.keys(s.s.calls), ["rejected", "ignored"]);
  assert.equal(s.s.calls.rejected.attempts, 1);
  assert.equal(s.s.calls.ignored.attempts, 1);
  for (let i = 0; i < 20 && Object.keys(s.s.calls).length; i++) {
    for (const row of Object.values(s.s.calls)) row.retryAt = 0;
    await s.flush();
  }
  assert.deepEqual(s.s.calls, {});
  assert.match(s.s.coverage, /停止重试/);
});
