import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Save } from "lucide-react";
import type { HostAdapter } from "../host/adapter";
import type { Data } from "../host/types";
import { clone, mergeEdits } from "../host/model";
import { guards } from "../host/bus";
export function Fold({
  title,
  children,
  initial = false,
  toolbar,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  initial?: boolean;
  toolbar?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(initial);
  const toggle = (
    <button
      className={`wb-fold-toggle ${icon ? "wb-icon" : ""}`}
      title={title}
      aria-label={title}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
    >
      {icon || (
        <>
          {title}
          <ChevronDown size={15} className={open ? "is-rotated" : ""} />
        </>
      )}
    </button>
  );
  return (
    <section className="wb-resource-fold">
      {toolbar ? (
        <div className="wb-fold-toolbar">
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
export function NativeConnection({ host }: { host: HostAdapter }) {
  const ref = useRef<HTMLDivElement>(null),
    [error, setError] = useState("");
  useEffect(() => {
    try {
      return host.leaseConnection(ref.current!);
    } catch (e) {
      setError(String(e));
    }
  }, [host]);
  return (
    <>
      <p className="wb-native-caption">当前运行连接</p>
      {error && <p role="alert">{error}</p>}
      <div ref={ref} className="wb-native-slot" />
    </>
  );
}
const saveHint = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘S" : "Ctrl+S";
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
}: {
  dirty: boolean;
  busy: boolean;
  message?: string;
  reset: () => void;
  save: () => void;
  label?: string;
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
    const scope = ref.current?.parentElement;
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
    <footer ref={ref} className="wb-save-footer">
      <small role="status">{dirty ? "未保存的修改" : flash}</small>
      <span className="wb-grow" />
      {dirty && (
        <>
          <button disabled={busy} onClick={reset}>
            还原
          </button>
          <button className="wb-primary" disabled={busy} title={`${label} · ${saveHint}`} onClick={save}>
            <Save size={15} />
            {label}
          </button>
        </>
      )}
    </footer>
  );
}
export function useDraft(
  read: () => Data,
  version: number,
  cache?: { host: HostAdapter; key: string },
  /** Fold outside changes into a dirty draft instead of waiting for it to be saved or reverted. */
  rebase = false,
) {
  const previous = cache?.host.drafts.get(cache.key),
    retain = previous && JSON.stringify(previous.base) !== JSON.stringify(previous.draft);
  const [base, setBase] = useState(() => (retain ? clone(previous.base) : read())),
    [draft, setDraft] = useState(() => (retain ? clone(previous.draft) : clone(base))),
    [message, setMessage] = useState("");
  const dirty = JSON.stringify(base) !== JSON.stringify(draft);
  useLayoutEffect(() => {
    if (cache)
      cache.host.drafts.set(cache.key, {
        base: clone(base),
        draft: clone(draft),
        extra: cache.host.drafts.get(cache.key)?.extra,
      });
  }, [base, draft, cache?.key]);
  useEffect(() => {
    if (!dirty) {
      const value = read();
      setBase(value);
      setDraft(clone(value));
    } else if (rebase)
      try {
        const value = read();
        if (JSON.stringify(value) === JSON.stringify(base)) return;
        setDraft(mergeEdits(base, draft, value));
        setBase(value);
      } catch {
        // Both sides changed the same field: keep the draft; saving reports the conflict.
      }
  }, [version]);
  useEffect(() => {
    const guard = () => !!cache || !dirty || confirm("有未保存修改，放弃这些修改？");
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const off = guards.add(guard);
    window.addEventListener("beforeunload", unload);
    return () => {
      off();
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty]);
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
      setBase(clone(data));
      setDraft(clone(data));
      setMessage("已保存");
    },
    reset: () => {
      setDraft(clone(base));
      setMessage("");
    },
    /** Records a change already applied outside the draft (a live setting) on both sides. */
    patch: (key: string, base: any, draft = base) => {
      setBase((b) => ({ ...b, [key]: clone(base) }));
      setDraft((d) => ({ ...d, [key]: clone(draft) }));
    },
  };
}
