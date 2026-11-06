import { memo } from "react";
import { activation } from "../../host/model";
import type { Data } from "../../host/types";
import { positions, modeName, type EntryActions } from "./shared";
/** One row of the deep editor's entry table. */
export const EntryRow = memo(function EntryRow({
  id,
  entry: e,
  open,
  tokens,
  onToggle,
  onOpen,
}: EntryActions & { id: string; entry: Data; open: boolean; tokens?: number }) {
  const mode = activation(e);
  return (
    <div
      role="row"
      className={`wb-wt-row is-${mode} ${open ? "is-open" : ""} ${e.disable ? "is-disabled" : ""}`}
      onClick={(v) => {
        if (!(v.target as HTMLElement).closest("input, button")) onOpen(open ? "" : id);
      }}
    >
      <span role="cell">
        <input
          type="checkbox"
          aria-label={`启用条目 ${e.comment || id}`}
          checked={!e.disable}
          onChange={(v) => onToggle(id, v.target.checked)}
        />
        <i title={modeName[mode]} />
      </span>
      <span role="cell">
        <button className="wb-wt-open" aria-expanded={open} onClick={() => onOpen(open ? "" : id)}>
          {e.comment || `条目 ${id}`}
        </button>
      </span>
      <span role="cell" className="wb-wt-keys">
        {mode === "constant" ? "—" : mode === "vector" ? "向量匹配" : (e.key ?? []).join(", ") || "—"}
      </span>
      <span role="cell">{positions[e.position ?? 0]}</span>
      <span role="cell" className="is-num">
        {(e.position ?? 0) === 4 ? (e.depth ?? 4) : "—"}
      </span>
      <span role="cell" className="is-num">
        {e.order ?? 0}
      </span>
      <span role="cell" className="is-num">
        {tokens ?? ""}
      </span>
    </div>
  );
});
