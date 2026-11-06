import { useState } from "react";
import { X } from "../../ui/icons";
/** Keyword chips with an inline add field (Enter adds, Backspace on empty removes the last). */
export function KeyChips({
  label,
  keys,
  onChange,
}: {
  label: string;
  keys: string[];
  onChange: (keys: string[]) => void;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const value = text.trim();
    if (value && !keys.includes(value)) onChange([...keys, value]);
    setText("");
  };
  return (
    <div className="wb-wt-keychips">
      <span>{label}</span>
      <div>
        {keys.map((k, i) => (
          <span className="wb-key" key={k + i}>
            {k}
            <button aria-label={`移除${label} ${k}`} onClick={() => onChange(keys.filter((_, j) => j !== i))}>
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          aria-label={`添加${label}`}
          placeholder="+ 添加"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !text && keys.length) onChange(keys.slice(0, -1));
          }}
        />
      </div>
    </div>
  );
}
