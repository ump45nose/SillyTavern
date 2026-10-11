import type { HostAdapter } from "../adapter";
import type { Data } from "../types";
import { clone, mergeEdits, validatePreset } from "../model";
import { ctx } from "../internals";

/** Presets, preset bindings to connections/models, and prompt token composition. */
export const presetMethods = {
  model(this: HostAdapter) {
    const c = ctx();
    return c.mainApi === "openai"
      ? c.getChatCompletionModel()
      : (c.textCompletionSettings?.model ?? c.mainApi);
  },
  bindingKey(this: HostAdapter, kind: "connection" | "model") {
    return kind === "connection"
      ? `connection:${this.snapshot().current.connection}`
      : `model:${ctx().mainApi}:${this.model()}`;
  },
  async applyBinding(this: HostAdapter) {
    if (this.bindingRun) return;
    const p = this.prefs(),
      name = p.bindings[this.bindingKey("connection")] || p.bindings[this.bindingKey("model")];
    if (!name || ctx().getPresetManager().getSelectedPresetName() === name) return;
    const connection = this.connectionControls();
    this.bindingRun = true;
    try {
      await this.select("preset", name);
      // Bindings choose generation settings while keeping the chosen API/model.
      for (const control of [connection.main, connection.provider, connection.model]) {
        if (!control) continue;
        const node = document.getElementById(control.id) as HTMLInputElement | HTMLSelectElement | null;
        if (node && node.value !== control.value) this.setConnectionControl(control.id, control.value);
      }
    } finally {
      this.bindingRun = false;
    }
  },
  presetData(this: HostAdapter, name: string) {
    const m = ctx().getPresetManager();
    const { presets, preset_names } = m.getPresetList();
    const i = Array.isArray(preset_names) ? preset_names.indexOf(name) : preset_names[name];
    if (i === undefined || i < 0) throw new Error("预设不存在");
    return clone(presets[i]);
  },
  async createPreset(this: HostAdapter, name: string, data?: Data) {
    const manager = ctx().getPresetManager();
    name = name.trim();
    if (!name || manager.getAllPresets().includes(name)) throw new Error("预设名称不能为空或重复");
    if (data) validatePreset(data);
    await manager.savePreset(name, data);
    this.refresh();
    return manager.getSelectedPresetName();
  },
  async deletePreset(this: HostAdapter, name: string) {
    const manager = ctx().getPresetManager(),
      { presets, preset_names } = manager.getPresetList();
    const wasActive = manager.getSelectedPresetName() === name;
    const previousPresets = clone(presets),
      previousNames = clone(preset_names),
      previousSelection = manager.getSelectedPreset();
    const select = window.jQuery(manager.select),
      previousOptions = select.html();
    try {
      if (!(await manager.deletePreset(name))) throw new Error("删除失败，已保留预设。");
    } catch (error) {
      presets.splice(0, presets.length, ...previousPresets);
      if (Array.isArray(preset_names)) preset_names.splice(0, preset_names.length, ...previousNames);
      else {
        for (const key of Object.keys(preset_names)) delete preset_names[key];
        Object.assign(preset_names, previousNames);
      }
      select.html(previousOptions);
      await manager.selectPreset(previousSelection);
      this.refresh();
      throw error;
    }
    if (wasActive && manager.getAllPresets().length) await manager.selectPreset(manager.getSelectedPreset());
    this.refresh();
  },
  async savePreset(this: HostAdapter, name: string, base: Data, draft: Data) {
    validatePreset(draft);
    const merged = mergeEdits(base, draft, this.presetData(name));
    await ctx().getPresetManager().savePreset(name, merged);
    this.refresh();
    return merged;
  },
  traceComposition(this: HostAdapter) {
    const manager = this.openai?.promptManager;
    if (!manager?.tokenHandler) return null;
    const counts = clone(manager.tokenHandler.getCounts());
    return {
      counts,
      total: manager.tokenHandler.getTotal(),
      limit: ctx().chatCompletionSettings.openai_max_context,
      source: "PromptManager token counts",
      historyIncludesInput: true,
    };
  },
};
