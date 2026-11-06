import type { Preferences } from "../host/types";
import { boundedPreference } from "../host/rp";

export interface RangeField {
  label: string;
  min: number;
  max: number;
  step: number;
  /** What an unset preference reads as. */
  fallback: number;
  /** Follows the shown value. */
  suffix: string;
}
export interface ChoiceField<T extends string> {
  label: string;
  fallback: T;
  options: readonly (readonly [T, string])[];
}
type Choice<K extends keyof Preferences> = ChoiceField<NonNullable<Preferences[K]> & string>;

/** The reading preferences, as the reading settings popover and 用户设置 › 外观与阅读 both edit them. */
export const readingFields: {
  theme: Choice<"theme">;
  readingFont: Choice<"readingFont">;
  readingSize: RangeField;
  readingLeading: RangeField;
  readingInset: RangeField;
  messageMeta: Choice<"messageMeta">;
} = {
  theme: {
    label: "主题",
    fallback: "system",
    options: [
      ["light", "亮色"],
      ["dark", "暗色"],
      ["system", "跟随系统"],
    ],
  },
  readingFont: {
    label: "正文字体",
    fallback: "serif",
    options: [
      ["serif", "宋体 · 纸书"],
      ["sans", "黑体 · 清晰"],
    ],
  },
  readingSize: { label: "字号", min: 14, max: 24, step: 1, fallback: 17, suffix: " px" },
  readingLeading: { label: "行距", min: 1.5, max: 2.4, step: 0.1, fallback: 2, suffix: "" },
  readingInset: { label: "左右留白", min: 24, max: 128, step: 4, fallback: 64, suffix: " px" },
  messageMeta: {
    label: "时间与楼层",
    fallback: "hover",
    options: [
      ["always", "始终显示"],
      ["hover", "悬浮显示"],
      ["never", "隐藏"],
    ],
  },
};

/** RP 外观's sliders; the stage reads them clamped to the same ranges. */
export const rpFields = {
  rpTextSize: { label: "对白字号", min: 14, max: 26, step: 1, fallback: 19, suffix: " px" },
  rpDialogWidth: { label: "对白区域宽度", min: 65, max: 94, step: 1, fallback: 72, suffix: "%" },
  rpSpriteScale: { label: "角色立绘大小", min: 55, max: 100, step: 1, fallback: 91, suffix: "%" },
} satisfies Record<string, RangeField>;

export const bounded = (field: RangeField, value: number | undefined) =>
  boundedPreference(value, field.fallback, field.min, field.max);

export const messageFont = (font: Preferences["readingFont"]) =>
  font === "sans" ? "var(--wb-font-message-sans)" : "var(--wb-font-message-serif)";
export const dialogueFont = (font: Preferences["readingFont"]) =>
  font === "sans" ? "var(--wb-font-dialogue-sans)" : "var(--wb-font-message-serif)";
