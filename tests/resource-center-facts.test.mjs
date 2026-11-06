import test from "node:test";
import assert from "node:assert/strict";
import { ResponseFacts } from "../server/resource-center-link/facts.mjs";

const frame = (e) =>
  Array.isArray(e) ? `event: ${e[0]}\ndata: ${JSON.stringify(e[1])}\n\n` : `data: ${JSON.stringify(e)}\n\n`;
const sse = (...events) => events.map(frame).join("");
const done = "data: [DONE]\n\n";
/** Feeds `text` as UTF-8 bytes in pieces of `size`, the way a proxied response arrives. */
function parse(text, { stream = true, size = Infinity } = {}) {
  const facts = new ResponseFacts(performance.now()),
    bytes = Buffer.from(text);
  for (let i = 0; i < bytes.length; i += Math.min(size, bytes.length))
    facts.feed(bytes.subarray(i, i + size), stream);
  return { facts, extra: facts.end(stream) };
}
const usage = ({ extra }) => [extra.inputTokens, extra.outputTokens, extra.tokenBasis];

const openai = sse(
  { choices: [{ delta: { role: "assistant", content: "" }, finish_reason: null }] },
  { choices: [{ delta: { content: "你好，世界" }, finish_reason: null }] },
  { choices: [{ delta: {}, finish_reason: "stop" }] },
  { choices: [], usage: { prompt_tokens: 12, completion_tokens: 5 } },
);
const anthropic = sse(
  ["message_start", { type: "message_start", message: { usage: { input_tokens: 25, output_tokens: 1 } } }],
  [
    "content_block_start",
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  ],
  ["ping", { type: "ping" }],
  [
    "content_block_delta",
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "你好" } },
  ],
  ["content_block_stop", { type: "content_block_stop", index: 0 }],
  [
    "message_delta",
    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 15 } },
  ],
);
const gemini = sse(
  {
    candidates: [{ content: { parts: [{ text: "你" }], role: "model" } }],
    usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 1 },
  },
  {
    candidates: [{ content: { parts: [{ text: "好" }], role: "model" }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2 },
  },
);

test("OpenAI, Anthropic and Gemini streams yield terminal state, first token and provider usage", () => {
  for (const [name, text, tokens] of [
    ["openai", openai + done, [12, 5]],
    ["anthropic", anthropic + sse(["message_stop", { type: "message_stop" }]), [25, 15]],
    ["gemini", gemini, [8, 2]],
  ]) {
    const result = parse(text);
    assert.equal(result.facts.terminal, true, name);
    assert.equal(result.facts.error, false, name);
    assert.equal(typeof result.extra.ttft, "number", name);
    assert.deepEqual(usage(result), [...tokens, "provider"], name);
  }
});

test("a stream is terminal only after its provider's end marker", () => {
  assert.equal(parse(anthropic).facts.terminal, false);
  assert.equal(
    parse(sse({ choices: [{ delta: { content: "hi" }, finish_reason: null }] })).facts.terminal,
    false,
  );
  assert.equal(parse(sse({ choices: [{ delta: { content: "hi" } }] }) + done).facts.terminal, true);
  assert.equal(
    parse(sse({ type: "response.completed", response: { usage: { input_tokens: 3 } } })).facts.terminal,
    true,
  );
  assert.equal(parse(gemini.slice(0, gemini.lastIndexOf("data:"))).facts.terminal, false);
});

test("events split across chunks, multi-byte characters and CRLF lines parse the same", () => {
  for (const text of [openai + done, anthropic, gemini]) {
    const whole = parse(text);
    for (const variant of [text, text.replaceAll("\n", "\r\n")])
      for (const size of [1, 7, 64]) {
        const pieces = parse(variant, { size });
        assert.equal(pieces.facts.terminal, whole.facts.terminal);
        assert.deepEqual(usage(pieces), usage(whole));
        assert.equal("ttft" in pieces.extra, "ttft" in whole.extra);
      }
  }
});

test("non-streaming responses are parsed once the body ends", () => {
  for (const [name, body, tokens] of [
    [
      "openai",
      {
        choices: [{ message: { content: "你好" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 4, completion_tokens: 2 },
      },
      [4, 2],
    ],
    [
      "anthropic",
      {
        type: "message",
        content: [{ type: "text", text: "你好" }],
        usage: { input_tokens: 6, output_tokens: 3 },
      },
      [6, 3],
    ],
    [
      "gemini",
      {
        candidates: [{ content: { parts: [{ text: "你好" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
      },
      [5, 2],
    ],
  ]) {
    const result = parse(JSON.stringify(body), { stream: false, size: 5 });
    assert.equal(result.facts.terminal, true, name);
    assert.deepEqual(usage(result), [...tokens, "provider"], name);
  }
});

test("provider errors are recognised and classified", () => {
  for (const [body, type] of [
    [{ error: { code: "insufficient_quota", message: "no balance" } }, "quota"],
    [{ type: "error", error: { type: "rate_limit_error" } }, "rate"],
    [{ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }, "rate"],
    [{ error: { code: "invalid_api_key" } }, "key"],
    [{ type: "error", error: { type: "overloaded_error" } }, "upstream"],
  ]) {
    const streamed = parse(sse(body));
    assert.equal(streamed.facts.error, true, JSON.stringify(body));
    assert.equal(streamed.facts.errorType, type, JSON.stringify(body));
    assert.equal(parse(JSON.stringify(body), { stream: false }).facts.errorType, type);
  }
});

test("oversized lines and bodies are skipped without breaking the rest of the stream", () => {
  const long = sse({ choices: [{ delta: { content: "x".repeat(70000) } }] });
  for (const size of [Infinity, 1000]) {
    const result = parse(
      long + sse({ choices: [], usage: { prompt_tokens: 9, completion_tokens: 70000 } }) + done,
      {
        size,
      },
    );
    assert.equal(result.facts.terminal, true);
    assert.equal("ttft" in result.extra, false);
    assert.deepEqual(usage(result), [9, 70000, "provider"]);
  }
  const body = JSON.stringify({
    choices: [{ message: { content: "x".repeat(300000) }, finish_reason: "stop" }],
  });
  const result = parse(body, { stream: false, size: 4096 });
  assert.equal(result.facts.oversized, true);
  assert.equal(result.facts.terminal, false);
  assert.deepEqual(result.extra, {});
});
