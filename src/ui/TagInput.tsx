import React, { useState } from "react";
import { X } from "./icons";
import { addTags, splitTags } from "./tags";

const SEPARATORS = [",", "，"];
/**
 * Chips for a list of short texts and a field that adds more. A separator, Enter or leaving the field
 * adds what was typed, once; Backspace in the empty field removes the last chip. Renders no wrapper,
 * so the caller's container lays out the chips and the field.
 */
export function TagInput({
  values,
  onChange,
  separators = SEPARATORS,
  label,
  inputLabel = `添加${label}`,
  placeholder,
  chipClassName,
  inputClassName,
  collapsed = false,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  /** Single characters that end an item as they are typed. */
  separators?: readonly string[];
  /** What one item is called, for the remove buttons' labels. */
  label: string;
  inputLabel?: string;
  placeholder?: string;
  chipClassName?: string;
  inputClassName?: string;
  /** The field stays behind a “+ 添加” button until pressed and goes back when focus leaves or on Escape. */
  collapsed?: boolean;
}) {
  const [text, setText] = useState(""),
    [open, setOpen] = useState(!collapsed);
  const add = (items: string[]) => {
    const next = addTags(values, items);
    if (next !== values) onChange(next);
  };
  return (
    <>
      {values.map((value, i) => (
        <span className={chipClassName} key={i + ":" + value}>
          {value}
          <button
            aria-label={`移除${label} ${value}`}
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      {open ? (
        <input
          className={inputClassName}
          aria-label={inputLabel}
          placeholder={placeholder}
          autoFocus={collapsed}
          value={text}
          size={Math.max(4, text.length + 1)}
          onChange={(e) => {
            const { items, rest } = splitTags(e.target.value, separators);
            add(items);
            setText(rest);
          }}
          onBlur={() => {
            add([text]);
            setText("");
            if (collapsed) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              add([text]);
              setText("");
            } else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
            else if (e.key === "Escape" && collapsed) {
              setText("");
              setOpen(false);
            }
          }}
        />
      ) : (
        <button className="wb-key-add" onClick={() => setOpen(true)}>
          + 添加
        </button>
      )}
    </>
  );
}
