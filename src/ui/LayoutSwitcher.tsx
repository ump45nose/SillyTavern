import React, { useState } from "react";
import { BookOpen, PanelsTopLeft, Theater } from "lucide-react";

export type LayoutMode = "novel" | "rp" | "native";
const modes = [
  { id: "novel", name: "Noval", detail: "阅读工作台", Icon: BookOpen },
  { id: "rp", name: "RP", detail: "角色聊天与立绘", Icon: Theater },
  { id: "native", name: "原生", detail: "酒馆原版", Icon: PanelsTopLeft },
] as const;

/**
 * Stays mounted independently of the workbench so native mode has the same entry.
 * A segmented control: every mode is one press away, and only the current one spells out its name.
 */
export function LayoutSwitcher({
  mode,
  onChange,
}: {
  mode: LayoutMode;
  onChange: (mode: LayoutMode) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const choose = async (next: LayoutMode) => {
    if (busy || next === mode) return;
    setBusy(true);
    setError("");
    try {
      await onChange(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`wb-layout-switcher wb-ui ${mode === "rp" ? "is-rp" : ""}`}>
      <div
        className="wb-layout-controls"
        role="radiogroup"
        aria-label="切换工作台"
        aria-busy={busy || undefined}
        onKeyDown={(event) => {
          const step =
            event.key === "ArrowRight" || event.key === "ArrowDown"
              ? 1
              : event.key === "ArrowLeft" || event.key === "ArrowUp"
                ? -1
                : 0;
          if (!step) return;
          event.preventDefault();
          const group = event.currentTarget,
            index = modes.findIndex((item) => item.id === mode),
            next = modes[(index + step + modes.length) % modes.length];
          void choose(next.id).then(() =>
            group.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus({ preventScroll: true }),
          );
        }}
      >
        {modes.map(({ id, name, detail, Icon }) => (
          <button
            key={id}
            role="radio"
            className="wb-layout-segment"
            aria-checked={mode === id}
            aria-label={name}
            title={`${name} · ${detail}`}
            tabIndex={mode === id ? 0 : -1}
            disabled={busy && mode !== id}
            onClick={() => void choose(id)}
          >
            <Icon size={16} />
            {mode === id && <span>{name}</span>}
          </button>
        ))}
      </div>
      {error && (
        <p className="wb-layout-error" role="alert" onClick={() => setError("")}>
          {error}
        </p>
      )}
    </div>
  );
}
