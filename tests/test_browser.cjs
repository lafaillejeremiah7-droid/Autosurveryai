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
 page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(url);
 const saved=async()=>{await page.waitForFunction(()=>!dirty&&!saving&&!saveFailed);assert(!await page.locator('#retry-save').isVisible());};
 const restore=async state=>{
  await page.evaluate(async state=>{
   const data=await (await fetch('/api/state')).json();
   const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':data.token},body:JSON.stringify({state,revision:data.revision,restore:true})});
   if(!res.ok)throw Error(await res.text());
  },state);
  await page.reload();await page.waitForFunction(()=>!!window.document.querySelector('[data-open="settings"]'));
 };
 const open=async key=>{await page.locator(`#monitors [data-open="${key}"]`).click();await page.locator('#screen-dialog[open]').waitFor();};
 const nav=async key=>page.locator(`#nav [data-tab="${key}"]`).click();
 const snap=async name=>{if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,name+'.png'),fullPage:true});}};
 await restore(fixture);
 // Importing a backup must invalidate Undo from the previous tournament.
 await page.evaluate(()=>{undoSnapshot={state:structuredClone(state),label:'Old tournament'};countdownDraft='2000-01-01T00:00';renderUndo();});
 await page.locator('#restore').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Backup restored and saved');
 assert(await page.evaluate(()=>undoSnapshot===null&&countdownDraft===null),'backup retained stale Undo or countdown draft');
 // All monitors at desktop and phone widths, with no page-level horizontal overflow.
 for(const [width,height,label] of [[1440,1000,'desktop'],[390,844,'phone']]){
  await page.setViewportSize({width,height});
  const scene=await page.locator('#walkway-view').evaluate(el=>{
   const box=el.getBoundingClientRect(),style=getComputedStyle(el);
   return {x:box.left,y:box.top,width:box.width,height:box.height,position:style.position,
    border:style.borderTopWidth,parent:el.parentElement?.tagName};
  });
  assert.equal(scene.position,'fixed','3D city should fill the browser viewport, not a box');
  assert.equal(scene.parent,'BODY','3D city should sit behind the entire page');
  assert.equal(scene.x,0);assert.equal(scene.y,0);
  assert(Math.abs(scene.width-width)<=1&&Math.abs(scene.height-height)<=1,'3D city must fill the screen');
  assert.equal(scene.border,'0px','3D background cannot have a framed border');
  assert(await page.evaluate(()=>window.CityWorld.getStatus().cameraEye[1]>15),'POV camera should be elevated');
  await snap(label+'-room');
  for(const key of ['settings','round1','round2','final','overview']){
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
 await tableScore.fill('3');await saved();
 assert(await tableScore.evaluate(el=>el===document.activeElement),'score-table focus jumped to its duplicate counter');
 // A changed survivor must show recovery controls instead of crashing on old slots.
 const stale=copy(fixture);stale.round1.players.p5.goals=stale.round1.players.p4.goals;stale.round1.players.p4.goals=[0,0,0,0,0];
 await restore(stale);await open('round2');
 assert(await page.locator('[data-action="clear-round"][data-stage="round2"]').isVisible());
 assert.equal(await page.locator('[data-path^="round2.players"]').count(),0);
 await page.locator('[data-action="clear-round"][data-stage="round2"]').click();await saved();
 assert(await page.locator('#screen-dialog #undo-action').isVisible());
 await page.locator('#undo-action').click();
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Undo applied');
 assert(await page.locator('text=This roster changed since What Do You Want? was scored.').isVisible());
 // Partial extra games remain unresolved. Keep the form editable after resolution.
 const tie=copy(fixture);tie.round1.players.p5.goals[0]=1;tie.round1.players.p7.goals[1]=2;tie.round1.players.p8.goals[2]=2;
 await restore(tie);await open('round1');await page.locator('[data-r1-game="4"]').click();
 await page.locator('[data-action="submit-match"]').click();
 await page.locator('#result-content [data-action="extra"]').click();await saved();
 const extra=p=>page.locator(`#result-content input[data-path="round1.extras.0.${p}"]`);
 await extra('p5').fill('3');await saved();
 assert((await page.locator('#result-content').innerText()).includes('EXTRA GAMES NEEDED'));
 await extra('p9').fill('0');await saved();
 assert((await page.locator('#result-content').innerText()).includes('ROUND SETTLED'));
 assert(await extra('p9').isVisible(),'resolved extra inputs disappeared');
 await page.waitForFunction(()=>!cutsceneActive);
 // A failed save in the topmost dialog must expose Retry and recover cleanly.
 await page.route('**/api/state',async route=>{
  if(route.request().method()==='PUT')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Simulated disk failure'})});
  else await route.continue();
 });
 await extra('p9').fill('3');await page.locator('#result-dialog #retry-save:not([hidden])').waitFor();
 assert(await page.locator('#error').isVisible());
 await page.unroute('**/api/state');await page.locator('#retry-save').click();await saved();
 assert.equal(await page.locator('#error').count(),1,'error element was destroyed by a rerender');
 assert((await page.locator('#result-content').innerText()).includes('EXTRA GAMES NEEDED'));
 await page.locator('#result-content [data-action="remove-extra"]').click();await saved();
 await page.locator('#result-dialog #undo-action').click();
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='Undo applied');
 assert.equal(await extra('p9').inputValue(),'3');
 await snap('extra-games-recovery');
 await page.locator('[data-action="close-result"]').click();
 assert(await page.locator('#screen-dialog #undo-action').count());
 // Fresh What Do You Want?: record all five rebalanced 4v4 matches via real controls, checking the saved draw.
 const fresh=copy(fixture);
 for(const key of ['round2','final']){
  fresh[key].extras=[];fresh[key].roster=[];
  for(const p of Object.keys(fresh.names)){fresh[key].players[p].goals=Array(key==='round2'?5:8).fill(null);if(key==='final')fresh[key].players[p].results=Array(8).fill('');}
 }
 fresh.round2.draw={order:[],lineups:[],revealed:0,completed:0,mode:'random'};
 await restore(fresh);await open('round2');await page.locator('[data-action="r2-start"]').click();
 let firstTeams=null,anyChanged=false;
 for(let g=0;g<5;g++){
  const current=await page.evaluate(()=>view.round2.schedule[round2Game]);
  if(firstTeams){if(JSON.stringify([...current.A].sort())!==JSON.stringify([...firstTeams.A].sort())&&JSON.stringify([...current.A].sort())!==JSON.stringify([...firstTeams.B].sort()))anyChanged=true;}else firstTeams=current;
  if(g===1){
   assert.equal(await page.locator('[data-action="r2-reroll"]').isEnabled(),true);
   const before=await page.evaluate(()=>view.round2.schedule[round2Game]);
   await page.locator('[data-action="r2-reroll"]').click();await saved();
   const after=await page.evaluate(()=>view.round2.schedule[round2Game]);
   assert.notDeepEqual([...after.A].sort(),[...before.A].sort());
  }
  const scorers=['A','B'].flatMap(t=>{const eligible=current[t].filter(p=>!['p4','p9'].includes(p));const limit=t==='A'?3:2;return Array.from({length:Math.min(limit,eligible.length)},(_,i)=>eligible[(g+i)%eligible.length]);});
  for(const p of [...current.A,...current.B]){
   await page.locator(`[data-path="round2.players.${p}.goals.${g}"]`).fill(scorers.includes(p)?'1':'0');await saved();
  }
  await page.locator('[data-action="r2-done"]').click();
  await page.locator('#result-dialog[open]').waitFor();
  assert.equal(await page.evaluate(()=>view.round2.draw.completed),g+1);
  await page.locator('[data-action="close-result"]').click();
 }
 assert.equal((await page.evaluate(()=>view.round2.schedule)).length,5);
 assert.equal(anyChanged,true,'Round 2 must vary teammates across five matches');
 assert.equal(await page.evaluate(()=>view.round2.complete),true);
 await nav('final');assert.equal(await page.locator('[data-path^="final.players"]').count(),6);
 // Team caps apply immediately to counters, typed/pasted input and server writes.
 for(const key of ['round1','round2','final']){
  await restore(fixture);
  const teams=await page.evaluate(key=>gameTeams(key,0),key);
  const capState=copy(fixture);
  for(const p of teams.A.concat(teams.B))capState[key].players[p].goals[0]=0;
  await restore(capState);await open(key);
  if(key==='round2')await page.locator('[data-r2-game="0"]').click();
  const pathFor=p=>`${key}.players.${p}.goals.0`;
  const input=p=>page.locator(`input[data-path="${pathFor(p)}"]`).first();
  const plus=p=>page.locator(`button[data-step="1"][data-target="${pathFor(p)}"]`);
  await input(teams.A[0]).fill('2');await saved();
  await input(teams.A[1]).fill('1');await saved();
  await input(teams.B[0]).fill('2');await saved();
  assert.equal(await plus(teams.A[2]).isDisabled(),true,'teammates share the 3-goal limit');
  assert.equal(await plus(teams.B[1]).isDisabled(),true,'opponent stays capped at 2');
  await input(teams.B[0]).fill('3');
  assert.equal(await input(teams.B[0]).inputValue(),'2','typing cannot create 3-3');
  assert((await page.locator('#error').innerText()).includes('already has 3'));
  await input(teams.A[0]).fill('3');
  assert.equal(await input(teams.A[0]).inputValue(),'2','typing cannot make a team total 4');
  const status=await page.evaluate(async({key,p})=>{
   const d=await (await fetch('/api/state')).json();d.state[key].players[p].goals[0]=3;
   return (await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':d.token},body:JSON.stringify({state:d.state,revision:d.revision})})).status;
  },{key,p:teams.B[0]});
  assert.equal(status,400,'direct API write cannot create 3-3');
  await input(teams.A[1]).fill('0');await saved();
  assert.equal(await plus(teams.B[1]).isDisabled(),false,'lowering the opponent unlocks a third goal');
  await plus(teams.B[1]).click();await page.waitForFunction(({key,p})=>state[key].players[p].goals[0]===1,{key,p:teams.B[1]});await saved();
  assert.equal(await plus(teams.A[1]).isDisabled(),true);
  assert((await page.locator('[data-score-stage]').innerText()).includes('2 : 3'));
 }
 // Bad request shapes return a readable 400, not a disconnected socket.
 const bad=await page.evaluate(async()=>{const d=await (await fetch('/api/state')).json();return (await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':d.token},body:'[]'})).status;});
 assert.equal(bad,400);
 assert.deepEqual(errors,[],'uncaught browser errors');
 console.log('Browser checks passed: five rooms at desktop/phone sizes, focus, recovery, Undo/Retry, extra games, five variable-team matches with optional reshuffle, and team goal caps in all three rounds (typing, counters, corrections, API).');
})().catch(async e=>{console.error(e);if(page)console.error(await page.evaluate(()=>({error:document.querySelector('#error')?.textContent,dirty,saving,undo:!!undoSnapshot,extraCount:state.round1.extras.length,undoHidden:document.querySelector('#undo-action')?.hidden})).catch(()=>null));process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();fs.rmSync(tmp,{recursive:true,force:true});});
