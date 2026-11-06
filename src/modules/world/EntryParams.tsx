import { Select } from "../../ui/Select";
import { Field } from "../../ui/common";
import type { Data } from "../../host/types";
import { DEFAULT_DEPTH, positions } from "./shared";

/**
 * Number settings in display order. `compact` names the ones the short form keeps, under that label;
 * `fallback` is what shows while the entry has no value.
 */
const numbers: { key: string; label: string; compact?: string; max?: number; fallback?: number }[] = [
  { key: "depth", label: "深度", compact: "深度", fallback: DEFAULT_DEPTH },
  { key: "order", label: "顺序", compact: "顺序" },
  { key: "probability", label: "概率 %", compact: "触发概率 %", max: 100 },
  { key: "scanDepth", label: "扫描深度" },
  { key: "sticky", label: "粘性" },
  { key: "cooldown", label: "冷却" },
  { key: "delay", label: "延迟" },
  { key: "recursionStep", label: "递归步数" },
  { key: "groupWeight", label: "组权重" },
];
const flags = [
  ["useProbability", "启用概率"],
  ["excludeRecursion", "排除递归"],
  ["preventRecursion", "阻止后续递归"],
  ["delayUntilRecursion", "仅递归时触发"],
  ["matchWholeWords", "匹配完整单词"],
  ["caseSensitive", "区分大小写"],
  ["useGroupScoring", "分组评分"],
  ["groupOverride", "覆盖包含组"],
];
/** An entry's injection settings: all of them for the deep editor, or position and three numbers. */
export function EntryParams({
  entry,
  onChange,
  compact = false,
}: {
  entry: Data;
  onChange: (patch: Data) => void;
  compact?: boolean;
}) {
  const position = (
    <Select value={entry.position ?? 0} onChange={(e) => onChange({ position: Number(e.target.value) })}>
      {positions.map((v, i) => (
        <option key={v} value={i}>
          {v}
        </option>
      ))}
    </Select>
  );
  const number = ({ key, max, fallback = 0 }: (typeof numbers)[number]) => (
    <input
      type="number"
      min={0}
      max={max}
      value={entry[key] ?? fallback}
      onChange={(e) => onChange({ [key]: Number(e.target.value) })}
    />
  );
  if (compact)
    return (
      <div className="wb-entry-params">
        <label>
          注入位置
          {position}
        </label>
        {numbers.map(
          (field) =>
            field.compact && (
              <label key={field.key}>
                {field.compact}
                {number(field)}
              </label>
            ),
        )}
      </div>
    );
  return (
    <aside className="wb-wt-params" aria-label="注入参数">
      <h4>注入参数</h4>
      <div className="wb-wt-param-grid">
        <Field label="注入位置">{position}</Field>
        {numbers.map((field) => (
          <Field label={field.label} key={field.key}>
            {number(field)}
          </Field>
        ))}
        <Field label="包含组">
          <input value={entry.group ?? ""} onChange={(e) => onChange({ group: e.target.value })} />
        </Field>
      </div>
      <div className="wb-wt-flags">
        {flags.map(([key, label]) => (
          <label className="wb-check" key={key}>
            <input
              type="checkbox"
              checked={!!entry[key]}
              onChange={(e) => onChange({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
    </aside>
  );
}
