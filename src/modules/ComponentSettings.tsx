import React from "react";
import type { HostAdapter } from "../host/adapter";
import NativeSettings from "./NativeSettings";
import { InstalledExtensions, ReadingForm } from "./DesignedSettings";
import { bus } from "../host/bus";
/** Lease whole native components. Their lists, local actions and dynamic editors remain owned by the host. */
export default function ComponentSettings({
  host,
  page,
  group,
  extensionId,
}: {
  host: HostAdapter;
  page: string;
  group: string;
  extensionId?: string;
}) {
  const installed = page === "extensions" && group === "已安装";
  return (
    <section className={`wb-component-settings page-${page}`} aria-label={group}>
      {installed && (
        <header className="wb-designed-page-head">
          <div>
            <h2>{group}</h2>
            <small>内置与第三方扩展</small>
          </div>
        </header>
      )}
      {installed ? (
        <InstalledExtensions
          host={host}
          open={(id) => bus.emit("settings-group", { group: "扩展设置", extension: id })}
        />
      ) : (
        <NativeSettings host={host} page={page} group={group} extensionId={extensionId} />
      )}
      {page === "settings" && group === "外观与阅读" && <ReadingForm host={host} />}
    </section>
  );
}
