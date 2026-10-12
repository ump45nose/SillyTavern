// Named UI states for the seeded visual instance, shared by capture and audit scripts.
import { session, ready, urls } from "../browser.mjs";

const desktop = { width: 1496, height: 817 };
const compact = { width: 1366, height: 768 };
const phone = { width: 390, height: 844 };

const key = (combo) => async (page) => {
  await page.keyboard.press(combo);
};
const click = (selector) => async (page) => {
  await page.locator(selector).first().click();
};
const label = (name) => async (page) => {
  await page.getByLabel(name, { exact: true }).first().click();
};
const text = (name) => async (page) => {
  await page.getByRole("button", { name, exact: true }).first().click();
};
/** The left column leads to 设置; every page is then one entry in the workspace's own nav. */
const settings = (name) => async (page) => {
  await page.locator(".wb-nav-footer").getByRole("button", { name: "设置", exact: true }).click();
  await page.locator(".wb-settings-nav").getByRole("button", { name, exact: true }).click();
};
const layout = (mode) => async (page) => {
  await page.evaluate((mode) => workbench.host.preference({ layout: mode }), mode);
};

const dark = async (page) => {
  await page.evaluate(() => workbench.host.preference({ theme: "dark" }));
};

const hover = (selector) => async (page) => {
  await page.locator(selector).last().hover();
};
const fill = (selector, value) => async (page) => {
  await page.locator(selector).fill(value);
};

/** A captured request shaped like the trace collector's records, so the Trace panel has something to show. */
const traceRecord = async (page) => {
  await page.evaluate(() => {
    workbench.records.push({
      id: "visual-trace", atMs: 0, timestamp: Date.now() - 42_000, path: "/api/backends/chat-completions/generate",
      capturePoint: "browser-to-sillytavern", status: 200, elapsedMs: 3240, generation: { id: "g", type: "normal" },
      body: { model: "claude-opus", temperature: 0.9, max_tokens: 1200, stream: true, messages: [
        { role: "system", content: "你是一位克制的叙事者，用第三人称写作。" },
        { role: "system", content: "[雾港志 / 灯塔] 雾港北岬的灯塔已经熄灭七年，守塔人下落不明。" },
        { role: "user", content: "我把书拉过来，翻到夹信的那一页。" },
      ] },
      assemblyEvent: "CHAT_COMPLETION_SETTINGS_READY", assembled: null,
      worldInfo: [
        { world: "雾港志", comment: "灯塔", uid: 1, key: ["灯塔"], content: "雾港北岬的灯塔已经熄灭七年，守塔人下落不明。", position: 0 },
        { world: "雾港志", comment: "雾港 · 码头区", uid: 3, constant: true, key: [], content: "码头区终年有雾。", position: 4, depth: 2 },
      ],
      worldInfoEvidence: "WORLD_INFO_ACTIVATED",
      composition: { counts: { main: 1840, charDescription: 1312, worldInfoBefore: 2286, chatHistory: 32610, nsfw: 364 }, limit: 65536 },
    });
  });
};

