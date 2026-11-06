import type { HostAdapter } from "../host/adapter";
import { AddonBridge } from "../host/addon-api";
import { addonEnabled, type AddonId } from "./catalog";
import { loadAddon } from "./loader";
import type { AddonRuntime, TaskHost } from "./types";
import { bus } from "../host/bus";
import { normalizeOutline, outlineContext } from "../domain/outline";
const OUTLINE_PROMPT = "noval_outline";
const managers = new WeakMap<HostAdapter, AddonManager>();
export class AddonManager {
  readonly bridge: AddonBridge;
  private runtimes = new Map<AddonId, AddonRuntime>();
  private pending = new Map<AddonId, Promise<AddonRuntime>>();
  private listeners = new Set<() => void>();
  private cleanups: (() => void)[] = [];
  /** Each runtime's subscription; it ends with its runtime. */
  private unsubscribes = new Map<AddonId, () => void>();
  private key: string;
  private version = 0;
  private disposed = false;
  /** The outline metadata object last read, and the `{{outline}}` text it gave. */
  private outline: { source?: unknown; text: string } = { text: "" };
  constructor(private host: HostAdapter) {
    this.bridge = new AddonBridge(host);
    this.key = this.bridge.key();
    // The outline guides writing without its add-on loaded: a macro, and the prompt when injection is on.
    this.cleanups.push(
      this.bridge.macro("outline", () => this.outline.text, "工作台大纲：当前节点、上级背景与下一节点"),
      () => host.prompts.clear(OUTLINE_PROMPT),
    );
    this.syncOutline();
    this.cleanups.push(
      this.bridge.onChatChange(() => {
        this.key = this.bridge.key();
        this.reset();
        this.syncOutline();
      }),
    );
    this.cleanups.push(
      host.subscribe(() => {
        const key = this.bridge.key();
        if (key !== this.key) {
          this.key = key;
          this.reset();
        }
        this.syncOutline();
        for (const [id, runtime] of this.runtimes)
          if (!addonEnabled(host.prefs(), id)) {
            this.unsubscribes.get(id)?.();
            this.unsubscribes.delete(id);
            runtime.dispose();
            this.runtimes.delete(id);
            this.emit();
          }
      }),
    );
    // IDE edits to the open chat's outline arrive through the sync relay. A loaded outline holds its
    // data in memory and saves it on the next change, so it takes the write.
    this.cleanups.push(
      host.sync.handleOutline(async (draft) => {
        const runtime = this.get("outline");
        if (runtime) await runtime.action("import", draft, "replace");
        else {
          const api = this.api("outline");
          await api.saveMetadata(draft, api.snapshot().chatKey);
        }
      }),
    );
    this.cleanups.push(
      this.bridge.onReply((reply) => {
        const api = this.api("image-gen"),
          rule = api.metadata().auto;
        if (!addonEnabled(host.prefs(), "image-gen") || !rule?.enabled) return;
        void this.ensure("image-gen")
          .then((runtime) => runtime.action("reply", reply))
          .catch((error) => host.report(error));
      }),
    );
  }
  /** Re-reads the chat's outline when its metadata object changes (every save replaces it). */
  private syncOutline() {
    const source = addonEnabled(this.host.prefs(), "outline") ? this.bridge.stored("outline") : undefined;
    if (source === this.outline.source) return;
    let text = "",
      prompt = "",
      depth = 0;
    try {
      const data = normalizeOutline(source);
      text = outlineContext(data);
      if (data.settings.inject.enabled) [prompt, depth] = [text, data.settings.inject.depth];
    } catch (error) {
      this.host.report(error);
    }
    this.outline = { source, text };
    this.host.prompts.set(OUTLINE_PROMPT, prompt, { depth });
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  revision = () => this.version;
  private emit = () => {
    this.version++;
    this.listeners.forEach((fn) => fn());
  };
  api(id: AddonId): TaskHost {
    return this.bridge.api(id, (view) => bus.emit("addon-open", { id, view }));
  }
  get(id: AddonId) {
    return this.runtimes.get(id);
  }
  async ensure(id: AddonId): Promise<AddonRuntime> {
    if (this.disposed || !addonEnabled(this.host.prefs(), id)) throw new Error("附加功能已停用。");
    const runtime = this.get(id);
    if (runtime) return runtime;
    const existing = this.pending.get(id);
    if (existing) return existing;
    const key = this.key;
    const pending = loadAddon(id)
      .then(({ module }) => {
        if (this.disposed || this.key !== key || !addonEnabled(this.host.prefs(), id))
          throw new Error("聊天已切换或功能已停用。");
        if (module.apiVersion !== 2) throw new Error("此插件没有后台任务。");
        const runtime = module.createRuntime(this.api(id));
        this.runtimes.set(id, runtime);
        this.unsubscribes.set(id, runtime.subscribe(this.emit));
        this.emit();
        return runtime;
      })
      .finally(() => {
        if (this.pending.get(id) === pending) this.pending.delete(id);
      });
    this.pending.set(id, pending);
    return pending;
  }
  tasks() {
    return [...this.runtimes]
      .map(([id, runtime]) => ({ id, runtime, ...runtime.task() }))
      .filter((task) => task.status !== "idle");
  }
  private reset() {
    this.unsubscribes.forEach((off) => off());
    this.unsubscribes.clear();
    this.runtimes.forEach((runtime) => runtime.dispose());
    this.runtimes.clear();
    this.pending.clear();
    this.emit();
  }
  dispose() {
    this.disposed = true;
    this.reset();
    this.cleanups.forEach((fn) => fn());
    this.bridge.dispose();
    this.listeners.clear();
    managers.delete(this.host);
  }
}
export function addonManager(host: HostAdapter) {
  let manager = managers.get(host);
  if (!manager) {
    manager = new AddonManager(host);
    managers.set(host, manager);
  }
  return manager;
}
export function disposeAddons(host: HostAdapter) {
  managers.get(host)?.dispose();
}
