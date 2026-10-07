// Optional browser regression. Uses the same environment as test_cutscene_browser.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'brawl-city-'));
const server=spawn(process.env.PYTHON||'python3',['app.py','--port','0','--no-browser','--data',path.join(tmp,'state.json')],{cwd:root});
let browser;
(async()=>{
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timed out')),15000);server.stdout.on('data',b=>{const m=b.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});server.on('error',reject);});
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'[]')});
 const page=await browser.newPage({viewport:{width:1440,height:980},timezoneId:'America/Chicago'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.CityWorld&&CityWorld.getStatus().rooms===5);
 assert.equal(await page.evaluate(()=>CityWorld.getStatus().progress),0);
 // Real animated entry and Escape must leave every room usable.
 for(const key of ['settings','round1','round2','final','overview']){
  await page.locator('#monitors [data-open="'+key+'"]').click();
  await page.locator('#screen-dialog[open]').waitFor();
  assert.equal(await page.evaluate(()=>CityWorld.getStatus().inside),true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!roomTransition&&!CityWorld.getStatus().inside);
 }
 await page.locator('[data-action="edit-start"]').click();
 await page.locator('#starts-at').fill(await page.evaluate(()=>localStartValue(new Date(Date.now()+3600000).toISOString())));
 await page.locator('#countdown-form [type="submit"]').click();
 await page.waitForFunction(()=>state.settings.disaster_started_at&&!dirty&&!saving);
 const origin=await page.evaluate(()=>state.settings.disaster_started_at);
 await page.reload();await page.waitForFunction(()=>!!view);
 assert.equal(await page.evaluate(()=>state.settings.disaster_started_at),origin);
 const restoreProgress=async p=>{
  await page.evaluate(async p=>{const d=await(await fetch('/api/state')).json(),now=Date.now();d.state.settings.start_at=new Date(now+3600000*(1-p)).toISOString();d.state.settings.disaster_started_at=new Date(now-3600000*p).toISOString();const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':d.token},body:JSON.stringify({state:d.state,revision:d.revision,restore:true})});if(!r.ok)throw Error(await r.text());},p);
  await page.reload();await page.waitForFunction(p=>window.CityWorld&&CityWorld.getStatus().rooms===5&&CityWorld.getStatus().buildings>0&&Math.abs(CityWorld.getStatus().progress-p)<.01,p);
 };
 let damage=0;
 for(const p of [.25,.5,.75,1]){await restoreProgress(p);const s=await page.evaluate(()=>CityWorld.getStatus());assert(s.damagedBuildings>damage);damage=s.damagedBuildings;if(p===1)assert.equal(damage,s.buildings);}
 await page.locator('#world-toggle').click();assert.equal(await page.evaluate(()=>CityWorld.getStatus().paused),true);
 await page.locator('#world-toggle').click();assert.equal(await page.evaluate(()=>CityWorld.getStatus().paused),false);
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});
 await page.locator('#monitors [data-open="settings"]').click();await page.locator('#screen-dialog[open]').waitFor();
 await page.locator('[data-action="clear-start"]').click();await page.waitForFunction(()=>!state.settings.start_at&&!dirty&&!saving);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>CityWorld.getStatus().progress===0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 const fallback=await browser.newPage({reducedMotion:'reduce'});
 await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});
 fallback.on('pageerror',e=>errors.push(e.message));
 await fallback.goto(url);await fallback.waitForFunction(()=>window.CityWorld&&CityWorld.getStatus().rooms===5);
 assert.equal(await fallback.evaluate(()=>CityWorld.getStatus().mode),'static');
 await fallback.locator('#monitors [data-open="settings"]').click();await fallback.locator('#screen-dialog[open]').waitFor();await fallback.keyboard.press('Escape');
 assert.deepEqual(errors,[]);
 console.log('City browser passed: five animated room entrances/Escape, countdown form and reload persistence, increasing damage through zero, motion toggle, mobile layout, reduced motion, and no-WebGL fallback.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
