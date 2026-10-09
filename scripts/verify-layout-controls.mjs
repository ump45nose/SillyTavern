import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { launch, session, ready, urls, artifacts } from "./browser.mjs";

// Real validation UI, with settings persisted only inside this browser's response replay.
// The user's saved RP demo, preferences, persona and chats are not changed by verification.
const directory = artifacts + "/layout-controls"; fs.mkdirSync(directory, { recursive:true });
const browser = await launch(), checks = [];
const pass = name => { checks.push(name); console.log("PASS", name); };
try {
  const { page, errors } = await session(browser);
  let settings;
  await page.route("**/api/settings/save", async route => {
    let body = route.request().postDataBuffer();
    if (route.request().headers()["content-encoding"] === "gzip") body = gunzipSync(body);
    settings = JSON.parse(body.toString());
    await route.fulfill({ json:{} });
  });
  await page.route("**/api/settings/get", async route => {
    const response = await route.fetch(), data = await response.json();
    if (settings) data.settings = JSON.stringify(settings);
    await route.fulfill({ response, json:data });
  });
  await page.route("**/api/chats/save", route => route.fulfill({ json:{ result:"ok" } }));
  await page.setViewportSize({ width:1496, height:817 });
  await ready(page, urls.validation, { probe:true }); await page.waitForTimeout(1200);
  const role = name => page.getByRole("button", { name, exact:true });
  const option = name => page.getByRole("menuitemradio", { name, exact:false });
  const settle = () => page.waitForTimeout(450);
  const collapsed = () => page.evaluate(() => document.body.classList.contains("wb-rp-top-collapsed"));
  const choose = async name => { await role("切换工作台").click(); await option(name).click(); await page.waitForFunction(() => document.querySelector('.wb-layout-trigger[aria-expanded="false"]:not(:disabled)')); await settle(); };
  await page.evaluate(() => { workbench.host.preference({ layout:"rp", rpTopAuto:false }); window.__layoutNative = { chat:document.getElementById("chat"), input:document.getElementById("send_textarea"), form:document.getElementById("send_form") }; }); await settle();
  assert.equal(await role("固定顶栏").getAttribute("aria-pressed"), "true");
  assert.equal(await role("固定顶栏").locator(".lucide-pin").count(), 1);
  await role("固定顶栏").click(); await page.mouse.move(750, 400); await settle();
  assert.equal(await collapsed(), true); assert.equal(await page.locator(".wb-top-pin").getAttribute("aria-pressed"), "false");
  const strip = await role("显示顶栏").evaluate(node => ({ height:node.getBoundingClientRect().height, background:getComputedStyle(node).backgroundColor }));
  assert.equal(strip.height, 14); assert.equal(strip.background, "rgba(0, 0, 0, 0)");
  pass("pin selection means fixed; unpin hides the header without an opaque reveal strip");

  await page.mouse.move(740, 4); await page.waitForTimeout(70);
  const moving = await page.locator(".wb-top").evaluate(node => ({ opacity:Number(getComputedStyle(node).opacity), y:node.getBoundingClientRect().y }));
  assert.ok(moving.opacity > 0 && moving.opacity < 1, JSON.stringify(moving)); await settle();
  await page.mouse.move(740, 35); await settle(); assert.equal(await collapsed(), false);
  await page.mouse.move(740, 400); await settle(); assert.equal(await collapsed(), true);
  await role("显示顶栏").focus(); await role("显示顶栏").press("Enter"); await settle();
  assert.equal(await collapsed(), false);
  assert.equal(await page.locator(".wb-top").evaluate(node => node.contains(document.activeElement)), true);
  await role("固定顶栏").click(); await page.mouse.move(750, 400); await settle();
  assert.equal(await collapsed(), false); assert.equal(await role("固定顶栏").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".wb-top").evaluate(node => node.getBoundingClientRect().y), 0);
  assert.equal(await role("显示顶栏").count(), 0);
  pass("hover crosses into the full header, keyboard reveals it, and pinning keeps it at the top");

  await role("固定顶栏").click(); await page.mouse.move(740, 400); await settle();
  await page.mouse.move(740, 4); await settle();
  await page.locator(".wb-selector-value").first().click(); await page.mouse.move(750, 400); await settle();
  assert.equal(await collapsed(), false); await role("关闭选择框").click(); await settle();
  await role("切换工作台").click(); await page.mouse.move(750, 400); await settle();
  assert.equal(await collapsed(), false); assert.equal(await option("RP").getAttribute("aria-checked"), "true");
  assert.equal(await page.locator(".wb-layout-menu svg").count(), 3);
  await page.screenshot({ path:directory + "/rp-menu.png" });
  await option("RP").press("ArrowDown"); assert.match(await page.evaluate(() => document.activeElement.textContent), /原生/);
  await page.keyboard.press("Escape"); await settle();
  assert.equal(await role("切换工作台").getAttribute("aria-expanded"), "false");
  pass("resource and mode menus keep the floating header visible; mode options have icons and keyboard navigation");

  await page.evaluate(() => { window.__denyLayout = event => event.preventDefault(); window.addEventListener("wb-before-close", __denyLayout); });
  await role("切换工作台").click(); await option("Noval").click(); await settle();
  assert.equal(await page.evaluate(() => workbench.host.prefs().layout), "rp");
  await page.evaluate(() => window.removeEventListener("wb-before-close", __denyLayout)); await page.keyboard.press("Escape"); await settle();
  pass("an editor's unsaved-change guard can cancel a layout switch");

  await role("输入回应").click(); await page.locator("#send_textarea").fill("WB_LAYOUT_DRAFT **Markdown**\n{{char}}");
  await choose("Noval");
  assert.equal(await page.locator(".wb-reading-bar").count(), 1);
  assert.equal(await page.locator("#send_textarea").inputValue(), "WB_LAYOUT_DRAFT **Markdown**\n{{char}}");
  await ready(page, urls.validation, { probe:true }); await settle();
  assert.equal(await page.evaluate(() => workbench.host.prefs().layout), "novel");
  await page.screenshot({ path:directory + "/noval.png" });
  // Reload intentionally establishes a fresh set of native references.
  await page.evaluate(() => { window.__layoutNative = { chat:document.getElementById("chat"), input:document.getElementById("send_textarea"), form:document.getElementById("send_form") }; });
  await page.locator("#send_textarea").fill("WB_LAYOUT_NATIVE_DRAFT"); await choose("RP"); await choose("原生");
  assert.equal(await page.evaluate(() => workbench.mounted), false);
  assert.equal(await role("切换工作台").count(), 1);
  assert.equal(await page.locator("#send_textarea").inputValue(), "WB_LAYOUT_NATIVE_DRAFT");
  assert.equal(await page.evaluate(() => __layoutNative.chat === document.getElementById("chat") && __layoutNative.input === document.getElementById("send_textarea") && __layoutNative.form === document.getElementById("send_form") && !document.querySelector(".wb-rp-stage,.wb-rp-part")), true);
  await ready(page, urls.validation); await settle();
  assert.equal(await page.evaluate(() => workbench.mounted), false); await page.screenshot({ path:directory + "/native.png" });
  await choose("RP"); assert.equal(await page.locator(".wb-rp-stage").count(), 1);
  assert.equal(await page.locator(".wb-left.is-open,.wb-right.is-open").count(), 0);
  pass("Noval/RP/native switch through one persistent entry; drafts and native nodes survive and choices reload correctly");

  await page.evaluate(() => workbench.host.preference({ rpTopAuto:false })); await settle();
  for (const layout of ["rp", "novel"]) {
    if (layout === "novel") await choose("Noval");
    for (const [width, height] of [[1024,768],[1100,800],[1366,768],[1496,817],[1920,1080],[2992,1634]]) {
      await page.setViewportSize({ width, height }); await settle();
      const rects = await page.evaluate(() => {
        const rect = selector => { const { left,right,top,bottom } = document.querySelector(selector).getBoundingClientRect(); return { left,right,top,bottom }; };
        return { width:innerWidth, contexts:rect(".wb-contexts"), actions:rect(".wb-top-right"), pin:rect(".wb-top-right button:last-of-type"), trigger:rect(".wb-layout-trigger"), eye:document.querySelector(".wb-rp-visibility") ? rect(".wb-rp-visibility") : null, overflow:document.documentElement.scrollWidth > innerWidth };
      });
      assert.equal(rects.overflow, false); assert.ok(rects.contexts.right <= rects.actions.left + 1, JSON.stringify(rects));
      assert.ok(rects.pin.right < rects.trigger.left, JSON.stringify(rects)); assert.ok(rects.trigger.right <= width, JSON.stringify(rects));
      if (rects.eye) assert.ok(rects.trigger.right < rects.eye.left, JSON.stringify(rects));
    }
  }
  pass("six desktop widths in both layouts keep resource selectors, pin, mode entry and eye separate");
  await page.setViewportSize({width:1496,height:817}); await choose("RP");
  await role("RP 外观").click();
  const checkbox = page.getByRole("checkbox", {name:"鼠标悬浮显示顶栏",exact:true});
  await checkbox.check(); await page.keyboard.press("Escape"); await page.mouse.move(750,400); await settle();
  assert.equal(await collapsed(), true);
  await page.mouse.move(740,4); await settle(); assert.equal(await role("固定顶栏").getAttribute("aria-pressed"), "false");
  await role("固定顶栏").click(); await page.mouse.move(750,400); await settle();
  await role("隐藏界面").click(); await settle(); assert.equal(await role("切换工作台").isVisible(), true);
  await role("显示界面").click(); await settle();
  pass("appearance checkbox agrees with pin state and the mode entry remains usable when chrome is hidden");
  assert.deepEqual(errors, []);
  fs.writeFileSync(directory + "/verification.json", JSON.stringify({ url:urls.validation, checks, errors }, null, 2));
} finally { await browser.close(); }
