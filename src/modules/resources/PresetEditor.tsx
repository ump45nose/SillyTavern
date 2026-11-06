import { Select } from "../../ui/Select";
import React, { useLayoutEffect, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Copy, Download, Plus, Trash2, Upload } from "../../ui/icons";
import type { HostAdapter } from "../../host/adapter";
import type { Data } from "../../host/types";
import { clone, validatePreset } from "../../host/model";
import { useTask, Notice, Empty, Field, IconButton } from "../../ui/common";
import { useTokenCounts } from "../../ui/tokens";
import { Check, Fold, SaveBar, Switch, useDraft } from "../../ui/ResourceControls";
import { actionLabels } from "../../host/labels";
import { bus } from "../../host/bus";
import { EntryEditor, useMobileLayout } from "../../ui/EntryEditor";
const parameterNames: Record<string, string> = {
  temperature: "温度",
  top_p: "Top P",
  top_k: "Top K",
  top_a: "Top A",
  min_p: "Min P",
  frequency_penalty: "频率惩罚",
  presence_penalty: "存在惩罚",
  repetition_penalty: "重复惩罚",
  openai_max_tokens: "最大回复 Token",
  openai_max_context: "上下文 Token 上限",
  stream_openai: "流式传输",
  show_thoughts: "请求思维链",
  reasoning_effort: "思考强度",
  seed: "随机种子",
  n: "回复数量",
};
/** Parameters that read best as a slider beside their number: [min, max, step]. */
const sliders: Record<string, [number, number, number]> = {
  temperature: [0, 2, 0.01],
  top_p: [0, 1, 0.01],
  frequency_penalty: [-2, 2, 0.01],
  presence_penalty: [-2, 2, 0.01],
  repetition_penalty: [1, 2, 0.01],
  top_k: [0, 200, 1],
  top_a: [0, 1, 0.01],
  min_p: [0, 1, 0.01],
  openai_max_tokens: [16, 8192, 16],
  openai_max_context: [1024, 131072, 1024],
};
/** The deep page's sampling card, in reading order; everything else waits in a fold. */
const sampling = [
  "temperature",
  "top_p",
  "top_k",
  "top_a",
  "min_p",
  "frequency_penalty",
  "presence_penalty",
  "repetition_penalty",
  "openai_max_tokens",
  "openai_max_context",
  "seed",
  "n",
  "reasoning_effort",
];
const roleNames: Record<string, string> = { system: "系统", user: "用户", assistant: "助手" };
const triggerNames = [
  ["normal", "普通"],
  ["continue", "继续"],
  ["impersonate", "AI 帮答"],
  ["swipe", "滑动"],
  ["regenerate", "重新生成"],
  ["quiet", "静默"],
] as const;
/** The prompt a click on the parameters page asks the prompts tab to open. */
let studioFocus = "";
const shown = (value: unknown) =>
  typeof value === "number" ? String(value) : typeof value === "boolean" ? (value ? "开" : "关") : "已改";
