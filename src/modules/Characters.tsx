import { Select } from "../ui/Select";
import React, { useContext, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  BookMarked,
  Star,
  Plus,
  Upload,
  Users,
  Grid2X2,
  Download,
  Trash2,
  Tag,
  Copy,
  PencilLine,
  PanelLeftClose,
  PanelLeftOpen,
  BookOpen,
  MessageSquarePlus,
  Search,
} from "../ui/icons";
import type { HostAdapter } from "../host/adapter";
import type { Data, Item } from "../host/types";
import { clone } from "../host/model";
import {
  useTask,
  SearchBox,
  Notice,
  Empty,
  Field,
  IconButton,
  useHostSlices,
  withoutChat,
} from "../ui/common";
import { ResourceRailContext } from "../ui/ResourcePicker";
import { SaveBar } from "../ui/ResourceControls";
import { guards, type Guard } from "../host/bus";

function CharacterInfo({ item, onEdit }: { item?: Item; onEdit: (id: string) => void }) {
  const data = item?.data?.data ?? item?.data;
  return (
    <div className="wb-character-info">
      <p className="wb-caption">角色信息</p>
      {item ? (
        <>
          <img src={item.image} alt="" />
          <h3 title={item.name}>{item.name}</h3>
          <small>{(data?.tags || []).join(" · ") || item.detail || "未分类角色"}</small>
          <p>{String(data?.description || "暂无角色描述").replace(/<[^>]*>/g, "")}</p>
          {data?.personality && <p>{data.personality}</p>}
          <button onClick={() => onEdit(item.id)}>
            <PencilLine size={14} />
            编辑角色
          </button>
        </>
      ) : (
        <p>悬浮或聚焦角色，查看介绍。</p>
      )}
    </div>
  );
}
export default function Characters(props: {
  host: HostAdapter;
  management?: boolean;
  onManage?: (group?: string) => void;
}) {
  return props.management ? <CharacterLibrary host={props.host} /> : <CharacterPanel {...props} />;
}
const favorite = (x: Item) => Boolean(x.data?.data?.extensions?.fav ?? x.data?.fav);
const fieldTabs = [
  ["description", "描述"],
  ["personality", "性格"],
  ["scenario", "场景"],
  ["first_mes", "第一条消息"],
] as const;
const plain = (text: unknown) =>
  String(text ?? "")
    .replace(/<[^>]*>/g, "")
    .trim();
