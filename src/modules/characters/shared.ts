import type React from "react";
import type { HostAdapter } from "../../host/adapter";
import type { Item } from "../../host/types";
import { takeFiles } from "../../ui/common";
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
/** New characters for the panel and the library: one named at a prompt and then opened, or cards from a file input. */
export const characterCreation = (
  host: HostAdapter,
  task: { run: (job: () => unknown) => unknown },
  open: (id: string) => void,
) => ({
  create() {
    const name = prompt("角色名称");
    if (name) task.run(async () => open(await host.createCharacter(name)));
  },
  importCards(event: React.ChangeEvent<HTMLInputElement>) {
    const files = takeFiles(event);
    task.run(async () => {
      for (const file of files) await host.importCharacter(file);
    });
  },
});
