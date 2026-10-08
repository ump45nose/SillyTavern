import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Play, ArrowUp, Menu, MessagesSquare, Paperclip, RotateCcw, UserRoundPen, WandSparkles } from "lucide-react";
import type {ComposerPopup} from "./ComposerPopovers";
import type { HostAdapter } from "../host/adapter";
/** Decorate native controls in-place: event handlers, selection and plugin nodes stay owned by ST. */
export function Composer({ host, toolbar, busy, run, open }: {
  host: HostAdapter; toolbar: HTMLElement; busy: boolean;
  run: (fn: () => unknown) => unknown; open: (popup:ComposerPopup) => void;
}) {
  const [ratio, setRatio] = useState(Math.min(.6, Math.max(.2, host.prefs().inputRatio ?? .2)));
  const ratioRef = useRef(ratio), drag = useRef<{y: number; ratio: number; height: number} | null>(null);
  ratioRef.current = ratio;
  useEffect(()=>{
    const cleanup:(()=>void)[]=[];
    for(const [id,kind,label] of [["options_button","menu","聊天菜单"],["extensionsMenuButton","tools","扩展工具"]] as const){
      const node=document.getElementById(id);if(!node)continue;
      const attributes=["role","aria-label","aria-haspopup","aria-expanded","tabindex"],previous=attributes.map(a=>node.getAttribute(a));
      node.setAttribute("role","button");node.setAttribute("aria-label",label);node.setAttribute("aria-haspopup","dialog");node.setAttribute("aria-expanded","false");node.tabIndex=0;
      const click=(e:Event)=>{e.preventDefault();e.stopImmediatePropagation();open({kind,anchor:node});};
      const key=(e:KeyboardEvent)=>{if(e.key==="Enter"||e.key===" ")click(e);};
      node.addEventListener("click",click,true);node.addEventListener("keydown",key,true);
      cleanup.push(()=>{node.removeEventListener("click",click,true);node.removeEventListener("keydown",key,true);attributes.forEach((a,i)=>previous[i]===null?node.removeAttribute(a):node.setAttribute(a,previous[i]!));});
    }
    return()=>cleanup.forEach(fn=>fn());
  },[open]);
  useEffect(() => {
    const input = document.getElementById("send_textarea")!;
    const names = ["placeholder", "connected_text", "no_connection_text"];
    const previous = names.map(name => input.getAttribute(name));
    const connected = "写下接下来发生的事… 支持 Markdown、XML 与酒馆宏";
    const disconnected = "连接模型后开始创作，或先写下草稿…";
    input.setAttribute("connected_text", connected);
    input.setAttribute("no_connection_text", disconnected);
    const sync = () => input.setAttribute("placeholder", host.snapshot().online ? connected : disconnected);
    const unsubscribe = host.subscribe(sync); sync();
    return () => { unsubscribe(); names.forEach((name, i) => { if (previous[i] === null) input.removeAttribute(name); else input.setAttribute(name, previous[i]!); }); };
  }, [host]);
  useEffect(() => {
    const area = document.getElementById("sheld")!;
    const apply = () => document.body.style.setProperty("--wb-composer-height", `${Math.max(152, area.clientHeight * ratioRef.current)}px`);
    const observer = new ResizeObserver(apply);
    observer.observe(area); apply();
    return () => { observer.disconnect(); document.body.style.removeProperty("--wb-composer-height"); document.body.classList.remove("wb-resizing"); };
  }, []);
  useEffect(() => {
    document.body.style.setProperty("--wb-composer-height", `${Math.max(152, document.getElementById("sheld")!.clientHeight * ratio)}px`);
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
  return <>
    {nativeIcon("options_button", <Menu className="wb-native-icon" size={18} aria-hidden="true" />)}
    {nativeIcon("extensionsMenuButton", <WandSparkles className="wb-native-icon" size={18} aria-hidden="true" />)}
    {nativeIcon("send_but", <ArrowUp className="wb-native-icon wb-send-icon" size={22} aria-hidden="true" />)}
    {createPortal(<>
      <button className="wb-input-grip" role="separator" aria-label="调整输入框高度" aria-orientation="horizontal" aria-valuemin={20} aria-valuemax={60} aria-valuenow={Math.round(ratio * 100)} title="上拉增加输入高度 · 双击恢复" onPointerDown={e => {
        if (e.button !== 0) return;
        e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
        const height = document.getElementById("sheld")!.clientHeight;
        drag.current = { y: e.clientY, ratio: document.getElementById("send_form")!.getBoundingClientRect().height / height, height };
        document.body.classList.add("wb-resizing");
      }} onPointerMove={e => {
        const start = drag.current;
        if (start) setRatio(Math.min(.6, Math.max(.2, start.ratio + (start.y - e.clientY) / start.height)));
      }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
      onDoubleClick={() => { setRatio(.2); host.preference({ inputRatio: .2 }); }}
      onKeyDown={e => {
        const value = e.key === "ArrowUp" ? ratio + .025 : e.key === "ArrowDown" ? ratio - .025 : e.key === "Home" ? .2 : e.key === "End" ? .6 : null;
        if (value === null) return;
        e.preventDefault(); const next = Math.min(.6, Math.max(.2, value)); setRatio(next); host.preference({ inputRatio: next });
      }}><span /></button>
      <div className="wb-composer-actions">
        <button title="续写" aria-label="续写" disabled={busy} onClick={() => run(() => host.click("#option_continue"))}><Play size={16} /></button>
        <button title="重生成" aria-label="重生成" disabled={busy} onClick={() => run(() => host.click("#option_regenerate"))}><RotateCcw size={16} /></button>
        <button title="快速回复" aria-label="快速回复" aria-haspopup="dialog" onClick={e=>open({kind:"quick",anchor:e.currentTarget})}><MessagesSquare size={16} /></button>
        <button title="AI 帮答" aria-label="AI 帮答" disabled={busy} onClick={()=>run(()=>host.click("#option_impersonate"))}><UserRoundPen size={17}/></button>
        <button title="附件" aria-label="附件" onClick={() => run(() => host.click("#attachFile"))}><Paperclip size={16} /></button>
      </div>
    </>, toolbar)}
  </>;
}