// Each state starts from a fresh load; steps run in order.
export const states = [
  { name: "novel-home", viewport: desktop, steps: [] },
  { name: "novel-home-1366", viewport: compact, steps: [] },
  { name: "novel-hover", viewport: desktop, steps: [hover('#chat .mes[is_user="false"]:not(.last_mes)')] },
  { name: "novel-draft", viewport: desktop, steps: [fill("#send_textarea", "她把信封翻过来，背面写着一行小字。")] },
  { name: "novel-left-collapsed", viewport: desktop, steps: [label("收纳左边栏")] },
  { name: "panel-character", viewport: desktop, steps: [label("角色与资源侧栏")] },
  { name: "panel-world", viewport: desktop, steps: [key("Alt+Shift+Digit3")] },
  { name: "panel-world-entry", viewport: desktop, steps: [key("Alt+Shift+Digit3"), label("编辑条目 灯塔")] },
  { name: "panel-preset", viewport: desktop, steps: [key("Alt+Shift+Digit2")] },
  { name: "panel-connection", viewport: desktop, steps: [key("Alt+Shift+Digit1")] },
  { name: "panel-persona", viewport: desktop, steps: [key("Alt+Shift+Digit4")] },
  { name: "panel-trace", viewport: desktop, steps: [key("Alt+Shift+KeyT")] },
  { name: "panel-trace-record", viewport: desktop, steps: [traceRecord, key("Alt+Shift+KeyT")] },
  { name: "panel-export", viewport: desktop, steps: [key("Alt+Shift+KeyT"), click('.wb-panel-tabs [aria-label="记录导出"]')] },
  { name: "panel-image", viewport: desktop, steps: [key("Alt+Shift+KeyT"), click('.wb-panel-tabs [aria-label="生图"]')] },
  { name: "panel-outline", viewport: desktop, steps: [key("Alt+Shift+KeyT"), click('.wb-panel-tabs [aria-label="大纲"]')] },
  { name: "chooser-world", viewport: desktop, steps: [click('[aria-controls="wb-choices-world"]')] },
  {
    name: "chooser-connection",
    viewport: desktop,
    steps: [click('[aria-controls="wb-choices-connection"]')],
  },
  { name: "reading-settings", viewport: desktop, steps: [label("阅读设置")] },
  { name: "focus", viewport: desktop, steps: [key("Alt+Shift+KeyF")] },
  { name: "popover-chat-files", viewport: desktop, steps: [label("管理聊天文件")] },
  { name: "settings-user", viewport: desktop, steps: [settings("用户设置")] },
  { name: "settings-preset", viewport: desktop, steps: [settings("预设")] },
  { name: "settings-world", viewport: desktop, steps: [settings("世界书")] },
  { name: "settings-character", viewport: desktop, steps: [settings("角色管理")] },
  { name: "shortcuts", viewport: desktop, steps: [text("快捷键")] },
  { name: "rp-stage", viewport: desktop, steps: [layout("rp")] },
  { name: "rp-compose", viewport: desktop, steps: [layout("rp"), label("输入回应")] },
  { name: "rp-history", viewport: desktop, steps: [layout("rp"), label("查看对话记录")] },
  { name: "rp-panel-world", viewport: desktop, steps: [layout("rp"), key("Alt+Shift+Digit3")] },
  { name: "rp-stage-dark", viewport: desktop, steps: [layout("rp"), dark] },
  { name: "rp-history-dark", viewport: desktop, steps: [layout("rp"), dark, label("查看对话记录")] },
  { name: "m-novel-home", viewport: phone, mobile: true, steps: [] },
  { name: "m-novel-left", viewport: phone, mobile: true, steps: [label("打开大纲与导航")] },
  { name: "m-novel-right", viewport: phone, mobile: true, steps: [label("打开角色与 Trace")] },
  { name: "m-novel-menu", viewport: phone, mobile: true, steps: [label("打开会话管理")] },
  { name: "m-novel-editor", viewport: phone, mobile: true, steps: [label("全屏编辑草稿")] },
  { name: "m-rp-home", viewport: phone, mobile: true, steps: [layout("rp")] },
];

/** Opens a fresh session, drives it into `state`, then hands the page to `inspect`. */
export async function visit(browser, state, inspect) {
  const { context, page, errors } = await session(browser, { helper: false, mobile: !!state.mobile });
  try {
    await page.setViewportSize(state.viewport);
    await ready(page, urls.visual, { probe: true });
    await page.waitForFunction(() => workbench.mounted && SillyTavern.getContext().chat.length > 0);
    // A neutral pointer position outside hover zones and edge reveals.
    await page.mouse.move(state.viewport.width / 2, 8);
    await page.waitForTimeout(900);
    for (const step of state.steps) {
      await step(page);
      await page.waitForTimeout(500);
    }
    await page.mouse.move(state.viewport.width / 2, 8);
    await page.waitForTimeout(600);
    // Pin the reading scroll position; native auto-scroll timing otherwise varies by a few pixels.
    await page.evaluate(() => {
      const chat = document.getElementById("chat");
      chat?.scrollTo({ top: chat.scrollHeight, behavior: "instant" });
    });
    await page.waitForTimeout(400);
    return { result: await inspect(page), errors };
  } finally {
    await context.close();
  }
}
