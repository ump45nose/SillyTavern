import type { Data, HostSnapshot, Item, Preferences, Resource } from "./types";
import { clone } from "./model";
import { ctx, internal } from "./internals";

export const defaults: Preferences = { left: true, bindings: {}, groups: {} };

/**
 * Shared host state and infrastructure. Domain behaviour lives in ./domains and is mixed into
 * HostAdapter; fields here are internal to the host package even where TypeScript cannot say so.
 */
export class HostCore {
  drafts = new Map<string, { base: Data; draft: Data; extra?: Data }>();
  listeners = new Set<() => void>();
  cleanup: (() => void)[] = [];
  resourceVersions = {
    world: 0,
    character: 0,
    preset: 0,
    persona: 0,
    connection: 0,
  };
  version = 0;
  cache: HostSnapshot | null = null;
  world: any;
  personas: any;
  openai: any;
  busy = false;
  resourceAction = false;
  chatsVersion = 0;
  bindingRun = false;
  suspendedDialogs: HTMLDialogElement[] = [];
  generating = false;
  listen(name: string, fn: (...args: any[]) => void) {
    const c = ctx(),
      event = c.eventTypes[name];
    if (event) {
      c.eventSource.on(event, fn);
      this.cleanup.push(() => c.eventSource.removeListener(event, fn));
    }
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  revision = () => this.version;
  refresh = () => {
    this.cache = null;
    this.version++;
    this.listeners.forEach((fn) => fn());
  };
  report(error: unknown) {
    window.dispatchEvent(
      new CustomEvent("wb-error", {
        detail: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  prefs(): Preferences {
    return { ...clone(defaults), ...ctx().extensionSettings.workbench };
  }
  preference(patch: Partial<Preferences>) {
    if (
      Object.entries(patch).every(
        ([k, v]) => JSON.stringify(this.prefs()[k as keyof Preferences]) === JSON.stringify(v),
      )
    )
      return;
    Object.assign(ctx().extensionSettings.workbench, patch);
    ctx().saveSettingsDebounced();
    this.refresh();
  }
  async persistSettings() {
    const c = ctx(),
      event = c.eventTypes.SETTINGS_UPDATED;
    let saved = false;
    const done = () => {
      saved = true;
    };
    c.eventSource.on(event, done);
    try {
      const script = await internal("script");
      await script.saveSettings();
      if (!saved) throw new Error("酒馆设置未确认保存，草稿已保留，请重试。");
    } finally {
      c.eventSource.removeListener(event, done);
    }
  }
  async request(path: string, body: Data) {
    const response = await fetch(path, {
      method: "POST",
      headers: ctx().getRequestHeaders(),
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`保存或读取失败（HTTP ${response.status}），草稿已保留。`);
    return response;
  }
  snapshot(): HostSnapshot {
    if (this.cache) return this.cache;
    const c = ctx(),
      manager = c.getPresetManager(),
      profiles = c.extensionSettings.connectionManager?.profiles ?? [];
    const characters: Item[] = c.characters.map((x: Data, i: number) => ({
      id: x.avatar,
      name: x.name,
      detail: (x.data?.tags ?? []).join(" · "),
      image: c.getThumbnailUrl("avatar", x.avatar),
      active:
        c.characterId !== undefined &&
        c.characterId !== null &&
        c.characterId !== "" &&
        i === Number(c.characterId),
      data: x,
    }));
    const personas = c.powerUserSettings.personas ?? {};
    const resources: Record<Resource, Item[]> = {
      connection: profiles
        .map((p: Data) => ({
          id: p.id,
          name: p.name,
          detail: this.prefs().groups[p.id] || p.model || p.api || "其他模型",
          data: p,
        }))
        .sort(
          (a: Item, b: Item) =>
            (a.detail ?? "").localeCompare(b.detail ?? "") || a.name.localeCompare(b.name),
        ),
      preset: (manager?.getAllPresets() ?? []).map((name: string) => ({
        id: name,
        name,
        detail: c.mainApi,
      })),
      world: c.getWorldInfoNames().map((name: string) => ({
        id: name,
        name,
        active: this.world?.selected_world_info.includes(name),
      })),
      persona: Object.entries(personas).map(([id, name]) => ({
        id,
        name: String(name),
        image: c.getThumbnailUrl("persona", id),
        detail: c.powerUserSettings.persona_descriptions?.[id]?.title ?? "",
      })),
    };
    return (this.cache = {
      chatName: String(c.chatId ?? "").replace(/\.jsonl$/, ""),
      groupId: c.groupId || undefined,
      groupName: c.groups?.find((g: Data) => g.id === c.groupId)?.name,
      character: characters.find((x) => x.active) ?? null,
      characters,
      resources,
      current: {
        connection: c.extensionSettings.connectionManager?.selectedProfile ?? "",
        preset: manager?.getSelectedPresetName() ?? "",
        world: this.world?.selected_world_info[0] ?? "",
        persona: this.personas?.user_avatar ?? "",
      },
      online: c.onlineStatus !== "no_connection",
      busy: this.busy || this.resourceAction || this.generating,
      messages: c.chat.map((m: Data, i: number) => ({
        id: i,
        name: m.name,
        text: m.mes,
        is_user: m.is_user,
        send_date: m.send_date,
      })),
    });
  }
  isGenerating() {
    return this.generating;
  }
  /**
   * Moves a native node into workbench UI with its handlers intact. `.wb-native-embedded` exempts it
   * from the style isolation rule; the returned function (and destroy) put it back exactly where it was.
   */
  lease(node: HTMLElement, container: HTMLElement, label: string) {
    const placeholder = document.createComment(label);
    node.before(placeholder);
    node.classList.add("wb-native-embedded");
    container.append(node);
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      node.classList.remove("wb-native-embedded");
      placeholder.replaceWith(node);
    };
    this.cleanup.push(restore);
    return () => {
      restore();
      this.cleanup = this.cleanup.filter((fn) => fn !== restore);
    };
  }
  download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
