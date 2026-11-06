import { ctx } from "./internals";

type Hook = (mes: string, info: { isUser: boolean; isReasoning: boolean }) => string;
type Slot = { hook: Hook | null };
const SLOTS = Symbol.for("workbench.formatter.hooks");

/**
 * Runs `hook` in SillyTavern's message formatter until the returned function idles it. The formatter
 * keeps every hook for the page's life and cannot remove one, so each name is added once per page,
 * recorded on the formatter rather than in this module, and a later call under the same name runs its
 * own function in that place.
 */
export function formatterHook(name: string, hook: Hook, options?: { stage?: string }) {
  const formatter = ctx().messageFormatter,
    slots: Map<string, Slot> = (formatter[SLOTS] ??= new Map());
  let slot = slots.get(name);
  if (!slot) {
    const added: Slot = { hook: null };
    formatter.addHook((mes: string, info: Parameters<Hook>[1]) => added.hook?.(mes, info) ?? mes, options);
    slots.set(name, (slot = added));
  }
  const current = slot;
  current.hook = hook;
  return () => {
    if (current.hook === hook) current.hook = null;
  };
}
