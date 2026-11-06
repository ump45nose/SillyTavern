import type { HostAdapter } from "./adapter";
import type { Data } from "./types";
import { mergeEdits, sameData, validatePreset } from "./model";
import { changedCells } from "./database";
import type { SyncTable } from "../sync/database";
import { ctx } from "./internals";

const BASE = "/api/plugins/workbench-sync";
const parse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

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
  /** This page's id on the plug-in's event stream, from its hello. */
  private page = "";
  /** The database state last reported, to send only changes. */
  private reported = "";
  private reporting: Promise<void> = Promise.resolve();
  private unsubscribe: () => void;
  /** Writes an outline into the open chat; registered by the add-on manager, which owns outlines. */
  private writeOutline: ((draft: Data) => Promise<void>) | null = null;
  constructor(private host: HostAdapter) {
    void this.probe();
    this.unsubscribe = host.database.subscribe(() => void this.report());
  }
  handleOutline(write: (draft: Data) => Promise<void>) {
    this.writeOutline = write;
    return () => {
      if (this.writeOutline === write) this.writeOutline = null;
    };
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
    const on = (name: string, handle: (data: Data) => void) =>
      source.addEventListener(name, (event) => {
        const text = String((event as MessageEvent).data),
          data = parse(text);
        if (data && typeof data === "object") handle(data as Data);
        else this.unreadable(name, text);
      });
    const status = (data: Data) =>
      this.set({ status: "online", clients: data.clients, pages: data.pages, recent: data.recent ?? [] });
    // Every (re)connection is a new page to the plug-in: report the open chat's tables again.
    on("hello", (data) => {
      this.page = data.page;
      this.reported = "";
      status(data);
      void this.report();
    });
    on("status", status);
    on("write", (data) => void this.write(data as WriteRequest));
    // EventSource reconnects by itself; CLOSED means the server answered with an error (plug-in gone).
    source.onerror = () =>
      this.set({ status: source.readyState === EventSource.CLOSED ? "absent" : "reconnecting" });
  }
  /** The open chat, as the plug-in names chats: by character avatar or group id, and chat file. */
  private openChat() {
    const c = ctx(),
      chat = c.getCurrentChatId();
    if (!chat) return null;
    return c.groupId
      ? { group: String(c.groupId), chat }
      : { avatar: c.characters[c.characterId]?.avatar as string | undefined, chat };
  }
  private isOpen(avatar: string | undefined, group: string | undefined, chat: string) {
    const open = this.openChat();
    return !!open && open.chat === chat && open.group === group && (group ? true : open.avatar === avatar);
  }
  private tables(): SyncTable[] {
    return this.host.database.state.tables.map(({ key, name, columns, rows }) => ({
      key,
      name,
      columns,
      rows: rows.map(({ id, index, cells }) => ({ id, index, cells })),
    }));
  }
  /**
   * Tells the plug-in which chat is open and its database tables, so an IDE can edit them. Reports
   * go out one after another; awaiting one waits until the latest state has reached the server.
   */
  private report() {
    this.reporting = this.reporting.then(() => this.send());
    return this.reporting;
  }
  private async send() {
    if (!this.page || this.disposed) return;
    const open = this.openChat(),
      tables = this.tables(),
      database = open && tables.length ? { ...open, tables } : null,
      body = JSON.stringify({ page: this.page, database });
    if (body === this.reported) return;
    const response = await fetch(`${BASE}/page-state`, {
      method: "POST",
      headers: ctx().getRequestHeaders(),
      body,
    }).catch(() => null);
    // A failed report is sent again with the next change or reconnection.
    if (response?.ok) this.reported = body;
  }
  /**
   * An event whose data is not a JSON object. A write is still answered when its request id can be
   * read, so the IDE hears at once rather than after the plug-in's timeout.
   */
  private unreadable(name: string, text: string) {
    const request = name === "write" ? /"request"\s*:\s*"([\w-]+)"/.exec(text)?.[1] : undefined;
    if (request)
      void this.reply(request, { status: "error", message: "写入请求的数据已损坏，页面没有执行。" });
    else console.warn(`[Workbench] unreadable ${name} event from workbench-sync`, text.slice(0, 200));
  }
  private async write(request: WriteRequest) {
    let reply: Reply;
    try {
      reply = await this.apply(request);
    } catch (error) {
      reply = { status: "error", message: error instanceof Error ? error.message : String(error) };
    }
    await this.reply(request.request, reply);
  }
  private reply(request: string, reply: Reply) {
    return fetch(`${BASE}/relay`, {
      method: "POST",
      headers: ctx().getRequestHeaders(),
      body: JSON.stringify({ request, ...reply }),
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
    else if (kind === "database") return this.database(id, base as SyncTable, draft as SyncTable);
    else return { status: "error", message: `页面不支持写入 ${kind}。` };
    return { status: "done" };
  }
  /**
   * Writes the file without applying it (writePresetFile). For the running preset, IDE changes reach
   * the running settings only where those still equal the file; other fields are reported as conflicts.
   */
  private async preset(name: string, base: Data, draft: Data): Promise<Reply> {
    validatePreset(draft);
    const host = this.host,
      running = host.runningPreset(name),
      merged = mergeEdits(base, draft, host.presetData(name));
    await host.writePresetFile(name, merged);
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
    const { avatar, group, chat } = JSON.parse(id);
    if (!this.isOpen(avatar, group, chat)) return { status: "skip" };
    if (!this.writeOutline) return { status: "error", message: "工作台界面尚未就绪，大纲未写入。" };
    await this.writeOutline(draft);
    return { status: "done" };
  }
  /**
   * Applies an IDE's table edit through the database plug-in: changed cells, then removed rows
   * (last first, so positions hold), then new rows. Nothing is written when the table has moved on.
   */
  private async database(id: string, base: SyncTable, draft: SyncTable): Promise<Reply> {
    const { avatar, group, chat, table: key } = JSON.parse(id),
      db = this.host.database;
    if (!this.isOpen(avatar, group, chat))
      return { status: "skip", message: "打开该聊天后可同步：页面已切换到其他聊天。" };
    const table = db.table(key);
    if (!table) return { status: "error", message: "这张表已不在数据库中。" };
    if (
      !sameData(
        this.tables().find((t) => t.key === key),
        base,
      )
    )
      return { status: "skip", message: "数据库刚刚更新过这张表：请重新载入文件后再改。" };
    const stray = draft.rows.find((row) => row.index && !table.rows[row.index - 1]);
    if (stray)
      return {
        status: "error",
        message: `这张表没有第 ${stray.index} 行（共 ${table.rows.length} 行），整张表都没有写入：请重新载入文件后再改。`,
      };
    const kept = new Set<number>();
    for (const row of draft.rows) {
      if (!row.index) continue;
      kept.add(row.index);
      const current = table.rows[row.index - 1];
      await db.saveRow(table, current, changedCells(table.columns, current.cells, row.cells));
    }
    for (const row of [...table.rows].reverse()) if (!kept.has(row.index)) await db.deleteRow(table, row);
    for (const row of draft.rows)
      if (!row.index)
        await db.insertRow(
          table,
          Object.fromEntries(table.columns.map((name, i) => [name, row.cells[i] ?? ""])),
        );
    // The plug-in's new state goes to the server before the reply, so the IDE reloads it.
    await this.report();
    return { status: "done" };
  }
  dispose() {
    this.disposed = true;
    this.unsubscribe();
    this.source?.close();
    this.listeners.clear();
  }
}
