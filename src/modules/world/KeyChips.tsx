import { TagInput } from "../../ui/TagInput";
/** A labelled keyword list for the trigger tab. */
export function KeyChips({
  label,
  keys,
  onChange,
}: {
  label: string;
  keys: string[];
  onChange: (keys: string[]) => void;
}) {
  return (
    <div className="wb-wt-keychips">
      <span>{label}</span>
      <div>
        <TagInput
          label={label}
          values={keys}
          onChange={onChange}
          chipClassName="wb-key"
          placeholder="+ 添加"
        />
      </div>
    </div>
  );
}
