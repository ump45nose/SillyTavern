import { Select } from "../../ui/Select";
import type { HostAdapter } from "../../host/adapter";
import { clone } from "../../host/model";
import { useTask, Notice, Field } from "../../ui/common";
import { Fold, SaveBar, useDraft } from "../../ui/ResourceControls";
import { actionLabels } from "../../host/labels";
export function ProfileEditor({ host, id }: { host: HostAdapter; id: string }) {
  const task = useTask(),
    edit = useDraft(
      () => clone(host.snapshot().resources.connection.find((x) => x.id === id)?.data || {}),
      host.resourceVersions.connection,
      { host, key: "connection:" + id },
    );
  const { draft, change } = edit;
  return (
    <fieldset disabled={task.busy} className="wb-profile-editor">
      <Notice error={task.error} />
      <Fold title={`${actionLabels.connectionProfile}与绑定`} hint={draft.preset || "未绑定预设"}>
        <div className="wb-form-pair">
          <Field label="连接名称">
            <input value={draft.name || ""} onChange={(e) => change("name", e.target.value)} />
          </Field>
          <Field label="记录模型">
            <input value={draft.model || ""} onChange={(e) => change("model", e.target.value)} />
          </Field>
        </div>
        <button disabled={edit.dirty} onClick={() => task.run(() => host.select("connection", id))}>
          应用此{actionLabels.connectionProfile}
        </button>
        <Field label="分组">
          <input
            value={host.prefs().groups[id] || ""}
            placeholder="未分组"
            onChange={(e) => host.preference({ groups: { ...host.prefs().groups, [id]: e.target.value } })}
          />
        </Field>
        <Field label="绑定预设">
          <Select value={draft.preset || ""} onChange={(e) => change("preset", e.target.value)}>
            <option value="">不绑定</option>
            {host.snapshot().resources.preset.map((p) => (
              <option key={p.id}>{p.name}</option>
            ))}
          </Select>
        </Field>
        <Fold title="连接配置记录">
          <Field label="记录接口类型">
            <Select value={draft.mode || "cc"} onChange={(e) => change("mode", e.target.value)}>
              <option value="cc">Chat Completion</option>
              <option value="tc">Text Completion</option>
            </Select>
          </Field>
          {[
            ["api", "服务类型"],
            ["api-url", "服务地址"],
            ["proxy", "代理配置"],
            ["secret-id", "凭据引用"],
            ["reasoning-template", "思考模板"],
            ["prompt-post-processing", "提示词后处理"],
            ["regex-preset", "正则预设"],
            ["stop-strings", "停止字符串"],
            ["start-reply-with", "回复前缀"],
            ...(draft.mode === "tc"
              ? [
                  ["sysprompt", "系统提示词"],
                  ["context", "上下文模板"],
                  ["instruct", "指令模板"],
                  ["tokenizer", "分词器"],
                ]
              : []),
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input value={draft[key] ?? ""} onChange={(e) => change(key, e.target.value)} />
            </Field>
          ))}
          <Field label="应用时跳过的字段（每行一个）">
            <textarea
              value={(draft.exclude || []).join("\n")}
              onChange={(e) => change("exclude", e.target.value.split("\n").filter(Boolean))}
            />
          </Field>
        </Fold>
      </Fold>
      <SaveBar
        {...edit}
        busy={task.busy}
        label={actionLabels.updateConnectionProfile}
        title={`${actionLabels.connectionProfile}有未写入的修改`}
        detail={profileChanges(edit.base, draft)}
        pending
        save={() =>
          task.run(async () => {
            await host.saveProfile(id, edit.base, draft);
            edit.saved(clone(host.snapshot().resources.connection.find((x) => x.id === id)!.data!));
          })
        }
      />
    </fieldset>
  );
}
/** "模型 a → b", or a count when several recorded fields changed. */
function profileChanges(base: Record<string, any>, draft: Record<string, any>) {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(draft)])].filter(
    (k) => JSON.stringify(base[k] ?? "") !== JSON.stringify(draft[k] ?? ""),
  );
  if (!keys.length) return undefined;
  const names: Record<string, string> = { name: "名称", model: "模型", preset: "绑定预设", api: "服务类型" };
  const first = keys.find((k) => names[k]);
  if (!first) return `${keys.length} 项记录字段`;
  const head = `${names[first]} ${base[first] || "空"} → ${draft[first] || "空"}`;
  return keys.length > 1 ? `${head} 等 ${keys.length} 项` : head;
}
