import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
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
import { motionAllowed, usePresence } from "./Motion";
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
    dock = document.getElementById("form_sheld")!,
    stage = document.getElementById("sheld")!,
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
  // Noval: the pill grows into the full-screen editor and shrinks back into it. The page is the
  // native #form_sheld let out of the flow ([data-wb-page]); #chat keeps its place with a margin
  // where the pill was. While the page moves, #sheld[data-wb-rise] lifts it over the header; once it
  // covers the window, body[data-wb-covered] hides what is underneath. The morph is a Web Animation
  // of the page's offset and clip from the pill's rectangle: no class changes mid-motion, and the
  // textarea stays the same node.
  const motion = useRef<Animation[]>([]),
    pull = useRef<{
      y: number;
      pointer: number;
      dy: number;
      previous: { y: number; t: number };
      last: { y: number; t: number };
    } | null>(null);
  const settle = () => {
    motion.current.forEach((a) => a.cancel());
    motion.current = [];
  };
  const moving = (on: boolean) => {
    if (on) {
      stage.dataset.wbRise = "";
      delete document.body.dataset.wbCovered;
    } else {
      delete stage.dataset.wbRise;
      document.body.dataset.wbCovered = "";
    }
  };
  const letGo = () => {
    settle();
    delete dock.dataset.wbPage;
    delete stage.dataset.wbRise;
    delete document.body.dataset.wbCovered;
    dock.style.removeProperty("translate");
    document.getElementById("chat")!.style.removeProperty("margin-bottom");
  };
  const pillShape = (page: DOMRect, pill: DOMRect, top = pill.top) => ({
    translate: `0 ${top - page.top}px`,
    clipPath: `inset(0px ${page.right - pill.right}px ${page.height - (pill.bottom - top)}px ${pill.left - page.left}px round 24px)`,
  });
  const openPage = (rise = 0) => {
    if (latest.current.editor) return;
    settle();
    const pill = form.getBoundingClientRect(),
      duration = motionAllowed() ? 340 : 0;
    delete dock.dataset.wbDrag;
    dock.style.removeProperty("--wb-rise");
    dock.style.removeProperty("--wb-rise-fade");
    document.getElementById("chat")!.style.setProperty("margin-bottom", `${dock.offsetHeight}px`);
    dock.dataset.wbPage = "";
    moving(true);
    const page = dock.getBoundingClientRect(),
      grow = dock.animate(
        [pillShape(page, pill, pill.top - rise), { translate: "0 0", clipPath: "inset(0px round 0px)" }],
        { duration, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    motion.current = [
      grow,
      form.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: duration * 0.6,
        delay: duration * 0.3,
        easing: "ease-out",
        fill: "backwards",
      }),
    ];
    grow.finished.then(
      () => moving(false),
      () => {},
    );
    flushSync(() => setEditing(true));
  };
  const closePage = (from = 0) => {
    if (!latest.current.editor) return;
    settle();
    dock.style.removeProperty("translate");
    // The pill's place is measured with the page back in the flow for a moment; the reading's
    // scroll is put back, as the shorter chat may have clamped it.
    const chat = document.getElementById("chat")!,
      page = dock.getBoundingClientRect(),
      margin = chat.style.getPropertyValue("margin-bottom"),
      scroll = chat.scrollTop;
    delete dock.dataset.wbPage;
    chat.style.removeProperty("margin-bottom");
    const pill = form.getBoundingClientRect(),
      duration = motionAllowed() ? 300 : 0;
    chat.style.setProperty("margin-bottom", margin);
    chat.scrollTo({ top: scroll, behavior: "instant" });
    dock.dataset.wbPage = "";
    moving(true);
    const shrink = dock.animate(
      [{ translate: `0 ${from}px`, clipPath: "inset(0px round 0px)" }, pillShape(page, pill)],
      { duration, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" },
    );
    motion.current = [
      shrink,
      form.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: duration * 0.45,
        easing: "ease-in",
        fill: "forwards",
      }),
    ];
    shrink.finished.then(
      () => {
        letGo();
        motion.current = [
          form.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * 0.5, easing: "ease-out" }),
        ];
      },
      () => {},
    );
    flushSync(() => setEditing(false));
  };
  const edit = (value: boolean) => (rp ? setEditing(value) : value ? openPage() : closePage());
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
    // Noval's page keys off its own attributes (a class on <body> stalls its first frame).
    document.body.classList.toggle("wb-mobile-editor", editor && rp);
    document.body.classList.toggle("wb-mobile-tools", sheet === "tools");
  }, [editor, sheet, rp]);
  useLayoutEffect(() => () => document.body.classList.remove("wb-mobile-editor", "wb-mobile-tools"), []);
  useEffect(() => {
    setSheet(null);
    setEditor(false);
  }, [rp, snap.chatName, snap.character?.id]);
  useEffect(() => {
    // A draft taller than the pill scrolls under the finger; a short one lets the pill be pulled up.
    const changed = () => {
      setLength(input.value.length);
      input.toggleAttribute("data-wb-overflow", input.scrollHeight > input.clientHeight + 1);
    };
    changed();
    input.addEventListener("input", changed);
    const image = () => {
      setSheet(null);
      setEditor(false);
      closeDrawers();
    };
    const off = [
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
      input.removeAttribute("data-wb-overflow");
      off.forEach((f) => f());
    };
  }, []);
  // The page lets go of the native nodes whenever the editor closes without its motion (a chat or
  // layout change), and on unmount.
  useLayoutEffect(() => {
    if (!editor && !motion.current.length) letGo();
  }, [editor]);
  useEffect(
    () => () => {
      letGo();
      delete dock.dataset.wbDrag;
      for (const name of ["--wb-rise", "--wb-rise-fade"]) dock.style.removeProperty(name);
    },
    [],
  );
  // Noval: pulling the pill up grows its card with the finger; past the threshold, or on a flick,
  // the card carries on into the full editor, otherwise it settles back.
  useEffect(() => {
    if (rp || editor) return;
    let drag: {
      x: number;
      y: number;
      pointer: number;
      room: number;
      rise: number;
      started: boolean;
      previous: { y: number; t: number };
      last: { y: number; t: number };
    } | null = null;
    const reset = () => {
      delete dock.dataset.wbDrag;
      dock.style.removeProperty("--wb-rise");
      dock.style.removeProperty("--wb-rise-fade");
    };
    const down = (e: PointerEvent) => {
      const target = e.target as Element;
      if (e.button !== 0 || e.pointerType === "mouse" || target.closest("button,a,select")) return;
      if (target === input && input.hasAttribute("data-wb-overflow")) return;
      const at = { y: e.clientY, t: e.timeStamp };
      drag = {
        x: e.clientX,
        y: e.clientY,
        pointer: e.pointerId,
        room: form.getBoundingClientRect().top - stage.getBoundingClientRect().top,
        rise: 0,
        started: false,
        previous: at,
        last: at,
      };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      const dy = drag.y - e.clientY;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.x, dy) < 8) return;
        if (dy <= 0 || Math.abs(e.clientX - drag.x) > dy) {
          drag = null;
          return;
        }
        drag.started = true;
        dock.dataset.wbDrag = "";
      }
      drag.rise = Math.min(drag.room, Math.max(0, dy));
      drag.previous = drag.last;
      drag.last = { y: e.clientY, t: e.timeStamp };
      dock.style.setProperty("--wb-rise", `${drag.rise}px`);
      dock.style.setProperty("--wb-rise-fade", String(Math.min(0.75, drag.rise / 160)));
    };
    const up = (e: PointerEvent) => {
      const current = drag;
      drag = null;
      if (!current?.started || e.pointerId !== current.pointer) return;
      const speed = (current.previous.y - current.last.y) / Math.max(1, current.last.t - current.previous.t);
      if (speed > 0.45 || current.rise > 72) openPage(current.rise);
      else reset();
    };
    const cancel = () => {
      drag = null;
      reset();
    };
    form.addEventListener("pointerdown", down);
    form.addEventListener("pointermove", move);
    form.addEventListener("pointerup", up);
    form.addEventListener("pointercancel", cancel);
    return () => {
      form.removeEventListener("pointerdown", down);
      form.removeEventListener("pointermove", move);
      form.removeEventListener("pointerup", up);
      form.removeEventListener("pointercancel", cancel);
      reset();
    };
  }, [rp, editor]);
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
        const close = document.querySelector<HTMLElement>(
          left ? ".wb-mobile-drawer-close" : ".wb-panel-close",
        );
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
  // The panel's tab row scrolls; keep the open tab in view.
  useEffect(() => {
    if (!panel) return;
    const frame = requestAnimationFrame(() => {
      const tab = document.querySelector<HTMLElement>(".wb-right .wb-panel-tab.is-active"),
        row = tab?.parentElement;
      row?.scrollTo({
        left: tab!.offsetLeft - row.offsetLeft - (row.clientWidth - tab!.offsetWidth) / 2,
        behavior: motionAllowed() ? "smooth" : "auto",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [panel]);
  // RP: a long press on the latest reply opens its actions (the dialogue box itself turns pages).
  useEffect(() => {
    const chat = document.getElementById("chat")!;
    let press: ReturnType<typeof setTimeout> | undefined,
      origin: { x: number; y: number } | null = null;
    const cancel = () => {
      clearTimeout(press);
      press = undefined;
      origin = null;
    };
    const down = (e: PointerEvent) => {
      if (!rp || e.button !== 0 || e.pointerType !== "touch") return;
      const message = (e.target as Element).closest<HTMLElement>(".mes");
      if (
        !message ||
        message !== chat.querySelector(".mes:last-child") ||
        message.getAttribute("is_user") === "true"
      )
        return;
      origin = { x: e.clientX, y: e.clientY };
      press = setTimeout(() => {
        cancel();
        setSheet(message);
      }, 550);
    };
    const move = (e: PointerEvent) => {
      if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 10) cancel();
    };
    const context = (e: MouseEvent) => {
      if (!rp) return;
      const message = (e.target as Element).closest<HTMLElement>(".mes");
      if (message === chat.querySelector(".mes:last-child") && message?.getAttribute("is_user") !== "true") {
        e.preventDefault();
        setSheet(message);
      }
    };
    // Native swipe events normally change reply candidates; on the phone a sideways drag moves the drawers.
    const nativeSwipe = (e: Event) => {
      if ((e.target as Element)?.closest("#chat") && !(e.target as Element).closest(interactive))
        e.stopImmediatePropagation();
    };
    chat.addEventListener("pointerdown", down);
    chat.addEventListener("pointermove", move);
    chat.addEventListener("pointerup", cancel);
    chat.addEventListener("pointercancel", cancel);
    chat.addEventListener("contextmenu", context);
    document.addEventListener("swiped-left", nativeSwipe, true);
    document.addEventListener("swiped-right", nativeSwipe, true);
    return () => {
      cancel();
      chat.removeEventListener("pointerdown", down);
      chat.removeEventListener("pointermove", move);
      chat.removeEventListener("pointerup", cancel);
      chat.removeEventListener("pointercancel", cancel);
      chat.removeEventListener("contextmenu", context);
      document.removeEventListener("swiped-left", nativeSwipe, true);
      document.removeEventListener("swiped-right", nativeSwipe, true);
    };
  }, [rp]);
  // Drawers follow the finger. A sideways drag on the reading (RP: the scene around the dialogue box)
  // pulls the outline out from the left or the panel from the right; a drag on an open drawer or its
  // shade pushes it back. On release, a flick or more than 40% shown decides.
  useEffect(() => {
    type Drag = {
      x: number;
      y: number;
      t: number;
      pointer: number;
      target: Element;
      opening: boolean;
      side?: "left" | "right";
      node?: HTMLElement;
      width?: number;
      shown?: number;
      previous: { x: number; t: number };
      last: { x: number; t: number };
    };
    let drag: Drag | null = null;
    // Drag state lives in data attributes and inline styles on the drawer and its shade only: class
    // writes wake SillyTavern's keyboard observer, and anything on <body> restyles the whole page.
    const shade = () => document.querySelector<HTMLElement>(".wb-mobile-shade");
    const release = (node?: HTMLElement) => {
      if (!node) return;
      delete node.dataset.wbDrag;
      node.style.removeProperty("--wb-drawer-x");
      const veil = shade();
      if (veil) {
        delete veil.dataset.wbDrag;
        veil.style.removeProperty("opacity");
      }
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType !== "touch") return;
      const target = e.target as Element,
        state = latest.current;
      if (state.editor || state.sheet) return;
      const open = state.left || !!state.panel;
      if (open) {
        if (!target.closest(".wb-left,.wb-right,.wb-mobile-shade")) return;
        if (
          target.closest(
            "input,textarea,select,[contenteditable=true],.wb-panel-tabs,.wb-mobile-resource-popup",
          )
        )
          return;
      } else {
        // Selecting text in the reading is not a swipe.
        const selection = getSelection(),
          anchor = selection?.anchorNode,
          inReading = (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest("#chat");
        if (target.closest(interactive) || (selection?.toString() && inReading)) return;
        if (rp ? target.closest(".wb-ui,#sheld,.wb-mobile-header") : !target.closest("#chat")) return;
      }
      const at = { x: e.clientX, t: e.timeStamp };
      drag = {
        x: e.clientX,
        y: e.clientY,
        t: e.timeStamp,
        pointer: e.pointerId,
        target,
        opening: !open,
        side: open ? (state.left ? "left" : "right") : undefined,
        previous: at,
        last: at,
      };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (!drag.node) {
        if (Math.hypot(dx, dy) < 10) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) {
          drag = null;
          return;
        }
        drag.side ??= dx > 0 ? "left" : "right";
        drag.node = document.querySelector<HTMLElement>(drag.side === "left" ? ".wb-left" : ".wb-right")!;
        drag.width = drag.node.offsetWidth;
        drag.node.dataset.wbDrag = "";
        const veil = shade();
        if (veil) veil.dataset.wbDrag = "";
      }
      const toward = drag.side === "left" ? dx : -dx,
        shown = Math.min(drag.width!, Math.max(0, drag.opening ? toward : drag.width! + toward));
      drag.shown = shown;
      drag.previous = drag.last;
      drag.last = { x: e.clientX, t: e.timeStamp };
      drag.node.style.setProperty("--wb-drawer-x", `${shown}px`);
      shade()?.style.setProperty("opacity", String(shown / drag.width!));
    };
    const up = (e: PointerEvent) => {
      const current = drag;
      drag = null;
      if (!current?.node || e.pointerId !== current.pointer) return;
      const sign = current.side === "left" ? 1 : -1,
        speed =
          ((current.last.x - current.previous.x) * sign) / Math.max(1, current.last.t - current.previous.t),
        travel = (e.clientX - current.x) * sign,
        quick = e.timeStamp - current.t < 300 && Math.abs(travel) > 40,
        flick = speed > 0.35 ? true : speed < -0.35 ? false : quick ? travel > 0 : null,
        open = flick ?? current.shown! > current.width! * 0.4;
      // The new state and the drag styles leave in one frame, so the slide continues from the finger.
      flushSync(() => {
        if (open && current.opening) current.side === "left" ? toggleLeft() : goPanel("character");
        if (!open && !current.opening) closeDrawers();
      });
      release(current.node);
      // A drag that began on a row or the shade must not also click it.
      const swallow = (click: Event) => {
        document.removeEventListener("click", swallow, true);
        if (!current.target.contains(click.target as Node)) return;
        click.stopPropagation();
        click.preventDefault();
      };
      document.addEventListener("click", swallow, true);
      setTimeout(() => document.removeEventListener("click", swallow, true), 300);
    };
    const cancel = () => {
      release(drag?.node);
      drag = null;
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", cancel);
    return () => {
      cancel();
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", cancel);
    };
  }, [rp, toggleLeft, goPanel, closeDrawers]);
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
  // A sheet follows its handle down; past a third of its height or on a flick it closes, otherwise
  // it settles back.
  useEffect(() => {
    const node = sheetRef.current;
    if (!node || presence.exiting) return;
    let drag: {
      y: number;
      pointer: number;
      dy: number;
      previous: { y: number; t: number };
      last: { y: number; t: number };
    } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !(e.target as Element).closest(".wb-mobile-sheet-grip,.wb-mobile-sheet > header"))
        return;
      if ((e.target as Element).closest("button")) return;
      const at = { y: e.clientY, t: e.timeStamp };
      drag = { y: e.clientY, pointer: e.pointerId, dy: 0, previous: at, last: at };
      node.dataset.wbDrag = "";
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      drag.dy = Math.max(0, e.clientY - drag.y);
      drag.previous = drag.last;
      drag.last = { y: e.clientY, t: e.timeStamp };
      node.style.setProperty("--wb-sheet-pull", `${drag.dy}px`);
    };
    const up = (e: PointerEvent) => {
      const current = drag;
      drag = null;
      if (!current || e.pointerId !== current.pointer) return;
      const speed = (current.last.y - current.previous.y) / Math.max(1, current.last.t - current.previous.t);
      delete node.dataset.wbDrag;
      if (speed > 0.5 || current.dy > node.offsetHeight / 3) close();
      else node.style.removeProperty("--wb-sheet-pull");
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
    node.addEventListener("pointercancel", up);
    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      node.removeEventListener("pointercancel", up);
    };
  }, [presence.value, presence.exiting]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editor) {
        e.preventDefault();
        edit(false);
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
      <button
        className={`wb-mobile-shade ${left || panel ? "is-open" : ""}`}
        aria-label="收起边栏"
        aria-hidden={!(left || panel)}
        tabIndex={left || panel ? 0 : -1}
        onClick={closeDrawers}
      />
      {/* The panel closes from the end of its own tab row. */}
      {left && (
        <>
          <span className="wb-mobile-drawer-title wb-ui">大纲与导航</span>
          <button
            className="wb-mobile-drawer-close is-left wb-ui"
            aria-label="关闭边栏"
            onClick={closeDrawers}
          >
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
        <button
          type="button"
          className="wb-mobile-focus-exit wb-ui"
          aria-label="退出专注"
          onClick={toggleFocus}
        >
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
          <div
            className="wb-mobile-editor-heading wb-ui"
            onPointerDown={(e) => {
              if (rp || e.button !== 0 || (e.target as Element).closest("button")) return;
              // Touch is captured implicitly; a mouse needs it to keep the bar while dragging.
              if (e.pointerType === "mouse") e.currentTarget.setPointerCapture(e.pointerId);
              const at = { y: e.clientY, t: e.timeStamp };
              pull.current = { y: e.clientY, pointer: e.pointerId, dy: 0, previous: at, last: at };
              settle();
              moving(true);
            }}
            onPointerMove={(e) => {
              const current = pull.current;
              if (!current || e.pointerId !== current.pointer) return;
              current.dy = Math.max(0, e.clientY - current.y);
              current.previous = current.last;
              current.last = { y: e.clientY, t: e.timeStamp };
              dock.style.setProperty("translate", `0 ${current.dy}px`);
            }}
            onPointerUp={(e) => {
              const current = pull.current;
              pull.current = null;
              if (!current || e.pointerId !== current.pointer) return;
              const speed =
                (current.last.y - current.previous.y) / Math.max(1, current.last.t - current.previous.t);
              if (speed > 0.5 || current.dy > dock.offsetHeight * 0.18) return closePage(current.dy);
              dock.style.removeProperty("translate");
              const back = dock.animate([{ translate: `0 ${current.dy}px` }, { translate: "0 0" }], {
                duration: motionAllowed() ? 240 : 0,
                easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
              });
              motion.current = [back];
              back.finished.then(
                () => moving(false),
                () => {},
              );
            }}
            onPointerCancel={() => {
              if (!pull.current) return;
              pull.current = null;
              dock.style.removeProperty("translate");
              moving(false);
            }}
          >
            <button aria-label="返回聊天，保留草稿" onClick={() => edit(false)}>
              {rp ? <ArrowLeft size={19} /> : <ChevronDown size={22} />}
              {rp && "返回"}
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
                  <button onClick={() => edit(true)}>
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
