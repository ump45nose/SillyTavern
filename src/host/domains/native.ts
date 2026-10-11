import type { HostAdapter } from "../adapter";
import { nativeMenuItems } from "../tools";

/** Native panels and controls: leasing settings DOM, opening drawers, clicking menu entries. */
export const nativeMethods = {
  click(this: HostAdapter, selector: string) {
    const nodes = [...document.querySelectorAll<HTMLElement>(selector)];
    const element =
      nodes.find((n) => !n.classList.contains("displayNone") && getComputedStyle(n).display !== "none") ??
      nodes[0];
    if (!element) throw new Error("当前酒馆未提供此入口。");
    element.click();
  },
  menuItems(this: HostAdapter, kind: "menu" | "tools") {
    return nativeMenuItems(kind);
  },
  /** Lease original controls with their handlers intact; every lease restores its exact origin. */
  leaseNative(this: HostAdapter, id: string, container: HTMLElement) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`酒馆未提供 ${id} 控件。`);
    if (node.closest(".wb-native-settings-slot,.wb-native-slot"))
      throw new Error("此设置已在其他编辑区打开。");
    return this.lease(node, container, "Workbench native settings origin");
  },
  native(this: HostAdapter, kind: string) {
    this.suspendedDialogs = [
      ...document.querySelectorAll<HTMLDialogElement>(".wb-dialog[open],.wb-settings-workspace[open]"),
    ];
    this.suspendedDialogs.forEach((d) => d.close());
    document.body.classList.add("wb-native-panel");
    const selectors: Record<string, string> = {
      connection: "#rm_api_block .drawer-toggle",
      preset: "#left-nav-panel .drawer-toggle",
      world: "#WI-SP-button .drawer-toggle",
      persona: "#persona-management-button .drawer-toggle",
      character: "#rightNavDrawerIcon",
      settings: "#user-settings-button .drawer-icon",
      quickreply: "#extensions-settings-button .drawer-icon",
      formatting: "#advanced-formatting-button .drawer-icon",
      background: "#backgrounds-button .drawer-icon",
      extensions: "#extensions-settings-button .drawer-icon",
    };
    // Drawer container names differ from the contents; selectors are isolated here.
    const fallback: Record<string, string> = {
      connection: "#API-status-top",
      preset: "#leftNavDrawerIcon",
      world: "#WIDrawerIcon",
      persona: "#persona-management-button .drawer-icon",
    };
    let el =
      document.querySelector<HTMLElement>(selectors[kind] ?? selectors.settings) ??
      document.querySelector<HTMLElement>(fallback[kind]);
    if (!el) throw new Error("原生面板不可用，请返回原界面。");
    if (!el.classList.contains("openIcon")) el.click();
  },
  closeNative(this: HostAdapter) {
    document
      .querySelectorAll<HTMLElement>("#top-settings-holder .drawer-icon.openIcon")
      .forEach((x) => x.click());
    document.body.classList.remove("wb-native-panel");
    this.suspendedDialogs.filter((d) => d.isConnected).forEach((d) => d.showModal());
    this.suspendedDialogs = [];
  },
};
