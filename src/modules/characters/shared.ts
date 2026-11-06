import type { Item } from "../../host/types";
export const favorite = (x: Item) => Boolean(x.data?.data?.extensions?.fav ?? x.data?.fav);
export const plain = (text: unknown) =>
  String(text ?? "")
    .replace(/<[^>]*>/g, "")
    .trim();
