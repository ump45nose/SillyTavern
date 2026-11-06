import { Select } from "../../ui/Select";
import React from "react";
import {
  Download,
  Trash2,
  RefreshCw,
  ChartNoAxesColumn,
  Upload,
  Lock,
  MessageSquare,
  Star,
  UserRound,
} from "../../ui/icons";
import type { HostAdapter } from "../../host/adapter";
import { useTask, Notice, useHostSlices, withoutChat } from "../../ui/common";
import { useTokenCounts } from "../../ui/tokens";
import { Fold, SaveBar, Switch, useDraft } from "../../ui/ResourceControls";
import { SpeakerColor } from "../../ui/SpeakerColor";
import { MdField } from "../../ui/md/MdField";
export function PersonaEditor({ host, id, deep }: { host: HostAdapter; id: string; deep?: boolean }) {
  const snap = useHostSlices(host, withoutChat),
    task = useTask(),
    edit = useDraft(() => host.personaData(id), host.resourceVersions.persona, {
      host,
      key: "persona:" + id,
    });
  const { draft, change } = edit,
    options = host.personaOptions(id),
    tokens = useTokenCounts(host, deep ? [["description", draft.description ?? ""]] : []);
  const action = (selector: string) =>
    task.run(async () => {
      if (id !== snap.current.persona) await host.select("persona", id);
      host.click(selector);
    });
  const exportPersona = () =>
    host.download(
      new Blob(
        [
          JSON.stringify(
            {
              name: draft.name,
              description: draft.description,
              position: draft.position,
              depth: draft.depth,
              role: draft.role,
              lorebook: draft.lorebook,
              title: draft.title,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      `${draft.name || "persona"}.json`,
    );
  const roleSelect = (
    <Select
      aria-label="注入角色"
      value={draft.role ?? 0}
      onChange={(e) => change("role", Number(e.target.value))}
    >
      <option value={0}>System</option>
      <option value={1}>User</option>
      <option value={2}>Assistant</option>
    </Select>
  );
  const save = (
    <SaveBar
      {...edit}
      busy={task.busy}
      save={() => task.run(async () => edit.saved(await host.savePersona(id, edit.base, draft)))}
    />
  );
  const positionSelect = (
    <Select value={draft.position ?? 0} onChange={(e) => change("position", Number(e.target.value))}>
      {[
        [0, "提示词 / 故事模板"],
        [2, "作者注释之前"],
        [3, "作者注释之后"],
        [4, "指定深度"],
        [9, "停用"],
      ].map(([v, n]) => (
        <option key={v} value={v}>
          {n}
        </option>
      ))}
    </Select>
  );
  // The panel's fold and the settings page's side column offer the same persona actions.
  const manage = (
    <>
      <button disabled={edit.dirty} onClick={exportPersona}>
        <Download size={14} />
        导出
      </button>
      <button disabled={edit.dirty} onClick={() => action("#sync_name_button")}>
        <RefreshCw size={14} />
        同步名称
      </button>
      <button disabled={edit.dirty} onClick={() => action("#PersonaManagement .user_stats_button")}>
        <ChartNoAxesColumn size={14} />
        统计
      </button>
      <button onClick={() => action("#personas_backup")}>
        <Download size={14} />
        备份全部身份
      </button>
      <button onClick={() => action("#personas_restore")}>
        <Upload size={14} />
        恢复备份
      </button>
      <button className="is-danger" disabled={edit.dirty} onClick={() => action("#persona_delete_button")}>
        <Trash2 size={14} />
        删除
      </button>
    </>
  );
  if (!deep) {
    // Board "PanelPersona": who uses this persona first (applies at once), then what it says, then the rest.
    const locks = [
      ["chat", "锁定当前对话", "此对话始终使用这个身份", MessageSquare],
      ["character", "锁定当前角色", "与当前角色的所有对话", UserRound],
      ["default", "默认身份", "新对话未锁定时使用", Star],
    ] as const;
    const scopeRow = (
      key: string,
      label: string,
      hint: string,
      Icon: typeof Star,
      checked: boolean,
      onChange: (v: boolean) => void,
      disabled = false,
    ) => (
      <div key={key} className={`wb-card-row wb-scope-row ${checked ? "is-on" : ""}`}>
        <Icon size={16} aria-hidden="true" />
        <span className="wb-scope-copy">
          <span>{label}</span>
          <small>{hint}</small>
        </span>
        <Switch label={label} checked={checked} disabled={disabled} onChange={onChange} />
      </div>
    );
    return (
      <fieldset className="wb-persona-editor wb-persona-panel" disabled={task.busy}>
        <Notice error={task.error} />
        <div className="wb-resource-detail wb-persona-body">
          <section className="wb-card wb-persona-scope" aria-label="使用范围">
            <p className="wb-card-caption">
              {options.current ? "使用范围 · 立即生效" : "使用范围 · 切换到此身份后可调整"}
            </p>
            {locks.map(([key, label, hint, Icon]) =>
              scopeRow(
                key,
                label,
                hint,
                Icon,
                !!options.locks[key],
                (v) => task.run(() => host.personaLock(key, v)),
                !options.current || edit.dirty,
              ),
            )}
            {scopeRow(
              "auto",
              "自动锁定到当前对话",
              "发送消息时把正在用的身份锁到对话",
              Lock,
              !!options.preferences.persona_auto_lock,
              (v) => task.run(() => host.personaPreference("persona_auto_lock", v)),
            )}
          </section>
          <section className="wb-persona-content" aria-label="设定内容">
            <div className="wb-persona-content-head">
              <span>用户描述</span>
              <small>{(draft.description ?? "").length} 字</small>
            </div>
            <MdField
              className="wb-persona-text"
              label="用户描述"
              rows={6}
              value={draft.description ?? ""}
              onChange={(value) => change("description", value)}
            />
          </section>
          <section className="wb-card wb-persona-fields-card" aria-label="名称与注入">
            <div className="wb-card-row">
              <span className="wb-card-label">用户名称</span>
              <input
                aria-label="用户名称"
                value={draft.name ?? ""}
                onChange={(e) => change("name", e.target.value)}
              />
            </div>
            <div className="wb-card-row">
              <span className="wb-card-label">说明标题</span>
              <input
                aria-label="说明标题"
                placeholder="列表中名称下方的一行"
                value={draft.title ?? ""}
                onChange={(e) => change("title", e.target.value)}
              />
            </div>
            <div className="wb-card-row">
              <span className="wb-card-label">注入位置</span>
              {React.cloneElement(positionSelect, { "aria-label": "注入位置" })}
            </div>
            {draft.position === 4 && (
              <div className="wb-card-row wb-card-pair">
                <span className="wb-card-label">深度</span>
                <input
                  aria-label="深度"
                  type="number"
                  min={0}
                  max={9999}
                  value={draft.depth ?? 2}
                  onChange={(e) => change("depth", Number(e.target.value))}
                />
                <span className="wb-card-label is-inline">角色</span>
                {roleSelect}
              </div>
            )}
            <div className="wb-card-row">
              <span className="wb-card-label">绑定世界书</span>
              <Select
                aria-label="绑定世界书"
                value={draft.lorebook || ""}
                onChange={(e) => change("lorebook", e.target.value)}
              >
                <option value="">不绑定</option>
                {snap.resources.world.map((w) => (
                  <option key={w.id}>{w.name}</option>
                ))}
              </Select>
            </div>
            <div className="wb-card-row">
              <span className="wb-card-label">对白颜色</span>
              <SpeakerColor host={host} kind="persona" id={id} />
            </div>
          </section>
          <Fold title="管理与偏好" hint="导出 · 统计 · 删除">
            <div className="wb-persona-manage">{manage}</div>
            {[
              ["persona_show_notifications", "切换身份时显示通知"],
              ["persona_allow_multi_connections", "允许角色关联多个身份"],
            ].map(([key, label]) => (
              <div key={key} className="wb-card-row wb-fold-switch">
                <span>{label}</span>
                <Switch
                  label={label}
                  checked={!!options.preferences[key]}
                  onChange={(v) => task.run(() => host.personaPreference(key, v))}
                />
              </div>
            ))}
          </Fold>
        </div>
        {save}
      </fieldset>
    );
  }
  // Board "WsPersona": the face and who uses it on the left, what it says on the right.
  const image = snap.resources.persona.find((x) => x.id === id)?.image;
  const locks = [
    ["chat", "锁定当前对话"],
    ["character", "锁定当前角色"],
    ["default", "默认身份"],
  ] as const;
  return (
    <fieldset className="wb-persona-editor wb-persona-desk" disabled={task.busy}>
      <Notice error={task.error} />
      <div className="wb-persona-desk-grid">
        <div className="wb-persona-side">
          <section className="wb-persona-portrait" aria-label="头像">
            <span className="wb-persona-face">
              {image ? <img src={image} alt="" /> : (draft.name || "?").slice(0, 1)}
            </span>
            <button onClick={() => action("#persona_set_image_button")}>更换头像</button>
          </section>
          <section className="wb-persona-card" aria-label="使用范围">
            <p className="wb-persona-card-title">
              {options.current ? "使用范围 · 立即生效" : "使用范围 · 切换到此身份后可调整"}
            </p>
            {locks.map(([key, label]) => (
              <div key={key} className="wb-persona-card-row">
                <span>{label}</span>
                <Switch
                  label={label}
                  checked={!!options.locks[key]}
                  disabled={!options.current || edit.dirty}
                  onChange={(v) => task.run(() => host.personaLock(key, v))}
                />
              </div>
            ))}
          </section>
          <section className="wb-persona-card" aria-label="注入与绑定">
            <p className="wb-persona-card-title">注入与绑定</p>
            <label className="wb-persona-card-row">
              <span>注入位置</span>
              {React.cloneElement(positionSelect, { "aria-label": "注入位置" })}
            </label>
            {draft.position === 4 && (
              <>
                <label className="wb-persona-card-row">
                  <span>深度</span>
                  <input
                    aria-label="深度"
                    type="number"
                    min={0}
                    max={9999}
                    value={draft.depth ?? 2}
                    onChange={(e) => change("depth", Number(e.target.value))}
                  />
                </label>
                <label className="wb-persona-card-row">
                  <span>注入角色</span>
                  {roleSelect}
                </label>
              </>
            )}
            <label className="wb-persona-card-row">
              <span>绑定世界书</span>
              <Select
                aria-label="绑定世界书"
                value={draft.lorebook || ""}
                onChange={(e) => change("lorebook", e.target.value)}
              >
                <option value="">不绑定</option>
                {snap.resources.world.map((w) => (
                  <option key={w.id}>{w.name}</option>
                ))}
              </Select>
            </label>
            <div className="wb-persona-card-row">
              <span>对白颜色</span>
              <SpeakerColor host={host} kind="persona" id={id} />
            </div>
          </section>
          <div className="wb-persona-tools">{manage}</div>
        </div>
        <div className="wb-persona-main">
          <label className="wb-persona-line">
            <span>用户名称</span>
            <input value={draft.name ?? ""} onChange={(e) => change("name", e.target.value)} />
          </label>
          <label className="wb-persona-line">
            <span>说明标题</span>
            <input
              placeholder="列表中名称下方的一行"
              value={draft.title ?? ""}
              onChange={(e) => change("title", e.target.value)}
            />
          </label>
          <MdField
            className="wb-persona-desc"
            label="用户描述"
            placeholder="写下你在故事里是谁：身份、性格、说话方式……"
            value={draft.description ?? ""}
            onChange={(value) => change("description", value)}
          />
          <small className="wb-persona-count">
            {(draft.description ?? "").length} 字
            {tokens.description !== undefined && ` · ${tokens.description} tokens`}
          </small>
        </div>
      </div>
      {save}
    </fieldset>
  );
}
