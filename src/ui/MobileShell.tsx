import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Expand,
  Eye,
  EyeOff,
  Folder,
  ImagePlus,
  Menu,
  MenuDrawer,
  MoreHorizontal,
  PanelsTopLeft,
  PencilLine,
  ScanLine,
  Plus,
  Settings,
  Theater,
  Users,
  WandSparkles,
  X,
} from "./icons";
import { pinnedTools, resolveTool } from "../host/tools";
import { addonEnabled } from "../addons/catalog";
import type { HostAdapter } from "../host/adapter";
import type { HostSnapshot, Panel, Resource, SettingsPage } from "../host/types";
import type { LayoutMode } from "./LayoutSwitcher";
import type { ComposerPopup } from "./ComposerPopovers";
import { ResourceControls } from "./Header";
import { ReadingSettings } from "./Reading";
import { composerTools, toolIcon } from "./ToolIcon";
import { usePresence } from "./Motion";
import { bus } from "../host/bus";

type Sheet = "management" | "tools" | HTMLElement | null;
const interactive = "button,input,textarea,select,a,[contenteditable=true],iframe,video";
export function MobileShell({
  host,
  snap,
  rp,
  left,
  panel,
  chooser,
  setChooser,
  goPanel,
  toggleLeft,
  closeDrawers,
  onLayout,
  settings,
  open,
  activate,
  next,
  select,
  focus,
  toggleFocus,
}: {
  host: HostAdapter;
  snap: HostSnapshot;
  rp: boolean;
  left: boolean;
  panel: Panel;
  chooser: Resource | null;
  setChooser: (kind: Resource | null) => void;
  goPanel: (panel: Panel, id?: string) => void;
  toggleLeft: () => void;
  closeDrawers: () => void;
  onLayout: (mode: LayoutMode) => void;
  settings: (page: SettingsPage, group?: string) => void;
  open: (popup: ComposerPopup) => void;
  activate: (id: string, anchor: HTMLElement) => void;
  next: (kind: Resource) => unknown;
  select: (kind: Resource, id: string, on: boolean) => void;
  /** Focus mode: Noval keeps only the reading and the composer; RP hides every pane. */
  focus: boolean;
  toggleFocus: () => void;
}) {
  const [sheet, setSheet] = useState<Sheet>(null),
    [editor, setEditor] = useState(false),
    [collapsed, setCollapsed] = useState(true),
    [length, setLength] = useState(0);
  const presence = usePresence(sheet),
    sheetRef = useRef<HTMLDivElement>(null),
    input = document.getElementById("send_textarea") as HTMLTextAreaElement,
    form = document.getElementById("send_form")!,
    items = document.getElementById("nonQRFormItems")!;
  const latest = useRef({ left, panel, editor, sheet });
  latest.current = { left, panel, editor, sheet };
  const close = () => {
      setSheet(null);
      setChooser(null);
    },
    setEditing = (value: boolean) => {
      setSheet(null);
      setChooser(null);
      setEditor(value);
    };
  const presentation = host.rpPresentation();
  // Novel names the story; RP names the scene, falling back to the story when the card has none.
  const scene = (key: string) => {
      const value = presentation.scene?.[key];
      return typeof value === "string" || typeof value === "number" ? String(value) : "";
    },
    who = snap.character?.name || snap.groupName || "选择角色",
    title = (rp && scene("location")) || snap.chatName || who,
    subtitle =
      rp && scene("location")
        ? [scene("time"), scene("weather")].filter(Boolean).join(" · ") || who
        : snap.chatName
          ? `${who} · ${snap.messages.length} 层`
          : "开始一段新的故事";
  const worlds = snap.resources.world.filter((x) => x.active),
    summary = [
      snap.resources.preset.find((x) => x.id === snap.current.preset)?.name,
      worlds.length ? worlds[0].name + (worlds.length > 1 ? ` +${worlds.length - 1}` : "") : "",
    ]
      .filter(Boolean)
      .join(" · ");
  useLayoutEffect(() => {
    document.body.classList.toggle("wb-mobile-busy", snap.busy);
    document.body.classList.toggle("wb-mobile-offline", !snap.online);
    return () => document.body.classList.remove("wb-mobile-busy", "wb-mobile-offline");
  }, [snap.busy, snap.online]);
  useLayoutEffect(() => {
    document.body.classList.toggle("wb-mobile-editor", editor);
    document.body.classList.toggle("wb-mobile-tools", sheet === "tools");
    return () => {
      document.body.classList.remove("wb-mobile-editor", "wb-mobile-tools");
    };
  }, [editor, sheet]);
  useEffect(() => {
    setSheet(null);
    setEditor(false);
  }, [rp, snap.chatName, snap.character?.id]);
  useEffect(() => {
    const changed = () => {
      setLength(input.value.length);
    };
    changed();
    input.addEventListener("input", changed);
    const edit = () => setEditing(true),
      image = () => {
        setSheet(null);
        setEditor(false);
        closeDrawers();
      };
    const off = [
      bus.on("mobile-editor-open", edit),
      bus.on("image-compose", image),
      bus.on("mobile-menu", () => setSheet("management")),
      // A floor picked in the outline is also selected, so its tools are one tap away.
      bus.on("floor-jump", (id) => {
        const chat = document.getElementById("chat")!;
        chat.querySelectorAll(".wb-mobile-actions").forEach((n) => n.classList.remove("wb-mobile-actions"));
        chat.querySelector(`.mes[mesid="${id}"]`)?.classList.add("wb-mobile-actions");
      }),
    ];
    return () => {
      input.removeEventListener("input", changed);
      off.forEach((f) => f());
    };
  }, []);
  useLayoutEffect(() => {
    const chat = document.getElementById("sheld")!,
      previous = chat.inert;
    chat.inert = left || !!panel || !!sheet;
    return () => {
      chat.inert = previous;
    };
  }, [left, panel, sheet]);
  useLayoutEffect(() => {
    const target = left
      ? document.querySelector<HTMLElement>(".wb-left")
      : panel
        ? document.querySelector<HTMLElement>(".wb-right")
        : sheet
          ? sheetRef.current
          : null;
    if (!target) return;
    const previous = document.activeElement as HTMLElement,
      frame = requestAnimationFrame(() => {
        const close = document.querySelector<HTMLElement>(".wb-mobile-drawer-close");
        (sheet ? sheetRef.current?.querySelector<HTMLElement>("button") : close)?.focus({
          preventScroll: true,
        });
      });
    const key = (e: KeyboardEvent) => {
      if (
        (document.activeElement as Element)?.closest(
          ".wb-mobile-resource-popup,.wb-resource-menu,.wb-popover",
        )
      )
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        sheet ? close() : closeDrawers();
      }
      if (e.key === "Tab") {
        const nodes = [
          ...(sheet ? target : document.body).querySelectorAll<HTMLElement>(
            sheet
              ? 'button:not(:disabled),input:not([type=hidden]),textarea,select,[tabindex="0"]'
              : ".wb-mobile-drawer-close, .wb-left.is-open button:not(:disabled),.wb-left.is-open input,.wb-right.is-open button:not(:disabled),.wb-right.is-open input,.wb-right.is-open textarea",
          ),
        ].filter((n) => !n.closest("[inert]") && n.getBoundingClientRect().height > 0);
        const index = nodes.indexOf(document.activeElement as HTMLElement);
        if (!nodes.length) return;
        if (e.shiftKey && index <= 0) {
          e.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!e.shiftKey && (index < 0 || index === nodes.length - 1)) {
          e.preventDefault();
          nodes[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", key, true);
      if (previous?.isConnected && previous.tagName !== "TEXTAREA") previous.focus({ preventScroll: true });
    };
  }, [left, panel, !!sheet]);
  // Sideways swipes open the drawers: anywhere in Noval's reading, and on RP's scene (the dialogue
  // box turns pages with the same gesture, so it is left to RPStage).
  useEffect(() => {
    const chat = document.getElementById("chat")!,
      surface = rp ? document.body : chat;
    let start: { x: number; y: number; target: Element; pointer: number } | null = null,
      press: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      clearTimeout(press);
      press = undefined;
    };
    const down = (e: PointerEvent) => {
      const selection = getSelection(),
        anchor =
          selection?.anchorNode instanceof Element
            ? selection.anchorNode
            : selection?.anchorNode?.parentElement;
      if (
        e.button !== 0 ||
        e.pointerType !== "touch" ||
        (e.target as Element).closest(interactive) ||
        (selection?.toString() && anchor?.closest("#chat"))
      )
        return;
      const target = e.target as Element;
      if (rp && target.closest(".wb-ui,#form_sheld,.wb-mobile-header")) return;
      if (!rp || !target.closest("#sheld"))
        start = { x: e.clientX, y: e.clientY, target, pointer: e.pointerId };
      if (rp) {
        const message = target.closest<HTMLElement>(".mes");
        const last = chat.querySelector(".mes:last-child");
        if (message && message === last && message.getAttribute("is_user") !== "true")
          press = setTimeout(() => {
            setSheet(message);
            start = null;
          }, 550);
      }
    };
    const move = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel();
    };
    const up = (e: PointerEvent) => {
      cancel();
      const gesture = start;
      start = null;
      if (
        !gesture ||
        latest.current.editor ||
        latest.current.sheet ||
        latest.current.left ||
        latest.current.panel
      )
        return;
      const dx = e.clientX - gesture.x,
        dy = e.clientY - gesture.y;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.7) {
        dx > 0 ? toggleLeft() : goPanel("character");
      }
    };
    const stopped = () => {
      cancel();
      start = null;
    };
    surface.addEventListener("pointerdown", down);
    surface.addEventListener("pointermove", move);
    surface.addEventListener("pointerup", up);
    surface.addEventListener("pointercancel", stopped);
    const context = (e: MouseEvent) => {
      if (!rp) return;
      const message = (e.target as Element).closest<HTMLElement>(".mes");
      if (message === chat.querySelector(".mes:last-child") && message?.getAttribute("is_user") !== "true") {
        e.preventDefault();
        setSheet(message);
      }
    };
    chat.addEventListener("contextmenu", context);
    // Native swipe events normally change reply candidates; the approved PWA gesture opens drawers instead.
    const nativeSwipe = (e: Event) => {
      if ((e.target as Element)?.closest("#chat") && !(e.target as Element).closest(interactive))
        e.stopImmediatePropagation();
    };
    document.addEventListener("swiped-left", nativeSwipe, true);
    document.addEventListener("swiped-right", nativeSwipe, true);
    return () => {
      cancel();
      surface.removeEventListener("pointerdown", down);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", up);
      surface.removeEventListener("pointercancel", stopped);
      chat.removeEventListener("contextmenu", context);
      document.removeEventListener("swiped-left", nativeSwipe, true);
      document.removeEventListener("swiped-right", nativeSwipe, true);
    };
  }, [rp, toggleLeft, goPanel]);
  // Phones have no hover: a tap on a Novel message shows its tools, a second tap or another message hides them.
  useEffect(() => {
    if (rp) return;
    const chat = document.getElementById("chat")!;
    const tap = (e: MouseEvent) => {
      const target = e.target as Element,
        message = target.closest<HTMLElement>(".mes");
      if (!message || target.closest(`${interactive},[role=button]`) || getSelection()?.toString()) return;
      const shown = message.classList.contains("wb-mobile-actions");
      chat.querySelectorAll(".wb-mobile-actions").forEach((n) => n.classList.remove("wb-mobile-actions"));
      if (!shown) message.classList.add("wb-mobile-actions");
    };
    chat.addEventListener("click", tap);
    return () => {
      chat.removeEventListener("click", tap);
      chat.querySelectorAll(".wb-mobile-actions").forEach((n) => n.classList.remove("wb-mobile-actions"));
    };
  }, [rp]);
  useEffect(() => {
    if (!left && !panel) return;
    const drawer = document.querySelector<HTMLElement>(left ? ".wb-left" : ".wb-right")!;
    let start: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch" && !(e.target as Element).closest(interactive))
        start = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const dx = e.clientX - start.x,
        dy = e.clientY - start.y;
      start = null;
      if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.7 && (left ? dx < 0 : dx > 0)) closeDrawers();
    };
    const cancel = () => {
      start = null;
    };
    drawer.addEventListener("pointerdown", down);
    drawer.addEventListener("pointerup", up);
    drawer.addEventListener("pointercancel", cancel);
    return () => {
      drawer.removeEventListener("pointerdown", down);
      drawer.removeEventListener("pointerup", up);
      drawer.removeEventListener("pointercancel", cancel);
    };
  }, [left, panel, closeDrawers]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editor) {
        e.preventDefault();
        setEditing(false);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [editor]);
  const resources = (
    <ResourceControls
      mobile
      snap={snap}
      panel={panel}
      chooser={chooser}
      setChooser={setChooser}
      goPanel={(next, id) => {
        close();
        goPanel(next, id);
      }}
      next={(kind) => {
        void next(kind);
      }}
      select={select}
      model={host.model()}
    />
  );
  const nativeAction = (selector: string) => {
    close();
    const control = (sheet instanceof HTMLElement ? sheet : document).querySelector<HTMLElement>(selector);
    control?.click();
  };
  const goSettings = (page: SettingsPage) => {
    close();
    settings(page);
  };
  const tools = [
    ...composerTools,
    ...pinnedTools(host.prefs().pinnedTools).filter(
      (t) => t.id !== "wb:export" || addonEnabled(host.prefs(), "record-export"),
    ),
  ];
  const disabledTool = (id: string) =>
    id.startsWith("builtin:")
      ? snap.busy && ["builtin:continue", "builtin:regenerate", "builtin:impersonate"].includes(id)
      : id !== "wb:export" && (!resolveTool(id) || !!resolveTool(id)?.disabled);
  return (
    <>
      <header
        className="wb-mobile-header wb-ui"
        inert={left || !!panel || !!sheet || editor || (focus && !rp)}
      >
        <button
          className="wb-mobile-nav"
          aria-label="打开大纲与导航"
          aria-expanded={left}
          onClick={toggleLeft}
        >
          <MenuDrawer size={21} />
        </button>
        <div className="wb-mobile-title">
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>
        <button
          className="wb-mobile-person"
          aria-label={rp ? (focus ? "显示界面" : "隐藏界面") : "打开角色与 Trace"}
          aria-pressed={rp ? focus : undefined}
          aria-expanded={rp ? undefined : !!panel}
          onClick={() => (rp ? toggleFocus() : goPanel("character"))}
        >
          {rp ? (
            focus ? (
              <Eye size={20} />
            ) : (
              <EyeOff size={20} />
            )
          ) : snap.character?.image ? (
            <span className="wb-mobile-face">
              <img src={snap.character.image} alt="" />
            </span>
          ) : (
            <span className="wb-avatar-fallback">N</span>
          )}
        </button>
      </header>
      {(left || panel) && (
        <>
          <button className="wb-mobile-shade" aria-label="收起边栏" onClick={closeDrawers} />
          {left && <span className="wb-mobile-drawer-title wb-ui">大纲与导航</span>}
          <button className="wb-mobile-drawer-close wb-ui" aria-label="关闭边栏" onClick={closeDrawers}>
            <X size={20} />
          </button>
        </>
      )}
      {!rp && (
        <div
          className={`wb-mobile-config wb-ui ${collapsed ? "is-collapsed" : ""}`}
          inert={left || !!panel || !!sheet || editor || focus}
        >
          <div hidden={collapsed}>{resources}</div>
          {collapsed && (
            <button className="wb-mobile-summary" onClick={() => setCollapsed(false)}>
              <i className={`wb-dot ${snap.online ? "online" : ""}`} />
              <span>
                {snap.resources.connection.find((x) => x.id === snap.current.connection)?.name ||
                  host.model() ||
                  "未连接"}
              </span>
              {!!summary && <small>· {summary}</small>}
            </button>
          )}
          <button
            className="wb-mobile-config-fold"
            aria-label={collapsed ? "展开快捷配置" : "收起快捷配置"}
            aria-expanded={!collapsed}
            onClick={() => {
              setCollapsed(!collapsed);
              setChooser(null);
            }}
          >
            {collapsed && <span>快捷配置</span>}
            <ChevronDown size={15} />
          </button>
        </div>
      )}
      {!rp && focus && !editor && (
        <button type="button" className="wb-mobile-focus-exit wb-ui" aria-label="退出专注" onClick={toggleFocus}>
          <ScanLine size={15} />
          退出专注
        </button>
      )}
      {!rp &&
        createPortal(
          <button
            type="button"
            className="wb-mobile-management wb-ui"
            aria-label="打开会话管理"
            onClick={() => setSheet("management")}
          >
            <MoreHorizontal size={21} strokeWidth={2.6} />
          </button>,
          document.getElementById("form_sheld")!,
        )}
      {createPortal(
        <button
          type="button"
          className="wb-mobile-plus wb-ui"
          aria-label="打开输入工具"
          aria-expanded={sheet === "tools"}
          onClick={() => setSheet(sheet === "tools" ? null : "tools")}
        >
          <Plus size={23} />
        </button>,
        items,
      )}
      {createPortal(
        <>
          <div className="wb-mobile-editor-heading wb-ui">
            <button aria-label="返回聊天，保留草稿" onClick={() => setEditing(false)}>
              <ArrowLeft size={19} />
              返回
            </button>
            <strong>
              {document.body.classList.contains("wb-image-input-mode") ? "生图提示词" : "编辑草稿"}
            </strong>
            <small>{length} 字</small>
          </div>
          {rp && (
            <button
              type="button"
              className="wb-mobile-editor-tools wb-ui"
              aria-label="草稿工具"
              onClick={() => setSheet("tools")}
            >
              <Plus size={23} />
            </button>
          )}
        </>,
        form,
      )}
      {presence.value && (
        <>
          <button
            className="wb-mobile-sheet-shade"
            aria-label="关闭工具面板"
            data-wb-exiting={presence.exiting || undefined}
            inert={presence.exiting}
            onClick={close}
          />
          <div
            ref={sheetRef}
            className={`wb-mobile-sheet wb-ui ${presence.value === "management" ? "is-management" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-label={sheet === "management" ? "会话管理" : sheet === "tools" ? "输入工具" : "最新回复操作"}
            inert={presence.exiting}
            data-wb-exiting={presence.exiting || undefined}
          >
            <span className="wb-mobile-sheet-grip" aria-hidden="true" />
            <header>
              <strong>
                {presence.value === "management"
                  ? "会话管理"
                  : presence.value === "tools"
                    ? "输入工具"
                    : "最新回复"}
              </strong>
              <button aria-label="关闭工具面板" onClick={close}>
                <X size={21} />
              </button>
            </header>
            {presence.value === "management" ? (
              <>
                <span className="wb-mobile-sheet-caption" aria-hidden="true">
                  布局模式
                </span>
                <div className="wb-mobile-mode-row" role="group" aria-label="工作台模式">
                  {(
                    [
                      ["novel", "Noval", BookOpen],
                      ["rp", "RP", Theater],
                      ["native", "原生", PanelsTopLeft],
                    ] as const
                  ).map(([mode, name, Icon]) => (
                    <button
                      key={mode}
                      aria-pressed={mode === (rp ? "rp" : "novel")}
                      onClick={() => {
                        close();
                        onLayout(mode);
                      }}
                    >
                      <Icon size={17} />
                      {name}
                    </button>
                  ))}
                </div>
                <div className="wb-mobile-sheet-list">
                  {!rp && (
                    <button
                      aria-pressed={focus}
                      onClick={() => {
                        close();
                        toggleFocus();
                      }}
                    >
                      <ScanLine size={19} />
                      专注模式
                      <ChevronRight size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      close();
                      goPanel("character");
                    }}
                  >
                    <Users size={19} />
                    角色与资源
                    <ChevronRight size={15} />
                  </button>
                  <button
                    onClick={() => {
                      close();
                      goPanel("trace");
                    }}
                  >
                    <Activity size={19} />
                    Trace
                    <ChevronRight size={15} />
                  </button>
                  <button
                    onClick={(e) => {
                      close();
                      open({ kind: "files", anchor: e.currentTarget });
                    }}
                  >
                    <Folder size={19} />
                    聊天文件
                    <ChevronRight size={15} />
                  </button>
                  <button onClick={() => goSettings("settings")}>
                    <Settings size={19} />
                    用户设置
                    <ChevronRight size={15} />
                  </button>
                  <ReadingSettings host={host} row />
                </div>
              </>
            ) : presence.value === "tools" ? (
              <>
                {rp && <div className="wb-mobile-tool-config">{resources}</div>}
                <div className="wb-mobile-tool-grid">
                  {tools.map((tool) => {
                    const Icon = toolIcon(tool.id, tool.label);
                    return (
                      <button
                        key={tool.id}
                        disabled={disabledTool(tool.id)}
                        onClick={(e) => {
                          close();
                          activate(tool.id, e.currentTarget);
                        }}
                      >
                        <Icon size={21} />
                        <span>{tool.label}</span>
                      </button>
                    );
                  })}
                  <button
                    onClick={(e) => {
                      close();
                      open({ kind: "menu", anchor: e.currentTarget });
                    }}
                  >
                    <Menu size={21} />
                    聊天菜单
                  </button>
                  <button
                    onClick={(e) => {
                      close();
                      open({ kind: "tools", anchor: e.currentTarget });
                    }}
                  >
                    <WandSparkles size={21} />
                    扩展工具
                  </button>
                  <button onClick={() => setEditing(true)}>
                    <Expand size={21} />
                    全屏输入
                  </button>
                </div>
              </>
            ) : (
              <div className="wb-mobile-sheet-list">
                <button disabled={snap.busy} onClick={() => nativeAction(".mes_edit")}>
                  <PencilLine size={19} />
                  编辑回复
                </button>
                <button onClick={() => nativeAction(".mes_copy")}>
                  <Copy size={19} />
                  复制回复
                </button>
                <div className="wb-mobile-candidates">
                  <button disabled={snap.busy} onClick={() => nativeAction(".swipe_left")}>
                    <ChevronLeft size={20} />
                    上一个候选
                  </button>
                  <button disabled={snap.busy} onClick={() => nativeAction(".swipe_right")}>
                    下一个候选
                    <ChevronRight size={20} />
                  </button>
                </div>
                {(presence.value as HTMLElement).querySelector(".wb-image-message-button") && (
                  <button disabled={snap.busy} onClick={() => nativeAction(".wb-image-message-button")}>
                    <ImagePlus size={19} />
                    为此回复生图
                  </button>
                )}
                <button
                  onClick={() => {
                    close();
                    goPanel("trace");
                  }}
                >
                  <Activity size={19} />
                  Trace
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
