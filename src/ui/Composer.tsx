import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, Menu, MoreHorizontal, WandSparkles } from "lucide-react";
import { addonEnabled } from "../addons/catalog";
import { pinnedTools } from "../host/tools";
import { composerTools, toolIcon } from "./ToolIcon";
import { useTools } from "./useTools";
import type { ComposerPopup } from "./ComposerPopovers";
import type { HostAdapter } from "../host/adapter";
import { bus } from "../host/bus";
/** Decorate native controls in-place: event handlers, selection and plugin nodes stay owned by ST. */
/** The composer card's smallest height: grip, two lines of text and the tool row (board "Main"). */
const COMPOSER_MIN = 124;
export function Composer({
  host,
  toolbar,
  busy,
  open,
  activate,
  mobile = false,
}: {
  host: HostAdapter;
  toolbar: HTMLElement;
  busy: boolean;
  open: (popup: ComposerPopup) => void;
  activate: (id: string, anchor: HTMLElement) => void;
  mobile?: boolean;
}) {
  useTools();
  const actions = [
      ...composerTools,
      ...pinnedTools(host.prefs().pinnedTools).filter(
        (tool) => tool.id !== "wb:export" || addonEnabled(host.prefs(), "record-export"),
      ),
    ],
    actionRow = useRef<HTMLDivElement>(null),
    [available, setAvailable] = useState(Infinity);
  useEffect(() => {
    const node = actionRow.current!;
    const observer = new ResizeObserver(() => setAvailable(node.clientWidth));
    observer.observe(node);
    setAvailable(node.clientWidth);
    return () => observer.disconnect();
  }, []);
  const slots = Math.max(0, Math.floor((available + 5) / 39)),
    visible = actions.slice(0, actions.length > slots ? Math.max(0, slots - 1) : slots),
    overflow = actions.slice(visible.length);
  const nativeTools = new Map(
    [...host.menuItems("menu"), ...host.menuItems("tools")]
      .filter((tool) => tool.pinnable)
      .map((tool) => [tool.id, tool]),
  );
  const disabled = (id: string) =>
    id.startsWith("builtin:")
      ? busy && ["builtin:continue", "builtin:regenerate", "builtin:impersonate"].includes(id)
      : id !== "wb:export" && (!nativeTools.has(id) || !!nativeTools.get(id)?.disabled);
  const [ratio, setRatio] = useState(Math.min(0.6, Math.max(0.2, host.prefs().inputRatio ?? 0.2)));
  const ratioRef = useRef(ratio),
    drag = useRef<{ y: number; ratio: number; height: number } | null>(null);
  ratioRef.current = ratio;
  useEffect(() => {
    const cleanup: (() => void)[] = [];
    for (const [id, kind, label] of [
      ["options_button", "menu", "聊天菜单"],
      ["extensionsMenuButton", "tools", "扩展工具"],
    ] as const) {
      const node = document.getElementById(id);
      if (!node) continue;
      const attributes = ["role", "aria-label", "aria-haspopup", "aria-expanded", "tabindex"],
        previous = attributes.map((a) => node.getAttribute(a));
      node.setAttribute("role", "button");
      node.setAttribute("aria-label", label);
      node.setAttribute("aria-haspopup", "dialog");
      node.setAttribute("aria-expanded", "false");
      node.tabIndex = 0;
      const click = (e: Event) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        open({ kind, anchor: node });
      };
      const key = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") click(e);
      };
      node.addEventListener("click", click, true);
      node.addEventListener("keydown", key, true);
      cleanup.push(() => {
        node.removeEventListener("click", click, true);
        node.removeEventListener("keydown", key, true);
        attributes.forEach((a, i) =>
          previous[i] === null ? node.removeAttribute(a) : node.setAttribute(a, previous[i]!),
        );
      });
    }
    return () => cleanup.forEach((fn) => fn());
  }, [open]);
  useEffect(() => {
    const input = document.getElementById("send_textarea")!;
    const names = ["placeholder", "connected_text", "no_connection_text"];
    const previous = names.map((name) => input.getAttribute(name));
    const connected = mobile ? "写下接下来发生的事…" : "写下接下来发生的事… 支持 Markdown、XML 与酒馆宏";
    const disconnected = mobile ? "写下草稿，或连接模型开始创作…" : "连接模型后开始创作，或先写下草稿…";
    input.setAttribute("connected_text", connected);
    input.setAttribute("no_connection_text", disconnected);
    const sync = () =>
      input.setAttribute(
        "placeholder",
        document.body.classList.contains("wb-image-input-mode")
          ? "输入生图提示词… 可拖入或粘贴参考图"
          : host.snapshot().online
            ? connected
            : disconnected,
      );
    const unsubscribe = host.subscribeSlice("session", sync);
    sync();
    return () => {
      unsubscribe();
      names.forEach((name, i) => {
        if (previous[i] === null) input.removeAttribute(name);
        else input.setAttribute(name, previous[i]!);
      });
    };
  }, [host, mobile]);
  useEffect(() => {
    const area = document.getElementById("sheld")!;
    const apply = () =>
      document.body.style.setProperty(
        "--wb-composer-height",
        `${Math.max(COMPOSER_MIN, area.clientHeight * ratioRef.current)}px`,
      );
    const observer = new ResizeObserver(apply);
    observer.observe(area);
    apply();
    return () => {
      observer.disconnect();
      document.body.style.removeProperty("--wb-composer-height");
      document.body.classList.remove("wb-resizing");
    };
  }, []);
  useEffect(() => {
    document.body.style.setProperty(
      "--wb-composer-height",
      `${Math.max(COMPOSER_MIN, document.getElementById("sheld")!.clientHeight * ratio)}px`,
    );
  }, [ratio]);
  const finish = () => {
    if (!drag.current) return;
    drag.current = null;
    document.body.classList.remove("wb-resizing");
    host.preference({ inputRatio: ratioRef.current });
  };
  const nativeIcon = (id: string, icon: React.ReactNode) => {
    const node = document.getElementById(id);
    return node && createPortal(icon, node);
  };
  return (
    <>
      {nativeIcon("options_button", <Menu className="wb-native-icon" size={18} aria-hidden="true" />)}
      {nativeIcon(
        "extensionsMenuButton",
        <WandSparkles className="wb-native-icon" size={18} aria-hidden="true" />,
      )}
      {nativeIcon(
        "send_but",
        <ArrowUp className="wb-native-icon wb-send-icon" size={22} aria-hidden="true" />,
      )}
      {createPortal(
        <>
          <button
            className="wb-input-grip"
            role={mobile ? undefined : "separator"}
            aria-label={mobile ? "全屏编辑草稿" : "调整输入框高度"}
            aria-orientation={mobile ? undefined : "horizontal"}
            aria-valuemin={mobile ? undefined : 20}
            aria-valuemax={mobile ? undefined : 60}
            aria-valuenow={mobile ? undefined : Math.round(ratio * 100)}
            title={mobile ? "上拉或点击，全屏编辑" : "上拉增加输入高度 · 双击恢复"}
            onClick={() => {
              if (mobile) bus.emit("mobile-editor-open");
            }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              const height = document.getElementById("sheld")!.clientHeight;
              drag.current = {
                y: e.clientY,
                ratio: document.getElementById("send_form")!.getBoundingClientRect().height / height,
                height,
              };
              if (!mobile) document.body.classList.add("wb-resizing");
            }}
            onPointerMove={(e) => {
              const start = drag.current;
              if (start && !mobile)
                setRatio(Math.min(0.6, Math.max(0.2, start.ratio + (start.y - e.clientY) / start.height)));
            }}
            onPointerUp={(e) => {
              if (mobile) {
                if (drag.current && drag.current.y - e.clientY > 35) bus.emit("mobile-editor-open");
                drag.current = null;
              } else finish();
            }}
            onPointerCancel={() => {
              if (mobile) drag.current = null;
              else finish();
            }}
            onLostPointerCapture={() => {
              if (mobile) drag.current = null;
              else finish();
            }}
            onDoubleClick={() => {
              setRatio(0.2);
              host.preference({ inputRatio: 0.2 });
            }}
            onKeyDown={(e) => {
              if (mobile) return;
              const value =
                e.key === "ArrowUp"
                  ? ratio + 0.025
                  : e.key === "ArrowDown"
                    ? ratio - 0.025
                    : e.key === "Home"
                      ? 0.2
                      : e.key === "End"
                        ? 0.6
                        : null;
              if (value === null) return;
              e.preventDefault();
              const next = Math.min(0.6, Math.max(0.2, value));
              setRatio(next);
              host.preference({ inputRatio: next });
            }}
          >
            <span />
          </button>
          <div className="wb-composer-actions" ref={actionRow}>
            {visible.map((tool) => {
              const Icon = toolIcon(tool.id, tool.label);
              return (
                <button
                  key={tool.id}
                  data-wb-tool={tool.id}
                  title={disabled(tool.id) ? `${tool.label} · 当前不可用` : tool.label}
                  aria-label={tool.label}
                  disabled={disabled(tool.id)}
                  onClick={(e) => activate(tool.id, e.currentTarget)}
                >
                  <Icon size={17} />
                </button>
              );
            })}
            {!!overflow.length && (
              <button
                title="更多工具"
                aria-label="更多工具"
                aria-haspopup="dialog"
                onClick={(e) =>
                  open({ kind: "pinned", toolIds: overflow.map((t) => t.id), anchor: e.currentTarget })
                }
              >
                <MoreHorizontal size={18} />
              </button>
            )}
          </div>
        </>,
        toolbar,
      )}
    </>
  );
}
