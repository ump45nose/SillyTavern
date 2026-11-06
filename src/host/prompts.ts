import type { HostAdapter } from "./adapter";
import { ctx } from "./internals";

/** SillyTavern's extension_prompt_types.IN_CHAT and extension_prompt_roles.SYSTEM; its context exposes neither. */
const IN_CHAT = 1,
  SYSTEM = 0;

export interface Injection {
  /** Messages counted back from the end of the chat; 0 is after the last one. */
  depth: number;
  /** An extension_prompt_types value; in the chat by default. */
  position?: number;
  /** An extension_prompt_roles value; system by default. */
  role?: number;
  /** Whether world info scans the text. */
  scan?: boolean;
}
type Entry = Required<Injection> & { text: string };

/**
 * The workbench's prompt injections. SillyTavern's own table starts empty whenever a chat is loaded,
 * reloaded or branched, and is emptied without a chat switch as well (an edited first message put
 * back), so the host keeps the entries and writes all of them again on every chat switch and when a
 * generation starts, before the prompt is assembled. Dry runs (token counts) start one too; writing
 * the same entries again changes nothing.
 */
export class PromptTable {
  private entries = new Map<string, Entry>();
  private disposed = false;
  constructor(host: HostAdapter) {
    for (const name of ["CHAT_CHANGED", "GENERATION_STARTED"]) host.listen(name, () => this.restore());
  }
  /** Injects `text` under `key` until it is set again or cleared; empty text clears it. */
  set(key: string, text: string, { depth, position = IN_CHAT, role = SYSTEM, scan = false }: Injection) {
    if (!text) return this.clear(key);
    if (this.disposed) return;
    const entry = { text, depth, position, role, scan };
    this.entries.set(key, entry);
    write(key, entry);
  }
  clear(key: string) {
    if (this.disposed) return;
    this.entries.delete(key);
    write(key);
  }
  /** Writes every entry into SillyTavern's table again. */
  restore() {
    for (const [key, entry] of this.entries) write(key, entry);
  }
  /** Takes every entry out; nothing set afterwards is written. */
  dispose() {
    for (const key of this.entries.keys()) write(key);
    this.entries.clear();
    this.disposed = true;
  }
}

/** A cleared entry is written empty: SillyTavern cannot remove one, and readers of the table expect `value`. */
function write(key: string, entry?: Entry) {
  ctx().setExtensionPrompt(
    key,
    entry?.text ?? "",
    entry?.position ?? IN_CHAT,
    entry?.depth ?? 0,
    entry?.scan ?? false,
    entry?.role ?? SYSTEM,
  );
}
