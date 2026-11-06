import { Select } from "../../ui/Select";
import { memo } from "react";
import { activation } from "../../host/model";
import type { Data } from "../../host/types";
import type { EntryActions } from "./shared";
/** One entry in the sidebar list; an edit elsewhere in the book leaves it untouched. */
export const EntryItem = memo(function EntryItem({
  id,
  entry: e,
  selected,
  locked,
  onToggle,
  onMode,
  onOpen,
}: EntryActions & {
  id: string;
  entry: Data;
  selected: boolean;
  locked: boolean;
  onMode: (id: string, mode: string) => void;
}) {
  const mode = activation(e),
    title = e.comment || `条目 ${id}`;
  return (
    <li className={`wb-entry mode-${mode} ${selected ? "is-selected" : ""} ${e.disable ? "is-off" : ""}`}>
      <input
        type="checkbox"
        aria-label={`启用条目 ${title}`}
        disabled={locked}
        checked={!e.disable}
        onChange={(v) => onToggle(id, v.target.checked)}
      />
      <span className="wb-entry-mode">
        <Select
          aria-label={`${title} 激活方式`}
          title="关键词 / 常驻 / 向量化"
          disabled={locked}
          value={mode}
          onChange={(v) => onMode(id, v.target.value)}
        >
          <option value="keyword">关键词</option>
          <option value="constant">常驻</option>
          <option value="vector">向量化</option>
        </Select>
      </span>
      <button
        className="wb-entry-open"
        aria-label={`编辑条目 ${title}`}
        aria-pressed={selected}
        onClick={() => onOpen(id)}
      >
        <strong>{title}</strong>
        <small>
          {mode === "constant"
            ? "始终注入"
            : mode === "vector"
              ? "语义匹配"
              : (e.key ?? []).join("、") || "未设置关键词"}
        </small>
      </button>
    </li>
  );
});