export function PresetEditor({
  host,
  id,
  deep,
  onSelect,
  view,
}: {
  host: HostAdapter;
  id: string;
  deep?: boolean;
  onSelect: (id: string) => void;
  view?: "prompts";
}) {
  const mobile = useMobileLayout();
  const task = useTask(),
    edit = useDraft(
      () => host.livePreset(id) ?? host.presetData(id),
      host.resourceVersions.preset,
      { host, key: "preset:" + id },
      true,
    );
  // The running preset follows SillyTavern: parameters, toggles and order apply at once; prompt
  // text stays a draft until saved. "更新预设" then writes the running state into the file.
  // One read of the preset per render: the running settings, the file and where they differ.
  const live = host.runningPreset(id),
    running = !!live,
    changed = live ? host.presetChanges(id, live) : [],
    pending = changed.length > 0;
  const { draft, change } = edit,
    [entry, setEntry] = useState(() => {
      const focus = studioFocus;
      studioFocus = "";
      return focus;
    }),
    [editorOpen, setEditorOpen] = useState(!!entry),
    [activeSection, setActiveSection] = useState("prompts"),
    [activeMore, setActiveMore] = useState(""),
    [scope, setScope] = useState(0),
    [pinsOpen, setPinsOpen] = useState(false),
    [dragging, setDragging] = useState<number | null>(null),
    [advanced, setAdvanced] = useState(host.drafts.get("preset:" + id)?.extra?.advanced ?? "");
  useLayoutEffect(() => {
    const cached = host.drafts.get("preset:" + id);
    if (cached) cached.extra = { ...cached.extra, advanced };
  }, [advanced, edit.base, draft]);
  const prompts: Data[] = draft.prompts || [],
    scopes: Data[] = draft.prompt_order || [],
    order: Data[] = scopes[scope]?.order || [];
  const rows: Data[] = order.length
    ? order
    : prompts.map((p) => ({ identifier: p.identifier, enabled: true }));
  const selected =
    prompts.find((p) => p.identifier === entry) ||
    prompts.find((p) => p.identifier === order[0]?.identifier) ||
    prompts[0];
  /** Applies a field to the running preset, or to the draft when editing a preset file. */
  const apply = (key: string, base: any, value = base) => {
    if (!running) return change(key, value);
    host.applyPreset({ [key]: base });
    edit.patch(key, base, value);
  };
  const setOrder = (value: Data[]) => {
    const next = clone(scopes);
    if (!next[scope]) next[scope] = { character_id: 100000, order: [] };
    next[scope].order = value;
    apply("prompt_order", next);
  };
  const updatePrompt = (patch: Data) =>
    change(
      "prompts",
      prompts.map((p) => (p.identifier === selected.identifier ? { ...p, ...patch } : p)),
    );
  const pins = host.prefs().presetPins ?? ["temperature", "openai_max_tokens"];
  const always = ["stream_openai", "show_thoughts"];
  const fileData = changed.length ? live!.file : null;
  const pendingDetail = fileData
    ? `${parameterNames[changed[0]] || changed[0]} ${shown(fileData[changed[0]])} → ${shown(draft[changed[0]])}` +
      (changed.length > 1 ? ` 等 ${changed.length} 项` : "")
    : "";
  /** One row of the common-parameter card: a switch, or a number with a slider where it helps. */
  const field = (key: string) => {
    const label = parameterNames[key] || key,
      differs = changed.includes(key) && <span className="wb-diff-dot" title="与预设文件不同" />;
    if (typeof draft[key] === "boolean" || always.includes(key))
      return (
        <div className="wb-preset-row" key={key}>
          <span className="wb-preset-label">
            {label}
            {differs}
          </span>
          <Switch label={label} checked={!!draft[key]} onChange={(v) => apply(key, v)} />
        </div>
      );
    const numeric = typeof draft[key] === "number",
      range = numeric ? sliders[key] : undefined,
      value = (v: string) => apply(key, numeric ? Number(v) : v);
    return (
      <div className={`wb-preset-row ${range ? "has-slider" : ""}`} key={key}>
        <span className="wb-preset-label">
          {label}
          {differs}
        </span>
        {range && (
          <input
            type="range"
            className="wb-slider"
            aria-label={`${label}滑块`}
            tabIndex={-1}
            min={range[0]}
            max={range[1]}
            step={range[2]}
            value={draft[key]}
            style={
              {
                "--wb-fill": `${((draft[key] - range[0]) / (range[1] - range[0])) * 100}%`,
              } as React.CSSProperties
            }
            onChange={(e) => value(e.target.value)}
          />
        )}
        <input
          className="wb-preset-value"
          aria-label={label}
          type={numeric ? "number" : "text"}
          step="any"
          value={draft[key] ?? ""}
          onChange={(e) => value(e.target.value)}
        />
      </div>
    );
  };
  const parameters = Object.keys(draft).filter(
    (k) => ["number", "boolean"].includes(typeof draft[k]) || k === "reasoning_effort",
  );
  // The settings page lays parameters and prompt order side by side (board WsPreset); the
  // prompts tab is the list beside one open prompt.
  const desk = !!deep && view !== "prompts",
    studio = !!deep && view === "prompts";
  const promptTokens = useTokenCounts(
    host,
    deep
      ? prompts
          .filter((p) => !p.marker)
          .map((p) => [p.identifier, String(p.content ?? "")] as [string, string])
      : [],
  );
  const promptActions = (
    <div className="wb-prompts-actions">
      {scopes.length > 1 && (
        <Select aria-label="提示词作用范围" value={scope} onChange={(e) => setScope(Number(e.target.value))}>
          {scopes.map((s, i) => (
            <option key={i} value={i}>
              {s.character_id === 100000 ? "全局" : `角色 ${s.character_id}`}
            </option>
          ))}
        </Select>
      )}
      <button
        className="wb-panel-icon"
        aria-label="新增提示词"
        title="新增提示词"
        onClick={() => {
          const identifier = crypto.randomUUID?.() || `wb-${Date.now()}`,
            prompt = { identifier, name: "新提示词", role: "system", content: "" };
          apply("prompts", [...(edit.base.prompts || []), prompt], [...prompts, prompt]);
          setOrder([...order, { identifier, enabled: true }]);
          setEntry(identifier);
          setActiveSection("prompts");
          setEditorOpen(true);
        }}
      >
        <Plus size={16} />
      </button>
    </div>
  );
  const promptHead = (
    <div className="wb-prompts-head">
      <span>
        提示词
        <small>
          {rows.filter((r) => r.enabled !== false).length} / {rows.length} 启用
        </small>
      </span>
      {promptActions}
    </div>
  );
  // A row keeps its key while the order changes, so the dragged row stays mounted until its dragend.
  const seen = new Map<string, number>(),
    rowKeys = rows.map((item) => {
      const id = String(item.identifier),
        n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      return n > 1 ? `${id}#${n}` : id;
    });
  const promptList = (
    <ul className="wb-prompts" aria-label="提示词顺序">
      {rows.map((item, i) => {
        const p = prompts.find((p) => p.identifier === item.identifier),
          name = p?.name || item.identifier,
          active = (studio || editorOpen) && selected?.identifier === item.identifier;
        return (
          <li
            className={`wb-prompt ${active ? "is-active" : ""} ${item.enabled === false ? "is-off" : ""} ${p?.marker ? "is-marker" : ""} ${dragging === i ? "is-dragging" : ""}`}
            key={rowKeys[i]}
            draggable={!!order.length}
            onDragStart={(e) => {
              setDragging(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (dragging === null || dragging === i) return;
              e.preventDefault();
              const next = [...rows];
              next.splice(i, 0, next.splice(dragging, 1)[0]);
              setDragging(i);
              setOrder(next);
            }}
            onDragEnd={() => setDragging(null)}
          >
            <GripVertical className="wb-prompt-grip" size={14} aria-hidden="true" />
            <input
              type="checkbox"
              aria-label={`启用提示词 ${name}`}
              checked={item.enabled !== false}
              onChange={(e) =>
                setOrder(rows.map((v, j) => (j === i ? { ...v, enabled: e.target.checked } : v)))
              }
            />
            <button
              className="wb-prompt-open"
              aria-label={`编辑提示词 ${name}`}
              aria-expanded={active}
              onClick={() => {
                if (desk) {
                  studioFocus = item.identifier;
                  bus.emit("settings-group", { group: "提示词" });
                } else if (studio) {
                  setEntry(item.identifier);
                  setEditorOpen(true);
                } else if (active) setEditorOpen(false);
                else {
                  setEntry(item.identifier);
                  setEditorOpen(true);
                }
              }}
            >
              <span>{name}</span>
            </button>
            <span className="wb-prompt-role">
              {p?.marker ? "标记" : roleNames[p?.role || "system"] || p?.role}
            </span>
            {deep && (
              <span className="wb-prompt-tokens">
                {p?.marker ? "—" : (promptTokens[item.identifier] ?? "")}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
  const remove = () => {
    if (confirm("删除这个提示词？")) {
      const keep = (p: Data) => p.identifier !== selected.identifier;
      apply("prompts", (edit.base.prompts || []).filter(keep), prompts.filter(keep));
      setOrder(order.filter((p) => p.identifier !== selected.identifier));
      setEntry("");
      setEditorOpen(false);
    }
  };
  const heading = selected && (
    <div className="wb-editor-heading">
      <input
        aria-label="提示词名称"
        value={selected.name || ""}
        onChange={(e) => updatePrompt({ name: e.target.value })}
      />
      <Select
        aria-label="提示词角色"
        value={selected.role || "system"}
        onChange={(e) => updatePrompt({ role: e.target.value })}
      >
        <option>system</option>
        <option>user</option>
        <option>assistant</option>
      </Select>
      {[-1, 1].map((dir) => (
        <IconButton
          key={dir}
          title={dir < 0 ? "上移提示词" : "下移提示词"}
          disabled={
            !order.length ||
            order.findIndex((p) => p.identifier === selected.identifier) + dir < 0 ||
            order.findIndex((p) => p.identifier === selected.identifier) + dir >= order.length
          }
          onClick={() => {
            const next = clone(order),
              i = next.findIndex((p) => p.identifier === selected.identifier);
            [next[i], next[i + dir]] = [next[i + dir], next[i]];
            setOrder(next);
          }}
        >
          {dir < 0 ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
        </IconButton>
      ))}
    </div>
  );
  const body = (
    <textarea
      aria-label="提示词正文"
      className="wb-prompt-body"
      value={selected?.content || ""}
      onChange={(e) => updatePrompt({ content: e.target.value })}
    />
  );
  const triggers: string[] = selected?.injection_trigger || [];
  /** Where and when a prompt goes: list order or a chat depth, and the generation types it joins. */
  const injection = selected && !selected.marker && (
    <div className="wb-prompt-inject">
      <div className="wb-prompt-inject-row">
        <Field label="提示词注入位置">
          <Select
            value={selected.injection_position ?? 0}
            onChange={(e) => updatePrompt({ injection_position: Number(e.target.value) })}
          >
            <option value={0}>按列表顺序</option>
            <option value={1}>指定聊天深度</option>
          </Select>
        </Field>
        {selected.injection_position === 1 && (
          <>
            <Field label="提示词深度">
              <input
                type="number"
                min={0}
                value={selected.injection_depth ?? 4}
                onChange={(e) => updatePrompt({ injection_depth: Number(e.target.value) })}
              />
            </Field>
            <Field label="提示词顺序">
              <input
                type="number"
                value={selected.injection_order ?? 100}
                onChange={(e) => updatePrompt({ injection_order: Number(e.target.value) })}
              />
            </Field>
          </>
        )}
        <Check
          label="禁止角色覆盖"
          checked={!!selected.forbid_overrides}
          onChange={(v) => updatePrompt({ forbid_overrides: v })}
        />
      </div>
      <div className="wb-prompt-triggers" role="group" aria-label="生成类型">
        <span>生成类型</span>
        {triggerNames.map(([value, label]) => (
          <button
            key={value}
            aria-pressed={triggers.includes(value)}
            onClick={() =>
              updatePrompt({
                injection_trigger: triggers.includes(value)
                  ? triggers.filter((t) => t !== value)
                  : [...triggers, value],
              })
            }
          >
            {label}
          </button>
        ))}
        <small>{triggers.length ? "" : "未选择时全部生效"}</small>
      </div>
    </div>
  );
  const saveBars = (
    <>
      <SaveBar
        dirty={edit.dirty || !!advanced}
        busy={task.busy}
        message={edit.message}
        label={running ? "保存" : actionLabels.updatePreset}
        reset={() => {
          setAdvanced("");
          edit.reset();
        }}
        save={() =>
          task.run(async () => {
            if (advanced) throw new Error("JSON 无法解析，请先修正。");
            edit.saved(
              running
                ? host.applyPresetDraft(id, edit.base, draft)
                : await host.savePreset(id, edit.base, draft),
            );
          })
        }
      />
      {pending && (
        <footer className="wb-savebar is-pending" aria-label="预设有未写入的修改">
          <span className="wb-savebar-dot" aria-hidden="true" />
          <span className="wb-savebar-copy">
            <span role="status">预设有未写入的修改</span>
            {pendingDetail && <small>{pendingDetail}</small>}
          </span>
          <button
            className="wb-savebar-revert"
            aria-label="还原为预设文件"
            disabled={task.busy}
            onClick={() => task.run(() => host.revertPreset())}
          >
            还原
          </button>
          <button
            className="wb-savebar-save"
            aria-label={actionLabels.updatePreset}
            disabled={task.busy}
            onClick={() => task.run(() => host.updatePreset(id))}
          >
            {actionLabels.updatePreset}
          </button>
        </footer>
      )}
    </>
  );
  const promptContent = selected && (
    <section className="wb-prompt-card" aria-label="编辑提示词">
      {heading}
      {selected.marker ? (
        <p className="wb-note">此项由酒馆动态组装，可在列表控制启用与顺序。</p>
      ) : (
        <>
          {body}
          <Fold title="注入与触发">{injection}</Fold>
          <div className="wb-entry-actions">
            <button className="wb-link is-danger" onClick={remove}>
              <Trash2 size={14} />
              删除提示词
            </button>
          </div>
        </>
      )}
      <Notice error={task.error} />
    </section>
  );
  const promptSheet = selected ? (
    <EntryEditor
      open={editorOpen}
      title={`提示词：${selected.name || selected.identifier}`}
      onClose={() => setEditorOpen(false)}
      busy={task.busy}
      footer={mobile ? saveBars : undefined}
    >
      {promptContent}
    </EntryEditor>
  ) : (
    <Empty>此类预设没有提示词子条目</Empty>
  );
  const json = (
    <Field label="预设 JSON">
      <textarea
        className="wb-code"
        value={advanced || JSON.stringify(draft, null, 2)}
        onChange={(e) => {
          setAdvanced(e.target.value);
          try {
            const value = JSON.parse(e.target.value);
            validatePreset(value);
            edit.setDraft(value);
            setAdvanced("");
          } catch {
            /* retain invalid input */
          }
        }}
      />
    </Field>
  );
  const importDraft = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file)
      task.run(async () => {
        const value = JSON.parse(await file.text());
        validatePreset(value);
        if (confirm("用文件内容替换当前草稿？保存后才会应用。")) {
          edit.setDraft(value);
          setAdvanced("");
        }
      });
  };
  const bindingChecks = (
    <>
      {(["connection", "model"] as const).map((scope) => (
        <Check
          key={scope}
          label={`绑定当前${scope === "connection" ? "连接" : "模型"}`}
          disabled={scope === "connection" && !host.snapshot().current.connection}
          checked={host.prefs().bindings[host.bindingKey(scope)] === id}
          onChange={(v) => {
            const bindings = { ...host.prefs().bindings };
            if (v) bindings[host.bindingKey(scope)] = id;
            else delete bindings[host.bindingKey(scope)];
            host.preference({ bindings });
          }}
        />
      ))}
    </>
  );
  return (
    <fieldset
      disabled={task.busy}
      className={`wb-preset-editor ${desk ? "is-desk" : ""} ${studio ? "is-studio" : ""}`}
    >
      <Notice error={task.error} />
      {desk ? (
        <>
          <div className="wb-preset-desk">
            <section className="wb-preset-params" aria-label="采样参数">
              <h3>采样参数</h3>
              {sampling.filter((k) => k in draft).map(field)}
              {always.filter((k) => k in draft).map(field)}
            </section>
            <section className="wb-preset-order">
              {promptHead}
              {promptList}
            </section>
          </div>
          <section className="wb-preset-file" aria-label="预设文件">
            <h3>预设文件</h3>
            <div className="wb-preset-file-row">
              {bindingChecks}
              <span className="wb-grow" />
              <button
                onClick={() => {
                  const name = prompt("副本名称", `${id} 副本`);
                  if (name)
                    task.run(async () => {
                      const next = await host.createPreset(name, draft);
                      edit.saved(draft);
                      onSelect(next);
                    });
                }}
              >
                <Copy size={15} />
                另存为
              </button>
              <button
                onClick={() =>
                  host.download(
                    new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
                    `${id}.json`,
                  )
                }
              >
                <Download size={15} />
                导出
              </button>
              <label className="wb-upload-button">
                <Upload size={15} />
                导入到草稿
                <input type="file" accept=".json,application/json" onChange={importDraft} />
              </label>
            </div>
            <Fold title="编辑 JSON" initial={!!advanced}>
              {json}
            </Fold>
          </section>
        </>
      ) : studio ? (
        <div className="wb-prompt-studio">
          <section className="wb-prompt-studio-list">
            {promptHead}
            {promptList}
          </section>
          {mobile ? (
            promptSheet
          ) : selected ? (
            <section className="wb-prompt-studio-editor" aria-label="编辑提示词">
              {heading}
              {selected.marker ? (
                <p className="wb-note">此项由酒馆动态组装，只能调整启用与顺序。</p>
              ) : (
                <>
                  {injection}
                  {body}
                  <footer>
                    <span>{promptTokens[selected.identifier] ?? "—"} tokens</span>
                    <button className="wb-link is-danger" onClick={remove}>
                      <Trash2 size={14} />
                      删除提示词
                    </button>
                  </footer>
                </>
              )}
            </section>
          ) : (
            <Empty>此类预设没有提示词子条目</Empty>
          )}
        </div>
      ) : (
        <>
          <div className="wb-preset-sections">
            <Fold
              title="常用选项"
              initial
              className="wb-preset-common-fold"
              hint={pins
                .filter((k) => k in draft)
                .map((k) => `${parameterNames[k] || k} ${shown(draft[k])}`)
                .join(" · ")}
            >
              <section className="wb-preset-card" aria-label="常用参数">
                {always.map(field)}
                {pins.filter((k) => k in draft && !always.includes(k)).map(field)}
              </section>
              <button
                className="wb-preset-pins-toggle"
                aria-expanded={pinsOpen}
                onClick={() => setPinsOpen(!pinsOpen)}
              >
                自定义常用项
              </button>
              <div
                className={`wb-fold-body ${pinsOpen ? "is-open" : ""}`}
                aria-hidden={!pinsOpen}
                inert={!pinsOpen}
              >
                <div>
                  <div className="wb-preset-pins">
                    {parameters
                      .filter((k) => !always.includes(k))
                      .map((k) => (
                        <Check
                          key={k}
                          label={parameterNames[k] || k}
                          checked={pins.includes(k)}
                          onChange={(v) =>
                            host.preference({ presetPins: v ? [...pins, k] : pins.filter((p) => p !== k) })
                          }
                        />
                      ))}
                  </div>
                </div>
              </div>
            </Fold>
            <Fold
              title="提示词"
              hint={`${rows.filter((r) => r.enabled !== false).length} / ${rows.length} 启用`}
              className="wb-preset-prompts-fold"
              toolbar={promptActions}
              open={activeSection === "prompts"}
              onOpenChange={(open) => {
                setActiveSection(open ? "prompts" : "");
                if (!open) setEditorOpen(false);
              }}
            >
              {promptList}
              {promptSheet}
            </Fold>
            <Fold
              title="更多预设设置"
              open={activeSection === "more"}
              onOpenChange={(open) => {
                setActiveSection(open ? "more" : "");
                setEditorOpen(false);
              }}
            >
              <Fold
                title="其他生成参数"
                open={activeMore === "parameters"}
                onOpenChange={(open) => setActiveMore(open ? "parameters" : "")}
              >
                {parameters.filter((k) => !pins.includes(k) && !always.includes(k)).map(field)}
              </Fold>
              <Fold
                title="提示格式"
                open={activeMore === "format"}
                onOpenChange={(open) => setActiveMore(open ? "format" : "")}
              >
                {[
                  ["impersonation_prompt", "AI 帮答指令"],
                  ["new_chat_prompt", "新对话提示"],
                  ["new_group_chat_prompt", "新群聊提示"],
                  ["new_example_chat_prompt", "对话示例提示"],
                  ["continue_nudge_prompt", "续写提示"],
                  ["send_if_empty", "空输入替代文本"],
                  ["wi_format", "世界书格式"],
                  ["scenario_format", "场景格式"],
                  ["personality_format", "性格格式"],
                ]
                  .filter(([key]) => key in draft)
                  .map(([key, label]) => (
                    <Field key={key} label={label}>
                      <textarea value={draft[key] || ""} onChange={(e) => change(key, e.target.value)} />
                    </Field>
                  ))}
              </Fold>
              <Fold
                title="模型 / 连接绑定"
                open={activeMore === "bindings"}
                onOpenChange={(open) => setActiveMore(open ? "bindings" : "")}
              >
                {bindingChecks}
              </Fold>
              <Fold
                title="高级编辑"
                open={activeMore === "advanced"}
                onOpenChange={(open) => setActiveMore(open ? "advanced" : "")}
              >
                <Field label="从文件替换当前草稿">
                  <input type="file" accept=".json,application/json" onChange={importDraft} />
                </Field>
                {json}
              </Fold>
            </Fold>
          </div>
        </>
      )}
      {(!mobile || !editorOpen || desk) && saveBars}
    </fieldset>
  );
}
