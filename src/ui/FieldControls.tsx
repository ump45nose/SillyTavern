import React from "react";
import type { RangeField } from "./readingFields";

/**
 * Mutually exclusive choices. With a label they form a radiogroup, the board's segmented control;
 * without one they are pressed-state buttons under a caption of their own.
 */
export function Segmented<T extends string>({
  label,
  className,
  options,
  order,
  value,
  onChange,
}: {
  label?: string;
  className: string;
  options: readonly (readonly [T, string])[];
  /** The keys as shown, when the order differs from `options`. */
  order?: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  const shown = order ? order.map((key) => options.find(([k]) => k === key)!) : options;
  return (
    <div className={className} role={label ? "radiogroup" : undefined} aria-label={label}>
      {shown.map(([key, text]) => (
        <button
          key={key}
          role={label ? "radio" : undefined}
          aria-checked={label ? value === key : undefined}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** A slider with its value beside it; `captioned` puts the field's label over it, as popovers do. */
export function Range({
  field,
  label,
  value,
  captioned = false,
  onChange,
}: {
  field: Omit<RangeField, "fallback">;
  label: string;
  value: number;
  captioned?: boolean;
  onChange: (value: number) => void;
}) {
  const { min, max } = field;
  const input = (
    <input
      aria-label={label}
      type="range"
      min={min}
      max={max}
      step={field.step}
      value={value}
      style={{ "--wb-fill": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
  const output = (
    <output>
      {value}
      {field.suffix}
    </output>
  );
  return captioned ? (
    <label className="wb-field">
      <span>
        {field.label}
        {output}
      </span>
      {input}
    </label>
  ) : (
    <div className="wb-reading-range">
      {input}
      {output}
    </div>
  );
}
