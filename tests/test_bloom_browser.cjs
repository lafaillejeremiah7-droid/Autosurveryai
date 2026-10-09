// Optional real-browser countdown bloom regression. Uses the same environment as test_browser.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'brawl-bloom-'));
const py=process.env.PYTHON||'python3';
const start=Date.now(),iso=ms=>new Date(start+ms).toISOString();
const blank=JSON.parse(execFileSync(py,['-c',"import json;from engine import new_state,round1_lineups;s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(s['names'])};round1_lineups(s);print(json.dumps(s))"],{cwd:root,encoding:'utf8'}));
const server=spawn(py,['app.py','--port','0','--no-browser','--data',path.join(tmp,'state.json')],{cwd:root});
let browser,page;
(async()=>{
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server did not start')),15000);server.stdout.on('data',b=>{const m=b.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});server.on('error',reject);});
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'[]')});
 page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 // Advance wall time without pausing animation frames or changing the server.
 // The controlled time survives reload, just as the real wall clock would.
 await page.addInitScript(start=>{window.__bloomNow=Number(sessionStorage.getItem('bloom-test-time')||start);Date.now=()=>window.__bloomNow;},start);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(url);
 const restore=async state=>{await page.evaluate(async state=>{const d=await(await fetch('/api/state')).json();const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':d.token},body:JSON.stringify({state,revision:d.revision,restore:true})});if(!r.ok)throw Error(await r.text());},state);await page.reload();await page.waitForFunction(()=>!!view);};
 const saved=()=>page.waitForFunction(()=>!dirty&&!saving&&!saveFailed&&!lineupBusy);
 const tick=ms=>page.evaluate(now=>{window.__bloomNow=now;sessionStorage.setItem('bloom-test-time',String(now));},start+ms);
 const bloom=async fraction=>{await page.waitForFunction(f=>Math.abs(CityWorld.getStatus().bloomLevel-f)<1e-9,fraction);await page.waitForFunction(f=>CityWorld.getStatus().gardenFlowers===Math.floor(f*112),fraction);assert.equal(await page.locator('#city-damage').textContent(),Math.floor(fraction*100)+'% BLOOM');};
 const score=async(p,g)=>{await page.locator(`input[data-path="round1.players.${p}.goals.${g}"]`).first().fill('0');await saved();};
 await restore(blank);await bloom(0);
 const scheduled=structuredClone(blank);
 scheduled.settings.disaster_started_at=iso(0);scheduled.settings.start_at=iso(240000);
 await restore(scheduled);await bloom(0);
 await tick(60000);await bloom(.25); // Time alone grows flowers, without scores.
 await page.locator('#monitors [data-open="round1"]').click();
 await page.locator('#screen-dialog[open]').waitFor();
 for(let i=1;i<=10;i++)await score('p'+i,0);
 await bloom(.25); // A completed match cannot change the countdown bloom.
 assert.equal(await page.evaluate(()=>view.round1.games[0].ready),true);
 await page.keyboard.press('Escape');await page.locator('#screen-dialog[open]').waitFor({state:'hidden'});
 await page.locator('#world-toggle').click();
 assert.equal(await page.evaluate(()=>CityWorld.getStatus().paused),true);
 await tick(120000);await bloom(.5); // Both pause and reduced motion leave bloom running.
 await page.reload();await page.waitForFunction(()=>!!view);await bloom(.5);
 await tick(239000);await bloom(239/240);
 assert.equal(await page.locator('#city-damage').textContent(),'99% BLOOM');
 await tick(240000);await bloom(1);
 await page.waitForFunction(()=>['days','hours','minutes','seconds'].every(k=>document.querySelector('#countdown-'+k).textContent==='00'));
 assert.equal(await page.evaluate(()=>view.round1.complete),false,'zero reaches full bloom before any round settles');
 await tick(300000);await bloom(1);
 await page.locator('#monitors [data-open="settings"]').click();
 await page.locator('[data-action="clear-start"]').click();await saved();await bloom(0);
 await page.locator('#undo-action').click();
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Undo applied');await bloom(1);
 const rescheduled=await page.evaluate(()=>JSON.parse(JSON.stringify(state)));
 rescheduled.settings.disaster_started_at=iso(300000);rescheduled.settings.start_at=iso(540000);
 await restore(rescheduled);await bloom(0);
 await tick(360000);await bloom(.25);
 await restore(blank);await bloom(0);
 assert.deepEqual(errors,[],'no browser errors');
 console.log('Bloom browser passed: automatic timed roses, 25/50/99/100%, exact zero, reload, pause/reduced motion, clear/Undo, reschedule and scoring independence.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();fs.rmSync(tmp,{recursive:true,force:true});});
