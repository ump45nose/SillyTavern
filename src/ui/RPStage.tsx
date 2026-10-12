import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CloudSun,
  History,
  MapPin,
  Maximize2,
  Minimize2,
  PencilLine,
  RotateCcw,
  Square,
  X,
  ImagePlus,
} from "./icons";
import type { HostAdapter } from "../host/adapter";
import { boundedPreference, dialoguePages } from "../host/rp";
import { useHostSlices } from "./common";
import { ReadingPresentation } from "./Reading";
import { beginImage } from "./AddonControls";
import { addonEnabled } from "../addons/catalog";
import { RPAppearance } from "./RPAppearance";
import { motionAllowed } from "./Motion";
import { bus } from "../host/bus";
import { actionLabels } from "../host/labels";

type Message = {
  node: HTMLElement;
  id: number;
  name: string;
  user: boolean;
  parts: HTMLElement[];
  pages: number[][];
  editing: boolean;
};
type Cursor = { id: number; page: number; compose: boolean };

/** Keep native message, media, iframe, textarea and event-handler identities intact. */
function useNativeDialogue(host: HostAdapter, capacity: number) {
  const [messages, setMessages] = useState<Message[]>([]);
  useLayoutEffect(() => {
    const chat = document.getElementById("chat")!;
    const read = (node: HTMLElement): Message => {
      const id = Number(node.getAttribute("mesid")),
        text = node.querySelector<HTMLElement>(".mes_text");
      // Mixed text/HTML and nested plugin output stay together as a single scrollable page.
      const mixed = [...(text?.childNodes || [])].some(
        (n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim(),
      );
      const parts = mixed ? [] : ([...(text?.children || [])] as HTMLElement[]);
      const pages = dialoguePages(
        parts.map((part) => ({
          length: part.textContent?.length || 1,
          atomic:
            part.matches("iframe,pre,table,img,video,audio,svg,canvas") ||
            !!part.querySelector("iframe,pre,table,img,video,audio,canvas"),
        })),
        capacity,
      );
      return {
        node,
        id,
        name: host.slice("chat")[id]?.name || node.querySelector(".name_text")?.textContent || "",
        user: node.getAttribute("is_user") === "true",
        parts,
        pages,
        editing: !!node.querySelector(".edit_textarea"),
      };
    };
    const scan = () => setMessages([...chat.querySelectorAll<HTMLElement>(".mes")].map(read));
    scan();
    const off = host.chatObserver.subscribe((change) => {
      if (change.nodes || change.editing) scan();
      // Streaming only touches the last floor: re-read just the floors that changed.
      else if (change.content.size)
        setMessages((prev) => prev.map((m) => (change.content.has(m.id) ? read(m.node) : m)));
    });
    return off;
  }, [host, capacity]);
  return messages;
}

export function RPStage({
  host,
  hidden,
  blocked,
  width,
  readingLayout,
  run,
}: {
  host: HostAdapter;
  hidden: boolean;
  blocked: boolean;
  width: number;
  readingLayout: () => void;
  run: (fn: () => unknown) => unknown;
}) {
  const snap = useHostSlices(host, ["session", "chat", "prefs"]),
    prefs = host.prefs();
  const textSize = boundedPreference(prefs.rpTextSize, 19, 14, 26),
    dialogWidth = boundedPreference(prefs.rpDialogWidth, 88, 65, 94);
  const [height, setHeight] = useState(innerHeight);
  useEffect(() => {
    const resize = () => setHeight(innerHeight);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const capacity = Math.max(
    120,
    Math.round(
      (((width * dialogWidth) / 100 - 56) / textSize) *
        Math.max(2, (Math.min(360, Math.max(180, height * 0.25)) - 50) / (textSize * 1.9)),
    ),
  );
  const messages = useNativeDialogue(host, capacity),
    [cursor, setCursor] = useState<Cursor>({ id: -1, page: -1, compose: false });
  const beforeImage = useRef<Cursor | null>(null),
    cursorNow = useRef(cursor);
  cursorNow.current = cursor;
  const [history, setHistory] = useState(false),
    [expanded, setExpanded] = useState(false),
    [mediaRevision, setMediaRevision] = useState(0);
  const [scroll, setScroll] = useState({ overflow: false, scrolled: false, end: true });
  const originals = useRef(new Map<HTMLElement, { inert: boolean; aria: string | null }>()),
    partsSeen = useRef(new Set<HTMLElement>());
  const live = useRef(true),
    lastChat = useRef(snap.chatName),
    lastCount = useRef(0),
    lastTurn = useRef(""),
    animation = useRef<Animation | null>(null);
  const current = messages.find((m) => m.id === cursor.id) || messages.at(-1);
  const page = current
    ? Math.min(
        current.pages.length - 1,
        Math.max(0, cursor.page < 0 ? current.pages.length - 1 : cursor.page),
      )
    : 0;
  const compose = cursor.compose || !current,
    presentation = host.rpPresentation(current?.user ? undefined : current?.name);
  void mediaRevision;
  const isHidden = hidden || blocked;
  useEffect(() => {
    if (lastChat.current !== snap.chatName) {
      lastChat.current = snap.chatName;
      live.current = true;
      setCursor({ id: -1, page: -1, compose: false });
      setHistory(false);
      setExpanded(false);
    }
  }, [snap.chatName]);
  useEffect(() => {
    if (!messages.length) {
      lastCount.current = 0;
      return;
    }
    const newest = messages.at(-1)!;
    if (live.current && newest.id !== cursor.id && (messages.length !== lastCount.current || cursor.id < 0))
      setCursor({ id: newest.id, page: 0, compose: false });
    lastCount.current = messages.length;
  }, [messages, cursor.id]);
  useEffect(() => {
    const jump = (id: number) => {
      live.current = false;
      setHistory(false);
      setCursor({ id, page: 0, compose: false });
    };
    const imageCompose = () => {
      beforeImage.current ??= { ...cursorNow.current };
      live.current = false;
      setHistory(false);
      setCursor((old) => ({ ...old, compose: true }));
    };
    const imageEnd = () => {
      if (beforeImage.current) {
        setCursor(beforeImage.current);
        beforeImage.current = null;
      }
    };
    const off = [
      bus.on("image-compose", imageCompose),
      bus.on("image-compose-end", imageEnd),
      bus.on("rp-jump", jump),
    ];
    return () => off.forEach((f) => f());
  }, []);
  useEffect(() => host.media.subscribe(() => setMediaRevision((v) => v + 1)), [host]);
  useLayoutEffect(() => {
    document.body.classList.toggle("wb-rp-compose", compose && !history);
    document.body.classList.toggle("wb-rp-expanded", expanded && compose && !history);
    document.body.classList.toggle("wb-rp-history", history);
    const sheld = document.getElementById("sheld")!,
      form = document.getElementById("form_sheld")!;
    sheld.inert = isHidden;
    form.inert = !compose || history || isHidden;
    document.body.style.setProperty("--wb-rp-text", textSize + "px");
    document.body.style.setProperty("--wb-rp-width", String(dialogWidth / 100));
    document.body.style.setProperty(
      "--wb-rp-sprite",
      boundedPreference(prefs.rpSpriteScale, 91, 55, 100) + "vh",
    );
    document.body.style.setProperty(
      "--wb-rp-font",
      prefs.readingFont === "sans"
        ? "system-ui,sans-serif"
        : "'Noto Serif CJK SC','Source Han Serif SC','Songti SC',SimSun,serif",
    );
    for (const message of messages) {
      const visible = history || (message === current && !compose);
      if (!originals.current.has(message.node))
        originals.current.set(message.node, {
          inert: message.node.inert,
          aria: message.node.getAttribute("aria-hidden"),
        });
      message.node.classList.toggle("wb-rp-current", message === current);
      message.node.inert = !visible;
      message.node.setAttribute("aria-hidden", String(!visible));
      message.parts.forEach((part, index) => {
        partsSeen.current.add(part);
        part.classList.add("wb-rp-part");
        part.classList.toggle("wb-rp-part-active", message.pages[page]?.includes(index) || false);
      });
    }
    for (const [node, previous] of originals.current)
      if (!node.isConnected) {
        node.inert = previous.inert;
        previous.aria === null
          ? node.removeAttribute("aria-hidden")
          : node.setAttribute("aria-hidden", previous.aria);
        node.classList.remove("wb-rp-current");
        originals.current.delete(node);
      }
    for (const part of partsSeen.current)
      if (!part.isConnected) {
        part.classList.remove("wb-rp-part", "wb-rp-part-active");
        partsSeen.current.delete(part);
      }
    const turn = `${current?.id}:${page}:${compose}:${history}`;
    if (turn !== lastTurn.current) {
      lastTurn.current = turn;
      const text = current?.node.querySelector<HTMLElement>(".mes_text");
      if (text && !history && !compose) {
        text.scrollTop = 0;
        sheld.querySelector("#chat")!.scrollTop = 0;
        animation.current?.cancel();
        if (motionAllowed())
          animation.current = text.animate(
            [
              { opacity: 0.2, transform: "translateX(14px)" },
              { opacity: 1, transform: "translateX(0)" },
            ],
            { duration: 240, easing: "cubic-bezier(.22,.8,.3,1)" },
          );
      }
    }
  }, [
    messages,
    current,
    page,
    compose,
    history,
    expanded,
    isHidden,
    textSize,
    dialogWidth,
    prefs.rpSpriteScale,
    prefs.readingFont,
  ]);
  useEffect(
    () => () => {
      animation.current?.cancel();
      originals.current.forEach((previous, node) => {
        node.inert = previous.inert;
        previous.aria === null
          ? node.removeAttribute("aria-hidden")
          : node.setAttribute("aria-hidden", previous.aria);
        node.classList.remove("wb-rp-current");
      });
      partsSeen.current.forEach((part) => part.classList.remove("wb-rp-part", "wb-rp-part-active"));
      document.getElementById("sheld")!.inert = false;
      document.getElementById("form_sheld")!.inert = false;
      document.body.classList.remove("wb-rp-compose", "wb-rp-expanded", "wb-rp-history");
      for (const name of ["text", "width", "sprite", "font"])
        document.body.style.removeProperty("--wb-rp-" + name);
    },
    [],
  );
  useEffect(() => {
    const chat = document.getElementById("chat")!,
      text = current?.node.querySelector<HTMLElement>(".mes_text");
    const measure = () => {
      const next = {
        overflow: chat.scrollHeight > chat.clientHeight + 2,
        scrolled: chat.scrollTop > 2,
        end: chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 2,
      };
      setScroll((old) =>
        old.overflow === next.overflow && old.scrolled === next.scrolled && old.end === next.end ? old : next,
      );
    };
    measure();
    chat.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(chat);
    if (text) observer.observe(text);
    return () => {
      observer.disconnect();
      chat.removeEventListener("scroll", measure);
    };
  }, [current?.node, page, compose, history]);
  const turn = (delta: number) => {
    if (current?.editing) return;
    if (compose) {
      setCursor({ id: current?.id ?? -1, page: -1, compose: false });
      return;
    }
    if (!current) return;
    const chat = document.getElementById("chat")!;
    if (
      (delta > 0 && chat.scrollTop + chat.clientHeight < chat.scrollHeight - 2) ||
      (delta < 0 && chat.scrollTop > 2)
    ) {
      chat.scrollBy({
        top: delta * Math.max(80, chat.clientHeight - 36),
        behavior: motionAllowed() ? "smooth" : "instant",
      });
      return;
    }
    live.current = false;
    const index = messages.indexOf(current),
      nextPage = page + delta;
    if (nextPage >= 0 && nextPage < current.pages.length)
      setCursor({ id: current.id, page: nextPage, compose: false });
    else if (delta < 0 && index > 0) setCursor({ id: messages[index - 1].id, page: -1, compose: false });
    else if (delta > 0 && index < messages.length - 1)
      setCursor({ id: messages[index + 1].id, page: 0, compose: false });
    else if (delta > 0) {
      live.current = true;
      setCursor({ id: current.id, page: -1, compose: true });
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        isHidden ||
        history ||
        document.querySelector("dialog[open],.wb-popover,[role=listbox]")
      )
        return;
      if ((e.target as Element)?.closest("input,textarea,select,button,[contenteditable=true]")) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        turn(e.key === "ArrowLeft" ? -1 : 1);
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  const nativeAction = (selector: string) =>
    run(() => {
      const button = current?.node.querySelector<HTMLElement>(selector);
      if (!button) throw new Error("当前消息没有此操作。");
      button.click();
    });
  const enterCompose = () => {
    if (current?.editing) return;
    live.current = true;
    setHistory(false);
    setCursor({ id: current?.id ?? -1, page: -1, compose: true });
  };
  const visibleDots = current?.pages.map((_, i) => i).filter((i) => Math.abs(i - page) <= 3) || [];
  const replies = [...new Map(host.quickReplies().map((qr: any) => [qr.key, qr])).values()].slice(
    0,
    3,
  ) as any[];
  const scene = presentation.scene,
    sceneValue = (key: string) =>
      typeof scene[key] === "string" || typeof scene[key] === "number" ? String(scene[key]) : "";
  const sceneHidden = isHidden || width < 1000 || (expanded && compose) || (history && width < 1400);
  return (
    <>
      {createPortal(
        <div className="wb-rp-stage" aria-label="RP 舞台">
          <div className="wb-rp-atmosphere" />
          {(presentation.sprite || (prefs.rpShowPortraits !== false && presentation.portrait)) && (
            <div
              className={`wb-rp-actor ${presentation.sprite ? "is-sprite" : "is-portrait"} ${current?.user || compose ? "is-listening" : "is-speaking"}`}
            >
              <img src={presentation.sprite || presentation.portrait} alt={presentation.name} />
              <span>{presentation.name}</span>
            </div>
          )}
          {(presentation.userSprite || (prefs.rpShowPortraits !== false && presentation.userPortrait)) && (
            <div
              className={`wb-rp-user ${presentation.userSprite ? "is-sprite" : "is-portrait"} ${current?.user || compose ? "is-speaking" : "is-listening"}`}
            >
              <img src={presentation.userSprite || presentation.userPortrait} alt={presentation.userName} />
              <span>{presentation.userName}</span>
            </div>
          )}
        </div>,
        document.body,
      )}
      {/* Board "RpDesktop": glass cards over the scene; the native message is the dialogue box itself. */}
      <aside
        className={`wb-rp-scene ${sceneHidden ? "is-hidden" : ""}`}
        inert={sceneHidden}
        aria-label="当前场景信息"
      >
        <div className="wb-rp-scene-head">
          <strong>{sceneValue("day") ? "DAY " + sceneValue("day") : "当前对话"}</strong>
          <span>
            {sceneValue("time") ||
              host.messageTime(snap.messages.find((m) => m.id === current?.id)?.send_date)}
          </span>
        </div>
        <span>
          <MapPin size={14} aria-hidden="true" />
          {sceneValue("location") || snap.groupName || snap.character?.name || "等待故事开始"}
        </span>
        {sceneValue("weather") && (
          <span>
            <CloudSun size={14} aria-hidden="true" />
            {sceneValue("weather")}
          </span>
        )}
      </aside>
      <section
        className={`wb-rp-deck ${width < 800 ? "is-compact" : ""} ${compose ? "is-compose" : ""} ${isHidden || history ? "is-hidden" : ""}`}
        inert={isHidden || history}
        aria-label="RP 对白与输入"
      >
        <div className="wb-rp-deck-bar">
          {!expanded && !!replies.length && (
            <div className="wb-rp-replies" role="group" aria-label="建议回应">
              {replies.map((qr) => (
                <button
                  key={qr.key}
                  title={qr.message}
                  disabled={snap.busy}
                  onClick={() => {
                    host.setInput(qr.message || "");
                    enterCompose();
                  }}
                >
                  {qr.label || qr.message?.slice(0, 45)}
                </button>
              ))}
            </div>
          )}
          <div className="wb-rp-tools" role="toolbar" aria-label="对白工具">
            <button
              className="wb-rp-tool"
              aria-label="切换阅读布局"
              title="切换阅读布局"
              onClick={readingLayout}
            >
              <BookOpen size={16} />
            </button>
            <RPAppearance host={host} />
            {host.isGenerating() && (
              <button
                className="wb-rp-tool"
                aria-label="停止生成"
                title="停止生成"
                onClick={() => run(() => host.click("#mes_stop"))}
              >
                <Square size={16} />
              </button>
            )}
            {current?.editing ? (
              <>
                <button
                  className="wb-rp-tool"
                  aria-label="保存对白编辑"
                  title="保存对白编辑"
                  onClick={() => nativeAction(".mes_edit_done")}
                >
                  <Check size={16} />
                </button>
                <button
                  className="wb-rp-tool"
                  aria-label="取消对白编辑"
                  title="取消对白编辑"
                  onClick={() => nativeAction(".mes_edit_cancel")}
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                <button
                  className="wb-rp-tool"
                  aria-label={`${actionLabels.regenerate}当前回复`}
                  title={`${actionLabels.regenerate}当前回复`}
                  disabled={snap.busy || !current || current.user || current.id !== snap.messages.length - 1}
                  onClick={() => run(() => host.click("#option_regenerate"))}
                >
                  <RotateCcw size={16} />
                </button>
                <button
                  className="wb-rp-tool"
                  aria-label="编辑当前对白"
                  title="编辑当前对白"
                  disabled={snap.busy || !current || compose}
                  onClick={() => nativeAction(".mes_edit")}
                >
                  <PencilLine size={16} />
                </button>
                {addonEnabled(prefs, "image-gen") && (
                  <button
                    className="wb-rp-tool"
                    aria-label="为当前对白生图"
                    title="为当前对白生图"
                    disabled={snap.busy || !current || compose}
                    onClick={() => beginImage(host, current!.id)}
                  >
                    <ImagePlus size={16} />
                  </button>
                )}
              </>
            )}
            {compose && (
              <button
                className="wb-rp-tool"
                aria-label={expanded ? "还原 RP 输入区" : "展开 RP 输入区"}
                title={expanded ? "还原输入区" : "展开输入区"}
                aria-expanded={expanded}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            )}
            <button
              className="wb-rp-tool"
              aria-label="上一段对白"
              title="上一段对白"
              disabled={
                (!compose && current === messages[0] && page === 0 && !scroll.scrolled) ||
                !current ||
                current.editing
              }
              onClick={() => turn(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              className="wb-rp-tool"
              aria-label="下一段对白或输入"
              title="下一段对白或输入"
              disabled={compose || !!current?.editing}
              onClick={() => turn(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        <div className="wb-rp-plate">
          {(compose || current?.user ? presentation.userPortrait : presentation.portrait) && (
            <img src={compose || current?.user ? presentation.userPortrait : presentation.portrait} alt="" />
          )}
          <strong>{compose ? presentation.userName : current?.name || presentation.name}</strong>
        </div>
        {!compose && (
          <div className="wb-rp-foot">
            <div className="wb-rp-dots">
              {visibleDots.map((index) => (
                <button
                  key={index}
                  aria-label={`对白第 ${index + 1} 段`}
                  aria-current={index === page ? "true" : undefined}
                  disabled={!!current?.editing}
                  onClick={() => {
                    live.current = false;
                    setCursor({ id: current!.id, page: index, compose: false });
                  }}
                />
              ))}
            </div>
            <button
              className="wb-rp-reply-field"
              aria-label="输入回应"
              disabled={!!current?.editing}
              onClick={enterCompose}
            >
              <span>{scroll.overflow ? "长对白可滚动阅读 · 输入回应…" : "输入回应…"}</span>
              <i className="wb-rp-reply-send" aria-hidden="true">
                <ArrowUp size={15} />
              </i>
            </button>
            {!current?.editing && (
              <button className="wb-rp-next" onClick={() => turn(1)}>
                {!scroll.end
                  ? "继续阅读"
                  : page + 1 === current?.pages.length && current === messages.at(-1)
                    ? "继续，轮到你回应"
                    : "继续下一段"}
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        )}
      </section>
      {!isHidden && (
        <button
          className="wb-rp-corner wb-rp-log-toggle"
          aria-label={history ? "关闭对话记录" : "查看对话记录"}
          title={history ? "回到对白" : "对话记录"}
          aria-pressed={history}
          onClick={() => setHistory(!history)}
        >
          <History size={16} aria-hidden="true" />
          {history ? "对白" : "记录"}
        </button>
      )}
      {history && (
        <>
          <div className="wb-rp-log-head">
            <h2>对话记录</h2>
            <small>
              {snap.chatName}
              {messages.length ? ` · ${messages.length} 层` : ""}
            </small>
            <button aria-label="返回 RP 对白" onClick={() => setHistory(false)}>
              <ChevronLeft size={15} aria-hidden="true" />
              返回对白
            </button>
          </div>
          <ReadingPresentation host={host} chatStyle />
        </>
      )}
    </>
  );
}
