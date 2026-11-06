/** Whether `text` reads as a regex keyword the way the host parses one: `/pattern/flags` that compiles. */
export function isRegexKey(text: string) {
  const match = text.match(/^\/([\w\W]+?)\/([gimsuy]*)$/);
  if (!match || /(^|[^\\])\//.test(match[1])) return false;
  try {
    new RegExp(match[1].replace("\\/", "/"), match[2]);
    return true;
  } catch {
    return false;
  }
}
/**
 * Typed text cut at the separators (single characters) into finished items and the text still being
 * typed. A separator inside a `/regex/` keyword that is not yet complete belongs to the keyword, as in
 * the host's keyword field.
 */
export function splitTags(text: string, separators: readonly string[]) {
  const items: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (!separators.includes(text[i])) continue;
    const item = text.slice(start, i).trim();
    if (item.startsWith("/") && !isRegexKey(item)) continue;
    if (item) items.push(item);
    start = i + 1;
  }
  return { items, rest: text.slice(start) };
}
/** `values` with each new, non-blank item appended once; the same array when nothing is new. */
export function addTags(values: string[], items: readonly string[]) {
  const next = [...values];
  for (const raw of items) {
    const item = raw.trim();
    if (item && !next.includes(item)) next.push(item);
  }
  return next.length === values.length ? values : next;
}
