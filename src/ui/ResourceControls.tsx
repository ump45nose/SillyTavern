import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "./icons";
import type { HostAdapter } from "../host/adapter";
import type { Data } from "../host/types";
import { clone, mergeEdits, sameData } from "../host/model";
import { useLeaveGuard } from "./common";
export function Fold({
  title,
  children,
  initial = false,
  toolbar,
  icon,
  hint,
  open: controlledOpen,
  onOpenChange,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  initial?: boolean;
  toolbar?: React.ReactNode;
  icon?: React.ReactNode;
  /** A quiet summary at the row's end, e.g. what the fold currently holds. */
  hint?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [localOpen, setLocalOpen] = useState(initial);
  const open = controlledOpen ?? localOpen;
  const toggle = (
    <button
      className={`wb-fold-head ${icon ? "is-icon" : ""}`}
      title={title}
      aria-label={title}
      aria-expanded={open}
      onClick={() => {
        setLocalOpen(!open);
        onOpenChange?.(!open);
      }}
    >
      {icon || (
        <>
          <span className="wb-fold-title">{title}</span>
          {hint && <small className="wb-fold-hint">{hint}</small>}
          <ChevronDown size={16} className="wb-fold-caret" />
        </>
      )}
    </button>
  );
  return (
    <section className={`wb-fold ${className}`}>
      {toolbar ? (
        <div className="wb-fold-tools">
          {toolbar}
          {toggle}
        </div>
      ) : (
        toggle
      )}
      <div className={`wb-fold-body ${open ? "is-open" : ""}`} aria-hidden={!open} inert={!open}>
        <div>{children}</div>
      </div>
    </section>
  );
}
export function Check({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="wb-check">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
export const saveHint = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘S" : "Ctrl+S";
/** An on/off control that applies at once (boards "Panel*"); the label names it for assistive tech. */
export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="wb-switch"
      aria-label={label}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" />
    </button>
  );
}
/**
 * The one save bar for content drafts: on screen only while there is something to save (and
 * briefly after saving), with Revert, Save and ⌘S / Ctrl+S inside the editor it belongs to.
 */
export function SaveBar({
  dirty,
  busy,
  message = "",
  reset,
  save,
  label = "保存",
  title = "未保存的修改",
  detail,
  pending = false,
}: {
  dirty: boolean;
  busy: boolean;
  message?: string;
  reset: () => void;
  save: () => void;
  label?: string;
  title?: string;
  detail?: string;
  /** A stored file differs from the runtime (presets, connection profiles): the warm warning tone. */
  pending?: boolean;
}) {
  const ref = useRef<HTMLElement>(null),
    [flash, setFlash] = useState("");
  useEffect(() => {
    if (dirty || !message) return;
    setFlash(message);
    const timer = setTimeout(() => setFlash(""), 2000);
    return () => clearTimeout(timer);
  }, [dirty]);
  const live = useRef({ busy, save });
  live.current = { busy, save };
  useEffect(() => {
    const scope = ref.current?.closest<HTMLElement>(".wb-entry-editor") ?? ref.current?.parentElement;
    if (!dirty || !scope) return;
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      e.stopPropagation();
      if (!live.current.busy) live.current.save();
    };
    scope.addEventListener("keydown", key);
    return () => scope.removeEventListener("keydown", key);
  }, [dirty]);
  if (!dirty && !flash) return null;
  return (
    <footer
      ref={ref}
      className={`wb-savebar ${dirty ? (pending ? "is-pending" : "") : "is-saved"}`}
      aria-label={dirty ? title : flash}
    >
      <span className="wb-savebar-dot" aria-hidden="true" />
      <span className="wb-savebar-copy">
        <span role="status">{dirty ? title : flash}</span>
        {dirty && detail && <small>{detail}</small>}
      </span>
      {dirty && (
        <>
          <button className="wb-savebar-revert" disabled={busy} onClick={reset}>
            还原
          </button>
          <button
            className="wb-savebar-save"
            aria-label={label}
            title={`${label} · ${saveHint}`}
            disabled={busy}
            onClick={save}
          >
            {label}
            <kbd aria-hidden="true">{saveHint}</kbd>
          </button>
        </>
      )}
    </footer>
  );
}
type DraftCache = { host: HostAdapter; key: string };
/** The cached draft under `key` while it holds unsaved work; a clean one is read again instead. */
export const unsavedDraft = (host: HostAdapter, key: string) =>
  host.dirtyDraftKeys().includes(key) ? host.drafts.get(key) : undefined;
/**
 * Mirrors an editor's draft into `host.drafts`, with `extra(draft)` or else the entry's own extra,
 * whenever the key, base, draft or one of the extra values changes. When the editor closes or moves
 * to another key the entry goes, unless `dirtyDraftKeys` (which saving and discarding all drafts go
 * by) still lists it.
 */
