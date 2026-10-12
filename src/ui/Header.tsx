import React, { useEffect, useRef } from "react";
import {
  BookMarked,
  Activity,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Plug,
  ScanLine,
  SlidersHorizontal,
  UserRound,
  X,
} from "./icons";
import { createPortal } from "react-dom";
import type { HostSnapshot, Panel, Resource } from "../host/types";
import { Empty, IconButton } from "./common";
import { usePresence } from "./Motion";
export const resourceLabels = { connection: "连接", preset: "预设", world: "世界书", persona: "用户设定" };
const icons = { preset: SlidersHorizontal, world: BookMarked, persona: UserRound };
const pillIcons = { connection: Plug, ...icons };
/** The popover's way into the full panel, named after what the panel lets you do there. */
const manageLabels: Record<Resource, string> = {
  connection: "管理连接",
  preset: "打开预设",
  world: "打开世界书",
  persona: "打开用户设定",
};
export function Header({
  snap,
  panel,
  chooser,
  setChooser,
  goPanel,
  next,
  select,
  model,
  focus,
  focused,
  focusShortcut,
  actions,
}: {
  snap: HostSnapshot;
  panel: Panel;
  chooser: Resource | null;
  setChooser: (value: Resource | null) => void;
  goPanel: (panel: Panel, id?: string) => void;
  next: (kind: Resource) => void;
  select: (kind: Resource, id: string, enabled: boolean) => void;
  model: string;
  focus: () => void;
  focused: boolean;
  focusShortcut: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="wb-top">
      <button
        className="wb-top-identity"
        aria-label={`打开角色面板：${snap.character?.name || "选择角色"}`}
        aria-pressed={panel === "character"}
        onClick={() => goPanel(panel === "character" ? null : "character")}
        title={snap.character?.name || "选择角色"}
      >
        <span className="wb-top-avatar">
          {snap.character?.image ? <img src={snap.character.image} alt="" /> : <span>N</span>}
        </span>
        <strong>{snap.groupName || snap.character?.name || "选择角色"}</strong>
      </button>
      <ResourcePills
        snap={snap}
        panel={panel}
        chooser={chooser}
        setChooser={setChooser}
        goPanel={goPanel}
        select={select}
        model={model}
      />
      <div className="wb-top-tools">
        <button
          className="wb-top-tool"
          title="Trace"
          aria-label="Trace"
          aria-pressed={panel === "trace"}
          onClick={() => goPanel(panel === "trace" ? null : "trace")}
        >
          <Activity size={18} />
        </button>
        {actions ?? (
          <button
            className="wb-top-tool wb-focus-toggle"
            title={`专注模式${focusShortcut ? " · " + focusShortcut : ""}`}
            aria-label="专注模式"
            aria-pressed={focused}
            onClick={focus}
          >
            <ScanLine size={18} />
          </button>
        )}
        {/* The layout switcher is mounted on its own (it also serves the native page) and sits here. */}
        <span className="wb-top-switcher-space" aria-hidden="true" />
      </div>
    </header>
  );
}

