import type { HostAdapter } from "./adapter";
import type { ChatChange } from "./chat-observer";
import { ctx, loadExtensionModule } from "./internals";
import { castPrompt, isPathSafe, parseCastTag, spriteLabel, type CastName, type Sprite } from "./cast";

/** Chat metadata `workbenchRP.cast`: a world book and the titles of the entries that play. */
export interface CastConfig {
  book: string;
  entries: string[];
}
export interface CastEntry extends CastName {
  /** The title is a name the server keeps as it is for a folder. */
  safe: boolean;
}
export interface CastMember extends CastEntry {
  sprites: Sprite[];
}
export interface CastState {
  /** Absent: the chat plays its character card, as before. */
  config?: CastConfig;
  /** Every titled entry of the book, for choosing the cast. */
  entries: CastEntry[];
  members: CastMember[];
  /** Chosen titles the book no longer has. */
  missing: string[];
  loading: boolean;
  error: string;
}

const PROMPT = "noval_cast",
  EXPRESSIONS = "/scripts/extensions/expressions/index.js",
  IN_CHAT = 1,
  SYSTEM = 0;
const idle: CastState = { entries: [], members: [], missing: [], loading: false, error: "" };
const enc = encodeURIComponent;

function entriesOf(book: any): CastEntry[] {
  const seen = new Set<string>(),
    entries: CastEntry[] = [];
  for (const entry of Object.values<any>(book?.entries || {})) {
    const name = String(entry?.comment ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    entries.push({
      name,
      aliases: (Array.isArray(entry.key) ? entry.key : [])
        .map((key: unknown) => String(key).trim())
        .filter((key: string) => key && key !== name),
      safe: isPathSafe(name),
    });
  }
  return entries;
}

/** Whether a text node begins a rendered line: at the start of its block, or just after a <br>. */
function opensLine(node: Node, root: Element): boolean {
  for (let at: Node | null = node; at && at !== root; at = at.parentNode) {
    const before = at.previousSibling;
    if (before)
      return (
        before.nodeName === "BR" ||
        (before.nodeType === 3 && !before.textContent!.trim() && opensLine(before, root))
      );
    if (at.parentNode instanceof HTMLElement && getComputedStyle(at.parentNode).display !== "inline")
      return true;
  }
  return true;
}

/**
 * A chat's world-book cast: which entries play, their images in `characters/<book>/<entry>/`, the
 * prompt asking the model to tag who speaks, and the tags taken out of the rendered text.
 */
export class CastRuntime {
  state: CastState = idle;
  private listeners = new Set<() => void>();
  private run = 0;
  private labels = new Map<string, Promise<string>>();
  constructor(private host: HostAdapter) {}
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private set(state: CastState) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  config(): CastConfig | undefined {
    const value = ctx().chatMetadata?.workbenchRP?.cast;
    if (!value || typeof value.book !== "string" || !value.book || !Array.isArray(value.entries)) return;
    return { book: value.book, entries: value.entries.filter((x: unknown) => typeof x === "string") };
  }
  /** Reads the chat's choice, the book and the chosen entries' images; called on every chat switch. */
  async load() {
    const run = ++this.run,
      config = this.config();
    this.labels.clear();
    if (!config) {
      this.prompt([]);
      return this.set(idle);
    }
    this.set({ ...this.state, config, loading: true, error: "" });
    try {
      const entries = entriesOf(await this.host.readBook(config.book));
      const chosen = config.entries
        .map((name) => entries.find((entry) => entry.name === name))
        .filter((entry): entry is CastEntry => !!entry?.safe);
      const members = await Promise.all(
        chosen.map(async (entry) => ({ ...entry, sprites: await this.sprites(config.book, entry.name) })),
      );
      if (run !== this.run) return;
      this.prompt(members);
      this.set({
        config,
        entries,
        members,
        missing: config.entries.filter((name) => !entries.some((entry) => entry.name === name)),
        loading: false,
        error: "",
      });
    } catch (error) {
      if (run !== this.run) return;
      this.prompt([]);
      this.set({ ...idle, config, error: error instanceof Error ? error.message : String(error) });
    }
  }
  /** Writes the chat's choice (none: back to the character card) and loads it. */
  async save(config: CastConfig | undefined) {
    const meta = ctx().chatMetadata,
      rp = { ...(meta.workbenchRP || {}) };
    if (config) rp.cast = { book: config.book, entries: [...new Set(config.entries)] };
    else delete rp.cast;
    meta.workbenchRP = rp;
    await ctx().saveMetadata();
    await this.load();
  }
  private async sprites(book: string, name: string): Promise<Sprite[]> {
    const response = await fetch(`/api/sprites/get?name=${enc(`${book}/${name}`)}`, {
      headers: ctx().getRequestHeaders(),
    });
    if (!response.ok) throw new Error(`读取「${name}」的立绘失败（HTTP ${response.status}）。`);
    const prefix = `/characters/${book}/${name}/`;
    return ((await response.json()) as Sprite[]).map((sprite) => {
      // The server answers with the folder names unescaped; a name with # or % would break the URL.
      const [file, query] = (
        sprite.path.startsWith(prefix) ? sprite.path.slice(prefix.length) : sprite.path.split("/").pop()!
      ).split("?");
      return {
        label: sprite.label,
        path: `/characters/${enc(book)}/${enc(name)}/${enc(file)}${query ? "?" + query : ""}`,
      };
    });
  }
  /** Files named for their expression (`joy.png`, `joy-2.png`) go into the entry's folder. */
  async upload(name: string, files: File[]) {
    const book = this.state.config?.book;
    if (!book) return;
    for (const file of files) {
      const label = spriteLabel(file.name);
      if (!/^[a-z_]+$/.test(label))
        throw new Error(`「${file.name}」需以英文表情名命名，例如 joy.png、anger-2.png。`);
      const form = new FormData();
      form.append("avatar", file);
      form.append("name", `${book}/${name}`);
      form.append("label", label);
      form.append("spriteName", file.name.replace(/\.[^.]+$/, "").toLowerCase());
      const headers = { ...ctx().getRequestHeaders() };
      delete headers["Content-Type"];
      const response = await fetch("/api/sprites/upload", { method: "POST", headers, body: form });
      if (!response.ok) throw new Error(`上传「${file.name}」失败（HTTP ${response.status}）。`);
    }
    await this.refresh(name);
  }
  async remove(name: string, sprite: Sprite) {
    const book = this.state.config?.book;
    if (!book) return;
    const file = decodeURIComponent(sprite.path.split("?")[0].split("/").pop()!);
    await this.host.request("/api/sprites/delete", {
      name: `${book}/${name}`,
      label: sprite.label,
      spriteName: file.replace(/\.[^.]+$/, ""),
    });
    await this.refresh(name);
  }
  /** Lists one member's images again after an upload or a removal. */
  private async refresh(name: string) {
    const book = this.state.config?.book;
    if (!book || !this.state.members.some((member) => member.name === name)) return;
    const sprites = await this.sprites(book, name),
      members = this.state.members.map((member) => (member.name === name ? { ...member, sprites } : member));
    this.prompt(members);
    this.set({ ...this.state, members });
  }
  /** A member by its title or one of its keywords. */
  member(name: string | null | undefined) {
    if (!name) return;
    return (
      this.state.members.find((member) => member.name === name) ??
      this.state.members.find((member) => member.aliases.includes(name))
    );
  }
  private prompt(members: CastMember[]) {
    ctx().setExtensionPrompt(
      PROMPT,
      castPrompt(members.map((m) => ({ name: m.name, labels: [...new Set(m.sprites.map((s) => s.label))] }))),
      IN_CHAT,
      1,
      false,
      SYSTEM,
    );
  }
  /** The expression the host's classifier reads in an untagged passage; "" when none is set up. */
  expression(key: string, text: string) {
    let pending = this.labels.get(key);
    if (!pending) {
      pending = this.classify(text);
      this.labels.set(key, pending);
    }
    return pending;
  }
  private async classify(text: string) {
    const settings = ctx().extensionSettings.expressions;
    // 99 is the classifier switched off.
    if (!settings || settings.api === 99 || !text.trim()) return "";
    try {
      const module = await loadExtensionModule(EXPRESSIONS);
      return typeof module.getExpressionLabel === "function"
        ? String((await module.getExpressionLabel(text)) || "")
        : "";
    } catch {
      return "";
    }
  }
  fallbackExpression(): string | undefined {
    return ctx().extensionSettings.expressions?.fallback_expression;
  }
  /**
   * Replaces each line-opening `名字|表情:` in rendered replies with an empty marker carrying the
   * speaker and expression; the raw message keeps it, so editing and the model still see it.
   */
  mark(change: ChatChange | null, chat: HTMLElement) {
    const scopes =
      change?.nodes || !change
        ? [chat]
        : [...change.content]
            .map((id) => chat.querySelector<HTMLElement>(`.mes[mesid="${id}"]`))
            .filter(Boolean);
    for (const scope of scopes)
      for (const text of scope!.querySelectorAll<HTMLElement>('.mes:not([is_user="true"]) .mes_text')) {
        if (!text.textContent?.includes("|")) continue;
        const hits: [Text, NonNullable<ReturnType<typeof parseCastTag>>][] = [];
        const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const tag = parseCastTag((node as Text).data);
          if (tag && opensLine(node, text)) hits.push([node as Text, tag]);
        }
        for (const [node, tag] of hits) {
          const marker = document.createElement("span");
          marker.className = "wb-cast-tag";
          marker.dataset.speaker = tag.speaker;
          marker.dataset.expr = tag.expr;
          node.deleteData(0, tag.length);
          node.before(marker);
        }
      }
  }
}
