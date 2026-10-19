import React, { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { HostAdapter } from "../host/adapter";
import type { OptionSource } from "../host/options-runtime";
import { DEFAULT_OPTIONS_PROMPT, type StoryOption } from "../host/options";
import { Popover } from "./Popover";
import { Select } from "./Select";

export function useOptionsState(host: HostAdapter) {
  return useSyncExternalStore(host.options.subscribe, () => host.options.state);
}

/**
 * The latest reply's options. One tap opens an option's detail, a second tap on the same option
 * (or on its detail) puts it in the input; nothing is sent.
 */
export function useStoryOptions(host: HostAdapter, onFill?: () => void) {
  const state = useOptionsState(host),
    [open, setOpen] = useState(-1);
  useEffect(() => setOpen(-1), [state.key]);
  const fill = (option: StoryOption) => {
    setOpen(-1);
    host.setInput(option.detail || option.title);
    onFill?.();
    requestAnimationFrame(() => document.getElementById("send_textarea")?.focus());
  };
  const chosen = state.items[open];
  const chips = state.items.map((option, index) => (
    <button
      key={index}
      className={`wb-story-option ${index === open ? "is-open" : ""}`}
      aria-expanded={index === open}
      title={index === open ? "再点一次填入输入框" : option.title}
      onClick={() => (index === open ? fill(option) : setOpen(index))}
    >
      {option.title}
    </button>
  ));
  const detail = chosen && (
    <button className="wb-story-detail" aria-label={`填入选项：${chosen.title}`} onClick={() => fill(chosen)}>
      <strong>{chosen.title}</strong>
      {chosen.detail && <span>{chosen.detail}</span>}
      <small>再点一次填入输入框</small>
    </button>
  );
  return { items: state.items, chips, detail, close: () => setOpen(-1) };
}

/** Noval: a row over the composer, in the native form's flow so the reading column makes room. */
export function ComposerOptions({ host }: { host: HostAdapter }) {
  const options = useStoryOptions(host),
    [slot, setSlot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const form = document.getElementById("send_form"),
      node = document.createElement("div");
    node.className = "wb-story-options wb-ui";
    form?.before(node);
    setSlot(node);
    return () => node.remove();
  }, []);
  if (!slot || !options.items.length) return null;
  return createPortal(
    <div role="group" aria-label="剧情选项">
      {options.detail}
      <div className="wb-story-chips">{options.chips}</div>
    </div>,
    slot,
  );
}

const sources: [OptionSource, string][] = [
  ["off", "关闭"],
  ["model", "模型输出"],
  ["db", "数据库表"],
];

/** Where this chat's options come from, and the prompt that asks the model for them. */
export function OptionsPopover({
  host,
  anchor,
  onClose,
}: {
  host: HostAdapter;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const state = useOptionsState(host),
    config = state.config,
    [prompt, setPrompt] = useState(host.options.template()),
    run = (pending: Promise<unknown>) => pending.catch((error) => host.report(error));
  return (
    <Popover anchor={anchor} title="剧情选项" onClose={onClose} className="wb-options-pop">
      <div className="wb-pop-form">
        <span className="wb-pop-label">选项来源 · 本聊天</span>
        <div className="wb-font-choices">
          {sources.map(([source, label]) => (
            <button
              key={source}
              aria-pressed={config.source === source}
              onClick={() => config.source !== source && run(host.options.save({ ...config, source }))}
            >
              {label}
            </button>
          ))}
        </div>
        {config.source === "db" && (
          <>
            <span className="wb-pop-label">选项表</span>
            <Select
              aria-label="数据库选项表"
              value={config.table}
              onChange={(e) => run(host.options.save({ ...config, table: e.target.value }))}
            >
              <option value="">选择一张表</option>
              {[...new Set([...state.tables, ...(config.table ? [config.table] : [])])].map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
            <p className="wb-options-note">
              只有一行时每列是一个选项；多行时每行是一个选项，第一列作标题，其余作详情。
            </p>
          </>
        )}
        {config.source === "model" && (
          <>
            <span className="wb-pop-label">提示词 · 所有聊天共用</span>
            <textarea
              className="wb-options-prompt"
              aria-label="剧情选项提示词"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="wb-options-actions">
              <button
                className="wb-primary"
                disabled={prompt === host.options.template()}
                onClick={() => run(host.options.savePrompt(prompt))}
              >
                保存提示词
              </button>
              <button
                disabled={prompt === DEFAULT_OPTIONS_PROMPT}
                onClick={() => {
                  setPrompt(DEFAULT_OPTIONS_PROMPT);
                  run(host.options.savePrompt(DEFAULT_OPTIONS_PROMPT));
                }}
              >
                恢复默认
              </button>
            </div>
            <p className="wb-options-note">
              模型在回复末尾附带 <code>{"<options>"}</code> 块：阅读时隐藏，下次请求时从历史中去掉。
            </p>
          </>
        )}
        {state.error && config.source !== "off" && <p className="wb-options-note is-error">{state.error}</p>}
      </div>
    </Popover>
  );
}
