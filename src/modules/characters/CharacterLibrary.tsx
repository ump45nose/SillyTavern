import { Select } from "../../ui/Select";
import React, { useState } from "react";
import { Star, Plus, Download, Search } from "../../ui/icons";
import type { HostAdapter } from "../../host/adapter";
import type { Item } from "../../host/types";
import { useTask, SearchBox, Notice, Empty, TriCheck, useHostSlices, withoutChat } from "../../ui/common";
import { toggleIds } from "../../ui/lists";
import { guards } from "../../host/bus";
import { characterCreation, favorite, matchCharacter, plain } from "./shared";
import { CharacterEditor } from "./CharacterEditor";
/** The first few names, then the total, so a long selection still fits a confirmation. */
const nameList = (items: Item[], shown = 8) => {
  const names = items.map((x) => x.name);
  return names.length > shown
    ? `${names.slice(0, shown).join("、")} 等 ${names.length} 个`
    : names.join("、");
};
/** "刚刚 / 5 天前 / 上周" for a last-chat timestamp. */
function since(value: unknown) {
  const at = Number(value);
  if (!at) return "";
  const minutes = Math.max(0, (Date.now() - at) / 60000),
    days = Math.floor(minutes / 1440);
  if (minutes < 60) return "刚刚";
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  if (days < 7) return `${days} 天前`;
  if (days < 14) return "上周";
  if (days < 56) return `${Math.floor(days / 7)} 周前`;
  return new Date(at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}
/** A portrait that falls back to the name's first character on a soft tint when the image is missing. */
function Portrait({ item, children }: { item: Item; children?: React.ReactNode }) {
  const [broken, setBroken] = useState(false),
    hue = [...item.name].reduce((n, c) => n + c.charCodeAt(0), 0) % 6;
  return (
    <span className={`wb-portrait ${broken ? "is-initial" : ""}`} data-tint={hue}>
      {broken ? (
        <b aria-hidden="true">{[...item.name][0]}</b>
      ) : (
        // The thumbnail is a small flattened JPEG; a portrait this size needs the card image itself.
        <img
          src={`/characters/${encodeURIComponent(item.id)}`}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
        />
      )}
      {children}
    </span>
  );
}
/** The independent character library (board "Characters"): a chip-filtered portrait gallery with a selection bar. */
export function CharacterLibrary({ host }: { host: HostAdapter }) {
  const snap = useHostSlices(host, withoutChat),
    task = useTask();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("recent"),
    [selected, setSelected] = useState<string[]>([]),
    [editing, setEditing] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const tagsOf = (x: Item) => (x.data?.data?.tags ?? []) as string[];
  const tags = [...new Set(snap.characters.flatMap(tagsOf))];
  const list = snap.characters
    .filter(
      (x) =>
        (filter !== "favorite" || favorite(x)) &&
        (filter !== "current" || x.active) &&
        (!filter.startsWith("tag:") || tagsOf(x).includes(filter.slice(4))) &&
        matchCharacter(query, x),
    )
    .sort((a, b) =>
      sort === "recent"
        ? Number(b.data?.date_last_chat ?? 0) - Number(a.data?.date_last_chat ?? 0)
        : a.name.localeCompare(b.name, "zh"),
    );
  const creation = characterCreation(host, task, setEditing);
  const chips: [string, string][] = [
    ["all", "全部"],
    ["favorite", "收藏"],
    ["current", "当前"],
    ...tags.map((t) => ["tag:" + t, t] as [string, string]),
  ];
  // Batch actions take only the selected cards still in view, never ones a filter or search hides.
  const chosen = list.filter((x) => selected.includes(x.id)),
    count = chosen.length;
  const report = (verb: string, done: number, failed: { id: string; message: string }[]) => {
    setMessage(`已${verb} ${done} 个角色${failed.length ? `，${failed.length} 个失败` : ""}`);
    if (failed.length)
      task.setError(
        failed.map((f) => `${chosen.find((x) => x.id === f.id)?.name || f.id}：${f.message}`).join("；"),
      );
  };
  const batchRun = (fn: () => unknown) => {
    setMessage("");
    return task.run(fn);
  };
  /** One card at a time: a failure is named in the error and the rest still run. */
  const each = (verb: string, job: (id: string) => Promise<unknown>) =>
    batchRun(async () => {
      const failed: { id: string; message: string }[] = [];
      for (const x of chosen) {
        try {
          await job(x.id);
        } catch (e) {
          failed.push({ id: x.id, message: e instanceof Error ? e.message : String(e) });
        }
      }
      report(verb, chosen.length - failed.length, failed);
    });
  const batch = (
    <div className={`wb-character-bulk ${count ? "is-active" : ""}`}>
      <label className="wb-check">
        <TriCheck
          label="选择当前结果"
          count={count}
          total={list.length}
          onChange={(on) => setSelected(on ? list.map((x) => x.id) : [])}
        />
        {count ? `已选 ${count} 个角色` : "全选"}
      </label>
      <span className="wb-grow" />
      <button
        disabled={!count || task.busy}
        onClick={() => {
          const value = prompt("添加标签");
          const ids = chosen.map((x) => x.id);
          if (value) batchRun(() => host.tagCharacters(ids, value));
        }}
      >
        标签
      </button>
      <button
        disabled={!count || task.busy}
        onClick={() => each("复制", (id) => host.duplicateCharacter(id))}
      >
        复制
      </button>
      <button disabled={!count || task.busy} onClick={() => each("导出", (id) => host.exportCharacter(id))}>
        导出
      </button>
      <button
        className="is-danger"
        disabled={!count || task.busy}
        onClick={() => {
          if (confirm(`删除选中的 ${count} 个角色卡？聊天文件保留。\n${nameList(chosen)}`))
            batchRun(async () => {
              const { deleted, failed } = await host.deleteCharacters(chosen.map((x) => x.id));
              report("删除", deleted.length, failed);
              setSelected(failed.map((f) => f.id));
            });
        }}
      >
        删除
      </button>
    </div>
  );
  return (
    <div className="wb-characters is-management">
      <Notice error={task.error} />
      {message && (
        <p className="wb-batch-status" role="status">
          {message}
        </p>
      )}
      {!editing ? (
        <section className="wb-library-content">
          <header className="wb-library-head">
            <h2>角色管理</h2>
            <small>
              {snap.characters.length} 个角色
              {list.length !== snap.characters.length && ` · 显示 ${list.length} 个`}
            </small>
            <span className="wb-grow" />
            <label className="wb-library-import">
              <Download size={15} />
              导入
              <input
                aria-label="导入角色卡"
                type="file"
                accept=".png,.json,.yaml,.yml,.charx,.byaf"
                multiple
                onChange={creation.importCards}
              />
            </label>
            <button className="wb-library-create" disabled={task.busy} onClick={creation.create}>
              <Plus size={15} />
              新建
            </button>
          </header>
          <div className="wb-character-search-row is-management">
            <SearchBox value={query} onChange={setQuery} placeholder="搜索角色或标签" />
            <div className="wb-library-chips" role="radiogroup" aria-label="角色筛选">
              {chips.map(([value, label]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={filter === value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <Select aria-label="角色排序" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="recent">最近对话</option>
              <option value="name">名称排序</option>
            </Select>
          </div>
          {batch}
          <div className={`wb-card-grid ${count ? "has-selection" : ""}`}>
            {list.map((x) => {
              const data = x.data?.data ?? x.data,
                on = selected.includes(x.id);
              return (
                <article
                  key={x.id}
                  className={`wb-character-card ${x.active ? "is-active" : ""} ${on ? "is-selected" : ""}`}
                >
                  <button
                    className="wb-character-main"
                    title={`编辑 ${x.name}`}
                    onClick={() => setEditing(x.id)}
                  >
                    <Portrait item={x}>{x.active && <em>当前</em>}</Portrait>
                    <span className="wb-character-card-body">
                      <span className="wb-character-card-title">
                        <strong>{x.name}</strong>
                        <time>{since(x.data?.date_last_chat)}</time>
                      </span>
                      <span className="wb-character-card-desc">
                        {plain(data?.description) || "暂无角色描述"}
                      </span>
                      {tagsOf(x).length > 0 && (
                        <span className="wb-character-card-tags">
                          {tagsOf(x)
                            .slice(0, 3)
                            .map((t) => (
                              <i key={t}>{t}</i>
                            ))}
                        </span>
                      )}
                    </span>
                  </button>
                  <label className="wb-character-select">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${x.name}`}
                      checked={on}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSelected((v) => toggleIds(v, [x.id], checked));
                      }}
                    />
                  </label>
                  <button
                    className={`wb-character-star ${favorite(x) ? "is-on" : ""}`}
                    aria-label={favorite(x) ? `取消收藏 ${x.name}` : `收藏 ${x.name}`}
                    title={favorite(x) ? "取消收藏" : "收藏"}
                    aria-pressed={favorite(x)}
                    onClick={() => task.run(() => host.favorite(x))}
                  >
                    <Star size={14} fill={favorite(x) ? "currentColor" : "none"} />
                  </button>
                </article>
              );
            })}
          </div>
          {!list.length && (
            <Empty
              icon={<Search size={18} />}
              title="没有符合条件的角色"
              action={{
                label: "清除筛选",
                onClick: () => {
                  setQuery("");
                  setFilter("all");
                },
              }}
            >
              换个名字或标签，或清除筛选。
            </Empty>
          )}
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
