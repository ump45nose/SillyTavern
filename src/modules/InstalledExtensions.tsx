import { useEffect, useState } from "react";
import { Plus, Puzzle, RefreshCw, Trash2 } from "../ui/icons";
import type { HostAdapter } from "../host/adapter";
import { Dialog, Field, Notice, SearchBox, useTask } from "../ui/common";
import { Check, Switch } from "../ui/ResourceControls";
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
