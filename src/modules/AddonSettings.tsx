import React from "react";
import { FileOutput, Puzzle } from "lucide-react";
import type { HostAdapter } from "../host/adapter";
import { addons, addonEnabled } from "../addons/catalog";
import { Check } from "../ui/ResourceControls";
import { useHost } from "../ui/common";
export default function AddonSettings({ host }: { host: HostAdapter }) {
  useHost(host);
  const prefs = host.prefs();
  return <section className="wb-addon-settings" aria-label="工作台附加功能">
    <header className="wb-utility-heading"><Puzzle size={21} /><div><h3>工作台附加功能</h3><p>启用后，点击入口才加载；关闭工作区后停止分析并释放资源。</p></div></header>
    <div className="wb-addon-grid">{addons.map(addon => {
      const enabled = addonEnabled(prefs, addon.id);
      return <article className={`wb-addon-card ${enabled ? "is-enabled" : ""}`} key={addon.id}>
        <header><FileOutput size={22} /><strong>{addon.label}<small>附加插件 · v{addon.version}</small></strong><Check label={`启用${addon.label}`} checked={enabled} onChange={value => host.preference({ addons: { ...prefs.addons, [addon.id]: value } })} /></header>
        <p>{addon.description}</p><footer><span>{enabled ? "已启用 · 按需加载" : "已停用"}</span><small>入口：右栏分类 / 常用工具栏</small></footer>
      </article>;
    })}</div>
  </section>;
}
