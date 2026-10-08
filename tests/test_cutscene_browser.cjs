// Optional focused browser regression: same Playwright/Chromium environment as test_browser.cjs.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'brawl-cutscene-'));
const py=process.env.PYTHON||'python3';
const fixtures=JSON.parse(execFileSync(py,['-c',"import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture,cut_tie_state;from engine import new_state;s=fixture();r1=fixture();r1['round2']=new_state()['round2'];r1['final']=new_state()['final'];r2=fixture();r2['final']=new_state()['final'];print(json.dumps({'round1':r1,'round2':r2,'final':s,'tie':cut_tie_state('round1')}))"],{cwd:root,encoding:'utf8'}));
const server=spawn(py,['app.py','--port','0','--no-browser','--data',path.join(tmp,'state.json')],{cwd:root});
const ready=new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('Server did not start')),15000);
 server.stdout.on('data',b=>{const m=b.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});
 server.on('error',reject);
});
let browser,page;
(async()=>{
 const url=await ready;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'[]')});
 page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'no-preference'});
 page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);
 const restore=async state=>{
  await page.evaluate(async state=>{const p=await(await fetch('/api/state')).json();const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':p.token},body:JSON.stringify({state,revision:p.revision,restore:true})});if(!r.ok)throw Error(await r.text());},state);
  await page.reload();await page.waitForFunction(()=>!!view);
 };
 const saved=()=>page.waitForFunction(()=>!dirty&&!saving&&!saveFailed);
 for(const [key,last,label] of [['round1',4,'Like Never Before'],['round2',4,'What Do You Want?'],['final',7,'You Wanted to Win, Right?']]){
  await restore(fixtures[key]);
  await page.evaluate(()=>{window.audioEvents=[];for(const name of ['portal','scream','cut','explosion','finalOmen','finalPurge','victory']){const original=BrawlAudio[name];BrawlAudio[name]=(...args)=>{window.audioEvents.push(name);return original(...args);};}});
  await page.evaluate(()=>{window.towerCalls=[];const world=window.CityWorld||{};const original=world.eliminateTower?.bind(world);world.eliminateTower=id=>{window.towerCalls.push(id);original?.(id);};window.CityWorld=world;});
  await page.evaluate(key=>openScreen(key),key);
  await page.evaluate(([key,last])=>{void openMatchResult(key,last);},[key,last]);
  if(key!=='final')await page.locator('#cutscene[open]').waitFor();
  if(key!=='final')assert(await page.locator('#cutscene').evaluate(e=>e.matches(':modal')),'cutscene must enter native top layer');
  assert((await page.locator('#cutscene-label').textContent()).includes(label),key+': '+await page.locator('#cutscene-label').textContent());
  if(key!=='final')assert(await page.locator('#cutscene-skip').evaluate(e=>{const r=e.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===e;}),'scoring dialog covered the cutscene');
  const expected=await page.evaluate(key=>eliminatedNames(key),key);
  assert.equal(expected.length,key==='final'?3:2);
  if(key!=='final')await page.waitForFunction(name=>document.querySelector('#cutscene').classList.contains('portal-grab')&&document.querySelector('#cutscene-caption').textContent.includes(name),expected[0]);
  else await page.waitForFunction(()=>!!CityWorld.getStatus().strike);
  if(key!=='final'){assert.equal(await page.locator('.portal-walker').count(),1);assert.equal(await page.locator('.portal-hand').count(),3);if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,key+'-portal.png')});}}
  assert.equal(await page.locator('#cutscene .cut-figure').count(),0);
  if(key!=='final')assert.equal(await page.evaluate(()=>view.final.complete),false,'early-round cutscene waited for tournament end');
  if(key==='round2'){await page.waitForFunction(()=>document.querySelector('#cutscene').classList.contains('portal-drag'));if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'portal-pull.png')});}
  await page.evaluate(([key,last])=>openMatchResult(key,last),[key,last]); // duplicate cannot replace active promise
  if(key==='round1')await page.keyboard.press('Escape');
  else if(key==='round2'){await page.waitForFunction(()=>CityWorld.getStatus().strike?.phase==='inbound',null,{timeout:14000});assert.equal(await page.locator('#screen-dialog').evaluate(e=>e.open),false);assert.equal(await page.evaluate(()=>CityWorld.getStatus().inside),false);await page.waitForFunction(()=>CityWorld.getStatus().strike?.phase==='impact');if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'city-cube-impact.png')});await page.keyboard.press('Escape');}
  // You Wanted to Win, Right? also verifies automatic completion, with no skip.
  await page.waitForFunction(()=>!cutsceneActive&&document.querySelector('#result-dialog').open,null,{timeout:18000});
  assert.equal(await page.locator('#screen-dialog').evaluate(e=>e.open),key==='round1','city strike exits the scoring room; portal-only skip keeps it');
  assert.deepEqual(await page.evaluate(()=>window.towerCalls),[],'removed towers must not receive elimination events');
  const sounds=await page.evaluate(()=>window.audioEvents);if(key==='round2'){assert.deepEqual(sounds.filter(s=>s!=='explosion'),['portal','scream','cut','portal','scream','cut']);assert.equal(sounds.filter(s=>s==='explosion').length,1,'cube has one impact sound');}if(key==='final')assert.equal(sounds.filter(s=>s==='explosion').length,1);
 }
 // Resolving a submitted cut tie must reveal the cutscene over the result dialog.
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});
 await restore(fixtures.tie);await page.evaluate(()=>openScreen('round1'));
 await page.evaluate(()=>openMatchResult('round1',4));
 assert.equal(await page.evaluate(()=>cutsceneActive),false);
 await page.locator('#result-content [data-action="extra"]').click();await saved();
 await page.locator('#result-content [data-path="round1.extras.0.p5"]').fill('3');await saved();
 assert.equal(await page.evaluate(()=>cutsceneActive),false,'partial tie must not eliminate anyone');
 await page.locator('#result-content [data-path="round1.extras.0.p9"]').fill('0');
 await page.locator('#cutscene[open]').waitFor();
 assert((await page.locator('#cutscene-label').textContent()).includes('Like Never Before'));
 assert((await page.locator('#cutscene-caption').innerText()).includes('ELIMINATED'));
 await page.locator('#cutscene-skip').click();await saved();
 assert(await page.locator('#result-dialog').evaluate(e=>e.open));
 assert.equal(await page.evaluate(()=>cutsceneActive),false);
 // An unrelated successful save after settlement must not replay the cutscene.
 await page.evaluate(()=>{state.settings.prizes[0]=19;changed();});await saved();
 assert.equal(await page.evaluate(()=>cutsceneActive),false);
 assert.deepEqual(errors,[]);
 console.log('Cutscenes passed: all three rounds independently, native top layer, correct eliminated players, duplicate guard, Esc/Skip/natural completion, mobile reduced motion, and tie settlement without unrelated replay.');
})().catch(async e=>{console.error(e);if(page)console.error(await page.evaluate(()=>({city:CityWorld.getStatus(),active:cutsceneActive,run:cutsceneRunId,stage:bombRoundStage,screen:document.querySelector('#screen-dialog').open,result:document.querySelector('#result-dialog').open,hud:document.querySelector('#round-strike-hud').hidden})));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
