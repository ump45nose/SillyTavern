import type { HostAdapter } from "./adapter";
import type { Data } from "./types";
import { clone, mergeEdits, sameData, validatePreset } from "./model";
import { ctx } from "./internals";
import { addonManager } from "../addons/runtime";

const BASE = "/api/plugins/workbench-sync";

export interface SyncRecent {
  time: number;
  path: string;
  route: "page" | "disk" | "none";
  ok: boolean;
  message?: string;
}
export interface SyncState {
  /** probing: asking the server; absent: the plug-in is not loaded; online: writes come through this page. */
  status: "probing" | "absent" | "online" | "reconnecting";
  /** IDE connections and workbench pages for this user. */
  clients: number;
  pages: number;
  recent: SyncRecent[];
}
interface WriteRequest {
  request: string;
  kind: string;
  id: string;
  base: Data;
  draft: Data;
}
interface Reply {
  status: "done" | "skip" | "error";
  message?: string;
  conflicts?: string[];
}

/**
 * The page end of IDE sync. When SillyTavern runs the workbench-sync server plug-in, the page
 * listens to it and carries out IDE writes through the workbench's own save calls, so what the
 * page holds in memory never goes stale. Unsaved editor drafts are left alone: they keep their
 * base, and saving them later merges field by field as before.
 */
export class SyncRelay {
  state: SyncState = { status: "probing", clients: 0, pages: 0, recent: [] };
  private source: EventSource | null = null;
  private listeners = new Set<() => void>();
  private disposed = false;
  constructor(private host: HostAdapter) {
    void this.probe();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  /** One request at start: without the plug-in nothing else is sent. */
  private async probe() {
    try {
      const response = await fetch(`${BASE}/info`, { headers: ctx().getRequestHeaders() });
      if (this.disposed) return;
      if (!response.ok) return this.set({ status: "absent" });
      this.listen();
    } catch {
      if (!this.disposed) this.set({ status: "absent" });
    }
  }
  private listen() {
    const source = new EventSource(`${BASE}/events?role=page`);
    this.source = source;
    const status = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      this.set({ status: "online", clients: data.clients, pages: data.pages, recent: data.recent ?? [] });
    };
    source.addEventListener("hello", status);
    source.addEventListener("status", status);
    source.addEventListener("write", (event) => void this.write(JSON.parse((event as MessageEvent).data)));
    // EventSource reconnects by itself; CLOSED means the server answered with an error (plug-in gone).
    source.onerror = () =>
      this.set({ status: source.readyState === EventSource.CLOSED ? "absent" : "reconnecting" });
  }
  private async write(request: WriteRequest) {
    let reply: Reply;
    try {
      reply = await this.apply(request);
    } catch (error) {
      reply = { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
    await fetch(`${BASE}/relay`, {
      method: "POST",
      headers: ctx().getRequestHeaders(),
      body: JSON.stringify({ request: request.request, ...reply }),
    }).catch((error) => this.host.report(error));
  }
  private async apply({ kind, id, base, draft }: WriteRequest): Promise<Reply> {
    const host = this.host;
    if (kind === "world") await host.saveBook(id, base, draft);
    else if (kind === "character") await host.saveCharacter(id, base, draft);
    else if (kind === "connection") await host.saveProfile(id, base, draft);
    else if (kind === "persona") await host.savePersona(id, base, draft);
    else if (kind === "preset") return this.preset(id, base, draft);
    else if (kind === "outline") return this.outline(id, draft);
    else return { status: "error", message: `页面不支持写入 ${kind}。` };
    return { status: "done" };
  }
  /**
   * Writes the preset file without SillyTavern's list update, which would select the preset and
   * reapply the file over the running settings. For the running preset, IDE changes reach the
   * running settings only where those still equal the file; other fields are reported as conflicts.
   */
  private async preset(name: string, base: Data, draft: Data): Promise<Reply> {
    validatePreset(draft);
    const host = this.host,
      manager = ctx().getPresetManager(),
      running = host.runningPreset(name),
      merged = mergeEdits(base, draft, host.presetData(name));
    await manager.savePreset(name, merged, { skipUpdate: true });
    const { presets, preset_names } = manager.getPresetList(),
      index = Array.isArray(preset_names) ? preset_names.indexOf(name) : preset_names[name];
    if (index !== undefined && index >= 0) presets[index] = clone(merged);
    const changed = Object.keys({ ...base, ...draft }).filter((k) => !sameData(base[k], draft[k])),
      conflicts: string[] = [];
    if (running) {
      const patch: Data = {};
      for (const key of changed)
        if (sameData(running.live[key], base[key])) patch[key] = draft[key];
        else if (!sameData(running.live[key], draft[key])) conflicts.push(key);
      if (Object.keys(patch).length) host.applyPreset(patch);
    }
    host.resourceVersions.preset++;
    host.invalidate("resources");
    return { status: "done", conflicts };
  }
  /** Only the open chat's outline goes through the page; the server writes other chats itself. */
  private async outline(id: string, draft: Data): Promise<Reply> {
    const { avatar, group, chat } = JSON.parse(id),
      c = ctx(),
      open =
        c.getCurrentChatId() === chat &&
        (group ? c.groupId === group : !c.groupId && c.characters[c.characterId]?.avatar === avatar);
    if (!open) return { status: "skip" };
    const manager = addonManager(this.host),
      runtime = manager.get("outline");
    // A loaded outline holds its data in memory and saves it on the next change, so it takes the write.
    if (runtime) await runtime.action("import", draft, "replace");
    else {
      const api = manager.api("outline");
      await api.saveMetadata(draft, api.snapshot().chatKey);
    }
    return { status: "done" };
  }
  dispose() {
    this.disposed = true;
    this.source?.close();
    this.listeners.clear();
  }
}
