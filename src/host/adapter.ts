import { clone } from "./model";
import { assertContext, ctx, internal } from "./internals";
import { HostCore, defaults } from "./core";
import { draftsMethods } from "./domains/drafts";
import { chatMethods } from "./domains/chat";
import { presetMethods } from "./domains/preset";
import { resourcesMethods } from "./domains/resources";
import { worldMethods } from "./domains/world";
import { characterMethods } from "./domains/character";
import { groupMethods } from "./domains/group";
import { extensionsMethods } from "./domains/extensions";
import { personaMethods } from "./domains/persona";
import { connectionMethods } from "./domains/connection";
import { nativeMethods } from "./domains/native";
export { nativeNodes } from "./internals";

/** Domain methods are written with `this: HostAdapter`; the mixed-in surface drops that parameter. */
type Mixin<T> = { [K in keyof T]: OmitThisParameter<T[K]> };

/**
 * Facade over SillyTavern for the workbench UI. State and infrastructure live in HostCore, domain
 * behaviour in ./domains; callers keep using one object.
 */
export class HostAdapter extends HostCore {
  async init() {
    this.generating = Boolean(ctx().streamingProcessor);
    [this.world, this.personas, this.openai] = await Promise.all([
      internal("world"),
      internal("personas"),
      internal("openai"),
    ]);
    assertContext();
    const c = ctx();
    const events = [
      "CHAT_CHANGED",
      "CHAT_RENAMED",
      "CHAT_DELETED",
      "GROUP_CHAT_DELETED",
      "MESSAGE_RECEIVED",
      "MESSAGE_SENT",
      "MESSAGE_UPDATED",
      "MESSAGE_DELETED",
      "CHARACTER_EDITED",
      "CHARACTER_DELETED",
      "CHARACTER_SELECTED",
      "SETTINGS_UPDATED",
      "OAI_PRESET_CHANGED_AFTER",
      "PRESET_CHANGED",
      "WORLDINFO_UPDATED",
      "WORLDINFO_SETTINGS_UPDATED",
      "PERSONA_CHANGED",
      "PERSONA_CREATED",
      "PERSONA_DELETED",
      "PERSONA_UPDATED",
      "CONNECTION_PROFILE_LOADED",
      "CONNECTION_PROFILE_CREATED",
      "CONNECTION_PROFILE_UPDATED",
      "CONNECTION_PROFILE_DELETED",
      "ONLINE_STATUS_CHANGED",
      "CHATCOMPLETION_MODEL_CHANGED",
      "CHATCOMPLETION_SOURCE_CHANGED",
    ];
    for (const name of events)
      this.listen(name, () => {
        if (["CHAT_CHANGED", "CHAT_RENAMED", "CHAT_DELETED", "GROUP_CHAT_DELETED"].includes(name))
          this.chatsVersion++;
        if (name === "WORLDINFO_UPDATED") this.resourceVersions.world++;
        if (name === "CHARACTER_EDITED") this.resourceVersions.character++;
        if (name === "PRESET_CHANGED" || name === "OAI_PRESET_CHANGED_AFTER") this.resourceVersions.preset++;
        if (name === "PERSONA_UPDATED") this.resourceVersions.persona++;
        if (name === "CONNECTION_PROFILE_UPDATED") this.resourceVersions.connection++;
        this.refresh();
      });
    this.listen("GENERATION_STARTED", (_type: any, _options: any, dry: boolean) => {
      if (!dry) {
        this.generating = true;
        this.refresh();
      }
    });
    for (const name of ["GENERATION_ENDED", "GENERATION_STOPPED"])
      this.listen(name, () => {
        this.generating = false;
        this.refresh();
      });

    for (const name of ["CONNECTION_PROFILE_LOADED", "CHATCOMPLETION_MODEL_CHANGED"])
      this.listen(name, () => {
        if (!this.busy && !this.resourceAction && !this.bindingRun)
          void this.applyBinding().catch((e) => this.report(e));
      });
    const handler = (e: Event) => {
      if (!(e.target as Element)?.closest?.("#wb-root")) this.refresh();
    };
    document.addEventListener("change", handler);
    this.cleanup.push(() => document.removeEventListener("change", handler));
    // Same settings object as the host; this contains no connection credentials.
    c.extensionSettings.workbench ??= clone(defaults);
    const guard = (e: Event) => {
      if (this.resourceAction) {
        e.preventDefault();
        return;
      }
      if ((e as CustomEvent).detail?.preserveDrafts) return;
      if (this.dirtyDraftKeys().length) {
        if (!confirm("有未保存的资源草稿，放弃这些修改？")) e.preventDefault();
        else this.drafts.clear();
      }
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (this.dirtyDraftKeys().length || this.resourceAction) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("wb-before-close", guard);
    window.addEventListener("beforeunload", unload);
    this.cleanup.push(() => {
      window.removeEventListener("wb-before-close", guard);
      window.removeEventListener("beforeunload", unload);
    });
    this.refresh();
  }
  destroy() {
    this.cleanup.forEach((fn) => fn());
    this.cleanup = [];
    this.listeners.clear();
    this.closeNative();
  }
}
export interface HostAdapter
  extends Mixin<typeof draftsMethods>,
    Mixin<typeof chatMethods>,
    Mixin<typeof presetMethods>,
    Mixin<typeof resourcesMethods>,
    Mixin<typeof worldMethods>,
    Mixin<typeof characterMethods>,
    Mixin<typeof groupMethods>,
    Mixin<typeof extensionsMethods>,
    Mixin<typeof personaMethods>,
    Mixin<typeof connectionMethods>,
    Mixin<typeof nativeMethods> {}

for (const methods of [
  draftsMethods,
  chatMethods,
  presetMethods,
  resourcesMethods,
  worldMethods,
  characterMethods,
  groupMethods,
  extensionsMethods,
  personaMethods,
  connectionMethods,
  nativeMethods,
])
  // Non-enumerable, like methods declared in the class body.
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(methods)))
    Object.defineProperty(HostAdapter.prototype, name, { ...descriptor, enumerable: false });
