import React from "react";
import { guards } from "../host/bus";
import { SearchBox } from "./common";
import { toggleIds } from "./lists";

/**
 * The list column of a settings manager page: title and actions, search, then rows that open in the
 * editor beside it. Moving to another row keeps the open editor's drafts, once the leave guards agree.
 */
export function ManagerList<T extends { id: string; name: string }>({
  title,
  actions,
  toolbar,
  search,
  filters,
  sections,
  editing,
  onEdit,
  selection,
  disabled = false,
  rowClassName,
  rowLabel,
  row,
  empty,
  footer,
}: {
  title: string;
  actions?: React.ReactNode;
  /** Above the search box, e.g. the batch toolbar. */
  toolbar?: React.ReactNode;
  search: React.ComponentProps<typeof SearchBox>;
  /** Between the search box and the list, e.g. the archive shelves. */
  filters?: React.ReactNode;
  sections: { key: string; header?: React.ReactNode; items: T[] }[];
  editing: string;
  onEdit: (id: string) => void;
  /** Gives every row a checkbox. */
  selection?: { ids: string[]; onChange: (ids: string[]) => void };
  disabled?: boolean;
  rowClassName?: string;
  rowLabel?: (item: T) => string;
  /** The row button's content. */
  row: (item: T) => React.ReactNode;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const open = (id: string) => {
    if (guards.check({ preserveDrafts: true })) onEdit(id);
  };
  return (
    <aside className="wb-manager-resources">
      <header className="wb-manager-head">
        <h3>{title}</h3>
        <span className="wb-grow" />
        {actions}
      </header>
      {toolbar}
      <SearchBox {...search} />
      {filters}
      <div className="wb-manager-list">
        {sections.map((section) => (
          <div className="wb-manager-section" key={section.key}>
            {section.header}
            {section.items.map((item) => {
              const picked = !!selection?.ids.includes(item.id);
              return (
                <div
                  key={item.id}
                  className={[
                    "wb-manager-row",
                    rowClassName,
                    editing === item.id && "is-editing",
                    picked && "is-selected",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {selection && (
                    <label>
                      <input
                        type="checkbox"
                        aria-label={`选择 ${item.name}`}
                        checked={picked}
                        disabled={disabled}
                        onChange={(e) =>
                          selection.onChange(toggleIds(selection.ids, [item.id], e.target.checked))
                        }
                      />
                    </label>
                  )}
                  <button
                    aria-label={rowLabel?.(item)}
                    aria-pressed={editing === item.id}
                    disabled={disabled}
                    onClick={() => open(item.id)}
                  >
                    {row(item)}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        {empty}
      </div>
      {footer}
    </aside>
  );
}
