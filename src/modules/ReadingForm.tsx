import { ChevronRight } from "../ui/icons";
import { defaultContextLimit } from "../host/context-limit";
import type { HostAdapter } from "../host/adapter";
import { Switch } from "../ui/ResourceControls";
import { Select } from "../ui/Select";
import { Range, Segmented } from "../ui/FieldControls";
import { messageFont, readingFields as fields } from "../ui/readingFields";
const segment = "wb-rail-segment wb-reading-segment";
/** 用户设置 › 外观与阅读 (board "Settings"): the workbench's own reading controls beside a live page. */
export function ReadingForm({ host }: { host: HostAdapter }) {
  const p = host.prefs(),
    size = p.readingSize ?? fields.readingSize.fallback,
    leading = p.readingLeading ?? fields.readingLeading.fallback,
    inset = p.readingInset ?? fields.readingInset.fallback,
    limit = p.contextLimit ?? defaultContextLimit;
  return (
    <div className="wb-reading-settings">
      <div className="wb-reading-cards">
        <section className="wb-reading-card" aria-label="阅读排版">
          <div className="wb-reading-row">
            <span>{fields.theme.label}</span>
            <Segmented
              label={fields.theme.label}
              className={segment}
              options={fields.theme.options}
              value={p.theme || fields.theme.fallback}
              onChange={(theme) => host.preference({ theme })}
            />
          </div>
          <div className="wb-reading-row">
            <span>{fields.readingFont.label}</span>
            <Select
              aria-label={fields.readingFont.label}
              value={p.readingFont || fields.readingFont.fallback}
              onChange={(e) => host.preference({ readingFont: e.target.value as "serif" | "sans" })}
            >
              {fields.readingFont.options.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </Select>
          </div>
          <div className="wb-reading-row">
            <span>{fields.readingSize.label}</span>
            <Range
              field={fields.readingSize}
              label="正文字号"
              value={size}
              onChange={(readingSize) => host.preference({ readingSize })}
            />
          </div>
          <div className="wb-reading-row">
            <span>{fields.readingLeading.label}</span>
            <Range
              field={fields.readingLeading}
              label="正文行距"
              value={leading}
              onChange={(readingLeading) => host.preference({ readingLeading })}
            />
          </div>
          <div className="wb-reading-row">
            <span>{fields.readingInset.label}</span>
            <Range
              field={fields.readingInset}
              label="正文左右留白"
              value={inset}
              onChange={(readingInset) => host.preference({ readingInset })}
            />
          </div>
        </section>
        <section className="wb-reading-card" aria-label="楼层与侧栏">
          <div className="wb-reading-row">
            <span>{fields.messageMeta.label}</span>
            <Segmented
              label={fields.messageMeta.label}
              className={segment}
              options={fields.messageMeta.options}
              value={p.messageMeta || fields.messageMeta.fallback}
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
                  field={{ label: "发送条数", min: 1, max: 60, step: 1, suffix: "" }}
                  label="发送条数"
                  value={limit.limit}
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
              fontFamily: messageFont(p.readingFont),
              fontSize: size,
              lineHeight: leading,
              paddingInline: Math.round(inset / 2),
            }}
          >
            {(p.messageMeta || fields.messageMeta.fallback) !== "never" && (
              <small>12 层 · 林间 · 15:21</small>
            )}
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
