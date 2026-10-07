// Optional real-browser regression check. Requires Playwright and Chromium.
// Run: node tests/test_browser.cjs
// Optional: PLAYWRIGHT_MODULE, CHROMIUM_EXECUTABLE, CHROMIUM_ARGS (JSON), SCREENSHOT_DIR.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'brawl-ui-'));
const py=process.env.PYTHON||'python3';
const fixture=JSON.parse(execFileSync(py,['-c',"import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;print(json.dumps(fixture()))"],{cwd:root,encoding:'utf8'}));
const copy=x=>JSON.parse(JSON.stringify(x));
const server=spawn(py,['app.py','--port','0','--no-browser','--data',path.join(tmp,'state.json')],{cwd:root});
const urlReady=new Promise((resolve,reject)=>{
 let output='';const timer=setTimeout(()=>reject(Error('Python server did not start')),15000);
 server.stdout.on('data',chunk=>{output+=chunk;const m=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});
 server.stderr.on('data',chunk=>process.stderr.write(chunk));
 server.on('error',reject);server.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});
});
let browser,page;
(async()=>{
 const url=await urlReady;
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'[]')});
 page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(url);
 const saved=async()=>{await page.waitForFunction(()=>!dirty&&!saving&&!saveFailed);assert(!await page.locator('#retry-save').isVisible());};
 const restore=async state=>{
  await page.evaluate(async state=>{
   const data=await (await fetch('/api/state')).json();
   const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':data.token},body:JSON.stringify({state,revision:data.revision,restore:true})});
   if(!res.ok)throw Error(await res.text());
  },state);
  await page.reload();await page.waitForFunction(()=>!!window.document.querySelector('[data-open="wheel"]'));
 };
 const open=async key=>{await page.locator(`[data-open="${key}"]`).click();await page.locator('#screen-dialog[open]').waitFor();};
 const nav=async key=>page.locator(`#nav [data-tab="${key}"]`).click();
 const snap=async name=>{if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,name+'.png'),fullPage:true});}};
 await restore(fixture);
 // All monitors at desktop and phone widths, with no page-level horizontal overflow.
 for(const [width,height,label] of [[1440,1000,'desktop'],[390,844,'phone']]){
  await page.setViewportSize({width,height});
  await snap(label+'-room');
  for(const key of ['wheel','settings','round1','round2','final','overview']){
   await open(key);
   assert(await page.locator('#screen-dialog #save-controls').count(),key+' has accessible save controls');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),key+' overflows viewport');
   await snap(label+'-'+key);
   await page.locator('#close-screen').click();
  }
 }
 await page.setViewportSize({width:1440,height:1000});
 // Editing the table must not jump focus into the duplicate score counter above it.
 await open('round1');
 const tableScore=page.locator('.scroll input[data-path="round1.players.p1.goals.0"]');
 await tableScore.fill('7');await saved();
 assert(await tableScore.evaluate(el=>el===document.activeElement),'score-table focus jumped to its duplicate counter');
 // A changed survivor must show recovery controls instead of crashing on old slots.
 const stale=copy(fixture);stale.round1.players.p5.goals=[20,20,20,20,20];
 await restore(stale);await open('round2');
 assert(await page.locator('[data-action="clear-round"][data-stage="round2"]').isVisible());
 assert.equal(await page.locator('[data-path^="round2.players"]').count(),0);
 await page.locator('[data-action="clear-round"][data-stage="round2"]').click();await saved();
 assert(await page.locator('#screen-dialog #undo-action').isVisible());
 await page.locator('#undo-action').click();
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Undo applied');
 assert(await page.locator('text=This roster changed since To Die was scored.').isVisible());
 // Partial extra games remain unresolved. Keep the form editable after resolution.
 const tie=copy(fixture);tie.round1.players.p5.goals=[2,1,1,1,1];
 await restore(tie);await open('round1');await page.locator('[data-r1-game="4"]').click();
 await page.locator('[data-action="submit-match"]').click();
 await page.locator('#result-content [data-action="extra"]').click();await saved();
 const extra=p=>page.locator(`#result-content input[data-path="round1.extras.0.${p}"]`);
 await extra('p5').fill('10');await saved();
 assert((await page.locator('#result-content').innerText()).includes('EXTRA GAMES NEEDED'));
 await extra('p9').fill('0');await saved();
 assert((await page.locator('#result-content').innerText()).includes('ROUND SETTLED'));
 assert(await extra('p9').isVisible(),'resolved extra inputs disappeared');
 // A failed save in the topmost dialog must expose Retry and recover cleanly.
 await page.route('**/api/state',async route=>{
  if(route.request().method()==='PUT')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Simulated disk failure'})});
  else await route.continue();
 });
 await extra('p9').fill('10');await page.locator('#result-dialog #retry-save:not([hidden])').waitFor();
 assert(await page.locator('#error').isVisible());
 await page.unroute('**/api/state');await page.locator('#retry-save').click();await saved();
 assert.equal(await page.locator('#error').count(),1,'error element was destroyed by a rerender');
 assert((await page.locator('#result-content').innerText()).includes('EXTRA GAMES NEEDED'));
 await page.locator('#result-content [data-action="remove-extra"]').click();await saved();
 await page.locator('#result-dialog #undo-action').click();
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Undo applied');
 assert.equal(await extra('p9').inputValue(),'10');
 await snap('extra-games-recovery');
 await page.locator('[data-action="close-result"]').click();
 assert(await page.locator('#screen-dialog #undo-action').count());
 // Fresh To Die: record all eight matches via real controls, checking the saved draw.
 const fresh=copy(fixture);
 for(const key of ['round2','final']){
  fresh[key].extras=[];fresh[key].roster=[];
  for(const p of Object.keys(fresh.names)){fresh[key].players[p].goals=Array(key==='round2'?8:10).fill(null);if(key==='final')fresh[key].players[p].results=Array(10).fill('');}
 }
 fresh.round2.draw={order:[],revealed:0,completed:0,mode:'random'};
 await restore(fresh);await open('round2');await page.locator('[data-action="r2-start"]').click();
 const rests=Object.fromEntries(Object.keys(fixture.names).map(p=>[p,0]));
 for(let g=0;g<8;g++){
  await page.locator('[data-action="r2-scores"]').click();
  const current=await page.evaluate(()=>view.round2.schedule[round2Game]);
  for(const p of current.sit)rests[p]++;
  for(const p of [...current.A,...current.B]){
   await page.locator(`[data-path="round2.players.${p}.goals.${g}"]`).fill(p.slice(1));await saved();
  }
  await page.locator('[data-action="r2-done"]').click();
  await page.locator('#result-dialog[open]').waitFor();
  assert.equal(await page.evaluate(()=>view.round2.draw.completed),g+1);
  await page.locator('[data-action="close-result"]').click();
 }
 assert.equal(Object.values(rests).filter(n=>n===2).length,8);
 assert.equal(await page.evaluate(()=>view.round2.complete),true);
 await nav('final');assert.equal(await page.locator('[data-path^="final.players"]').count(),6);
 // The open name wheel is independent of the roster and blocks overlapping spins.
 await nav('wheel');await page.locator('[data-wheel-mode="free"]').click();
 await page.locator('#wheel-entries').fill('Alpha\nBeta\nGamma');await saved();
 await page.locator('[data-check="wheel.remove_winner"]').check();await saved();
 await page.locator('.wheel-actions [data-action="spin"]').click();await page.waitForFunction(()=>!spinning&&!!wheelLast);await saved();
 assert.equal((await page.locator('#wheel-entries').inputValue()).split('\n').length,2);
 assert.equal(await page.locator('[data-action="remove-winner"]').isDisabled(),true);
 const choices=await page.evaluate(async()=>{const original=randomIndex;let count=0;randomIndex=n=>{count++;return original(n);};try{await Promise.all([spinWheel(),spinWheel()]);return count;}finally{randomIndex=original;}});
 assert.equal(choices,1,'overlapping spin requests picked more than one winner');await saved();
 // Bad request shapes return a readable 400, not a disconnected socket.
 const bad=await page.evaluate(async()=>{const d=await (await fetch('/api/state')).json();return (await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':d.token},body:'[]'})).status;});
 assert.equal(bad,400);
 assert.deepEqual(errors,[],'uncaught browser errors');
 console.log('Browser checks passed: six monitors at desktop/phone sizes, score focus, stale-roster recovery, Undo/Retry in both dialogs, extra-game corrections, all eight sit-out draws, name wheel, malformed request.');
})().catch(async e=>{console.error(e);if(page)console.error(await page.evaluate(()=>({error:document.querySelector('#error')?.textContent,dirty,saving,undo:!!undoSnapshot,extraCount:state.round1.extras.length,undoHidden:document.querySelector('#undo-action')?.hidden})).catch(()=>null));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();fs.rmSync(tmp,{recursive:true,force:true});});
