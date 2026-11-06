import test from "node:test";
import assert from "node:assert/strict";
import { isSensitiveKey, redactUrlUserinfo } from "../src/host/secrets.js";

test("SillyTavern's sensitive preset fields and common credential names are sensitive", () => {
  // public/scripts/openai.js sensitiveFields
  for (const name of [
    "reverse_proxy",
    "proxy_password",
    "custom_url",
    "custom_include_body",
    "custom_exclude_body",
    "custom_include_headers",
    "vertexai_region",
    "vertexai_express_project_id",
    "azure_base_url",
    "azure_deployment_name",
    "workers_ai_account_id",
  ])
    assert.equal(isSensitiveKey(name), true, name);
  for (const name of [
    "password",
    "userPassword",
    "passwd",
    "secret",
    "client_secret",
    "Authorization",
    "Proxy-Authorization",
    "api_key",
    "apiKey",
    "APIKey",
    "X-Api-Key",
    "openai_api_key",
    "private_key",
    "cookie",
    "Set-Cookie",
    "credentials",
    "token",
    "access_token",
    "access_tokens",
    "refreshToken",
    "id_token",
    "X-Auth-Token",
    "X-CSRF-Token",
  ])
    assert.equal(isSensitiveKey(name), true, name);
});

test("model parameters and ordinary fields are not sensitive", () => {
  for (const name of [
    "max_tokens",
    "openai_max_tokens",
    "max_completion_tokens",
    "max_new_tokens",
    "min_tokens",
    "max_tokens_second",
    "add_bos_token",
    "ban_eos_token",
    "skip_special_tokens",
    "custom_token_bans",
    "tokenizer",
    "bypass_status_check",
    "vertexai_auth_mode",
    "azure_api_version",
    "api_server",
    "custom_prompt_post_processing",
    "key",
    "keysecondary",
    "chatKey",
    "temperature",
    "messages",
    "",
  ])
    assert.equal(isSensitiveKey(name), false, name);
});

test("URL user info is redacted wherever it appears; other text is kept", () => {
  assert.equal(
    redactUrlUserinfo("https://user:secret@example.test/v1"),
    "https://redacted:redacted@example.test/v1",
  );
  assert.equal(redactUrlUserinfo("http://:secret@127.0.0.1:5000"), "http://:redacted@127.0.0.1:5000");
  assert.equal(redactUrlUserinfo("http://user@host/"), "http://redacted@host/");
  assert.equal(redactUrlUserinfo("https://u:p@ss@host/x"), "https://redacted:redacted@host/x");
  assert.equal(
    redactUrlUserinfo("见 https://a:b@one.test 与\nwss://c:d@two.test/?q=1 两处"),
    "见 https://redacted:redacted@one.test 与\nwss://redacted:redacted@two.test/?q=1 两处",
  );
  for (const text of [
    "**原文** <xml>内容</xml>",
    "https://example.test/a@b",
    "https://example.test/?mail=a@b.test",
    "mailto:someone@example.test",
    "git@github.com:org/repo.git",
    "写信给 someone@example.test",
  ])
    assert.equal(redactUrlUserinfo(text), text);
});

test("URL redaction stays linear on long text", () => {
  const text = "a".repeat(20_000) + "://" + "b".repeat(20_000);
  const start = performance.now();
  assert.equal(redactUrlUserinfo(text), text);
  assert.ok(performance.now() - start < 1000);
});
