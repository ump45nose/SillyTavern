import assert from 'node:assert/strict';
import fs from 'node:fs';
import {launch,session,ready,urls,artifacts} from './browser.mjs';
const browser=await launch(),dir=artifacts+'/sidebar-image-input';fs.mkdirSync(dir,{recursive:true});
const report={checks:[],passed:false};let page;
try{
 const test=await session(browser);page=test.page;
 await page.route('**/api/settings/save',r=>r.fulfill({json:{}}));
 await page.route('**/api/chats/save',r=>r.fulfill({json:{result:'ok'}}));
 await page.route('**/api/settings/get',async r=>{const response=await r.fetch(),data=await response.json(),s=JSON.parse(data.settings);s.extension_settings.workbench??={};Object.assign(s.extension_settings.workbench,{layout:'novel',left:true,addons:{outline:true,'image-gen':true,'record-export':true}});data.settings=JSON.stringify(s);await r.fulfill({response,json:data});});
 await page.setViewportSize({width:1496,height:817});await ready(page,urls.validation);await page.waitForFunction(()=>window.workbench?.mounted&&workbench.metrics.workbenchReadyMs);
 const button=name=>page.getByRole('button',{name,exact:true}),wait=()=>page.waitForTimeout(350),pass=s=>{report.checks.push(s);console.log('PASS',s);};
 for(const name of ['历史对话','大纲','对话楼层']){
  const toggle=page.locator('.wb-navigation-v4 .wb-fold-toggle').filter({hasText:name});await toggle.click();await wait();
  assert.equal(await page.locator('.wb-nav-chat').evaluate(n=>n.inert),true);assert.equal(await page.locator('#wb-nav-settings').evaluate(n=>n.inert),true);
  await button('展开设置').click();await wait();assert.equal(await page.locator('#wb-nav-settings').evaluate(n=>n.inert),false);
  await toggle.click();await wait();assert.equal(await page.locator('.wb-nav-chat').evaluate(n=>n.inert),false);assert.equal(await page.locator('#wb-nav-settings').evaluate(n=>n.inert),false);
 }
 pass('each navigation fold collects upper chat and lower settings, then restores both');
 await button('大纲').click();await page.getByRole('tree',{name:'当前聊天大纲'}).waitFor();await wait();await page.screenshot({path:dir+'/outline-1496.png'});await button('大纲').click();await wait();
 await page.locator('.wb-edge-left').click();await page.mouse.move(600,350);await wait();
 const reading=await page.locator('#sheld').boundingBox();await page.mouse.move(2,400);await page.waitForFunction(()=>document.body.classList.contains('wb-left-hover-open'));await wait();
 assert.deepEqual(await page.locator('#sheld').boundingBox(),reading);await page.mouse.move(130,430);await wait();assert.equal(await page.locator('.wb-left').getAttribute('aria-hidden'),'false');await page.mouse.move(700,400);await page.waitForFunction(()=>!document.body.classList.contains('wb-left-hover-open'));
 await page.mouse.move(1494,400);await page.waitForFunction(()=>document.body.classList.contains('wb-right-hover-open'));await wait();assert.deepEqual(await page.locator('#sheld').boundingBox(),reading);await page.locator('.wb-edge-right').click();await page.mouse.move(600,400);await wait();assert.equal(await page.locator('.wb-edge-right').getAttribute('aria-expanded'),'true');assert.equal(await page.evaluate(()=>document.body.classList.contains('wb-right-open')),true);await page.locator('.wb-edge-right').click();await page.mouse.move(600,400);await wait();
 pass('edge hover reveals overlays without moving reading layout; moving within keeps open, leaving closes, click pins');
 await page.evaluate(()=>{window.__originalInput=document.getElementById('send_textarea');});await page.locator('#send_textarea').fill('保持聊天草稿');await page.locator('#chat>.mes').first().hover();await button('为第 1 层生图').click();await button('取消手动生图').waitFor();
 await page.waitForFunction(()=>document.querySelector('#send_textarea').placeholder.includes('参考图'));await page.locator('#send_textarea').fill('柔和夕阳下的花园，保持参考人物外貌');
 const png=fs.readFileSync('tests/writing-addons.test.mjs','utf8').match(/const png='([^']+)'/)[1];await page.locator('.wb-image-input-anchor input[type=file]').setInputFiles({name:'portrait.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.locator('.wb-image-input-anchor img').waitFor();await wait();
 const geometry=await page.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();const title=r('.wb-image-input-label'),input=r('#send_textarea'),refs=r('.wb-image-references'),send=r('#send_but'),form=r('#send_form');return{ordered:title.bottom<=input.top&&refs.bottom<=input.top&&input.bottom<=send.top+1,fits:send.bottom<=form.bottom&&input.height>=55,same:__originalInput===document.getElementById('send_textarea'),placeholder:document.getElementById('send_textarea').placeholder};});assert.equal(geometry.ordered,true);assert.equal(geometry.fits,true);assert.equal(geometry.same,true);await page.screenshot({path:dir+'/image-input-reference-1496.png'});
 await button('移除参考图 1').click();assert.equal(await page.locator('.wb-image-input-anchor img').count(),0);
 await page.locator('#send_textarea').evaluate((input,png)=>{const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],'pasted.png',{type:'image/png'}));input.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},png);await page.locator('.wb-image-input-anchor img').waitFor();
 await button('移除参考图 1').click();await page.locator('#send_textarea').evaluate((input,png)=>{const data=new DataTransfer();data.items.add(new File([Uint8Array.from(atob(png),c=>c.charCodeAt(0))],'dropped.png',{type:'image/png'}));input.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));},png);await page.locator('.wb-image-input-anchor img').waitFor();
 let referenceBody;await page.route('**/wb-mock-images/v1/images/edits',async route=>{referenceBody=route.request().postDataBuffer();await route.fulfill({json:{data:[{b64_json:png}]}});});
 await page.route('**/api/images/upload',route=>route.fulfill({json:{path:'/user/images/wb-reference-check.png'}}));await page.route('**/user/images/wb-reference-check.png',route=>route.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')}));
 const resultCount=await page.evaluate(()=>SillyTavern.getContext().chatMetadata.workbench_addons?.['image-gen']?.results?.length||0);
 await page.evaluate(()=>{const prefs=workbench.host.prefs();workbench.host.preference({addonSettings:{...prefs.addonSettings,'image-gen':{...prefs.addonSettings?.['image-gen'],provider:'openai',url:location.origin+'/wb-mock-images/v1',key:''}}});});
 await page.locator('#send_but').click();await page.waitForFunction(n=>(SillyTavern.getContext().chatMetadata.workbench_addons?.['image-gen']?.results?.length||0)===n+1,resultCount);
 assert.ok(referenceBody.includes(Buffer.from(png,'base64')));assert.ok(referenceBody.includes(Buffer.from('name="image[]"')));assert.equal(await page.locator('#send_textarea').inputValue(),'保持聊天草稿');assert.equal(await page.evaluate(png=>JSON.stringify(SillyTavern.getContext().chatMetadata).includes(png),png),false);
 pass('manual image header precedes native prompt; upload/remove/paste/drop feed the actual multipart request and restore chat draft');
 for(const mode of ['novel','rp'])for(const width of [1024,1496,1920]){await page.setViewportSize({width,height:817});await page.evaluate(layout=>workbench.host.preference({layout}),mode);await page.mouse.move(width/2,400);await wait();if(mode==='rp')await button('为当前对白生图').click();else{await page.locator('#chat>.mes').first().hover();await button('为第 1 层生图').click();}await button('取消手动生图').waitFor();await wait();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await page.screenshot({path:dir+`/image-${mode}-${width}.png`});await button('取消手动生图').click();}
 pass('manual image composer fits narrow/main/wide Noval and RP');assert.deepEqual(test.errors,[]);report.passed=true;
}catch(error){report.failure=error.stack;console.error(error);process.exitCode=1;if(page)await page.screenshot({path:dir+'/failure.png'}).catch(()=>{});}finally{fs.writeFileSync(dir+'/verification.json',JSON.stringify(report,null,2));await browser.close();}
