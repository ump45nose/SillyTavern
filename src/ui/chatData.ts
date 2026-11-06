/**
 * Quick replies once per key: a set enabled in several lists (global, chat, character) shows each reply
 * once, in the place it first appears.
 */
export function uniqueReplies<T extends { key: string }>(replies: T[]): T[] {
  return [...new Map(replies.map((reply) => [reply.key, reply] as const)).values()];
}

/** A field of the chat's RP scene as text: strings and numbers show, anything else is blank. */
export function sceneText(scene: Record<string, unknown>, key: string) {
  const value = scene[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}
