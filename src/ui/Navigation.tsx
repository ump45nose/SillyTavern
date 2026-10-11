import React, { useEffect, useState } from "react";
import {
  ChevronDown,
  Ellipsis,
  FolderOpen,
  History,
  Keyboard,
  Layers,
  ListTree,
  MessageSquarePlus,
  PencilLine,
  Settings,
  UsersRound,
} from "lucide-react";
import type { HostAdapter } from "../host/adapter";
import type { Data, HostSnapshot, SettingsPage } from "../host/types";
import AddonWorkspace from "./AddonWorkspace";
import { useHostSlice } from "./common";
import { settingsLabels } from "../host/labels";
import { addonEnabled } from "../addons/catalog";
import type { ComposerPopup } from "./ComposerPopovers";
type Section = "history" | "outline" | "floors";
const RECENT_FLOORS = 5;

/**
 * The left column of the desk: the open conversation on its own card, then three sections that
 * fold independently, and a short footer into settings. Everything else lives in the settings page.
 */
export function Navigation({
  host,
  snap,
  visible,
  settings,
  open,
  help,
  run,
}: {
  host: HostAdapter;
  snap: HostSnapshot;
  visible: boolean;
  settings: (page: SettingsPage, group?: string) => void;
  open: (popup: ComposerPopup) => void;
  help: () => void;
  run: (fn: () => unknown) => unknown;
}) {
  const messages = useHostSlice(host, "chat");
  const outlineEnabled = addonEnabled(host.prefs(), "outline");
  const [expanded, setExpanded] = useState<Record<Section, boolean>>({
      history: false,
      // Closed at start so the outline add-on (and its stylesheet) loads only when asked for.
      outline: false,
      floors: true,
    }),
    [allFloors, setAllFloors] = useState(false),
    [recent, setRecent] = useState<Data[] | null>(null);
  const toggle = (section: Section) =>
    setExpanded((current) => ({ ...current, [section]: !current[section] }));
  const hasChat = !!snap.character || !!snap.groupId;
  useEffect(() => {
    if (!visible || !hasChat) return;
    let active = true;
    host
      .recentChats()
      .then((chats) => {
        if (active) setRecent(chats);
      })
      .catch((e) => {
        if (active) host.report(e);
      });
    return () => {
      active = false;
    };
  }, [host, visible, hasChat, snap.chatName, snap.character?.id, snap.groupId, host.chatsVersion]);
  const others = (recent || []).filter((c) => String(c.file_name).replace(/\.jsonl$/, "") !== snap.chatName);
  const floors = allFloors ? messages : messages.slice(-RECENT_FLOORS);
  return (
    <aside
      className={`wb-left wb-nav ${visible ? "is-open" : ""}`}
      aria-label="创作导航"
      inert={!visible}
      aria-hidden={!visible}
    >
      <section className="wb-nav-card" aria-label="当前对话">
        <div className="wb-nav-card-head">
          <span className="wb-nav-card-status">
            <i className={snap.chatName ? "is-live" : ""} />
            当前对话
          </span>
          <div className="wb-nav-card-tools">
            <button
              className="wb-nav-icon"
              disabled={snap.busy || !hasChat}
              aria-label="开始新对话"
              title="开始新对话"
              onClick={() => run(() => host.newChat())}
            >
              <MessageSquarePlus size={16} />
            </button>
            <button
              className="wb-nav-icon"
              aria-label="管理聊天文件"
              title="管理聊天文件"
              disabled={!hasChat}
              onClick={(e) => open({ kind: "files", anchor: e.currentTarget })}
            >
              <FolderOpen size={16} />
            </button>
            <button
              className="wb-nav-icon"
              aria-label="聊天管理操作"
              title="更多对话操作"
              aria-expanded="false"
              onClick={(e) => open({ kind: "chat", anchor: e.currentTarget })}
            >
              <Ellipsis size={16} />
            </button>
          </div>
        </div>
        <div className="wb-nav-card-title">
          <strong title={snap.chatName}>{snap.chatName || "还没有打开的对话"}</strong>
          {snap.chatName && (
            <button
              className="wb-nav-icon is-small"
              aria-label="重命名对话"
              title="重命名对话"
              disabled={snap.busy}
              onClick={(e) => open({ kind: "rename", anchor: e.currentTarget })}
            >
              <PencilLine size={13} />
            </button>
          )}
        </div>
        <small className="wb-nav-card-meta">
          {snap.groupName || snap.character?.name || "请选择角色"} · {messages.length} 层
        </small>
      </section>

      <div className="wb-nav-sections">
        <NavSection
          id="history"
          icon={<History size={16} />}
          label="历史对话"
          count={recent ? String(others.length) : ""}
          expanded={expanded.history}
          toggle={() => toggle("history")}
        >
          <ul className="wb-nav-list" aria-label="历史对话">
            {others.slice(0, 15).map((c) => {
              const name = String(c.file_name).replace(/\.jsonl$/, "");
              return (
                <li key={c.file_name}>
                  <button
                    className="wb-nav-row"
                    title={name}
                    disabled={snap.busy}
                    onClick={() => run(() => host.openChat(c.file_name))}
                  >
                    <span className="wb-nav-row-text">{name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {recent && !others.length && <p className="wb-nav-empty">暂无历史对话</p>}
        </NavSection>

        {outlineEnabled && (
          <NavSection
            id="outline"
            icon={<ListTree size={16} />}
            label="大纲"
            expanded={expanded.outline}
            toggle={() => toggle("outline")}
          >
            <AddonWorkspace host={host} id="outline" active={expanded.outline && visible} view="sidebar" />
          </NavSection>
        )}

        <NavSection
          id="floors"
          icon={<Layers size={16} />}
          label="对话楼层"
          count={allFloors ? `全部 ${messages.length} 层` : `最近 ${RECENT_FLOORS} 层`}
          expanded={expanded.floors}
          toggle={() => toggle("floors")}
        >
          <ol className={`wb-nav-list wb-floor-list ${allFloors ? "is-expanded" : ""}`} aria-label="对话楼层">
            {floors.map((m) => (
              <li key={m.id}>
                <button
                  className={`wb-nav-row ${m.id === messages.length - 1 ? "is-current" : ""}`}
                  aria-current={m.id === messages.length - 1 ? "true" : undefined}
                  onClick={() => run(() => host.jump(m.id))}
                >
                  <span className="wb-floor-number">{m.id + 1}</span>
                  <span className="wb-nav-row-text">{m.preview.replace(/[#*_]/g, "").slice(0, 80)}</span>
                </button>
              </li>
            ))}
          </ol>
          {!messages.length && <p className="wb-nav-empty">开始聊天后，楼层会显示在这里。</p>}
          {messages.length > RECENT_FLOORS && (
            <button className="wb-nav-more" onClick={() => setAllFloors(!allFloors)}>
              {allFloors ? `只看最近 ${RECENT_FLOORS} 层` : `显示全部 ${messages.length} 层`}
            </button>
          )}
        </NavSection>
      </div>

      <nav className="wb-nav-footer" aria-label="设置与管理">
        <button className="wb-nav-foot" onClick={() => settings("settings")}>
          <Settings size={16} />
          设置
        </button>
        <button className="wb-nav-foot" onClick={() => settings("character")}>
          <UsersRound size={16} />
          {settingsLabels.character}
        </button>
        <button className="wb-nav-icon wb-nav-keys" aria-label="快捷键" title="快捷键" onClick={help}>
          <Keyboard size={16} />
        </button>
      </nav>
    </aside>
  );
}

function NavSection({
  id,
  icon,
  label,
  count,
  expanded,
  toggle,
  children,
}: {
  id: Section;
  icon: React.ReactNode;
  label: string;
  count?: string;
  expanded: boolean;
  toggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`wb-nav-section ${expanded ? "is-open" : ""}`} id={`wb-nav-${id}`}>
      <button
        className="wb-nav-toggle"
        aria-label={label}
        aria-expanded={expanded}
        aria-controls={`wb-nav-${id}-body`}
        onClick={toggle}
      >
        {icon}
        <span>{label}</span>
        {count && <small>{count}</small>}
        <ChevronDown size={14} className="wb-nav-caret" />
      </button>
      <div
        id={`wb-nav-${id}-body`}
        className={`wb-fold-body ${expanded ? "is-open" : ""}`}
        inert={!expanded}
        aria-hidden={!expanded}
      >
        <div>{children}</div>
      </div>
    </section>
  );
}
