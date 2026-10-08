import React, { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PanelLeftOpen, PanelLeftClose, PanelRightOpen, PanelRightClose, ScanLine, X, Activity, BookOpen, SlidersHorizontal, UserRound, UsersRound, Plug, ChevronDown } from "lucide-react";
import { ResourceRailContext } from "./ui/ResourcePicker";
import {ClickFeedback,usePresence} from "./ui/Motion";
import { Header } from "./ui/Header";
import { Composer } from "./ui/Composer";
import { Navigation } from "./ui/Navigation";
import {ComposerPopovers, type ComposerPopup} from "./ui/ComposerPopovers";
import {ReadingPresentation,ReadingSettings} from "./ui/Reading";
import { Operations, shortcutAction, shortcutHint } from "./host/operations";
import {Shortcuts} from "./ui/Shortcuts";
import type { HostAdapter } from "./host/adapter";
import type { Panel, Resource, SettingsPage } from "./host/types";
import {
  useHost,
  useTask,
  IconButton,
  Empty,
  Dialog,
  Loading,
} from "./ui/common";
const World = lazy(() => import("./modules/World"));
const Characters = lazy(() => import("./modules/Characters"));
const Resources = lazy(() => import("./modules/Resources"));
const Trace = lazy(() => import("./modules/Trace"));
const SettingsWorkspace=lazy(()=>import("./modules/SettingsWorkspace"));
const labels = {
  connection: "连接",
  preset: "预设",
  world: "世界书",
  persona: "用户设定",
};
export function beforeClose() {
  return window.dispatchEvent(
    new Event("wb-before-close", { cancelable: true }),
  );
}
export default function App({
  host,
  trace,
  toolbar,
  onExit,
}: {
  host: HostAdapter;
  trace: any;
  toolbar: HTMLElement;
  onExit: () => void;
}) {
  const [operations] = useState(() => new Operations());
  const snap = useHost(host),
    task = useTask(),
    [left, setLeft] = useState(host.prefs().left),
    [panel, setPanel] = useState<Panel>(null),
    [chooser, setChooser] = useState<Resource | null>(null),
    [focusId, setFocusId] = useState(""),
    [deep, setDeep] = useState<Panel | "library">(null),
    [focus, setFocus] = useState(false),
    [width, setWidth] = useState(window.innerWidth),
    [renderedPanel, setRenderedPanel] = useState<Panel>(null),
    [tabsOpen, setTabsOpen] = useState(false),
    [railOpen, setRailOpen] = useState(true),
    [railTarget, setRailTarget] = useState<HTMLElement|null>(null),
    [popup,setPopup]=useState<ComposerPopup|null>(null),
    [workspace,setWorkspace]=useState<{page:SettingsPage;group?:string;initial?:string}|null>(null),
    [help, setHelp] = useState(false),
    [externalError, setExternalError] = useState("");
  const selectedIds = useRef<Partial<Record<NonNullable<Panel>, string>>>({});
  const popupPresence=usePresence(popup),workspacePresence=usePresence(workspace),helpPresence=usePresence(help?true:null);
  const openPopup=useCallback((next:ComposerPopup)=>setPopup(prev=>prev?.kind===next.kind&&prev.anchor===next.anchor?null:next),[]);
  const openSettings=(page:SettingsPage,group?:string,initial?:string)=>{if(!beforeClose())return;setPopup(null);setPanel(null);setChooser(null);setDeep(null);setWorkspace({page,group,initial});};
  const goPanel = (next: Panel, id?: string) => {
    if (!beforeClose()) return;
    if (next && id !== undefined) selectedIds.current[next] = id;
    setPanel(next);
    if(next)setRailOpen(true);
    if (next) setFocusId(id ?? selectedIds.current[next] ?? "");
    setChooser(null);
  };
  const goDeep = (next: Panel | "library", id = "") => {
    if(next==="world"||next==="connection"||next==="preset"||next==="persona"||next==="library"){openSettings(next==="preset"?"generation":next==="library"?"character":next,undefined,id);return;}
    if (!beforeClose()) return;
    setDeep(next);
    setFocusId(id);
    setPanel(null);
    setChooser(null);
  };
  const next = (kind: Resource) =>
    task.run(async () => {
      const items = snap.resources[kind];
      if (!items.length) {
        goPanel(kind);
        return;
      }
      const index = items.findIndex(
        (x) =>
          x.id ===
          (kind === "world"
            ? focusId || snap.current.world
            : snap.current[kind]),
      );
      const item = items[(index + 1) % items.length];
      if (kind === "world") goPanel(kind, item.id);
      else await host.select(kind, item.id);
    });
  for (const kind of [
    "connection",
    "preset",
    "world",
    "persona",
  ] as Resource[]) {
    operations.register(`open.${kind}`, () => goPanel(kind));
    operations.register(`next.${kind}`, () => next(kind));
  }
  operations.register("open.trace", () => goPanel("trace"));
  operations.register("open.character", () => goPanel("character"));
  const leftWidth = width <= 1400 ? 240 : 260, rightWidth = width <= 1400 ? 440 : 460;
  const railVisible=!!panel&&panel!=="trace"&&railOpen&&!focus;
  const leftVisible = left && !focus && (!panel || width - leftWidth - rightWidth - (railVisible?180:0) >= 420);
  const toggleLeft = () => { if (left && !leftVisible && !focus) goPanel(null); else setLeft(v => !v); };
  const toggleFocus = () => { setChooser(null); setFocus(v => !v); };
  operations.register("toggle.left", toggleLeft);
  operations.register("toggle.focus", toggleFocus);
  useEffect(() => { const resize = () => setWidth(window.innerWidth); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize); }, []);
  useEffect(() => {
    if (panel) { setRenderedPanel(panel); return; }
    const timer = setTimeout(() => setRenderedPanel(null), 220);
    return () => clearTimeout(timer);
  }, [panel]);
  useEffect(() => { host.preference({ left }); }, [left]);
  useLayoutEffect(() => {
    document.body.classList.toggle("wb-left-open", leftVisible);
    document.body.classList.toggle("wb-right-open", !!panel && !focus);
    document.body.classList.toggle("wb-focus", focus);
    document.body.classList.toggle("wb-rail-open",railVisible);
  }, [leftVisible, panel, focus, railVisible]);
  useEffect(() => {
    const handler = (e: Event) => setExternalError((e as CustomEvent).detail);
    window.addEventListener("wb-error", handler);
    return () => window.removeEventListener("wb-error", handler);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.isComposing || workspace) return;
      if (e.key === "Escape") {
        if (chooser) {
          setChooser(null);
          return;
        }
        if (focus) {
          setFocus(false);
          return;
        }
        host.closeNative();
        return;
      }
    };
    const shortcut=(e:KeyboardEvent)=>{
      if(e.defaultPrevented||e.isComposing||e.repeat||e.getModifierState("AltGraph")||workspace||deep||help||document.querySelector("dialog[open]"))return;
      const prefs=host.prefs();if(prefs.shortcutsEnabled===false)return;
      const action=shortcutAction(e,prefs.shortcuts);
      if(action){e.preventDefault();e.stopPropagation();operations.run(action);}
    };
    document.addEventListener("keydown", key);
    document.addEventListener("keydown",shortcut,true);
    return () => {document.removeEventListener("keydown", key);document.removeEventListener("keydown",shortcut,true);};
  });
  const content = (kind: Panel, independent = false) =>
    kind === "world" ? (
      <World
        key={`world:${focusId}`}
        host={host}
        initial={focusId}
        deep={independent}
        onDeep={independent ? undefined : (name) => goDeep("world", name)}
      />
    ) : kind === "character" ? (
      <Characters host={host} onManage={group => group?openSettings("character",group):goDeep("library")} />
    ) : kind === "trace" ? (
      <Trace host={host} trace={trace} />
    ) : kind ? (
      <Resources
        key={`${kind}:${focusId}`}
        host={host}
        kind={kind}
        onSelection={id => { selectedIds.current[kind] = id; }}
        initial={focusId}
        deep={independent}
        onDeep={independent ? undefined : (id) => goDeep(kind, id)}
      />
    ) : null;
  return (
    <>
      <ClickFeedback/>
      <Header snap={snap} panel={panel} chooser={chooser} setChooser={setChooser} goPanel={goPanel}
        next={kind => operations.run(`next.${kind}`)} model={host.model()} focus={toggleFocus} focused={focus}
        focusShortcut={host.prefs().shortcutsEnabled===false?"":shortcutHint("toggle.focus",host.prefs().shortcuts)}
        select={(kind, id, enabled) => task.run(async () => {
          if (kind === "world") await host.toggleBook(id, enabled);
          else await host.select(kind, id);
        })} />
      <div className="wb-reading-bar">
        {!focus && <IconButton title={`收纳左栏${host.prefs().shortcutsEnabled!==false&&shortcutHint("toggle.left",host.prefs().shortcuts)?" · "+shortcutHint("toggle.left",host.prefs().shortcuts):""}`} onClick={() => operations.run("toggle.left")}>
          {leftVisible ? <PanelLeftClose size={21} /> : <PanelLeftOpen size={21} />}
        </IconButton>}
        <span className="wb-chat-name" title={snap.chatName}>{snap.chatName || "开始一段新的故事"}</span>
        <span className="wb-grow" />
        <ReadingSettings host={host}/>
        {focus ? <button className="wb-exit-focus wb-top-action is-active" title="退出专注" aria-label="退出专注" aria-pressed="true" onClick={toggleFocus}><ScanLine size={24} /></button> :
          <IconButton title={panel ? "关闭右栏" : "角色与资源侧栏"} onClick={() => goPanel(panel ? null : "character")}>
            {panel ? <PanelRightClose size={21} /> : <PanelRightOpen size={21} />}
          </IconButton>}
      </div>
      <Navigation host={host} snap={snap} visible={leftVisible} settings={openSettings} open={openPopup}
        help={() => setHelp(true)} exit={() => { if (beforeClose()) onExit(); }} run={task.run} />
      <aside id="wb-resource-rail" ref={setRailTarget} className={`wb-resource-rail ${railVisible?"is-open":""}`} inert={!railVisible} aria-hidden={!railVisible} aria-label="资源列表与角色信息"/>
      <aside className={`wb-right ${panel && !focus ? "is-open" : ""}`} inert={!panel || focus} aria-hidden={!panel || focus} aria-label="角色与资源">
        <button className="wb-panel-switch" aria-label="展开资源分类" aria-expanded={tabsOpen} onClick={()=>setTabsOpen(!tabsOpen)}><span>{panel==="character"?"角色":panel==="trace"?"Trace":panel?labels[panel]:"角色与资源"}</span><ChevronDown size={14}/></button>
        <div className={`wb-panel-tabs-fold ${tabsOpen?"is-open":""}`} inert={!tabsOpen}>
        <div className="wb-panel-tabs">
          {([["character", "角色", UsersRound], ["world", "世界书", BookOpen], ["preset", "预设", SlidersHorizontal], ["connection", "连接", Plug], ["persona", "用户设定", UserRound], ["trace", "Trace", Activity]] as const).map(([kind, label, Icon]) =>
            <button key={kind} className={panel === kind ? "is-active" : ""} aria-pressed={panel === kind} onClick={() => {goPanel(kind);setTabsOpen(false);}}><Icon size={15} />{label}</button>)}
        </div>
        </div>
        {!deep&&!workspace && <div className="wb-panel-content" key={renderedPanel}><ResourceRailContext.Provider value={{open:railOpen,setOpen:setRailOpen,target:railTarget}}><Suspense fallback={<Loading />}>{content(renderedPanel)}</Suspense></ResourceRailContext.Provider></div>}
      </aside>
      {(task.error || externalError) && (
        <div className="wb-toast" role="alert">
          <span>{task.error || externalError}</span>
          <IconButton
            title="关闭提示"
            onClick={() => {
              task.setError("");
              setExternalError("");
            }}
          >
            <X size={15} />
          </IconButton>
        </div>
      )}
      <button className="wb-native-return" onClick={() => host.closeNative()}>
        收起原生面板 <X size={16} />
      </button>
      <ReadingPresentation host={host}/>
      {popupPresence.value&&<ComposerPopovers key={popupPresence.value.kind} host={host} popup={popupPresence.value} exiting={popupPresence.exiting} close={()=>setPopup(null)} settings={openSettings}/>}
      {workspacePresence.value&&<Suspense fallback={<Loading/>}><SettingsWorkspace host={host} page={workspacePresence.value.page} group={workspacePresence.value.group} initial={workspacePresence.value.initial} exiting={workspacePresence.exiting} onClose={()=>setWorkspace(null)}/></Suspense>}
      {deep && (
        <Dialog
          wide
          title={
            deep === "library"
              ? "角色管理"
              : `${deep in labels ? labels[deep as Resource] : "资源"} · 深度编辑`
          }
          onClose={() => {
            if (beforeClose()) setDeep(null);
          }}
        >
          <Suspense fallback={<Loading />}>
            {deep === "library" ? (
              <Characters host={host} management />
            ) : (
              content(deep, true)
            )}
          </Suspense>
        </Dialog>
      )}
      {helpPresence.value && (
        <Dialog title="快捷键" exiting={helpPresence.exiting} onClose={() => setHelp(false)}>
          <Shortcuts host={host}/>
        </Dialog>
      )}
      <Composer host={host} toolbar={toolbar} busy={snap.busy} run={task.run} open={openPopup} />
    </>
  );
}
