import test from "node:test";
import assert from "node:assert/strict";
import { canonical, fingerprint, nativePatch } from "../server/resource-center-link/native.mjs";

/** In-memory stand-in for the tavern's SecretManager with the same activation rules. */
class Secrets {
  constructor(data = {}) {
    this.data = structuredClone(data);
    this.writes = 0;
  }
  _readSecretsFile() {
    return structuredClone(this.data);
  }
  _writeSecretsFile(data) {
    this.data = structuredClone(data);
  }
  readSecret(key, id) {
    return (this.data[key] || []).find((s) => (id ? s.id === id : s.active))?.value || "";
  }
  writeSecret(key, value, label) {
    const list = (this.data[key] ??= []);
    for (const s of list) s.active = false;
    const id = `secret-${list.length + 1}`;
    list.push({ id, value, label, active: true });
    this.writes++;
    return id;
  }
  rotateSecret(key, id) {
    for (const s of this.data[key] || []) s.active = s.id === id;
  }
}
const active = (secrets) => secrets.data.api_key_custom?.find((s) => s.active)?.id;
const remote = (patch) => ({
  name: "中心名称",
  selectedModel: "model-b",
  protocol: "OpenAI",
  baseUrl: "https://api.example.com",
  credential: "sk-remote",
  credentialFingerprint: fingerprint("sk-remote"),
  ...patch,
});

test("canonical drops credentials, query and trailing /v1 except for Gemini", () => {
  assert.equal(canonical("https://user:pw@api.example.com/v1/?x=1#top", "OpenAI"), "https://api.example.com");
  assert.equal(
    canonical("https://api.example.com/openai/v1///", "Anthropic"),
    "https://api.example.com/openai",
  );
  assert.equal(canonical("https://proxy.example.com/v1/", "Gemini"), "https://proxy.example.com/v1");
  assert.throws(() => canonical("ftp://api.example.com", "OpenAI"), /HTTP\(S\)/);
});

test("a new OpenAI credential gets its own secret without changing the active global key", () => {
  const secrets = new Secrets({ api_key_custom: [{ id: "global", value: "sk-global", active: true }] });
  const profile = { id: "p1", name: "旧名称", api: "custom", "api-url": "https://old.example.com/v1/" };
  const patch = nativePatch({}, profile, remote(), secrets);
  assert.equal(patch.profile.name, "中心名称");
  assert.equal(patch.profile.model, "model-b");
  assert.equal(patch.profile["api-url"], "https://api.example.com/v1");
  assert.equal(patch.profile["secret-id"], "secret-2");
  assert.equal(secrets.readSecret("api_key_custom", "secret-2"), "sk-remote");
  assert.equal(secrets.data.api_key_custom[1].label, "资源中心 · p1");
  assert.equal(active(secrets), "global");
  assert.equal(patch.secretId, "secret-2");
});

test("without a previously active key the new secret is not left active", () => {
  const secrets = new Secrets();
  nativePatch({}, { id: "p1", api: "custom" }, remote(), secrets);
  assert.equal(secrets.writes, 1);
  assert.equal(active(secrets), undefined);
});

test("a credential that is already stored is not written again", () => {
  const secrets = new Secrets({ api_key_custom: [{ id: "mine", value: "sk-remote", active: false }] });
  const patch = nativePatch({}, { id: "p1", api: "custom", "secret-id": "mine" }, remote(), secrets);
  assert.equal(patch.profile["secret-id"], "mine");
  assert.equal(secrets.writes, 0);
  // A retried prepare reuses the secret written for the same credential the first time.
  const empty = new Secrets();
  const again = nativePatch({}, { id: "p1", api: "custom" }, remote(), empty, {
    credentialFingerprint: fingerprint("sk-remote"),
    secretId: "prepared",
  });
  assert.equal(again.profile["secret-id"], "prepared");
  assert.equal(empty.writes, 0);
});

test("Gemini and Anthropic connections are saved as a named reverse proxy", () => {
  const settings = { proxies: [{ name: "旧代理", url: "https://old.example.com", password: "old-pass" }] };
  const profile = { id: "p2", api: "openai", proxy: "旧代理", model: "x" };
  const gemini = nativePatch(
    settings,
    profile,
    remote({ protocol: "Gemini", baseUrl: "https://g.example.com/v1", credential: "" }),
    new Secrets(),
  );
  assert.equal(gemini.profile.api, "google");
  assert.equal(gemini.profile.proxy, "资源中心 · p2");
  assert.deepEqual(gemini.proxies.at(-1), {
    name: "资源中心 · p2",
    url: "https://g.example.com/v1",
    password: "old-pass",
  });
  assert.equal(settings.proxies.length, 1);
  const claude = nativePatch(
    { proxies: gemini.proxies },
    gemini.profile,
    remote({ protocol: "Anthropic", baseUrl: "https://c.example.com" }),
    new Secrets(),
  );
  assert.equal(claude.profile.api, "claude");
  assert.equal(claude.proxies.length, 2);
  assert.deepEqual(claude.proxies[1], {
    name: "资源中心 · p2",
    url: "https://c.example.com",
    password: "sk-remote",
  });
});

test("unsupported protocols are refused instead of guessed", () => {
  assert.throws(
    () => nativePatch({}, { id: "p" }, remote({ protocol: "OpenAI Responses" }), new Secrets()),
    /Responses/,
  );
  assert.throws(
    () => nativePatch({}, { id: "p" }, remote({ protocol: "Cohere" }), new Secrets()),
    /尚不支持/,
  );
});
