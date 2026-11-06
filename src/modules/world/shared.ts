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
export const modeName: Record<string, string> = { keyword: "关键词", constant: "常驻", vector: "向量化" };
export type EntryActions = {
  onToggle: (id: string, on: boolean) => void;
  onOpen: (id: string) => void;
};
