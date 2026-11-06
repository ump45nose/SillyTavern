import { useRef, useState } from "react";
import { Copy, Download, Plus, Trash2, Upload, MoreHorizontal, Folder } from "../../ui/icons";
import type { HostAdapter } from "../../host/adapter";
import { validatePreset } from "../../host/model";
import { useTask } from "../../ui/common";
import { Popover } from "../../ui/Popover";
import { emptyPreset } from "../../host/empty-preset";
import { safeToLeave } from "./shared";
export function PresetActions({
  host,
  id,
  onSelect,
}: {
  host: HostAdapter;
  id?: string;
  onSelect: (id: string) => void;
}) {
  const task = useTask(),
    upload = useRef<HTMLInputElement>(null),
    [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const data = () => {
    if (!id) throw new Error("请先选择预设。");
    const cached = host.drafts.get("preset:" + id);
    if (cached?.extra?.advanced) throw new Error("JSON 无法解析，请先修正。");
    return cached?.draft ?? host.livePreset(id) ?? host.presetData(id);
  };
  const run = (action: () => Promise<unknown> | unknown) => {
    setAnchor(null);
    task.run(action);
  };
  return (
    <>
      <input
        ref={upload}
        className="wb-preset-upload"
        type="file"
        accept=".json,application/json"
        aria-label="导入预设文件"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          run(async () => {
            const value = JSON.parse(await file.text());
            validatePreset(value);
            const name = prompt("导入为新预设（不会覆盖已有预设）", file.name.replace(/\.json$/i, ""));
            if (name && safeToLeave()) onSelect(await host.createPreset(name, value));
          });
        }}
      />
      <button
        className="wb-panel-icon"
        title="导入预设"
        aria-label="导入预设"
        disabled={task.busy || host.isBusy()}
        onClick={() => upload.current?.click()}
      >
        <Upload size={16} />
      </button>
      <button
        className="wb-panel-icon"
        title="预设管理"
        aria-label="预设管理"
        aria-expanded={!!anchor}
        disabled={task.busy || host.isBusy()}
        onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
      >
        <MoreHorizontal size={18} />
      </button>
      {anchor && (
        <Popover anchor={anchor} title="预设管理" onClose={() => setAnchor(null)}>
          <div className="wb-preset-actions">
            <button
              disabled={!id}
              onClick={() =>
                run(async () => {
                  const current = host.snapshot().resources.preset.find((item) => item.id === id);
                  const group = prompt("分组名称（留空移出分组）", current?.group || "");
                  if (group !== null && id) await host.setResourceGroup("preset", [id], group);
                })
              }
            >
              <Folder size={16} />
              设置分组
            </button>
            <button
              onClick={() =>
                run(async () => {
                  const name = prompt("空白预设名称", "空白预设");
                  if (name && safeToLeave()) onSelect(await host.createPreset(name, emptyPreset()));
                })
              }
            >
              <Plus size={16} />
              新建空白预设
            </button>
            <button
              disabled={!id}
              onClick={() =>
                run(async () => {
                  const value = data(),
                    name = prompt("副本名称", `${id} 副本`);
                  if (name && safeToLeave()) onSelect(await host.createPreset(name, value));
                })
              }
            >
              <Copy size={16} />
              另存为
            </button>
            <button
              disabled={!id}
              onClick={() =>
                run(() =>
                  host.download(
                    new Blob([JSON.stringify(data(), null, 2)], { type: "application/json" }),
                    `${id}.json`,
                  ),
                )
              }
            >
              <Download size={16} />
              导出预设
            </button>
            <button
              className="is-danger"
              disabled={!id}
              onClick={() =>
                run(async () => {
                  if (id && confirm(`删除预设「${id}」？未保存的修改也会删除。`)) {
                    await host.deletePreset(id);
                    onSelect(host.snapshot().current.preset || host.snapshot().resources.preset[0]?.id || "");
                  }
                })
              }
            >
              <Trash2 size={16} />
              删除预设
            </button>
          </div>
        </Popover>
      )}
      {task.error && (
        <span className="wb-preset-action-error" role="alert">
          {task.error}
        </span>
      )}
    </>
  );
}
