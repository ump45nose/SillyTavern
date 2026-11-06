import assert from 'node:assert/strict';
import { ready, urls } from './browser.mjs';
import { runCheck } from './lib/check.mjs';

// A page opened before an extension update asks for chunks the update deleted. The workbench must
// stay mounted and offer a reload, not fall back to the native UI.
await runCheck('stale-chunk',async({session,pass,dir})=>{
 const {page}=await session();await page.setViewportSize({width:1496,height:817});
 await page.route('**/api/settings/get',async r=>{const response=await r.fetch(),data=await response.json(),s=JSON.parse(data.settings);s.extension_settings.workbench??={};Object.assign(s.extension_settings.workbench,{layout:'novel',left:true});data.settings=JSON.stringify(s);await r.fulfill({response,json:data});});
 // Simulate the update: the lazily loaded page chunks (capitalised names) are gone from the server.
 const missing=[];
 await page.route(/workbench-probe\/dist\/[A-Z][^/]*\.js$/,route=>{missing.push(route.request().url().split('/').pop());return route.fulfill({status:404,body:''});});
 await ready(page,urls.validation,{probe:true});
 await page.locator('.wb-nav-footer').getByRole('button',{name:'设置',exact:true}).click();
 const alert=page.getByRole('alert').filter({hasText:'工作台已更新'});await alert.waitFor();
 assert.equal(await page.evaluate(()=>document.body.classList.contains('wb-active')),true,'the workbench stays mounted');
 assert(missing.some(name=>name.startsWith('SettingsWorkspace-')),JSON.stringify(missing));
 assert(await alert.getByRole('button',{name:'刷新'}).isVisible());
 pass('a missing settings chunk shows a reload prompt and keeps the workbench mounted',{missing});await page.screenshot({path:dir+'/prompt.png'});
 await page.unroute(/workbench-probe\/dist\//);
 await Promise.all([page.waitForEvent('load'),alert.getByRole('button',{name:'刷新'}).click()]);
 await ready(page,urls.validation,{probe:true});
 assert.equal(await page.evaluate(()=>document.body.classList.contains('wb-active')),true);
 pass('reload restores the workbench');
});
