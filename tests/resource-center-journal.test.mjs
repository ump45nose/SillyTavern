import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Journal } from "../server/resource-center-link/journal.mjs";

function temp(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rc-journal-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const dirOf = (root) => path.join(root, "resource-center-link");
const files = (root) => fs.readdirSync(dirOf(root)).sort();
function seed(root) {
  const journal = new Journal(root);
  journal.state.config = {
    url: "http://center.test",
    rpToken: "rp-secret-token",
    connectorToken: "connector-secret-token",
    instanceId: "fn",
  };
  journal.state.queue.push({ kind: "receipt", eventId: "e1", body: { id: "job", state: "applied" } });
  journal.save();
  return journal.state;
}

test("journal round-trips its state through the encrypted file", (t) => {
  const root = temp(t);
  const state = seed(root);
  assert.deepEqual(files(root), ["state.enc", "vault.key"]);
  assert.equal(fs.readFileSync(path.join(dirOf(root), "vault.key")).length, 32);
  assert.ok(!fs.readFileSync(path.join(dirOf(root), "state.enc")).includes("rp-secret-token"));
  const reopened = new Journal(root);
  assert.deepEqual(reopened.state, state);
  assert.equal(reopened.quarantined, undefined);
});

test("a journal whose key is missing is set aside and starts empty", (t) => {
  const root = temp(t);
  seed(root);
  const sealed = fs.readFileSync(path.join(dirOf(root), "state.enc"));
  fs.rmSync(path.join(dirOf(root), "vault.key"));
  const journal = new Journal(root);
  assert.equal(journal.state.config, null);
  assert.deepEqual(journal.state.queue, []);
  assert.match(
    path.basename(journal.quarantined),
    /^state\.enc\.corrupt-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z$/,
  );
  assert.deepEqual(fs.readFileSync(journal.quarantined), sealed);
  assert.equal(fs.existsSync(path.join(dirOf(root), "state.enc")), false);
  journal.state.config = { url: "http://center.test" };
  journal.save();
  assert.deepEqual(new Journal(root).state.config, { url: "http://center.test" });
});

test("a tampered journal is set aside and the existing key keeps working", (t) => {
  const root = temp(t);
  seed(root);
  const key = fs.readFileSync(path.join(dirOf(root), "vault.key"));
  const sealed = fs.readFileSync(path.join(dirOf(root), "state.enc"));
  sealed[sealed.length - 1] ^= 1;
  fs.writeFileSync(path.join(dirOf(root), "state.enc"), sealed);
  const journal = new Journal(root);
  assert.equal(journal.state.config, null);
  assert.ok(fs.existsSync(journal.quarantined));
  journal.save();
  assert.deepEqual(fs.readFileSync(path.join(dirOf(root), "vault.key")), key);
  assert.equal(new Journal(root).quarantined, undefined);
});

test("a truncated journal and key are set aside so new state can be written", (t) => {
  const root = temp(t);
  seed(root);
  fs.writeFileSync(path.join(dirOf(root), "vault.key"), Buffer.alloc(5));
  fs.writeFileSync(path.join(dirOf(root), "state.enc"), Buffer.alloc(0));
  const journal = new Journal(root);
  assert.ok(journal.quarantined);
  assert.ok(files(root).some((f) => f.startsWith("vault.key.corrupt-")));
  journal.save();
  assert.equal(fs.readFileSync(path.join(dirOf(root), "vault.key")).length, 32);
  assert.equal(new Journal(root).quarantined, undefined);
});

test("a journal path that cannot be read is reported instead of being moved", (t) => {
  const root = temp(t);
  fs.mkdirSync(path.join(dirOf(root), "state.enc"), { recursive: true });
  assert.throws(() => new Journal(root), { code: "EISDIR" });
  assert.deepEqual(files(root), ["state.enc"]);
});