/** Desktop resource pills: one press opens a short list to switch; the footer leads to the panel. */
function ResourcePills({
  snap,
  panel,
  chooser,
  setChooser,
  goPanel,
  select,
  model,
}: Pick<
  Parameters<typeof Header>[0],
  "snap" | "panel" | "chooser" | "setChooser" | "goPanel" | "select" | "model"
>) {
  const presence = usePresence(chooser);
  const last = useRef<Resource | null>(null);
  // Keyboard users land on the current choice; closing returns them to the pill they came from.
  useEffect(() => {
    const previous = last.current;
    last.current = chooser;
    if (chooser) {
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLInputElement>(
            `#wb-choices-${chooser} input:checked, #wb-choices-${chooser} input`,
          )
          ?.focus({ preventScroll: true }),
      );
    } else if (
      previous &&
      (!document.activeElement ||
        document.activeElement === document.body ||
        document.activeElement.closest(".wb-pill-pop"))
    )
      document.querySelector<HTMLButtonElement>(`.wb-pill[aria-controls="wb-choices-${previous}"]`)?.focus();
  }, [chooser]);
  useEffect(() => {
    if (!chooser) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target as Element)?.closest?.(".wb-pill-slot")) setChooser(null);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [chooser]);
  return (
    <nav className="wb-top-pills" aria-label="当前资源">
      {(Object.keys(resourceLabels) as Resource[]).map((kind) => {
        const items = snap.resources[kind],
          selected = items.find((x) => x.id === snap.current[kind]);
        const Icon = pillIcons[kind];
        const value = selected?.name || (kind === "connection" ? model || "未连接" : "未选择");
        const active = items.filter((x) => x.active);
        const count = kind === "world" ? active.length : 0;
        const shown = kind === "world" ? active[0]?.name || "未启用" : value;
        const open = presence.value === kind;
        return (
          <div className="wb-pill-slot" key={kind}>
            <button
              className="wb-pill"
              aria-label={`${resourceLabels[kind]}：${shown}${count > 1 ? ` 等 ${count} 本` : ""}`}
              title={`${resourceLabels[kind]}：${shown}`}
              aria-expanded={chooser === kind}
              aria-controls={`wb-choices-${kind}`}
              aria-current={panel === kind ? "true" : undefined}
              onClick={() => setChooser(chooser === kind ? null : kind)}
            >
              <span className="wb-pill-icon">
                <Icon size={16} />
                {kind === "connection" && <i className={`wb-pill-dot ${snap.online ? "is-online" : ""}`} />}
              </span>
              <span className="wb-pill-value" key={shown + count}>
                {shown}
              </span>
              {count > 1 && <span className="wb-pill-extra">+{count - 1}</span>}
              <ChevronDown size={14} className="wb-pill-caret" />
            </button>
            {open && (
              <div
                className="wb-pill-pop"
                id={`wb-choices-${kind}`}
                role="dialog"
                aria-label={`${resourceLabels[kind]}选择`}
                inert={presence.exiting}
                data-wb-exiting={presence.exiting || undefined}
              >
                <div className="wb-pill-pop-head">
                  <strong>{kind === "connection" ? "连接配置" : resourceLabels[kind]}</strong>
                  <small>
                    {kind === "world" ? `已启用 ${count} · 共 ${items.length} 本` : `${items.length} 个`}
                  </small>
                </div>
                <ul className="wb-pill-pop-list">
                  {items.map((item) => {
                    const on = kind === "world" ? !!item.active : item.id === snap.current[kind];
                    return (
                      <li key={item.id} className={on ? "is-on" : ""}>
                        <label>
                          <input
                            type={kind === "world" ? "checkbox" : "radio"}
                            name={`wb-pill-${kind}`}
                            aria-label={`${kind === "world" ? "启用" : "选择"} ${item.name}`}
                            checked={on}
                            disabled={snap.busy}
                            onChange={(e) => select(kind, item.id, e.target.checked)}
                          />
                          <span
                            className={`wb-pill-mark ${kind === "world" ? "is-check" : ""}`}
                            aria-hidden="true"
                          >
                            <Check size={12} strokeWidth={3} />
                          </span>
                          <span className="wb-pill-pop-copy">
                            <strong>{item.name}</strong>
                            {item.detail && <small>{item.detail}</small>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {!items.length && <Empty>暂无配置</Empty>}
                <div className="wb-pill-pop-foot">
                  <button onClick={() => goPanel(kind)}>
                    {manageLabels[kind]}
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/** Both desktop and PWA configuration rows share the same resource actions and selection UI. */
export function ResourceControls({
  snap,
  panel,
  chooser,
  setChooser,
  goPanel,
  next,
  select,
  model,
  mobile = false,
}: Pick<
  Parameters<typeof Header>[0],
  "snap" | "panel" | "chooser" | "setChooser" | "goPanel" | "next" | "select" | "model"
> & { mobile?: boolean }) {
  const presence = usePresence(chooser);
  const overlay = (children: React.ReactNode) =>
    mobile
      ? createPortal(<div className="wb-ui wb-mobile-resource-popup">{children}</div>, document.body)
      : children;
  return (
    <div className="wb-contexts">
      {(Object.keys(resourceLabels) as Resource[]).map((kind) => {
        const items = snap.resources[kind],
          selected = items.find((x) => x.id === snap.current[kind]);
        const Icon = kind === "connection" ? null : icons[kind];
        const value = selected?.name || (kind === "connection" ? model : "未选择");
        const count = kind === "world" ? items.filter((x) => x.active).length : 0;
        return (
          <div className={`wb-selector ${panel === kind || chooser === kind ? "is-active" : ""}`} key={kind}>
            <button
              className="wb-selector-detail"
              title={`${resourceLabels[kind]}详情`}
              aria-label={`${resourceLabels[kind]}详情`}
              onClick={() => goPanel(kind)}
            >
              {Icon ? <Icon size={17} /> : <span className={`wb-dot ${snap.online ? "online" : ""}`} />}
            </button>
            <button
              className="wb-selector-value"
              title={`${resourceLabels[kind]}：${value}`}
              aria-expanded={chooser === kind}
              aria-controls={`wb-choices-${kind}`}
              onClick={() => setChooser(chooser === kind ? null : kind)}
            >
              <span key={value + count} className="wb-value-text">
                {value}
                {count > 1 ? ` +${count - 1}` : ""}
              </span>
              <ChevronDown size={13} />
            </button>
            <IconButton
              title={`下一个${resourceLabels[kind]}`}
              disabled={snap.busy}
              onClick={() => next(kind)}
            >
              <ChevronRight size={16} />
            </IconButton>
            {presence.value === kind &&
              overlay(
                <>
                  <button
                    className="wb-pop-dismiss"
                    aria-label="关闭选择框"
                    onClick={() => setChooser(null)}
                  />
                  <div
                    className="wb-popover"
                    role={mobile ? "dialog" : undefined}
                    aria-label={mobile ? `${resourceLabels[kind]}选择` : undefined}
                    inert={presence.exiting}
                    data-wb-exiting={presence.exiting || undefined}
                    id={`wb-choices-${kind}`}
                  >
                    <div className="wb-section-title">
                      {resourceLabels[kind]}
                      <small>选择 · 查看详情</small>
                      {mobile && (
                        <button
                          className="wb-icon"
                          aria-label="关闭资源选择"
                          onClick={() => setChooser(null)}
                        >
                          <X size={18} />
                        </button>
                      )}
                    </div>
                    {items.map((item) => (
                      <div
                        className={`wb-quick-row ${(kind === "world" ? item.active : item.id === snap.current[kind]) ? "is-active" : ""}`}
                        key={item.id}
                      >
                        <input
                          type="checkbox"
                          aria-label={`${kind === "world" ? "启用" : "选择"} ${item.name}`}
                          checked={kind === "world" ? !!item.active : item.id === snap.current[kind]}
                          disabled={snap.busy}
                          onChange={(e) => select(kind, item.id, e.target.checked)}
                        />
                        <button onClick={() => goPanel(kind, item.id)}>
                          <strong>{item.name}</strong>
                          {item.detail && <small>{item.detail}</small>}
                        </button>
                        <IconButton title={`查看 ${item.name} 详情`} onClick={() => goPanel(kind, item.id)}>
                          <ChevronRight size={15} />
                        </IconButton>
                      </div>
                    ))}
                    {!items.length && <Empty>暂无配置</Empty>}
                    <button className="wb-link" onClick={() => goPanel(kind)}>
                      查看全部与编辑 <ChevronRight size={14} />
                    </button>
                  </div>
                </>,
              )}
          </div>
        );
      })}
    </div>
  );
}
