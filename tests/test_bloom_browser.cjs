// Optional real-browser bloom regression. Uses the same environment as test_browser.cjs.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'brawl-bloom-'));
const py=process.env.PYTHON||'python3';
const blank=JSON.parse(execFileSync(py,['-c',"import json;from engine import new_state,round1_lineups;s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(s['names'])};round1_lineups(s);print(json.dumps(s))"],{cwd:root,encoding:'utf8'}));
const server=spawn(py,['app.py','--port','0','--no-browser','--data',path.join(tmp,'state.json')],{cwd:root});
let browser,page;
(async()=>{
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Server did not start')),15000);server.stdout.on('data',b=>{const m=b.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});server.on('error',reject);});
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'[]')});
 page=await browser.newPage({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(url);
 const restore=async state=>{await page.evaluate(async state=>{const d=await(await fetch('/api/state')).json();const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':d.token},body:JSON.stringify({state,revision:d.revision,restore:true})});if(!r.ok)throw Error(await r.text());},state);await page.reload();await page.waitForFunction(()=>!!view);};
 const saved=()=>page.waitForFunction(()=>!dirty&&!saving&&!saveFailed&&!lineupBusy);
 const bloom=async fraction=>{await page.waitForFunction(f=>Math.abs(CityWorld.getStatus().bloomLevel-f)<1e-9,fraction);await page.waitForFunction(f=>CityWorld.getStatus().gardenFlowers===Math.round(f*112),fraction);assert.equal(await page.locator('#city-damage').textContent(),Math.round(fraction*100)+'% BLOOM');};
 const score=async(p,g)=>{await page.locator(`input[data-path="round1.players.${p}.goals.${g}"]`).first().fill('0');await saved();};
 await restore(blank);await bloom(0);
 await page.locator('#monitors [data-open="round1"]').click();
 await page.locator('#screen-dialog[open]').waitFor();
 await score('p1',0);await bloom(0); // A partially entered match is not completed.
 for(let i=2;i<=10;i++)await score('p'+i,0);
 await bloom(1/15);
 assert.equal(await page.evaluate(()=>view.round1.complete),false,'bloom does not wait for a settled round');
 await page.reload();await page.waitForFunction(()=>!!view);await bloom(1/15);
 await page.locator('#monitors [data-open="round1"]').click();
 await page.locator('[data-r1-game="1"]').click();
 for(let i=1;i<=10;i++)await score('p'+i,1);
 await bloom(2/15); // Pavilion status is still current, so caching must include progress.
 await page.locator('[data-action="clear-r1-game"]').click();await saved();await bloom(1/15);
 await page.locator('#undo-action').click();
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Undo applied');await bloom(2/15);
 const reset=structuredClone(blank);reset.settings.start_at='2020-01-02T00:00:00Z';reset.settings.disaster_started_at='2020-01-01T00:00:00Z';
 await restore(reset);await bloom(0);
 assert.equal(await page.evaluate(()=>CityWorld.getStatus().progress),1,'the opening countdown remains independent');
 assert.deepEqual(errors,[],'no browser errors');
 console.log('Bloom browser passed: partial input 0%, first match 7%, second 13%, real flowers, reload, clear, Undo, reset and countdown independence.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.kill();fs.rmSync(tmp,{recursive:true,force:true});});
