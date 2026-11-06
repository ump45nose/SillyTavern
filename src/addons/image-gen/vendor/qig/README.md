# QIG source attribution

Source: https://github.com/platberlitz/sillytavern-image-gen
Pinned commit: 5915f096d899960b5013b759556098d310b2fc08 (manifest version 3.5.0).
License: MIT, retained verbatim in LICENSE.

Selected upstream libraries, trimmed from upstream 5915f096 to the code Workbench reaches; the remaining code is unchanged. Workbench imports provider URL/payload/result helpers, image validation and materialization, A1111 URL normalization, ComfyUI workflow/polling/targeted cancellation, and prompt tag normalization. The upstream entry point, global initialization and UI are not included. Workbench orchestration and native image persistence live outside this directory.

Removed from the upstream files:

- `a1111-runtime.js`: everything except `normalizeA1111BaseUrl` and `A1111_REQUEST_TIMEOUT_MS` (numeric parsing, base64 helpers, reference image materialization, model refresh check, ADetailer unit).
- `image-metadata.js`: PNG scanline validation (`validateImageData`), PNG text and structured metadata read/write, generation parameter parsing and `sanitizeServerSubfolder`; `detectImageFormat` and its format checks remain.
- `provider-adapters.js`: `isNovelAICompatibleProxyUrl`, `getGptImageApiUrl`, provider error parsing and the GPT Image route retry (`requestGptImageWithRouteRetry` and its helpers).
- `comfyui-backend.js`: settings and model list normalization, `renderComfyWorkflow`, workflow component discovery, object_info combo parsing, override pruning, capability detection and WebSocket message parsing.
- `security.js`: credential field detection, URL credential redaction, `sanitizeReproducibleModel`, `readResponseJson` and `replaceSelectOptions`.
- `prompt-pipeline.js`: everything except `dedupePromptTags` and `isTagSegment` (request and world info builders, pipeline state helpers, `looksLikeTagList`).
