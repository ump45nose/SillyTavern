import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { envFile, readEnv } from "../scripts/env.mjs";

// Only fake files: the checkout's own .env holds instance credentials.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-env-"));
process.on("exit", () => fs.rmSync(temp, { recursive: true, force: true }));
const fake = (name, lines) => {
  const file = path.join(temp, name);
  fs.writeFileSync(file, lines.join("\n"));
  return file;
};

test("readEnv keeps everything after the first '=' and skips comments and lines without '='", () => {
  const file = fake("values.env", [
    "# WB_USERNAME=commented",
    "WB_USERNAME=first",
    "WB_PASSWORD=a=b==",
    "not a pair",
    "WB_MOCK_API=http://127.0.0.1:32013/v1?x=1",
    "EMPTY=",
    "WB_USERNAME=last",
    "",
  ]);
  assert.deepEqual(readEnv({ file }), {
    WB_USERNAME: "last",
    WB_PASSWORD: "a=b==",
    WB_MOCK_API: "http://127.0.0.1:32013/v1?x=1",
    EMPTY: "",
  });
});

test("readEnv takes keys and values verbatim", () => {
  const file = fake("verbatim.env", [" # indented=not a comment", 'QUOTED="x"', "SPACED = y ", "CRLF=z\r"]);
  assert.deepEqual(readEnv({ file }), {
    " # indented": "not a comment",
    QUOTED: '"x"',
    "SPACED ": " y ",
    CRLF: "z\r",
  });
});

test("a missing env file throws, or reads as empty when optional", () => {
  const file = path.join(temp, "missing.env");
  assert.throws(() => readEnv({ file }), { code: "ENOENT" });
  assert.deepEqual(readEnv({ file, optional: true }), {});
});

test("the default file is the .env at the root of the checkout the scripts run from", () => {
  assert.equal(envFile, fileURLToPath(new URL("../.env", import.meta.url)));
});
