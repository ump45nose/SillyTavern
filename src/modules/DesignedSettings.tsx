import React, { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import {
  ChevronRight,
  Copy,
  Download,
  KeyRound,
  PencilLine,
  Plus,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  Upload,
  Volume2,
} from "../ui/icons";
import { defaultContextLimit } from "../host/context-limit";
import type { HostAdapter } from "../host/adapter";
import { Dialog, Field, Notice, SearchBox, useTask } from "../ui/common";
import { HostControl, type FormControl } from "../ui/HostControl";
import { Check, Fold, Switch } from "../ui/ResourceControls";
import { Select } from "../ui/Select";
import { nativePages } from "./NativeSettings";
const titles: Record<string, string> = {
  custom_api_url_text: "API 地址",
  custom_prompt_post_processing: "提示词后处理",
  "auto-connect-checkbox": "自动连接上次使用的服务",
  openai_reverse_proxy: "代理地址",
  openai_reverse_proxy_name: "代理名称",
  openai_proxy_password: "代理凭据",
  server_urls_text: "服务地址",
};
const actionTitles: Record<string, string> = {
  "Manage API keys": "管理 API 凭据",
  "Additional Parameters": "附加请求参数",
  "Update current template": "更新模板",
  "Rename current template": "重命名模板",
  "Save template as": "另存模板",
  "Restore current template": "还原模板",
  "Delete template": "删除模板",
};
function clean(s: string | null | undefined) {
  return (s || "").replace(/\s+/g, " ").trim();
}
function labelOf(n: HTMLElement) {
  const input = n as FormControl,
    l = input.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
  l?.querySelectorAll("input,select,textarea,button,.menu_button").forEach((n) => n.remove());
  const previous = n.previousElementSibling;
  const adjacent =
    previous && !previous.matches("select,input,textarea,.menu_button") ? clean(previous.textContent) : "";
  return (
    titles[n.id] ||
    (/api_key|access_token|auth_token/.test(n.id) ? "API 凭据" : "") ||
    clean(l?.textContent) ||
    n.getAttribute("aria-label") ||
    n.title ||
    clean(n.closest(".range-block")?.querySelector(".range-block-title")?.textContent) ||
    adjacent ||
    n.getAttribute("placeholder") ||
    (n.matches("select,input,textarea") ? "" : clean(n.textContent)) ||
    n.id
  );
}
function iconOf(n: HTMLElement) {
  const s = (n.id + " " + n.className + " " + n.title + " " + n.dataset.action).toLowerCase();
  return /delete|trash|remove/.test(s)
    ? Trash2
    : /import|upload/.test(s)
      ? Upload
      : /export|download/.test(s)
        ? Download
        : /new|create|add/.test(s)
          ? Plus
          : /refresh|update/.test(s)
            ? RefreshCw
            : /restore|reset/.test(s)
              ? RotateCcw
              : /copy|duplicate/.test(s)
                ? Copy
                : /save/.test(s)
                  ? Save
                  : /rename|edit/.test(s)
                    ? PencilLine
                    : /key|secret/.test(s)
                      ? KeyRound
                      : /audio|sound/.test(s)
                        ? Volume2
                        : Settings;
}
function applicable(n: HTMLElement, root: HTMLElement) {
  for (let p: HTMLElement | null = n; p && p !== root; p = p.parentElement) {
    if (p === n && p.matches("input[type=checkbox],input[type=radio]")) continue;
    if (p.hidden) return false;
    if (p.classList.contains("inline-drawer-content") || p.matches("details")) continue;
    if (getComputedStyle(p).display === "none" && !p.matches("select.select2-hidden-accessible"))
      return false;
  }
  return true;
}
const credentials = /url|api_key|access_token|auth_token|password|region|project|tenant|deployment/;
/** The connection fields the runtime card does not mirror, without displaying the original page container. */
export default function DesignedSettings({ host }: { host: HostAdapter }) {
  const ref = useRef<HTMLDivElement>(null),
    [root, setRoot] = useState<HTMLElement | null>(null),
    [error, setError] = useState(""),
    [, redraw] = useReducer((n) => n + 1, 0);
  useLayoutEffect(() => {
    let restore: undefined | (() => void);
    try {
      restore = host.leaseNative(nativePages.connection.id, ref.current!);
      setRoot(ref.current!.firstElementChild as HTMLElement);
    } catch (e) {
      setError(String(e));
    }
    return () => {
      restore?.();
      setRoot(null);
    };
  }, [host]);
  useEffect(() => {
    if (!root) return;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(redraw);
    };
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "hidden", "class", "disabled"],
    });
    root.addEventListener("input", sync);
    root.addEventListener("change", sync);
    const unsub = host.subscribe(sync);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      unsub();
      root.removeEventListener("input", sync);
      root.removeEventListener("change", sync);
    };
  }, [root, host]);
  const c = host.connectionControls(),
    bridged = [
      c.main?.id,
      c.provider?.id,
      c.model?.id,
      c.connect,
      c.test,
      "connection_profiles",
      "view_connection_profile",
      "create_connection_profile",
      "update_connection_profile",
      "edit_connection_profile",
      "reload_connection_profile",
      "delete_connection_profile",
    ];
  const owns = (n: HTMLElement) =>
    !!root && applicable(n, root) && !bridged.includes(n.id) && !n.closest(".wb-connection-bridged");
  const controls = root
    ? [...root.querySelectorAll<FormControl>("input,textarea,select")].filter(
        (n) =>
          owns(n) &&
          n.type !== "hidden" &&
          !n.id.endsWith("_pin") &&
          !n.id.endsWith("_counter") &&
          !n.classList.contains("select2-search__field") &&
          !n.closest(".wb-select"),
      )
    : [];
  const actions = root
    ? [
        ...root.querySelectorAll<HTMLElement>(
          "button,.menu_button,a.menu_button,label.menu_button,[role=tab]",
        ),
      ].filter(
        (n) =>
          owns(n) &&
          !n.closest(".select2-container,.inline-drawer-header") &&
          !n.classList.contains("drawer-toggle") &&
          !n.parentElement?.closest("button,.menu_button") &&
          !n.closest("label:has(input[type=checkbox]),label:has(input[type=radio])"),
      )
    : [];
  const renderControl = (n: FormControl) => {
    const label = labelOf(n),
      isCheck = n instanceof HTMLInputElement && /checkbox|radio/.test(n.type);
    return (
      <div
        key={n.id || controls.indexOf(n)}
        className={`wb-designed-field ${isCheck ? "is-check" : ""} ${n instanceof HTMLTextAreaElement || (n instanceof HTMLSelectElement && n.multiple) ? "is-full" : ""}`}
        data-control={n.id}
      >
        {isCheck ? (
          <label className="wb-check">
            <HostControl node={n} host={host} label={label} />
            <span>{label}</span>
          </label>
        ) : (
          <Field label={label}>
            <HostControl node={n} host={host} label={label} />
            {n instanceof HTMLInputElement && n.type === "range" && <output>{n.value}</output>}
          </Field>
        )}
      </div>
    );
  };
  const renderAction = (n: HTMLElement, i: number) => {
    const Icon = iconOf(n),
      label =
        actionTitles[clean(n.textContent)] ||
        actionTitles[n.title] ||
        clean(n.textContent) ||
        n.title ||
        n.id;
    return (
      <button
        key={n.id || i}
        title={n.title}
        disabled={n.matches(":disabled,.disabled")}
        onClick={() => {
          n.click();
          redraw();
        }}
      >
        <Icon size={15} />
        {label}
      </button>
    );
  };
  return (
    <div className="wb-designed-settings page-connection">
      <div ref={ref} className="wb-settings-source" aria-hidden="true" inert />
      <Notice error={error} />
      <header className="wb-designed-page-head">
        <div>
          <h2>服务与凭据</h2>
        </div>
      </header>
      <section className="wb-designed-section">
        <h3>地址与凭据</h3>
        <div className="wb-designed-fields">
          {controls.filter((n) => credentials.test(n.id)).map(renderControl)}
        </div>
        <div className="wb-designed-actions">
          {actions.filter((n) => n.classList.contains("manage-api-keys")).map(renderAction)}
        </div>
      </section>
      <Fold title="请求与高级参数">
        <div className="wb-designed-fields">
          {controls.filter((n) => !credentials.test(n.id)).map(renderControl)}
        </div>
        <div className="wb-designed-actions">
          {actions.filter((n) => !n.classList.contains("manage-api-keys")).map(renderAction)}
        </div>
      </Fold>
      {!controls.length && !actions.length && <p className="wb-note">当前没有可用配置。</p>}
    </div>
  );
}
/** A row of mutually exclusive choices, drawn as the board's segmented control. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="wb-rail-segment wb-reading-segment" role="radiogroup" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          role="radio"
          aria-checked={value === key}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="wb-reading-range">
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--wb-fill": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>
        {value}
        {unit && ` ${unit}`}
      </output>
    </div>
  );
}
/** 用户设置 › 外观与阅读 (board "Settings"): the workbench's own reading controls beside a live page. */
export function ReadingForm({ host }: { host: HostAdapter }) {
  const p = host.prefs(),
    size = p.readingSize ?? 17,
    leading = p.readingLeading ?? 2,
    inset = p.readingInset ?? 64,
    limit = p.contextLimit ?? defaultContextLimit;
  return (
    <div className="wb-reading-settings">
      <div className="wb-reading-cards">
        <section className="wb-reading-card" aria-label="阅读排版">
          <div className="wb-reading-row">
            <span>主题</span>
            <Segmented
              label="主题"
              value={p.theme || "system"}
              options={[
                ["light", "亮色"],
                ["dark", "暗色"],
                ["system", "跟随系统"],
              ]}
              onChange={(theme) => host.preference({ theme })}
            />
          </div>
          <div className="wb-reading-row">
            <span>正文字体</span>
            <Select
              aria-label="正文字体"
              value={p.readingFont || "serif"}
              onChange={(e) => host.preference({ readingFont: e.target.value as any })}
            >
              <option value="serif">宋体 · 纸书</option>
              <option value="sans">黑体 · 清晰</option>
            </Select>
          </div>
          <div className="wb-reading-row">
            <span>字号</span>
            <Range
              label="正文字号"
              value={size}
              min={14}
              max={24}
              unit="px"
              onChange={(readingSize) => host.preference({ readingSize })}
            />
          </div>
          <div className="wb-reading-row">
            <span>行距</span>
            <Range
              label="正文行距"
              value={leading}
              min={1.5}
              max={2.4}
              step={0.1}
              onChange={(readingLeading) => host.preference({ readingLeading })}
            />
          </div>
          <div className="wb-reading-row">
            <span>左右留白</span>
            <Range
              label="正文左右留白"
              value={inset}
              min={24}
              max={128}
              step={4}
              unit="px"
              onChange={(readingInset) => host.preference({ readingInset })}
            />
          </div>
        </section>
        <section className="wb-reading-card" aria-label="楼层与侧栏">
          <div className="wb-reading-row">
            <span>时间与楼层</span>
            <Segmented
              label="时间与楼层"
              value={p.messageMeta || "hover"}
              options={[
                ["always", "始终显示"],
                ["hover", "悬浮显示"],
                ["never", "隐藏"],
              ]}
              onChange={(messageMeta) => host.preference({ messageMeta })}
            />
          </div>
          <div className="wb-reading-row">
            <span>
              默认折叠用户输入
              <small>你的输入默认收成一行，点击展开</small>
            </span>
            <Switch
              label="默认折叠用户输入"
              checked={p.userCollapsed !== false}
              onChange={(v) => host.preference({ userCollapsed: v })}
            />
          </div>
          <div className="wb-reading-row is-pointer-only">
            <span>
              边缘悬停展开侧栏
              <small>鼠标停在窗口左右边缘时临时展开收起的侧栏</small>
            </span>
            <Switch
              label="边缘悬停展开侧栏"
              checked={p.edgeHover !== false}
              onChange={(v) => host.preference({ edgeHover: v })}
            />
          </div>
          <div className="wb-reading-row">
            <span>
              Markdown 实时预览
              <small>输入框、大纲与设定长文本边写边显示效果，正在编辑的行显示源码</small>
            </span>
            <Switch
              label="Markdown 实时预览"
              checked={p.mdLive !== false}
              onChange={(v) => host.preference({ mdLive: v })}
            />
          </div>
          <div className="wb-reading-row">
            <span>
              只发送最近的楼层
              <small>生成时只带最近 {limit.limit} 条消息，更早的楼层在列表里标出，不删除</small>
            </span>
            <Switch
              label="只发送最近的楼层"
              checked={limit.enabled}
              onChange={(enabled) => host.preference({ contextLimit: { ...limit, enabled } })}
            />
          </div>
          {limit.enabled && (
            <>
              <div className="wb-reading-row">
                <span>发送条数</span>
                <Range
                  label="发送条数"
                  value={limit.limit}
                  min={1}
                  max={60}
                  step={1}
                  onChange={(n) => host.preference({ contextLimit: { ...limit, limit: n } })}
                />
              </div>
              <div className="wb-reading-row">
                <span>
                  后台生成也限制
                  <small>扩展和斜杠命令发起的生成</small>
                </span>
                <Switch
                  label="后台生成也限制"
                  checked={limit.quiet}
                  onChange={(quiet) => host.preference({ contextLimit: { ...limit, quiet } })}
                />
              </div>
            </>
          )}
        </section>
      </div>
      <aside className="wb-reading-preview" aria-label="实时预览">
        <header>
          <span>实时预览</span>
          <span>改动立即生效</span>
        </header>
        <div className="wb-reading-sample">
          <div
            className="wb-reading-page"
            style={{
              fontFamily: p.readingFont === "sans" ? "var(--wb-font-ui)" : "var(--wb-font-reading)",
              fontSize: size,
              lineHeight: leading,
              paddingInline: Math.round(inset / 2),
            }}
          >
            {(p.messageMeta || "hover") !== "never" && <small>12 层 · 林间 · 15:21</small>}
            <p>
              雾气沿着窗沿慢慢散开。<span>“明天见。”</span>她说。
            </p>
            <p>钟楼又敲了五下。雾已大到看不见对面的街。</p>
            <div className={`wb-reading-user ${p.userCollapsed !== false ? "is-collapsed" : ""}`}>
              {/* The same fold the reading column draws: arrow, label, then the first words. */}
              <span className="wb-reading-user-head">
                <ChevronRight size={14} className={p.userCollapsed !== false ? "" : "is-open"} />
                <span>你的输入</span>
                {p.userCollapsed !== false && <small>我把书拉过来，翻到夹信的那一页。</small>}
              </span>
              {p.userCollapsed === false && <p>我把书拉过来，翻到夹信的那一页。</p>}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
export function InstalledExtensions({ host, open }: { host: HostAdapter; open: (id: string) => void }) {
  const task = useTask(),
    [list, setList] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [install, setInstall] = useState(false),
    [url, setUrl] = useState(""),
    [branch, setBranch] = useState(""),
    [global, setGlobal] = useState(false),
    [message, setMessage] = useState("");
  const refresh = () => host.installedExtensions().then(setList);
  useEffect(() => {
    refresh().catch((e) => host.report(e));
  }, [host]);
  const shown = list.filter((x) => x.name.toLowerCase().includes(query.toLowerCase()));
  // Board "SettingsExt": one tool row, then one quiet row per extension with its switch at the end.
  return (
    <>
      <Notice error={task.error} />
      <div className="wb-ext-tools">
        <SearchBox value={query} onChange={setQuery} placeholder="搜索已安装的扩展" />
        <small className="wb-ext-count">
          已安装 {list.length} · 已启用 {list.filter((x) => x.enabled).length}
        </small>
        <span className="wb-grow" />
        <button
          className="wb-ext-refresh"
          disabled={task.busy}
          onClick={() =>
            task.run(async () => {
              await refresh();
              setMessage("列表已更新，可逐个检查第三方扩展更新。");
            })
          }
        >
          <RefreshCw size={14} />
          刷新列表
        </button>
        <button className="wb-ext-install" onClick={() => setInstall(true)}>
          <Plus size={15} />
          安装扩展
        </button>
      </div>
      {message && (
        <p className="wb-ext-status" role="status">
          {message}
        </p>
      )}
      <div className="wb-ext-list">
        {shown.map((x) => (
          <div key={x.id} className={`wb-ext-row ${x.enabled ? "is-on" : ""}`}>
            <span className="wb-ext-icon" aria-hidden="true">
              <Puzzle size={17} />
            </span>
            <span className="wb-ext-copy">
              <strong>
                {x.name}
                <small>{x.version ? (/^v/i.test(x.version) ? x.version : "v" + x.version) : "内置"}</small>
              </strong>
              <small>{x.description || x.id}</small>
            </span>
            {x.id.startsWith("third-party/") && (
              <>
                <button
                  className="wb-ext-icon-button"
                  title={`更新 ${x.name}`}
                  aria-label={`更新 ${x.name}`}
                  disabled={task.busy}
                  onClick={() =>
                    task.run(async () => {
                      await host.extensionAction(x.id, "update");
                      setMessage("更新完成，刷新页面后生效。");
                      await refresh();
                    })
                  }
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  className="wb-ext-icon-button is-danger"
                  title={`卸载 ${x.name}`}
                  aria-label={`卸载 ${x.name}`}
                  disabled={task.busy}
                  onClick={() => {
                    if (confirm(`卸载 ${x.name}？`))
                      task.run(async () => {
                        await host.extensionAction(x.id, "delete");
                        setList((l) => l.filter((item) => item.id !== x.id));
                        setMessage("扩展已卸载，刷新页面后生效。");
                      });
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <button className="wb-ext-open" disabled={!x.container} onClick={() => open(x.container)}>
              设置
            </button>
            <Switch
              label={`启用 ${x.name}`}
              checked={x.enabled}
              disabled={task.busy}
              onChange={(v) =>
                task.run(async () => {
                  await host.toggleExtension(x.id, v);
                  setList((l) => l.map((item) => (item.id === x.id ? { ...item, enabled: v } : item)));
                  setMessage("启停设置已保存，刷新页面后完全生效。");
                })
              }
            />
          </div>
        ))}
        {!shown.length && <p className="wb-ext-empty">{query ? "没有符合的扩展" : "还没有扩展"}</p>}
      </div>
      {install && (
        <Dialog title="安装扩展" onClose={() => setInstall(false)}>
          <div className="wb-confirm-body">
            <Notice error={task.error} />
            <Field label="仓库地址">
              <input
                aria-label="扩展仓库地址"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <Field label="分支（可选）">
              <input value={branch} onChange={(e) => setBranch(e.target.value)} />
            </Field>
            <Check label="为所有用户安装（需要管理员权限）" checked={global} onChange={setGlobal} />
            <button
              className="wb-primary"
              disabled={task.busy || !url}
              onClick={() =>
                task.run(async () => {
                  await host.installExtension(url, branch, global);
                  setInstall(false);
                  await refresh();
                  setMessage("安装完成，刷新页面后生效。");
                })
              }
            >
              安装
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
