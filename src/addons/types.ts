import type { ComponentType } from "react";
/** Versioned, limited host capabilities for optional workspaces. No settings/chat mutation API. */
export interface AddonHost {
  subscribe: (listener: () => void) => () => void;
  revision: () => number;
  snapshot: () => { chatKey: string; chatName: string; busy: boolean };
  exportSnapshot: () => { key: string; timestamp: number; messages: { id: number; name: string; role: "user" | "assistant" | "system"; text: string }[] };
  download: (blob: Blob, filename: string) => void;
  jump: (id: number) => void;
  exportChat: (name: string) => Promise<void>;
}
export interface AddonModule {
  apiVersion: 1;
  id: string;
  Workspace: ComponentType<{ host: AddonHost }>;
}
export interface AddonManifest {
  id: string;
  apiVersion: 1;
  version: string;
  entry: string;
  css: string;
}
