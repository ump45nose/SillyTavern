import type { Item } from "../../host/types";
import { matchQuery } from "../../ui/lists";
export const favorite = (x: Item) => Boolean(x.data?.data?.extensions?.fav ?? x.data?.fav);
export const plain = (text: unknown) =>
  String(text ?? "")
    .replace(/<[^>]*>/g, "")
    .trim();
/** What a character search looks at in the panel and the library: name, tags (the detail line) and description. */
export const matchCharacter = (query: string, x: Item) =>
  matchQuery(query, x.name, x.detail) ||
  matchQuery(query, plain(x.data?.data?.description ?? x.data?.description));