function useDraftCache(
  cache: DraftCache | undefined,
  base: Data | null,
  draft: Data | null,
  extra?: (draft: Data) => Data,
) {
  const written = useRef<unknown[]>([]);
  useLayoutEffect(() => {
    if (!cache || !base || !draft) return;
    const value = extra?.(draft),
      parts = [cache.key, base, draft, ...Object.values(value ?? {})];
    if (parts.length === written.current.length && parts.every((x, i) => x === written.current[i])) return;
    written.current = parts;
    cache.host.drafts.set(cache.key, {
      base,
      draft,
      extra: value ?? cache.host.drafts.get(cache.key)?.extra,
    });
  });
  useEffect(() => {
    if (!cache) return;
    const { host, key } = cache;
    return () => {
      if (!host.dirtyDraftKeys().includes(key)) host.drafts.delete(key);
    };
  }, [cache?.host, cache?.key]);
}
export function useDraft(
  read: () => Data,
  version: number,
  cache?: DraftCache,
  /** Fold outside changes into a dirty draft instead of waiting for it to be saved or reverted. */
  rebase = false,
) {
  // Base and draft are replaced, never mutated, so they may share branches and be cached as they are.
  const [initial] = useState(() => {
    const previous = cache?.host.drafts.get(cache.key);
    if (previous && !sameData(previous.base, previous.draft)) return previous;
    const value = read();
    return { base: value, draft: value };
  });
  const [base, setBase] = useState<Data>(initial.base),
    [draft, setDraft] = useState<Data>(initial.draft),
    [message, setMessage] = useState("");
  const dirty = useMemo(() => !sameData(base, draft), [base, draft]);
  useDraftCache(cache, base, draft);
  useEffect(() => {
    if (!dirty) {
      const value = read();
      setBase(value);
      setDraft(value);
    } else if (rebase)
      try {
        const value = read();
        if (sameData(value, base)) return;
        setDraft(mergeEdits(base, draft, value));
        setBase(value);
      } catch {
        // Both sides changed the same field: keep the draft; saving reports the conflict.
      }
  }, [version]);
  useLeaveGuard(dirty, cache ? undefined : () => confirm("有未保存修改，放弃这些修改？"));
  return {
    base,
    draft,
    dirty,
    message,
    setDraft,
    change: (key: string, value: any) => {
      setDraft((d) => ({ ...d, [key]: value }));
      setMessage("");
    },
    saved: (data: Data) => {
      // One copy, so later changes the host makes to its own object cannot reach the editor.
      const value = clone(data);
      setBase(value);
      setDraft(value);
      setMessage("已保存");
    },
    reset: () => {
      setDraft(base);
      setMessage("");
    },
    /** Records a change already applied outside the draft (a live setting) on both sides. */
    patch: (key: string, base: any, draft = base) => {
      const saved = clone(base),
        edited = draft === base ? saved : clone(draft);
      setBase((b) => ({ ...b, [key]: saved }));
      setDraft((d) => ({ ...d, [key]: edited }));
    },
  };
}
const restoreDraft = (host: HostAdapter, key: string) => {
  const cached = unsavedDraft(host, key);
  return { key, base: cached?.base ?? null, draft: cached?.draft ?? null };
};
/**
 * useDraft for data read asynchronously. A key reopens on its unsaved draft (`unsavedDraft` gives the
 * editor the `extra` cached with it); a clean one is read again, and once more whenever `version`
 * moves. `extra` is the editor state to cache beside a draft; `edited` marks unsaved work that lives
 * only in that state.
 */
export function useAsyncDraft({
  host,
  key,
  load,
  version,
  extra,
  edited = false,
  onLoad,
  onError,
}: {
  host: HostAdapter;
  key: string;
  /** Null while there is nothing to read. */
  load: (() => Promise<Data>) | null;
  version: number;
  extra?: (draft: Data) => Data;
  edited?: boolean;
  onLoad?: (data: Data) => void;
  onError?: (message: string) => void;
}) {
  const [state, setState] = useState(() => restoreDraft(host, key));
  let current = state;
  if (current.key !== key) setState((current = restoreDraft(host, key)));
  const { base, draft } = current;
  const changed = useMemo(() => !!base && !!draft && !sameData(base, draft), [base, draft]),
    dirty = changed || (edited && !!draft);
  useDraftCache({ host, key }, base, draft, extra);
  useLeaveGuard(dirty);
  /** What base was read at. A null version follows a save, whose own change event is no news. */
  const loaded = useRef<{ key: string; version: number | null } | null>(null),
    latest = useRef({ load, onLoad, onError });
  latest.current = { load, onLoad, onError };
  useEffect(() => {
    if (dirty || !latest.current.load) return;
    const last = loaded.current;
    if (last?.key === key && (last.version === null || last.version === version)) {
      loaded.current = { key, version };
      return;
    }
    let live = true;
    latest.current.load().then(
      (data) => {
        if (!live) return;
        loaded.current = { key, version };
        setState({ key, base: data, draft: data });
        latest.current.onLoad?.(data);
      },
      (e) => {
        if (live) latest.current.onError?.(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [key, version, dirty]);
  const setDraft = useCallback(
    (next: Data | ((draft: Data) => Data)) =>
      setState((s) => (s.draft ? { ...s, draft: typeof next === "function" ? next(s.draft) : next } : s)),
    [],
  );
  return {
    base,
    draft,
    dirty,
    setDraft,
    /** Takes data the host has just saved as the new base. */
    saved: (data: Data) => {
      loaded.current = { key, version: null };
      setState({ key, base: data, draft: data });
    },
    reset: () => setState((s) => ({ ...s, draft: s.base })),
  };
}
