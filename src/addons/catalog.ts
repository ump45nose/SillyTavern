import type { Preferences } from "../host/types";
/** Metadata only: importing the catalog never imports a feature or fetches its manifest. */
export const addons = [{
  id: "record-export", label: "记录导出", version: "1.0.0", toolId: "wb:export",
  description: "在右栏分析聊天 XML，按标签保留或排除内容，预览并下载 TXT / Markdown。",
}] as const;
export type AddonId = typeof addons[number]["id"];
export function addonEnabled(prefs: Pick<Preferences, "addons">, id: AddonId) {
  return prefs.addons?.[id] !== false;
}