/** The right panel (board "PanelCharacter"): the list lives in the rail; the card shows one character to read, then act on. */
function CharacterPanel({ host, onManage }: { host: HostAdapter; onManage?: (group?: string) => void }) {
  const snap = useHostSlices(host, withoutChat),
    task = useTask(),
    rail = useContext(ResourceRailContext);
  const [query, setQuery] = useState(""),
    [viewing, setViewing] = useState(snap.character?.id || ""),
    [field, setField] = useState<(typeof fieldTabs)[number][0]>("description"),
    [editing, setEditing] = useState<string | null>(null);
  const item = snap.characters.find((x) => x.id === viewing) ?? snap.character ?? snap.characters[0];
  const data = item?.data?.data ?? item?.data ?? {};
  const list = snap.characters
    .filter((x) =>
      `${x.name} ${x.detail} ${(x.data?.data?.tags || []).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    )
    .sort((a, b) => Number(favorite(b)) - Number(favorite(a)) || a.name.localeCompare(b.name, "zh"));
  const create = () => {
    const name = prompt("角色名称");
    if (name) task.run(async () => setEditing(await host.createCharacter(name)));
  };
  const star = (x: Item, className: string) => (
    <button
      className={className}
      aria-label={favorite(x) ? `取消收藏 ${x.name}` : `收藏 ${x.name}`}
      title={favorite(x) ? "取消收藏" : "收藏"}
      aria-pressed={favorite(x)}
      onClick={() => task.run(() => host.favorite(x))}
    >
      <Star size={14} fill={favorite(x) ? "currentColor" : "none"} />
    </button>
  );
  const listNav = (
    <nav className={`wb-ui wb-rail wb-character-nav ${rail ? "" : "is-inline"}`} aria-label="角色列表">
      <label className="wb-rail-search">
        <Search size={14} />
        <input
          aria-label="搜索角色"
          placeholder="搜索角色或标签"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="wb-rail-scroll">
        <ul className="wb-rail-list">
          {list.map((x) => (
            <li
              key={x.id}
              className={`wb-rail-row ${x.id === item?.id && !editing ? "is-viewing" : ""} ${x.active ? "is-on" : ""}`}
            >
              <button
                className="wb-rail-open"
                aria-current={(x.id === item?.id && !editing) || undefined}
                title={x.active ? `${x.name} · 当前角色` : x.name}
                onClick={() => {
                  if (editing && !guards.check()) return;
                  setEditing(null);
                  setViewing(x.id);
                }}
              >
                <span className="wb-rail-avatar" aria-hidden="true">
                  {x.image ? <img src={x.image} alt="" /> : x.name.slice(0, 1)}
                </span>
                <span className="wb-rail-copy">
                  <span className="wb-rail-name">{x.name}</span>
                  <small>{x.active ? "当前角色" : x.detail || "未分类角色"}</small>
                </span>
              </button>
              {favorite(x) && (
                <Star className="wb-rail-star" size={12} fill="currentColor" aria-label="收藏" role="img" />
              )}
            </li>
          ))}
        </ul>
        {!list.length && <p className="wb-rail-empty">没有符合条件的角色</p>}
      </div>
      <div className="wb-rail-foot">
        <button className="wb-rail-new" disabled={task.busy} onClick={create}>
          <Plus size={15} />
          新建
        </button>
        <label className="wb-rail-tool" title="导入角色卡">
          <Upload size={15} />
          <input
            aria-label="导入角色卡"
            type="file"
            accept=".png,.json,.yaml,.yml,.charx,.byaf"
            multiple
            onChange={(e) => {
              const files = [...(e.target.files || [])];
              task.run(async () => {
                for (const file of files) await host.importCharacter(file);
              });
            }}
          />
        </label>
        <button className="wb-rail-tool" aria-label="群组" title="群组" onClick={() => onManage?.("群组")}>
          <Users size={15} />
        </button>
        {onManage && (
          <button
            className="wb-rail-tool"
            aria-label="独立管理"
            title="打开角色管理"
            onClick={() => onManage()}
          >
            <Grid2X2 size={15} />
          </button>
        )}
      </div>
    </nav>
  );
  const tags: string[] = data.tags || [];
  const text = plain(data[field]);
  return (
    <div className="wb-characters wb-character-panel">
      <Notice error={task.error} />
      {editing ? (
        <div className="wb-character-detail-wrap">
          <button
            className="wb-link"
            onClick={() => {
              if (guards.check()) setEditing(null);
            }}
          >
            ← 返回角色
          </button>
          <CharacterEditor key={editing} id={editing} host={host} />
        </div>
      ) : item ? (
        <article className="wb-character-profile" aria-label={`角色 ${item.name}`}>
          <header className="wb-character-hero">
            {item.image && (
              // The hero is too large for the native thumbnail (a small flattened JPEG); show the card image itself.
              <img src={`/characters/${encodeURIComponent(item.id)}`} alt="" />
            )}
            <div className="wb-character-hero-tools">
              {star(item, "wb-character-hero-tool is-star")}
              {rail && (
                <button
                  className="wb-character-hero-tool"
                  aria-label={rail.open ? "收起角色列表" : "展开角色列表"}
                  title={rail.open ? "收起角色列表" : "展开角色列表"}
                  aria-expanded={rail.open}
                  onClick={() => rail.setOpen(!rail.open)}
                >
                  {rail.open ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
                </button>
              )}
            </div>
            <div className="wb-character-hero-copy">
              <h2 title={item.name}>{item.name}</h2>
              <p>{item.active ? "当前对话中" : item.detail || data.creator || "未分类角色"}</p>
              {tags.length > 0 && (
                <div className="wb-character-tags">
                  {tags.slice(0, 4).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          </header>
          <div className="wb-character-fields" role="tablist" aria-label="角色字段">
            {fieldTabs.map(([key, label]) => (
              <button key={key} role="tab" aria-selected={field === key} onClick={() => setField(key)}>
                {label}
              </button>
            ))}
          </div>
          <div className={`wb-character-text ${text ? "" : "is-empty"}`} role="tabpanel">
            {text || "暂无内容"}
          </div>
          <p className="wb-character-world">
            <BookMarked size={14} aria-hidden="true" />
            绑定世界书
            <span>{data.extensions?.world || "未绑定"}</span>
          </p>
          <footer className="wb-character-actions">
            <button
              className="wb-character-start"
              disabled={task.busy || !!item.active}
              onClick={() => task.run(() => host.selectCharacter(item.id))}
            >
              <MessageSquarePlus size={14} />
              {item.active ? "当前角色" : "开始对话"}
            </button>
            <button
              className="wb-character-quiet"
              onClick={() => task.run(() => host.exportCharacter(item.id))}
            >
              导出角色
            </button>
            <button className="wb-character-edit" onClick={() => setEditing(item.id)}>
              <PencilLine size={14} />
              编辑角色
            </button>
          </footer>
        </article>
      ) : (
        <Empty>还没有角色，先新建或导入一张角色卡</Empty>
      )}
      {rail ? rail.target && rail.open && createPortal(listNav, rail.target) : listNav}
    </div>
  );
}
/** The independent character library (deep view; restyled with the settings workspace in E6). */
function CharacterLibrary({ host }: { host: HostAdapter }) {
  const snap = useHostSlices(host, withoutChat),
    task = useTask();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [tag, setTag] = useState(""),
    [sort, setSort] = useState("name"),
    [selected, setSelected] = useState<string[]>([]),
    [editing, setEditing] = useState<string | null>(null),
    [preview, setPreview] = useState<string>("");
  const tags = [...new Set(snap.characters.flatMap((x) => x.data?.data?.tags ?? []))] as string[];
  const list = snap.characters
    .filter(
      (x) =>
        (filter !== "favorite" || favorite(x)) &&
        (filter !== "current" || x.active) &&
        (!tag || x.data?.data?.tags?.includes(tag)) &&
        `${x.name} ${x.detail} ${(x.data?.data?.tags || []).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "recent"
        ? Number(b.data?.date_last_chat ?? 0) - Number(a.data?.date_last_chat ?? 0)
        : a.name.localeCompare(b.name, "zh"),
    );
  const open = (item: Item) => setEditing(item.id);
  const edit = (id: string) => setEditing(id),
    info = <CharacterInfo item={snap.characters.find((x) => x.id === preview)} onEdit={edit} />;
  const importCard = (
    <label className="wb-import-character">
      <Upload size={15} />
      导入
      <input
        aria-label="导入角色卡"
        type="file"
        accept=".png,.json,.yaml,.yml,.charx,.byaf"
        multiple
        onChange={(e) => {
          const files = [...(e.target.files || [])];
          task.run(async () => {
            for (const file of files) await host.importCharacter(file);
          });
        }}
      />
    </label>
  );
  const create = () => {
    const name = prompt("角色名称");
    if (name) task.run(async () => setEditing(await host.createCharacter(name)));
  };
  const batch = (
    <div className="wb-character-bulk">
      <label className="wb-check">
        <input
          aria-label="选择当前结果"
          type="checkbox"
          checked={list.length > 0 && list.every((x) => selected.includes(x.id))}
          onChange={(e) => setSelected(e.target.checked ? list.map((x) => x.id) : [])}
        />
        全选
      </label>
      <small>{selected.length} 已选</small>
      <span className="wb-grow" />
      <button
        disabled={!selected.length || task.busy}
        onClick={() => {
          const value = prompt("添加标签");
          if (value) task.run(() => host.tagCharacters(selected, value));
        }}
      >
        <Tag size={15} />
        标签
      </button>
      <button
        disabled={!selected.length || task.busy}
        onClick={() =>
          task.run(async () => {
            for (const id of selected) await host.exportCharacter(id);
          })
        }
      >
        <Download size={15} />
        导出
      </button>
      <button
        disabled={!selected.length || task.busy}
        onClick={() =>
          task.run(async () => {
            for (const id of selected) await host.duplicateCharacter(id);
          })
        }
      >
        <Copy size={15} />
        复制
      </button>
      <button
        disabled={!selected.length || task.busy}
        onClick={() => {
          if (confirm(`删除选中的 ${selected.length} 个角色卡？聊天文件保留。`))
            task.run(async () => {
              await host.deleteCharacters(selected);
              setSelected([]);
            });
        }}
      >
        <Trash2 size={15} />
        删除
      </button>
      <button disabled={task.busy} onClick={create}>
        <Plus size={15} />
        新建
      </button>
      {importCard}
    </div>
  );
  return (
    <div className="wb-characters is-management">
      <Notice error={task.error} />
      {!editing ? (
        <section className="wb-library-content">
          <header className="wb-designed-page-head">
            <div>
              <h2>角色管理</h2>
              <small>{list.length} 个角色 · 悬浮查看介绍</small>
            </div>
          </header>
          {batch}
          <div className="wb-character-search-row is-management">
            <SearchBox value={query} onChange={setQuery} placeholder="搜索角色或标签" />
            <>
              <Select aria-label="角色筛选" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="all">全部角色</option>
                <option value="favorite">我的收藏</option>
                <option value="current">当前角色</option>
              </Select>
              <Select aria-label="标签筛选" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">所有标签</option>
                {tags.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </>
            <Select aria-label="角色排序" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">名称排序</option>
              <option value="recent">最近对话</option>
            </Select>
          </div>
          <div className="wb-character-browse has-info">
            <aside>{info}</aside>
            <div>
              <div className="wb-card-grid">
                {list.map((x) => (
                  <article
                    key={x.id}
                    className={`wb-character-card ${x.active ? "is-active" : ""} ${selected.includes(x.id) ? "is-selected" : ""}`}
                    onMouseEnter={() => setPreview(x.id)}
                    onFocus={() => setPreview(x.id)}
                  >
                    <input
                      type="checkbox"
                      aria-label={`选择 ${x.name}`}
                      checked={selected.includes(x.id)}
                      onChange={(e) =>
                        setSelected((v) => (e.target.checked ? [...v, x.id] : v.filter((id) => id !== x.id)))
                      }
                    />
                    <button className="wb-character-main" title={x.name} onClick={() => open(x)}>
                      <span className="wb-portrait">
                        <img src={x.image} alt="" />
                      </span>
                      <span>
                        <strong>{x.name}</strong>
                        <small>{x.detail || "未分类角色"}</small>
                      </span>
                      {x.active && <em>当前</em>}
                    </button>
                    <IconButton
                      title={favorite(x) ? `取消收藏 ${x.name}` : `收藏 ${x.name}`}
                      onClick={() => task.run(() => host.favorite(x))}
                    >
                      <Star size={15} fill={favorite(x) ? "currentColor" : "none"} />
                    </IconButton>
                    <IconButton title={`编辑角色 ${x.name}`} onClick={() => edit(x.id)}>
                      <PencilLine size={14} />
                    </IconButton>
                  </article>
                ))}
              </div>
              {!list.length && <Empty>没有符合条件的角色</Empty>}
            </div>
          </div>
        </section>
      ) : (
        <div className="wb-character-detail-wrap">
          <button
            className="wb-link"
            onClick={() => {
              if (guards.check()) setEditing(null);
            }}
          >
            ← 返回角色库
          </button>
          <CharacterEditor key={editing} id={editing} host={host} />
        </div>
      )}
    </div>
  );
}
function CharacterEditor({ host, id }: { host: HostAdapter; id: string }) {
  const task = useTask(),
    [base, setBase] = useState<Data | null>(host.drafts.get("character:" + id)?.base || null),
    [draft, setDraft] = useState<Data | null>(host.drafts.get("character:" + id)?.draft || null),
    [message, setMessage] = useState("");
  const dirty = !!base && JSON.stringify(base) !== JSON.stringify(draft);
  useEffect(() => {
    if (dirty) return;
    let live = true;
    host
      .characterData(id)
      .then((c) => {
        if (live) {
          setBase(clone(c.data ?? {}));
          setDraft(clone(c.data ?? {}));
        }
      })
      .catch((e) => task.setError(e.message));
    return () => {
      live = false;
    };
  }, [id, host.resourceVersions.character, dirty]);
  useEffect(() => {
    if (base && draft) host.drafts.set("character:" + id, { base: clone(base), draft: clone(draft) });
  }, [base, draft, id]);
  useEffect(() => {
    const guard: Guard = ({ preserveDrafts }) =>
      preserveDrafts || !dirty || confirm("角色有未保存修改，放弃这些修改？");
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const off = guards.add(guard);
    window.addEventListener("beforeunload", unload);
    return () => {
      off();
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty]);
  if (!draft || !base)
    return (
      <>
        <Notice error={task.error} />
        <Empty>正在读取角色…</Empty>
      </>
    );
  const field = (key: string, label: string, rows = 4) => (
    <Field label={label}>
      <textarea
        rows={rows}
        value={draft[key] ?? ""}
        onChange={(e) => {
          setDraft({ ...draft, [key]: e.target.value });
          setMessage("");
        }}
      />
    </Field>
  );
  return (
    <fieldset disabled={task.busy} className="wb-character-editor">
      <Notice error={task.error} />
      <div className="wb-role-heading">
        <img src={host.snapshot().characters.find((c) => c.id === id)?.image} />
        <Field label="角色名称">
          <input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
      </div>
      <div className="wb-designed-actions">
        <button onClick={() => task.run(() => host.selectCharacter(id))}>
          <Users size={15} />
          开始对话
        </button>
        <label className="wb-import-character">
          <Upload size={15} />
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
        <button onClick={() => task.run(() => host.exportCharacter(id))}>
          <Download size={15} />
          导出角色
        </button>
        <button onClick={() => task.run(() => host.duplicateCharacter(id))}>
          <Copy size={15} />
          复制角色
        </button>
      </div>
      <Field label="标签（逗号分隔）">
        <input
          value={(draft.tags ?? []).join(", ")}
          onChange={(e) =>
            setDraft({
              ...draft,
              tags: e.target.value
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean),
            })
          }
        />
      </Field>
      {field("description", "角色描述", 7)}
      {field("first_mes", "第一条消息", 6)}
      <Field label="备选开场白（以单独一行 --- 分隔）">
        <textarea
          value={(draft.alternate_greetings || []).join("\n---\n")}
          onChange={(e) =>
            setDraft({ ...draft, alternate_greetings: e.target.value.split(/\n---\n/).filter(Boolean) })
          }
        />
      </Field>
      <details>
        <summary>高级定义</summary>
        {field("personality", "性格")}
        {field("scenario", "场景")}
        {field("mes_example", "对话示例")}
        {field("system_prompt", "系统提示词")}
        {field("post_history_instructions", "历史后指令")}
        {field("creator_notes", "创作者注释")}
        <div className="wb-designed-fields">
          {[
            ["creator", "创建者"],
            ["character_version", "角色版本"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                value={draft[key] || ""}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <Field label="角色世界书">
          <Select
            value={draft.extensions?.world || ""}
            onChange={(e) =>
              setDraft({ ...draft, extensions: { ...draft.extensions, world: e.target.value } })
            }
          >
            <option value="">不绑定</option>
            {host.snapshot().resources.world.map((w) => (
              <option key={w.id}>{w.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="发言积极性">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={draft.extensions?.talkativeness ?? 0.5}
            onChange={(e) =>
              setDraft({
                ...draft,
                extensions: { ...draft.extensions, talkativeness: Number(e.target.value) },
              })
            }
          />
        </Field>
        <Field label="深度提示词">
          <textarea
            value={draft.extensions?.depth_prompt?.prompt || ""}
            onChange={(e) =>
              setDraft({
                ...draft,
                extensions: {
                  ...draft.extensions,
                  depth_prompt: { ...draft.extensions?.depth_prompt, prompt: e.target.value },
                },
              })
            }
          />
        </Field>
        <div className="wb-form-pair">
          <Field label="深度">
            <input
              type="number"
              min={0}
              value={draft.extensions?.depth_prompt?.depth ?? 4}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  extensions: {
                    ...draft.extensions,
                    depth_prompt: { ...draft.extensions?.depth_prompt, depth: Number(e.target.value) },
                  },
                })
              }
            />
          </Field>
          <Field label="注入角色">
            <Select
              value={draft.extensions?.depth_prompt?.role || "system"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  extensions: {
                    ...draft.extensions,
                    depth_prompt: { ...draft.extensions?.depth_prompt, role: e.target.value },
                  },
                })
              }
            >
              <option>system</option>
              <option>user</option>
              <option>assistant</option>
            </Select>
          </Field>
        </div>
      </details>
      <SaveBar
        dirty={dirty}
        busy={task.busy}
        message={message}
        reset={() => {
          setDraft(clone(base));
          setMessage("");
        }}
        save={() =>
          task.run(async () => {
            const data = await host.saveCharacter(id, base, draft);
            setBase(clone(data.data));
            setDraft(clone(data.data));
            setMessage("已保存");
          })
        }
      />
    </fieldset>
  );
}
