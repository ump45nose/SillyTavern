import React from "react";
import { ChevronRight } from "../ui/icons";
import { defaultContextLimit } from "../host/context-limit";
import type { HostAdapter } from "../host/adapter";
import { Switch } from "../ui/ResourceControls";
import { Select } from "../ui/Select";
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
