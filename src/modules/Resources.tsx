import { useEffect, useRef, useState } from "react";
import { Copy, Trash2, BookmarkPlus } from "../ui/icons";
import type { HostAdapter } from "../host/adapter";
import type { Resource } from "../host/types";
import { useTask, Notice, Empty, useHostSlices, withoutChat } from "../ui/common";
import { connectionLabel, resourceLabels } from "../host/labels";
import { ResourcePicker, type RailExtras } from "../ui/ResourcePicker";
import { ConnectionRuntime } from "./Connection";
import { guards } from "../host/bus";
import { safeToLeave } from "./resources/shared";
import { PresetActions } from "./resources/PresetActions";
import { ProfileEditor } from "./resources/ProfileEditor";
import { PersonaEditor } from "./resources/PersonaEditor";
import { PresetEditor } from "./resources/PresetEditor";
export default function Resources({
  host,
  kind,
  initial,
  deep,
  onSelection,
  view,
}: {
  host: HostAdapter;
  kind: Exclude<Resource, "world">;
  initial?: string;
  deep?: boolean;
  onSelection?: (id: string) => void;
  view?: "prompts";
}) {
  const snap = useHostSlices(host, withoutChat),
    task = useTask();
  const [id, setId] = useState(initial || snap.current[kind] || snap.resources[kind][0]?.id || "");
  const pendingCreation = useRef<Set<string> | null>(null);
  useEffect(() => {
    onSelection?.(id);
  }, [id]);
  useEffect(() => {
    // Native create/delete actions can change the collection while this editor is open.
    const created =
      pendingCreation.current && snap.resources[kind].find((x) => !pendingCreation.current!.has(x.id));
    if (created) {
      pendingCreation.current = null;
      setId(created.id);
      return;
    }
    if (id && !snap.resources[kind].some((x) => x.id === id))
      setId(snap.current[kind] || snap.resources[kind][0]?.id || "");
  }, [snap.resources[kind], id, kind]);
  const current = snap.resources[kind].find((x) => x.id === id);
  const choose = (next: string) => {
    if (deep ? guards.check({ preserveDrafts: true }) : safeToLeave()) {
      pendingCreation.current = null;
      setId(next);
    }
  };
  const apply = (next: string) => {
    if (safeToLeave())
      task.run(async () => {
        pendingCreation.current = null;
        await host.select(kind, next);
        setId(next);
      });
  };
  const nativeAction = (selector: string) => {
    if (safeToLeave())
      task.run(async () => {
        pendingCreation.current = /create_|duplicate/.test(selector)
          ? new Set(snap.resources[kind].map((x) => x.id))
          : null;
        if (kind === "persona" && !/create_/.test(selector) && current && snap.current.persona !== id)
          await host.select("persona", id);
        host.click(selector);
      });
  };
  const rail: Record<typeof kind, RailExtras> = {
    preset: {
      plain: true,
      grouped: true,
      create: {
        label: "新建预设",
        run: () => {
          const name = prompt("新预设名称");
          if (name) task.run(async () => setId(await host.createPreset(name)));
        },
      },
    },
    connection: {
      grouped: true,
      restore: (id) => task.run(() => host.archiveResources("connection", [id], false)),
      create: { label: "新建连接配置", run: () => nativeAction("#create_connection_profile") },
    },
    persona: {
      avatars: true,
      create: { label: "新建用户设定", run: () => nativeAction("#create_dummy_persona") },
    },
  };
  return (
    <div className={`wb-resources wb-resource-v3 kind-${kind} ${deep ? "is-deep" : ""}`}>
      <header className="wb-panel-heading">
        {kind === "persona" && current && !deep && (
          <button
            className="wb-panel-avatar"
            aria-label="更换头像"
            title="更换头像"
            disabled={snap.busy || task.busy}
            onClick={() => nativeAction("#persona_set_image_button")}
          >
            {current.image ? <img src={current.image} alt="" /> : current.name.slice(0, 1)}
          </button>
        )}
        <div className="wb-panel-heading-copy">
          <div className="wb-panel-heading-line">
            <ResourcePicker
              label={resourceLabels[kind]}
              items={snap.resources[kind]}
              id={id}
              active={snap.current[kind]}
              choose={choose}
              use={apply}
              sortable={kind === "persona"}
              disabled={snap.busy || task.busy}
              extras={rail[kind]}
            />
            {current && snap.current[kind] === id && (
              <span className={`wb-status-chip ${kind === "connection" && !snap.online ? "is-off" : ""}`}>
                {kind === "connection"
                  ? connectionLabel(snap.online)
                  : kind === "preset"
                    ? "运行中"
                    : "使用中"}
              </span>
            )}
          </div>
          {current?.detail && kind !== "preset" && <p className="wb-panel-sub">{current.detail}</p>}
        </div>
        <div className="wb-panel-heading-actions">
          {kind === "preset" && <PresetActions host={host} id={current?.id} onSelect={setId} />}
          {current && snap.current[kind] !== id && (
            <button
              className="wb-panel-action"
              aria-label={`使用此${resourceLabels[kind]}`}
              title={`使用此${resourceLabels[kind]}`}
              disabled={snap.busy || task.busy}
              onClick={() => apply(id)}
            >
              使用
            </button>
          )}
          {kind === "connection" &&
            (
              [
                ["update_connection_profile", "记录", "把当前连接设置记录到此配置", BookmarkPlus],
                ["delete_connection_profile", "删除", "删除此连接配置", Trash2],
              ] as const
            ).map(([selector, text, title, Icon]) => (
              <button
                key={selector}
                className="wb-panel-icon"
                aria-label={text}
                title={snap.current.connection !== id ? "使用此连接后可操作" : title}
                disabled={snap.busy || task.busy || !current || snap.current.connection !== id}
                onClick={() => nativeAction(`#${selector}`)}
              >
                <Icon size={15} />
              </button>
            ))}
          {kind === "persona" && current && (
            <button
              className="wb-panel-icon"
              aria-label="复制"
              title="复制此用户设定"
              disabled={snap.busy || task.busy}
              onClick={() => nativeAction("#persona_duplicate_button")}
            >
              <Copy size={15} />
            </button>
          )}
        </div>
      </header>
      <Notice error={task.error} />
      {kind === "preset" ? (
        current ? (
          <PresetEditor key={id} host={host} id={id} deep={deep} view={view} onSelect={setId} />
        ) : (
          <>
            <Empty>暂无预设</Empty>
            <button
              onClick={() => {
                const name = prompt("新预设名称");
                if (name) task.run(async () => setId(await host.createPreset(name)));
              }}
            >
              创建预设
            </button>
          </>
        )
      ) : kind === "connection" ? (
        <div className="wb-resource-detail wb-connection-detail">
          <ConnectionRuntime host={host} />
          {current && <ProfileEditor key={id} host={host} id={id} />}
        </div>
      ) : current ? (
        <PersonaEditor key={id} host={host} id={id} deep={deep} />
      ) : (
        <div className="wb-fields">
          <Empty>选择用户身份，或创建一个新身份</Empty>
          <button onClick={() => host.click("#create_dummy_persona")}>创建用户设定</button>
        </div>
      )}
    </div>
  );
}
