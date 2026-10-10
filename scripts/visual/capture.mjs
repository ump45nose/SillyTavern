// Captures named UI states from the seeded visual instance for pixel comparison.
// Usage: node scripts/visual/capture.mjs <outDir> [stateNameFilter]
// Sessions intercept settings saves (helper:false), so capturing never mutates the seeded data.
import fs from "node:fs";
import path from "node:path";
import { launch, session, ready, urls } from "../browser.mjs";

const out = path.resolve(process.argv[2] || "artifacts/visual/current");
const filter = process.argv[3] ? new RegExp(process.argv[3]) : null;
fs.mkdirSync(out, { recursive: true });

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
const layout = (mode) => async (page) => {
  await page.evaluate((mode) => workbench.host.preference({ layout: mode }), mode);
};

// Each state starts from a fresh load; steps run in order.
const states = [
  { name: "novel-home", viewport: desktop, steps: [] },
  { name: "novel-home-1366", viewport: compact, steps: [] },
  { name: "novel-left-collapsed", viewport: desktop, steps: [label("收纳左边栏")] },
  { name: "panel-character", viewport: desktop, steps: [label("角色与资源侧栏")] },
  { name: "panel-world", viewport: desktop, steps: [key("Alt+Shift+Digit3")] },
  { name: "panel-world-entry", viewport: desktop, steps: [key("Alt+Shift+Digit3"), label("编辑条目 灯塔")] },
  { name: "panel-preset", viewport: desktop, steps: [key("Alt+Shift+Digit2")] },
  { name: "panel-connection", viewport: desktop, steps: [key("Alt+Shift+Digit1")] },
  { name: "panel-persona", viewport: desktop, steps: [key("Alt+Shift+Digit4")] },
  { name: "panel-trace", viewport: desktop, steps: [key("Alt+Shift+KeyT")] },
  { name: "chooser-world", viewport: desktop, steps: [click('[aria-controls="wb-choices-world"]')] },
  { name: "chooser-connection", viewport: desktop, steps: [click('[aria-controls="wb-choices-connection"]')] },
  { name: "reading-settings", viewport: desktop, steps: [label("阅读设置")] },
  { name: "focus", viewport: desktop, steps: [key("Alt+Shift+KeyF")] },
  { name: "popover-chat-files", viewport: desktop, steps: [label("管理聊天文件")] },
  { name: "settings-user", viewport: desktop, steps: [text("用户设置")] },
  { name: "settings-preset", viewport: desktop, steps: [text("生成配置")] },
  { name: "settings-world", viewport: desktop, steps: [text("世界书")] },
  { name: "settings-character", viewport: desktop, steps: [text("角色管理")] },
  { name: "shortcuts", viewport: desktop, steps: [text("快捷键")] },
  { name: "rp-stage", viewport: desktop, steps: [layout("rp")] },
  { name: "rp-compose", viewport: desktop, steps: [layout("rp"), label("输入回应")] },
  { name: "rp-history", viewport: desktop, steps: [layout("rp"), label("查看对话记录")] },
  { name: "rp-panel-world", viewport: desktop, steps: [layout("rp"), key("Alt+Shift+Digit3")] },
  { name: "m-novel-home", viewport: phone, mobile: true, steps: [] },
  { name: "m-novel-left", viewport: phone, mobile: true, steps: [label("打开大纲与导航")] },
  { name: "m-novel-right", viewport: phone, mobile: true, steps: [label("打开角色与 Trace")] },
  { name: "m-novel-menu", viewport: phone, mobile: true, steps: [label("打开会话管理")] },
  { name: "m-novel-editor", viewport: phone, mobile: true, steps: [label("全屏编辑草稿")] },
  { name: "m-rp-home", viewport: phone, mobile: true, steps: [layout("rp")] },
];

const browser = await launch();
const report = [];
try {
  for (const state of states) {
    if (filter && !filter.test(state.name)) continue;
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
      await page.screenshot({ path: path.join(out, state.name + ".png"), animations: "disabled", caret: "hide" });
      report.push({ name: state.name, ok: true, errors });
    } catch (error) {
      report.push({ name: state.name, ok: false, error: String(error.message || error).split("\n")[0] });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(out, "report.json"), JSON.stringify(report, null, 2));
for (const r of report) console.log(r.ok ? "OK  " : "FAIL", r.name, r.ok ? (r.errors.length ? r.errors : "") : r.error);
