import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
const { code } = await transform(await readFile(new URL("../src/host/labels.ts", import.meta.url), "utf8"), {
  loader: "ts",
  format: "esm",
});
const { connectionLabel } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);

test("the connection is named by its profile, else its model, online or not", () => {
  for (const online of [true, false]) {
    assert.equal(connectionLabel(online, "Claude 主力", "claude-sonnet-4"), "Claude 主力");
    assert.equal(connectionLabel(online, undefined, "gpt-4o"), "gpt-4o");
    assert.equal(connectionLabel(online, "", "gpt-4o"), "gpt-4o");
  }
});

test("with no name, 已连接 or 未连接 says whether SillyTavern is online", () => {
  assert.equal(connectionLabel(true, undefined, ""), "已连接");
  assert.equal(connectionLabel(false, "", ""), "未连接");
});

test("status labels pass no names and read 已连接 or 未连接", () => {
  assert.equal(connectionLabel(true), "已连接");
  assert.equal(connectionLabel(false), "未连接");
});
