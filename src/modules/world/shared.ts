export const positions = [
  "角色定义之前",
  "角色定义之后",
  "作者注释之前",
  "作者注释之后",
  "指定深度",
  "示例之前",
  "示例之后",
  "Outlet",
];
/** The depth the host injects an entry at when the entry has none (world-info.js DEFAULT_DEPTH). */
export const DEFAULT_DEPTH = 4;
export const modeName: Record<string, string> = { keyword: "关键词", constant: "常驻", vector: "向量化" };
export type EntryActions = {
  onToggle: (id: string, on: boolean) => void;
  onOpen: (id: string) => void;
};
