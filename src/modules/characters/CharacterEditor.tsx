import { Select } from "../../ui/Select";
import React, { useState } from "react";
import { MessageSquarePlus, ImagePlus, X } from "../../ui/icons";
import type { HostAdapter } from "../../host/adapter";
import type { Data } from "../../host/types";
import { sameData } from "../../host/model";
import { useTask, Notice, Empty, Field } from "../../ui/common";
import { SaveBar, useAsyncDraft } from "../../ui/ResourceControls";
import { useTokenCounts } from "../../ui/tokens";
import { MdField } from "../../ui/md/MdField";
import { SpeakerColor } from "../../ui/SpeakerColor";
import { plain } from "./shared";
const editorTabs = ["人设", "第一条消息", "对话示例", "高级定义", "创作者注释"] as const;
type EditorTab = (typeof editorTabs)[number];
const budgetGroups = [
  ["描述", ["description"], "var(--wb-trace-system)"],
  ["性格与场景", ["personality", "scenario"], "var(--wb-trace-preset)"],
  ["第一条消息", ["first_mes"], "var(--wb-trace-world)"],
  ["对话示例", ["mes_example"], "var(--wb-trace-character)"],
] as const;
const tokenFields = [
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "system_prompt",
  "post_history_instructions",
];
/** The character card editor (board CharacterEdit): portrait and facts, tabbed fields, then the token budget and greetings. */
export function CharacterEditor({ host, id }: { host: HostAdapter; id: string }) {
  const task = useTask(),
    { base, draft, dirty, setDraft, saved, reset } = useAsyncDraft({
      host,
      key: "character:" + id,
      load: () => host.characterData(id).then((c) => c.data ?? {}),
      version: host.resourceVersions.character,
      onError: task.setError,
    }),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState<EditorTab>("人设"),
    [tagText, setTagText] = useState("");
  const tokens = useTokenCounts(
    host,
    draft ? tokenFields.map((k) => [k, String(draft[k] ?? "")] as [string, string]) : [],
  );
  if (!draft || !base)
    return (
      <>
        <Notice error={task.error} />
        <Empty>正在读取角色…</Empty>
      </>
    );
  const item = host.snapshot().characters.find((c) => c.id === id);
  const put = (patch: Data) => {
    setDraft({ ...draft, ...patch });
    setMessage("");
  };
  const ext = (patch: Data) => put({ extensions: { ...draft.extensions, ...patch } });
  const depth = (patch: Data) => ext({ depth_prompt: { ...draft.extensions?.depth_prompt, ...patch } });
  const changed = (key: string) => !sameData(draft[key] ?? "", base[key] ?? "");
  const field = (key: string, label: string, rows = 4, reading = true) => (
    <label className={`wb-ce-field ${reading ? "is-reading" : ""}`} key={key}>
      <span className="wb-ce-label">
        {label}
        {changed(key) && <i className="wb-ce-dirty" aria-label="已修改" />}
        {tokens[key] !== undefined && <small>{tokens[key].toLocaleString()} tokens</small>}
      </span>
      <MdField
        label={label}
        rows={rows}
        value={draft[key] ?? ""}
        onChange={(value) => put({ [key]: value })}
      />
    </label>
  );
  const tags: string[] = draft.tags ?? [];
  const greetings: string[] = [draft.first_mes ?? "", ...(draft.alternate_greetings ?? [])].filter(
    (x, i) => i === 0 || x,
  );
  const examples = String(draft.mes_example ?? "")
    .split(/<START>/i)
    .filter((x) => x.trim()).length;
  const counts: Partial<Record<EditorTab, number>> = {
    人设: ["description", "personality", "scenario"].filter((k) => String(draft[k] ?? "").trim()).length,
    第一条消息: greetings.filter((x) => x.trim()).length,
    对话示例: examples,
  };
  const budget = budgetGroups.map(([label, keys, color]) => ({
      label,
      color,
      value: keys.reduce((n, k) => n + (tokens[k] ?? 0), 0),
    })),
    total = budget.reduce((n, x) => n + x.value, 0),
    limit = host.contextLimit();
  const addTag = () => {
    const value = tagText.trim();
    if (value && !tags.includes(value)) put({ tags: [...tags, value] });
    setTagText("");
  };
  const worlds = host.snapshot().resources.world;
  return (
    <fieldset disabled={task.busy} className="wb-character-editor">
      <aside className="wb-ce-side">
        <figure className="wb-ce-portrait">
          <img
            src={`/characters/${encodeURIComponent(id)}?v=${host.resourceVersions.character ?? 0}`}
            alt=""
          />
          <label className="wb-ce-avatar">
            <ImagePlus size={14} />
            更换头像
            <input
              aria-label="上传角色头像"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) task.run(() => host.characterAvatar(id, file));
              }}
            />
          </label>
        </figure>
        <dl className="wb-ce-meta">
          <div>
            <dt>创建者</dt>
            <dd>
              <input
                aria-label="创建者"
                value={draft.creator ?? ""}
                placeholder="未填写"
                onChange={(e) => put({ creator: e.target.value })}
              />
            </dd>
          </div>
          <div>
            <dt>角色版本</dt>
            <dd>
              <input
                aria-label="角色版本"
                value={draft.character_version ?? ""}
                placeholder="未填写"
                onChange={(e) => put({ character_version: e.target.value })}
              />
            </dd>
          </div>
          <div>
            <dt>角色世界书</dt>
            <dd>
              <Select
                aria-label="角色世界书"
                value={draft.extensions?.world || ""}
                onChange={(e) => ext({ world: e.target.value })}
              >
                <option value="">不绑定</option>
                {worlds.map((w) => (
                  <option key={w.id}>{w.name}</option>
                ))}
              </Select>
            </dd>
          </div>
          <div>
            <dt>对白颜色</dt>
            <dd>
              <SpeakerColor host={host} kind="character" id={id} />
            </dd>
          </div>
          <div>
            <dt>文件</dt>
            <dd title={id}>{id}</dd>
          </div>
        </dl>
      </aside>
      <section className="wb-ce-main">
        <Notice error={task.error} />
        <header className="wb-ce-head">
          <input
            className="wb-ce-name"
            aria-label="角色名称"
            value={draft.name ?? ""}
            onChange={(e) => put({ name: e.target.value })}
          />
          <div className="wb-ce-actions">
            <button onClick={() => task.run(() => host.exportCharacter(id))}>导出角色</button>
            <button onClick={() => task.run(() => host.duplicateCharacter(id))}>复制角色</button>
            <button
              className="is-raised"
              disabled={item?.active}
              onClick={() => task.run(() => host.selectCharacter(id))}
            >
              <MessageSquarePlus size={15} />
              开始对话
            </button>
          </div>
          <div className="wb-ce-tags">
            {tags.map((t) => (
              <span key={t}>
                {t}
                <button
                  aria-label={`移除标签 ${t}`}
                  onClick={() => put({ tags: tags.filter((x) => x !== t) })}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              aria-label="添加标签"
              placeholder="+ 标签"
              value={tagText}
              size={Math.max(4, tagText.length + 1)}
              onChange={(e) => setTagText(e.target.value.replace(/,|，/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "," || e.key === "，") {
                  e.preventDefault();
                  addTag();
                }
              }}
              onBlur={addTag}
            />
          </div>
        </header>
        <nav className="wb-ce-tabs" role="tablist" aria-label="角色字段">
          {editorTabs.map((name) => (
            <button key={name} role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>
              {name}
              {!!counts[name] && <small>{counts[name]}</small>}
            </button>
          ))}
        </nav>
        <div className="wb-ce-body" role="tabpanel" aria-label={tab}>
          {tab === "人设" && (
            <>
              {field("description", "角色描述", 8)}
              {field("personality", "性格", 3)}
              {field("scenario", "场景", 3)}
            </>
          )}
          {tab === "第一条消息" && (
            <>
              {field("first_mes", "第一条消息", 7)}
              <label className="wb-ce-field is-reading">
                <span className="wb-ce-label">
                  备选开场白
                  {changed("alternate_greetings") && <i className="wb-ce-dirty" aria-label="已修改" />}
                  <small>以单独一行 --- 分隔</small>
                </span>
                <MdField
                  label="备选开场白（以单独一行 --- 分隔）"
                  rows={8}
                  value={(draft.alternate_greetings || []).join("\n---\n")}
                  onChange={(value) => put({ alternate_greetings: value.split(/\n---\n/).filter(Boolean) })}
                />
              </label>
            </>
          )}
          {tab === "对话示例" && field("mes_example", "对话示例", 14, false)}
          {tab === "高级定义" && (
            <>
              {field("system_prompt", "系统提示词", 4, false)}
              {field("post_history_instructions", "历史后指令", 3, false)}
              <label className="wb-ce-field">
                <span className="wb-ce-label">深度提示词</span>
                <MdField
                  label="深度提示词"
                  rows={3}
                  value={draft.extensions?.depth_prompt?.prompt || ""}
                  onChange={(prompt) => depth({ prompt })}
                />
              </label>
              <div className="wb-ce-row">
                <Field label="深度">
                  <input
                    type="number"
                    min={0}
                    value={draft.extensions?.depth_prompt?.depth ?? 4}
                    onChange={(e) => depth({ depth: Number(e.target.value) })}
                  />
                </Field>
                <Field label="注入角色">
                  <Select
                    value={draft.extensions?.depth_prompt?.role || "system"}
                    onChange={(e) => depth({ role: e.target.value })}
                  >
                    <option>system</option>
                    <option>user</option>
                    <option>assistant</option>
                  </Select>
                </Field>
                <label className="wb-field wb-ce-talk">
                  <span>
                    发言积极性 <output>{Math.round((draft.extensions?.talkativeness ?? 0.5) * 100)}%</output>
                  </span>
                  <input
                    aria-label="发言积极性"
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={draft.extensions?.talkativeness ?? 0.5}
                    style={
                      {
                        "--wb-fill": `${(draft.extensions?.talkativeness ?? 0.5) * 100}%`,
                      } as React.CSSProperties
                    }
                    onChange={(e) => ext({ talkativeness: Number(e.target.value) })}
                  />
                </label>
              </div>
            </>
          )}
          {tab === "创作者注释" && field("creator_notes", "创作者注释", 10)}
        </div>
        <SaveBar
          dirty={dirty}
          busy={task.busy}
          message={message}
          detail={[
            ...["description", "personality", "scenario", "first_mes", "mes_example", "creator_notes"].filter(
              changed,
            ),
            ...(changed("name") ? ["name"] : []),
          ]
            .map(
              (k) =>
                ({
                  description: "描述",
                  personality: "性格",
                  scenario: "场景",
                  first_mes: "第一条消息",
                  mes_example: "对话示例",
                  creator_notes: "创作者注释",
                  name: "名称",
                })[k],
            )
            .join(" · ")}
          reset={() => {
            reset();
            setMessage("");
          }}
          save={() =>
            task.run(async () => {
              const data = await host.saveCharacter(id, base, draft);
              saved(data.data ?? {});
              setMessage("已保存");
            })
          }
        />
      </section>
      <aside className="wb-ce-insight">
        {total > 0 && (
          <section className="wb-ce-card">
            <header>
              <h3>Token 预算</h3>
              <small>
                {total.toLocaleString()}
                {limit ? ` / ${limit >= 1024 ? Math.round(limit / 1024) + "k" : limit}` : ""}
              </small>
            </header>
            <div className="wb-ce-budget" aria-hidden="true">
              {budget.map((x) => (
                <i key={x.label} style={{ flexGrow: x.value, background: x.color }} />
              ))}
            </div>
            <ul className="wb-ce-legend">
              {budget.map((x) => (
                <li key={x.label}>
                  <i style={{ background: x.color }} />
                  {x.label}
                  <span>{x.value.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="wb-ce-card">
          <header>
            <h3>第一条消息</h3>
            <small>{greetings.length} 条备选</small>
          </header>
          <ol className="wb-ce-greetings">
            {greetings.map((text, i) => (
              <li key={i}>
                <button onClick={() => setTab("第一条消息")} className={i === 0 ? "is-default" : ""}>
                  <small>
                    #{i + 1}
                    {i === 0 && " · 默认"}
                  </small>
                  <span>{plain(text) || "（空）"}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </fieldset>
  );
}
