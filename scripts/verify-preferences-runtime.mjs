import assert from 'node:assert/strict';
import {ready,urls,createCharacter,openResource,openSettings,settle,settingsWorkspace} from './browser.mjs';
import {runCheck} from './lib/check.mjs';
await runCheck('preferences',async({session,pass,dir,cleanup})=>{
 const {page,errors}=await session();await page.setViewportSize({width:1496,height:817});await ready(page,urls.validation,{probe:true});await createCharacter(page);
 const original=await page.evaluate(()=>{const p=workbench.host.prefs();return Object.fromEntries(['readingInset','shortcuts','shortcutsEnabled','left','messageMeta'].map(k=>[k,p[k]]));});
 cleanup(()=>page.evaluate(async p=>{document.querySelector('dialog.wb-dialog[open] .wb-icon')?.click();document.querySelector('.wb-focus-toggle[aria-pressed=true]')?.click();document.querySelector('.wb-right.is-open .wb-right-head .wb-icon')?.click();window.__preferencesFrame?.remove();workbench.host.preference(p);await workbench.host.persistSettings();},original));
 const preferences=async patch=>{await page.evaluate(p=>workbench.host.preference(p),patch);await settle(page,330);};
 await preferences({readingInset:64,shortcuts:{},shortcutsEnabled:true,left:true,messageMeta:'always'});
 assert.deepEqual(await page.evaluate(()=>({setting:SillyTavern.getContext().powerUserSettings.reduced_motion,body:document.body.classList.contains('reduced-motion')})),{setting:false,body:false});
 const padding=()=>page.locator('#chat').evaluate(n=>{const s=getComputedStyle(n);return {left:parseFloat(s.paddingLeft),right:parseFloat(s.paddingRight),width:n.clientWidth,scroll:n.scrollWidth};});
 assert.equal((await padding()).left,64);assert.equal((await padding()).right,64);
 await page.getByRole('button',{name:'阅读设置',exact:true}).click();
 const slider=page.getByRole('slider',{name:'正文左右留白',exact:true});await slider.waitFor();
 for(const value of [24,96,128]){
  await slider.fill(String(value));await settle(page,330);const p=await padding();assert.equal(p.left,value);assert.equal(p.right,value);assert(p.scroll<=p.width+1);assert.equal(await page.evaluate(()=>workbench.host.prefs().readingInset),value);
 }
 await page.screenshot({path:dir+'/reading-settings-1496.png'});
 await slider.fill('96');await page.keyboard.press('Escape');await settle(page,330);
 await page.evaluate(()=>workbench.host.persistSettings());await page.reload();await page.waitForFunction(()=>document.body.classList.contains('wb-active'));await settle(page,330);
 assert.equal((await padding()).left,96);await createCharacter(page);await settle(page,330);pass('T slider updates both paragraph gutters immediately and persists after reload',await padding());
 // A fresh original message and iframe survive changing the reader layout.
 await page.locator('#chat .mes_text').first().evaluate(n=>{window.__preferencesText=n;const f=document.createElement('iframe');f.srcdoc='<p>Original content</p>';f.height='70';n.append(f);window.__preferencesFrame=f;window.__preferencesWindow=f.contentWindow;});
 await preferences({readingInset:128});
 for(const [width,height] of [[1366,768],[1440,900],[1496,817],[1920,1080]]){
  await page.setViewportSize({width,height});await openResource(page,'预设详情');await settle(page,330);
  const p=await padding();assert(p.left>=20&&p.left<=128);assert.equal(p.left,p.right);assert(p.width-p.left-p.right>=318);assert(p.scroll<=p.width+1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  assert(await page.evaluate(()=>document.querySelector('#chat .mes_text')===__preferencesText&&__preferencesText.contains(__preferencesFrame)&&__preferencesFrame.contentWindow===__preferencesWindow));
  await page.getByRole('button',{name:'关闭右栏',exact:true}).click();await settle(page,330);
 }
 await page.evaluate(()=>__preferencesFrame.remove());await page.setViewportSize({width:1496,height:817});await preferences({readingInset:64});pass('four real desktop sizes preserve usable text width, native message and iframe ownership');
 // The two persona surfaces, resource rows, native solid circles and other selected states share one boundary.
 await page.locator('.wb-pill[aria-controls="wb-choices-persona"]').click();await settle(page,330);
 const style=n=>{const s=getComputedStyle(n);return {border:s.borderTopColor,width:s.borderTopWidth,fill:s.backgroundColor,shadow:s.boxShadow,radius:s.borderTopLeftRadius};};
 const quick=await page.locator('#wb-choices-persona li.is-on').evaluate(style);assert.equal(quick.fill,'rgb(240, 230, 218)');assert.equal(quick.shadow,'none');
 const circle=await page.locator('#wb-choices-persona li.is-on .wb-pill-mark').evaluate(n=>({after:getComputedStyle(n,'::after').content,fill:getComputedStyle(n).backgroundColor,radius:getComputedStyle(n).borderRadius}));assert.equal(circle.after,'none');assert.equal(circle.fill,'rgb(183, 100, 73)');assert.equal(circle.radius,'50%');
 await page.screenshot({path:dir+'/selection-header-persona-1496.png'});await page.keyboard.press('Escape');await settle(page,330);
 await openResource(page,'用户设定详情');await settle(page,330);
 const rail=await page.locator('#wb-resource-rail .wb-rail-row.is-viewing').evaluate(style);assert.equal(rail.fill,'rgb(255, 254, 250)');assert.notEqual(rail.shadow,'none');await page.screenshot({path:dir+'/selection-sidebar-persona-1496.png'});await page.getByRole('button',{name:'关闭右栏',exact:true}).click();await settle(page,330);
 pass('header and sidebar selections share a fine warm outline, paper fill and original solid circle',{quick,rail,circle});
 const help=()=>page.getByRole('dialog',{name:'快捷键',exact:true});
 const openHelp=async()=>{await page.locator('.wb-nav-footer').getByRole('button',{name:'快捷键',exact:true}).click();await help().waitFor();await settle(page,330);};
 let closeAnimation;
 const closeHelp=async()=>{await help().getByRole('button',{name:'返回工作台',exact:true}).click();if(!closeAnimation){await page.waitForTimeout(40);closeAnimation=await page.locator('.wb-dialog[data-wb-exiting=true]').evaluate(n=>({animations:n.getAnimations().length,opacity:parseFloat(getComputedStyle(n).opacity),inert:n.inert}));assert(closeAnimation.animations>0&&closeAnimation.opacity>0&&closeAnimation.opacity<1&&closeAnimation.inert);}await help().waitFor({state:'detached'});await settle(page,330);};
 const recorder=label=>help().getByRole('button',{name:'修改快捷键 '+label,exact:true});
 await openHelp();/* Nine core operations, five from the bundled outline and image add-ons, and the database panel. */assert.equal(await help().locator('.wb-shortcut-row').count(),15);
 const r=await help().boundingBox();assert(r.x>=0&&r.y>=0&&r.x+r.width<=1496&&r.y+r.height<=817);
 await recorder('进入／退出专注').click();await page.keyboard.press('Alt+Shift+3');await help().getByRole('alert').waitFor();assert((await help().getByRole('alert').innerText()).includes('打开世界书'));assert.equal(await page.evaluate(()=>workbench.host.prefs().shortcuts?.['toggle.focus']),undefined);
 await page.keyboard.press('Shift+A');assert((await help().getByRole('alert').innerText()).includes('修饰键'));
 await page.keyboard.press('Control+l');assert((await help().getByRole('alert').innerText()).includes('浏览器'));
 await page.keyboard.press('Escape');assert.equal(await recorder('进入／退出专注').getAttribute('aria-pressed'),'false');assert(await help().isVisible());
 await recorder('进入／退出专注').click();await page.keyboard.press('Control+Alt+g');await settle(page,330);assert.equal(await page.evaluate(()=>workbench.host.prefs().shortcuts['toggle.focus']),'Ctrl+Alt+KeyG');assert.equal(await page.locator('.wb-focus-toggle').getAttribute('aria-pressed'),'false');await page.screenshot({path:dir+'/custom-shortcuts-1496.png'});await closeHelp();
 assert((await page.locator('.wb-focus-toggle').getAttribute('title')).includes('Ctrl+Alt+G'));
 await page.keyboard.press('Alt+Shift+f');assert.equal(await page.locator('.wb-focus-toggle').getAttribute('aria-pressed'),'false');await page.keyboard.press('Control+Alt+g');await settle(page,330);assert.equal(await page.locator('.wb-focus-toggle').getAttribute('aria-pressed'),'true');await page.keyboard.press('Control+Alt+g');await settle(page,330);
 await page.evaluate(()=>workbench.host.persistSettings());await page.reload();await page.waitForFunction(()=>document.body.classList.contains('wb-active'));await settle(page,330);await page.keyboard.press('Control+Alt+g');await settle(page,330);assert.equal(await page.locator('.wb-focus-toggle').getAttribute('aria-pressed'),'true');await page.keyboard.press('Control+Alt+g');await settle(page,330);
 pass('custom recording, conflicts, browser/input protection, Escape cancellation, replaced default, persistence and dispatch');
 await openHelp();await help().getByRole('button',{name:'清除快捷键 进入／退出专注',exact:true}).click();assert.equal(await recorder('进入／退出专注').innerText(),'未设置');await closeHelp();await page.keyboard.press('Control+Alt+g');assert.equal(await page.locator('.wb-focus-toggle').getAttribute('aria-pressed'),'false');
 await openHelp();await help().getByRole('button',{name:'恢复默认',exact:true}).click();await help().getByRole('checkbox',{name:'启用工作台快捷键',exact:true}).uncheck();await closeHelp();await page.keyboard.press('Alt+Shift+f');assert.equal(await page.locator('.wb-focus-toggle').getAttribute('aria-pressed'),'false');
 await openHelp();await help().getByRole('checkbox',{name:'启用工作台快捷键',exact:true}).check();await closeHelp();await page.keyboard.press('Alt+Shift+f');await settle(page,330);assert.equal(await page.locator('.wb-focus-toggle').getAttribute('aria-pressed'),'true');await page.keyboard.press('Escape');await settle(page,330);
 await page.locator('#send_textarea').evaluate(n=>{window.__preferencesInput=n.value;n.focus();n.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',key:'F',altKey:true,shiftKey:true,repeat:true,bubbles:true}));n.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyF',key:'F',altKey:true,shiftKey:true,isComposing:true,bubbles:true}));});assert.equal(await page.locator('.wb-focus-toggle').getAttribute('aria-pressed'),'false');
 await page.keyboard.type('普通输入 WB');assert((await page.locator('#send_textarea').inputValue()).endsWith('普通输入 WB'));await page.locator('#send_textarea').evaluate(n=>{n.value=__preferencesInput;n.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.keyboard.press('Alt+Shift+3');await settle(page,330);assert(await page.locator('.wb-right .wb-world-panel').isVisible());await page.getByRole('button',{name:'关闭右栏',exact:true}).click();await settle(page,330);
 pass('clear, disable and restore defaults; repeated/IME keys and normal composer typing stay intact; resource shortcut works');
 await openHelp();await page.setViewportSize({width:1366,height:768});await settle(page,330);const small=await help().boundingBox();assert(small.y>=0&&small.y+small.height<=768);assert(await help().locator('.wb-shortcut-row').last().isVisible());await page.screenshot({path:dir+'/shortcuts-1366.png'});await closeHelp();await page.setViewportSize({width:1496,height:817});pass('shortcut editor remains bounded at the smaller desktop size and animates on return',closeAnimation);
 await openSettings(page,'用户设置');const ws=settingsWorkspace(page);await ws.waitFor();await settle(page,330);
 const reading=ws.getByRole('slider',{name:'正文左右留白',exact:true});await reading.scrollIntoViewIfNeeded();await reading.fill('80');await settle(page,330);assert.equal((await padding()).left,80);assert.equal(await page.evaluate(()=>workbench.host.prefs().readingInset),80);await reading.fill('64');await settle(page,330);await page.screenshot({path:dir+'/reading-form-1496.png'});await ws.getByRole('button',{name:'返回工作台',exact:true}).click();await ws.waitFor({state:'detached'});pass('independent reading settings and the T popover share the same saved inset');
 assert.deepEqual(errors,[]);
});
