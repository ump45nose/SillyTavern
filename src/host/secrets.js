/**
 * Which fields hold credentials, and URL user info in text. One rule for every copy of a request or
 * a resource that leaves SillyTavern's own storage: the trace, add-on metadata and the sync files.
 * Plain JS so that extension/trace.js and node tests load it as is.
 */

/** SillyTavern's sensitiveFields (public/scripts/openai.js): proxy and custom endpoint settings. */
export const sensitiveFields = Object.freeze([
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
]);

/**
 * Credential names, matched within a name in lower case with its words joined by "_". `token` counts
 * alone or after a word that makes it a credential: max_tokens and add_bos_token are model settings.
 */
const credential =
  /password|passwd|passphrase|secret|authorization|cookie|credential|api_?key|private_?key|^token$|(?:^|_)(?:access|refresh|id|auth|bearer|session|csrf|xsrf|oauth|api)_?tokens?(?:_|$)/;

/**
 * Whether a field holds a credential or one of SillyTavern's proxy and endpoint settings, by name.
 * @param {string} name
 * @returns {boolean}
 */
export function isSensitiveKey(name) {
  const words = name
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z\d]+/g, "_")
    .replace(/^_|_$/g, "");
  return sensitiveFields.includes(words) || credential.test(words);
}

/**
 * The text with the user info (`user:password@`) of every URL in it replaced by `redacted`.
 * @param {string} text
 * @returns {string}
 */
export function redactUrlUserinfo(text) {
  // The last @ before the path ends the user info, as in URL parsing.
  return text.replace(/:\/\/([^\s/?#]*)@/g, (_, info) => {
    const colon = info.indexOf(":"),
      user = colon < 0 ? info : info.slice(0, colon),
      password = colon < 0 ? "" : info.slice(colon + 1);
    return `://${user && "redacted"}${password && ":redacted"}@`;
  });
}
