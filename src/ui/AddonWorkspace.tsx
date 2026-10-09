import React, { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { HostAdapter } from "../host/adapter";
import { addonEnabled, type AddonId } from "../addons/catalog";
import { addonHost, addonStyles, loadAddon } from "../addons/loader";
import type { AddonModule } from "../addons/types";
import { Loading, Notice, useHost } from "./common";
class AddonBoundary extends React.Component<{ children: React.ReactNode; retry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="wb-addon-message"><Notice error="附加插件发生错误，请重新载入。" /><button onClick={this.props.retry}><RotateCcw size={15} />重新载入</button></div> : this.props.children; }
}
export default function AddonWorkspace({ host, id, active }: { host: HostAdapter; id: AddonId; active: boolean }) {
  useHost(host);
  const enabled = addonEnabled(host.prefs(), id), api = useMemo(() => addonHost(host), [host]);
  const [module, setModule] = useState<AddonModule | null>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active || !enabled) { setModule(null); return; }
    let closed = false, styles: ReturnType<typeof addonStyles> | undefined;
    setModule(null); setError("");
    void (async () => {
      try {
        const loaded = await loadAddon(id);
        if (closed) return;
        styles = addonStyles(id, loaded.css); await styles.ready;
        if (!closed) setModule(loaded.module);
      } catch (failure) {
        styles?.dispose();
        if (!closed) setError(failure instanceof Error ? failure.message : String(failure));
      }
    })();
    return () => { closed = true; styles?.dispose(); };
  }, [id, active, enabled, attempt]);
  if (!active || !enabled) return null;
  if (error) return <div className="wb-addon-message" role="region" aria-label="附加插件加载失败"><Notice error={error} /><button onClick={() => setAttempt(value => value + 1)}><RotateCcw size={15} />重新载入</button></div>;
  if (!module) return <Loading />;
  const Workspace = module.Workspace;
  return <AddonBoundary key={`${id}:${attempt}`} retry={() => setAttempt(value => value + 1)}><Workspace host={api} /></AddonBoundary>;
}
