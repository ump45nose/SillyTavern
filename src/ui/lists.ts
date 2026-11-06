/** Whether the fields, read as one line, contain `query`; case and surrounding spaces do not matter. */
export function matchQuery(query: string, ...fields: (string | null | undefined)[]) {
  const needle = query.trim().toLowerCase();
  return !needle || fields.filter(Boolean).join(" ").toLowerCase().includes(needle);
}

/** What a resource search looks at wherever the resource is listed: its name, detail line and group. */
export const matchItem = (query: string, item: { name: string; detail?: string; group?: string }) =>
  matchQuery(query, item.name, item.detail, item.group);

/** `selected` with `ids` added after the ones already chosen, or with `ids` taken out. */
export function toggleIds(selected: readonly string[], ids: readonly string[], on: boolean) {
  if (on) return [...new Set([...selected, ...ids])];
  const drop = new Set(ids);
  return selected.filter((id) => !drop.has(id));
}
