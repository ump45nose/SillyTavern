import type { HostAdapter } from "./adapter";
import { ctx } from "./internals";
import {
  DEFAULT_OPTIONS_PROMPT,
  parseOptions,
  sheets,
  stripHistory,
  stripOptions,
  tableOptions,
  type StoryOption,
} from "./options";

export type OptionSource = "off" | "model" | "db";
/** Chat metadata `workbenchOptions`: where this chat's options come from. */
export interface OptionsConfig {
  source: OptionSource;
  /** The database table bound for the "db" source. */
  table: string;
}
export interface OptionsState {
  config: OptionsConfig;
  /** The options for the latest reply; empty while a reply is generating or the user spoke last. */
  items: StoryOption[];
  /** Changes with the reply the options belong to, so a view can drop what it had expanded. */
  key: string;
  /** The database's table names, for binding one. */
  tables: string[];
  error: string;
}

const PROMPT = "noval_options",
  IN_CHAT = 1,
  SYSTEM = 0,
  HOOKED = Symbol.for("workbench.options.formatter");
const off: OptionsConfig = { source: "off", table: "" };

/** The database plug-in's API, as far as the options need it. */
interface DatabaseApi {
  exportTableAsJson: () => unknown;
  registerTableUpdateCallback?: (fn: () => void) => void;
}
const database = () => (window as any).AutoCardUpdaterAPI as DatabaseApi | undefined;

/**
 * A chat's story options: the model's `<options>` block (asked for by an injected prompt, hidden in
 * the text, left out of later prompts) or a bound table of the database plug-in.
 */
export class OptionsRuntime {
  state: OptionsState = { config: off, items: [], key: "", tables: [], error: "" };
  private listeners = new Set<() => void>();
  private table: StoryOption[] = [];
  private subscribed = false;
  private disposed = false;
  constructor(private host: HostAdapter) {
    // MessageFormatter keeps its hooks for the page's life, so the hook goes in once per page.
    const formatter = ctx().messageFormatter;
    if (formatter && !formatter[HOOKED]) {
      formatter[HOOKED] = true;
      formatter.addHook((mes: string, info: { isUser: boolean }) => (info.isUser ? mes : stripOptions(mes)), {
        stage: formatter.stage.BEFORE_REGEX,
      });
    }
    host.listen("CHAT_COMPLETION_PROMPT_READY", (data: { chat?: { role: string; content: unknown }[] }) => {
      for (const message of data.chat || [])
        if (message.role === "assistant") message.content = this.stripContent(message.content);
    });
    host.listen("GENERATE_AFTER_COMBINE_PROMPTS", (data: { prompt?: unknown }) => {
      if (typeof data.prompt === "string")
        data.prompt = stripHistory(data.prompt, this.state.config.source === "model");
    });
    host.listen("CHAT_CHANGED", () => this.load());
    host.cleanup.push(host.subscribe(() => this.update()));
    this.load();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private set(patch: Partial<OptionsState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private stripContent(content: unknown) {
    if (typeof content === "string") return stripOptions(content);
    if (Array.isArray(content))
      return content.map((part) =>
        part?.type === "text" && typeof part.text === "string"
          ? { ...part, text: stripOptions(part.text) }
          : part,
      );
    return content;
  }
  config(): OptionsConfig {
    const value = ctx().chatMetadata?.workbenchOptions;
    const source = ["model", "db"].includes(value?.source) ? (value.source as OptionSource) : "off";
    return { source, table: typeof value?.table === "string" ? value.table : "" };
  }
  template() {
    return this.host.prefs().optionsPrompt || DEFAULT_OPTIONS_PROMPT;
  }
  /** Reads the chat's choice; called on every chat switch. */
  load() {
    const config = this.config();
    ctx().setExtensionPrompt(
      PROMPT,
      config.source === "model" ? this.template() : "",
      IN_CHAT,
      0,
      false,
      SYSTEM,
    );
    this.table = [];
    this.set({ config, error: "" });
    if (config.source === "db") this.readTable();
    else this.set({ tables: [] });
    this.update(true);
  }
  async save(config: OptionsConfig) {
    const meta = ctx().chatMetadata;
    if (config.source === "off" && !config.table) delete meta.workbenchOptions;
    else meta.workbenchOptions = { source: config.source, table: config.table };
    await ctx().saveMetadata();
    this.load();
  }
  /** The prompt is the user's own across chats; empty brings the default back. */
  async savePrompt(text: string) {
    this.host.preference({ optionsPrompt: text.trim() === DEFAULT_OPTIONS_PROMPT ? "" : text });
    await this.host.persistSettings();
    this.load();
  }
  /** Reads the bound table, and keeps reading it whenever the database updates. */
  readTable() {
    const api = database();
    if (!api || typeof api.exportTableAsJson !== "function") {
      this.table = [];
      this.set({ tables: [], error: "没有检测到数据库插件（AutoCardUpdaterAPI）。" });
      return this.update(true);
    }
    if (!this.subscribed && typeof api.registerTableUpdateCallback === "function") {
      this.subscribed = true;
      api.registerTableUpdateCallback(() => {
        if (!this.disposed && this.state.config.source === "db") this.readTable();
      });
    }
    try {
      const all = sheets(api.exportTableAsJson()),
        name = this.state.config.table,
        sheet = all.find((s) => s.name === name);
      this.table = sheet ? tableOptions(sheet) : [];
      this.set({
        tables: all.map((s) => s.name!),
        error: !name ? "请选择一张表。" : sheet ? "" : `数据库里没有名为「${name}」的表。`,
      });
    } catch (error) {
      this.table = [];
      this.set({ error: `读取数据库表失败：${error instanceof Error ? error.message : String(error)}` });
    }
    this.update(true);
  }
  /** The options belong to the latest reply, and only once it has finished and the user has not answered. */
  private update(force = false) {
    const c = ctx(),
      last = c.chat?.at(-1),
      source = this.state.config.source;
    const reply = !!last && !last.is_user && !last.is_system && !this.host.isBusy();
    const key = reply ? `${c.chat.length - 1}:${last.swipe_id ?? 0}:${source}:${last.mes?.length ?? 0}` : "";
    if (!force && key === this.state.key) return;
    const items =
      !reply || source === "off"
        ? []
        : source === "model"
          ? parseOptions(String(last.mes ?? ""))
          : this.table;
    this.set({ items, key });
  }
  dispose() {
    this.disposed = true;
    ctx().setExtensionPrompt(PROMPT, "", IN_CHAT, 0, false, SYSTEM);
    this.listeners.clear();
  }
}
