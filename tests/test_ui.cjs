// No browser or third-party packages needed. Run: node tests/test_ui.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const payload=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
 "import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import evaluate;s=fixture();print(json.dumps({'state':s,'view':evaluate(s)}))"],{cwd:root,encoding:'utf8'}));
const elements={},events={};
// classList gains contains() so the Pause garden toggle (document.body.classList
// .contains('world-paused')) can be exercised; element() gains createElement-friendly
// extras (style.setProperty, remove, animate().cancel).
const makeClassList=()=>{const set=new Set();return {toggle(c){if(set.has(c)){set.delete(c);return false;}set.add(c);return true;},remove(...c){c.forEach(x=>set.delete(x));},add(...c){c.forEach(x=>set.add(x));},contains(c){return set.has(c);}};};
const element=()=>({dataset:{},scrollTop:0,innerHTML:'',textContent:'',open:false,classList:makeClassList(),style:{setProperty(){}},addEventListener(){},removeChild(e){if(e)e.parentElement=null;},remove(){if(this.parentElement&&this.parentElement.removeChild)this.parentElement.removeChild(this);},focus(){},appendChild(e){e.parentElement=this;},showModal(){this.open=true;},close(){this.open=false;},animate(){return {finished:Promise.resolve(),cancel(){}};},querySelector(){return null;}});
const document={querySelector:s=>elements[s]??=(element()),querySelectorAll:()=>[],addEventListener:(type,fn)=>events[type]=fn,body:element(),createElement:()=>element()};
const context={document,window:{addEventListener(){},matchMedia:()=>({matches:true})},fetch:()=>new Promise(()=>{}),setTimeout:()=>1,clearTimeout(){},setInterval(){},console,fixture:payload,confirm:()=>true};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'static/app.js'),'utf8'),context);
vm.runInContext('state=fixture.state;view=fixture.view;',context);

/* Garden plants use the evaluated goals (including settled extra games), carry
   scores forward, and never hide the original ten players after pruning. */
{
 const expectedTiers=[[0,0],[1,1],[2,1],[3,2],[5,2],[6,3],[10,4],[15,5],[21,6]];
 for(const [goals,tier] of expectedTiers)assert.equal(vm.runInContext(`plantTier(${goals})`,context),tier);
 for(const key of ['round1','round2','final']){
  const html=vm.runInContext(`plantGarden('${key}')`,context);
  assert.equal((html.match(/class="plant-card /g)||[]).length,10,`${key}: ten plants visible`);
  assert.equal((html.match(/class="plant-art"/g)||[]).length,10,`${key}: ten individual roses`);
  const model=JSON.parse(vm.runInContext(`JSON.stringify(plantGardenModel('${key}'))`,context));
  assert.equal(model.length,10);
  for(const p of model){
   const current=payload.view[key].rows.find(r=>r.id===p.id);
   assert.equal(p.roundGoals,current?.goals||0);
   const previous=['round1','round2','final'].slice(0,['round1','round2','final'].indexOf(key)+1);
   const expected=previous.reduce((n,k)=>n+(payload.view[k].rows.find(r=>r.id===p.id)?.goals||0),0);
   assert.equal(p.goals,expected,`${key}: growth carries over without double counting`);
  }
 }
 assert.notEqual(vm.runInContext('plantSvg(0)',context),vm.runInContext('plantSvg(6)',context),'zero-goal seedling differs from full bloom');
 const oldName=payload.state.names.p1;
 vm.runInContext("state.names.p1='<img src=x onerror=alert(1)>';",context);
 assert(!vm.runInContext("plantGarden('round1')",context).includes('<img src=x'),'names are HTML-escaped');
 vm.runInContext(`state.names.p1=${JSON.stringify(oldName)};`,context);
 vm.runInContext("view=JSON.parse(JSON.stringify(view));view.round1.complete=false;view.round1.survivors=[];",context);
 assert(!JSON.parse(vm.runInContext("JSON.stringify(plantGardenModel('round2'))",context)).some(p=>p.pruned),'unsettled cut cannot prune');
 vm.runInContext(`({state,view}=fixture)`,context);
}

for(let g=0;g<5;g++){
 const html=vm.runInContext(`round2Game=${g};round2Page()`,context);
 const paths=[...html.matchAll(/data-path="round2\.players\.(p\d+)\.goals\.(\d+)"/g)];
 assert.equal(paths.length,8);assert.equal((html.match(/data-r2-game=/g)||[]).length,5);
 assert.deepEqual(paths.map(m=>m[1]).sort(),[...payload.view.round2.schedule[g].A,...payload.view.round2.schedule[g].B].sort());
 assert(paths.every(m=>Number(m[2])===g));assert(html.includes('Overall standings'));assert(!html.includes('undefined'));
}
// A three-goal match ends immediately: set every remaining blank score to 0
// across both teams, preserving existing goals and other games.
for(const key of ['round1','round2','final']){
 const teams=key==='round1'?payload.state.round1.lineups[0]:payload.view[key].schedule[0];
 const fixtureState=JSON.parse(JSON.stringify(payload.state));
 for(const p of [...teams.A,...teams.B])fixtureState[key].players[p].goals[0]=null;
 const a=teams.A,b=teams.B;
 fixtureState[key].players[a[0]].goals[0]=2;
 fixtureState[key].players[b[0]].goals[0]=1;
 const nextGameBefore=fixtureState[key].players[a[1]].goals[1];
 const mockFields=[...a,...b].map(p=>({dataset:{path:`${key}.players.${p}.goals.0`},value:''}));
 const duplicate={dataset:{path:`${key}.players.${a[2]}.goals.0`},value:''};
 mockFields.push(duplicate);
 const originalQueryAll=document.querySelectorAll;
 document.querySelectorAll=selector=>selector==='input[data-path]'?mockFields:[];
 vm.runInContext(`state=${JSON.stringify(fixtureState)};view=fixture.view;`,context);
 // Two goals do not fill the blanks prematurely.
 assert.equal(vm.runInContext(`value('${key}.players.${a[1]}.goals.0')`,context),null);
 assert.equal(vm.runInContext(`enterGoal('${key}.players.${a[1]}.goals.0',1)`,context),true);
 const scored=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
 assert.equal(scored[key].players[a[0]].goals[0],2,'a scored 2 remains untouched');
 assert.equal(scored[key].players[a[1]].goals[0],1,'third goal remains recorded');
 assert.equal(scored[key].players[b[0]].goals[0],1,'opponent\'s existing goal remains');
 for(const p of [...a.slice(2),...b.slice(1)])assert.equal(scored[key].players[p].goals[0],0,'unentered goal auto-completes with 0');
 assert.equal(scored[key].players[a[1]].goals[1],nextGameBefore,'other games are unchanged');
 assert.equal(mockFields.find(x=>x.dataset.path.endsWith('.'+a[2]+'.goals.0')).value,'0','visible teammate goal is updated');
 assert.equal(duplicate.value,'0','duplicate Round 1 score input is updated');
 document.querySelectorAll=originalQueryAll;
}
// Opposing side can also win; it fills every remaining player score.
{
 const key='round2',teams=payload.view.round2.schedule[0],fresh=JSON.parse(JSON.stringify(payload.state));
 for(const p of [...teams.A,...teams.B])fresh.round2.players[p].goals[0]=null;
 fresh.round2.players[teams.A[0]].goals[0]=1;
 fresh.round2.players[teams.B[0]].goals[0]=2;
 vm.runInContext(`state=${JSON.stringify(fresh)};view=fixture.view;`,context);
 assert.equal(vm.runInContext(`enterGoal('round2.players.${teams.B[1]}.goals.0',1)`,context),true);
 const result=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
 assert.equal(result.round2.players[teams.A[0]].goals[0],1,'other team scored goals are retained');
 for(const p of [...teams.A.slice(1),...teams.B.slice(2)])assert.equal(result.round2.players[p].goals[0],0,'winner B also zero-fills all blank players');
}
// Two goals alone must not auto-fill anything; user can still score.
{
 const key='round2',teams=payload.view.round2.schedule[0],fresh=JSON.parse(JSON.stringify(payload.state));
 for(const p of [...teams.A,...teams.B])fresh.round2.players[p].goals[0]=null;
 vm.runInContext(`state=${JSON.stringify(fresh)};view=fixture.view;`,context);
 assert.equal(vm.runInContext(`enterGoal('round2.players.${teams.A[0]}.goals.0',2)`,context),true);
 const result=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
 assert.equal(result.round2.players[teams.B[0]].goals[0],null,'no premature zeros at two goals');
}
// The null-to-zero behavior also applies when a third goal is typed directly.
{
 const key='round2',teams=payload.view.round2.schedule[0],fresh=JSON.parse(JSON.stringify(payload.state));
 for(const p of [...teams.A,...teams.B])fresh.round2.players[p].goals[0]=null;
 fresh.round2.players[teams.A[0]].goals[0]=2;
 vm.runInContext(`state=${JSON.stringify(fresh)};view=fixture.view;`,context);
 const input={id:'',dataset:{path:`round2.players.${teams.A[1]}.goals.0`},type:'number',value:'1'};
 events.input({target:input});
 const result=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
 for(const p of [...teams.A.slice(2),...teams.B])assert.equal(result.round2.players[p].goals[0],0,'typed goal auto-fills blank scores');
}
vm.runInContext('state=fixture.state;view=fixture.view;',context);
vm.runInContext("resetStage('round2')",context);
assert.equal(vm.runInContext("state.round2.players.p1.goals.length",context),5);
assert.equal(vm.runInContext("state.final.players.p1.goals.length",context),8);
assert.equal(vm.runInContext("state.round1.players.p1.goals[0]",context),2);
// Exercise actual delegated match-selector and goal-counter handlers.
vm.runInContext('state=fixture.state;render=()=>{};flush=async()=>{};save=async()=>{};',context);
const click=dataset=>events.click({target:{closest:()=>({dataset,disabled:false})}});
// Drain pending microtasks so a click handler that `await`s a resolved stub (flush/save)
// advances to the point where it has set a synchronous flag (e.g. FEAT-003 cutsceneActive)
// WITHOUT resolving the sandbox's never-firing setTimeout timers.
const flushMicro=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
(async()=>{
 await click({r2Game:'4'});assert.equal(vm.runInContext('round2Game',context),4);
 const p=payload.view.round2.schedule[4].A[0],target=`round2.players.${p}.goals.4`;
 await click({action:'clear-r2-game'});
 await click({step:'1',target});assert.equal(vm.runInContext(`value('${target}')`,context),1);
 await click({action:'clear-r2-game'});assert.equal(vm.runInContext(`value('${target}')`,context),null);
 await click({action:'reset-all'});assert.equal(vm.runInContext('state.version',context),6);
 assert.equal(vm.runInContext('state.round2.players.p1.goals.length',context),5);
 const ready=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import Draws;from engine import evaluate,round2_draw_action;s=round2_draw_action(Draws().fresh(),'start');g=evaluate(s)['round2']['schedule'][0];[(s['round2']['players'][p]['goals'].__setitem__(0,0)) for p in g['A']+g['B']];s=round2_draw_action(s,'done',1);print(json.dumps({'state':s,'view':evaluate(s),'revision':2}))"],{cwd:root,encoding:'utf8'}));
 context.responsePayload=ready;context.fetch=async(url,options)=>{assert.equal(url,'/api/round2-draw');const body=JSON.parse(options.body);assert.equal(body.action,'done');assert.equal(body.game,1);return {ok:true,json:async()=>ready};};
 
 await click({action:'r2-done',match:'1'});
 assert.equal(vm.runInContext('round2Game',context),1);assert.equal(vm.runInContext('tab',context),'round2');
 const fixedHTML=vm.runInContext('round2Page()',context);
 assert(fixedHTML.includes('BALANCED 4v4'),'new round uses balanced per-game teams');
 assert(fixedHTML.includes('data-r2-game="2" disabled'),'third match stays locked until second is completed');
 assert(fixedHTML.includes('Match 2 of 5'),'new round uses five games');
 assert(!fixedHTML.includes('SITTING OUT')&&!fixedHTML.includes('sit-out wheel'),'there is no sit-out wheel');
 assert(fixedHTML.includes('data-action="r2-reroll"'),'Round 2 has its own reshuffle button');
 // // Name wheel removal: the standalone 'Name your fate' draw is gone. There is no
 // more wheelMode and no navigable Name wheel room. The tabs array must not expose
 // a 'wheel'/'Name wheel' entry, renderRoom() must not emit a data-open="wheel"
 // tile, and no navigable tab may render the 'Name your fate' screen.
 vm.runInContext('state=fixture.state;view=fixture.view;',context);
 const navTabs=vm.runInContext('tabs',context);
 assert(Array.isArray(navTabs),'tabs is the top-level navigation array');
 assert(!navTabs.some(t=>t[0]==='wheel'),'no navigable tab keyed "wheel"');
 assert(!navTabs.some(t=>t[1]==='Name wheel'),'no navigable tab labelled "Name wheel"');
 vm.runInContext('renderRoom()',context);  // renderRoom() writes into #monitors (returns nothing).
 const roomHTML=context.document.querySelector('#monitors').innerHTML;
 assert(roomHTML.includes('data-open="settings"'),'renderRoom() still renders the surviving room tiles');
 assert(!roomHTML.includes('data-open="wheel"'),'renderRoom() emits no Name wheel tile');
 assert(!roomHTML.includes('Name your fate')&&!/NAME<br>YOUR FATE\./i.test(roomHTML),'renderRoom() shows no Name-your-fate tile');
 const screenFor={settings:'settings()',round1:"round('round1')",round2:'round2Page()',final:'finalPage()',overview:'overview()'};
 for(const t of navTabs){
  const expr=screenFor[t[0]];assert(expr,`navigable tab ${t[0]} maps to a known screen renderer`);
  const out=vm.runInContext(`finalGame=0;round1Game=0;round2Game=0;tab=${JSON.stringify(t[0])};String(${expr})`,context);
  assert(!out.includes('Name your fate'),`navigable tab ${t[0]} does not render the Name-your-fate screen`);
  assert(!/data-wheel-mode/.test(out),`navigable tab ${t[0]} has no Name-wheel mode tabs`);
 }
 const pointsTable=vm.runInContext('finalPage()',context).split('<summary>View points per game</summary>')[1].split('</details>')[0];
 assert.equal((pointsTable.match(/<th>/g)||[]).length,vm.runInContext('view.final.schedule.length',context)+1,'final points table headers match the eight-game schedule');
 // Know Thy Nature per-game split model: teams are auto-generated cosmetic 5v5 splits
 // (no wheel assignment, no fixed per-player team).
 const r1=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from engine import IDS,new_state,evaluate,round1_lineups;s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(IDS)};round1_lineups(s);print(json.dumps({'state':s,'view':evaluate(s),'revision':5}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(r1.state)};view=${JSON.stringify(r1.view)};revision=5;`,context);
 // (b) Know Thy Nature screen shows the per-game A/B cosmetic lineup grouping with per-player
 //     goal inputs for the selected game, and NONE of the retired fixed-team controls.
 const r1Round=vm.runInContext("round1Game=0;round('round1')",context);
 assert(r1Round.includes('teams-grid'),'Know Thy Nature renders the per-game A/B lineup grid');
 assert(r1Round.includes('Team A')&&r1Round.includes('Team B'),'Know Thy Nature shows both cosmetic teams');
 assert(r1Round.includes('team-score'),'Know Thy Nature reuses the .team-score grouping');
 const r1Inputs=[...r1Round.matchAll(/data-path="round1\.players\.(p\d+)\.goals\.0"/g)].map(m=>m[1]);
 assert.deepEqual([...new Set(r1Inputs)].sort(),[...payload.view.round1.rows.map(r=>r.id)].sort(),'all ten players have a goal input for the selected game');
 assert(!r1Round.includes('data-path="round1.players.p1.team"')&&!/round1\.players\.\w+\.team/.test(r1Round),'no per-player team select');
 assert(!r1Round.includes('Assign teams'),'no retired Assign-teams panel');
 assert(!r1Round.includes('data-action="r1-reset"')&&!r1Round.includes('data-action="r1-wheel"'),'no retired reset/open-wheel controls');
 assert(r1Round.includes('data-action="r1-reroll"'),'Know Thy Nature offers the per-game reshuffle control');
 // (c) The retired Name-wheel helpers are gone entirely.
 assert.equal(vm.runInContext("typeof round1MatchForName",context),'undefined');
 assert.equal(vm.runInContext("typeof resetRound1Spin",context),'undefined');
 assert.equal(vm.runInContext("typeof wheelPage",context),'undefined','the standalone Name wheel renderer is gone');
 assert.equal(vm.runInContext("typeof spinWheel",context),'undefined','the Name-wheel spin handler is gone');
 assert.equal(vm.runInContext("typeof wheelModeTabs",context),'undefined','the Name-wheel mode tabs are gone');
 assert.equal(vm.runInContext("typeof randomIndex",context),'undefined','the Name-wheel random picker is gone');
 assert.equal(vm.runInContext("typeof wheelMode",context),'undefined','the shared wheelMode global is gone');
 assert.equal(vm.runInContext("typeof wheelLast",context),'undefined','the Name-wheel result global is gone');
 console.log('Know Thy Nature UI: per-game cosmetic A/B splits with ten goal inputs, reshuffle control, no fixed-team wheel/reset/select.');
 console.log('Name wheel removal: no "wheel"/"Name wheel" tab, no data-open="wheel" tile, no "Name your fate" screen on any navigable tab, and the standalone wheel helpers are gone.');
 console.log('Round 2 UI: all five lineups, eight editable players, game selection, counters, clearing and reset passed.');

 // The production Divine Selection engine chooses cuts by player ID and stage rank.
 vm.runInContext('state=fixture.state;view=fixture.view;render=()=>{};flush=async()=>{};save=async()=>{};',context);
 const en1=JSON.parse(vm.runInContext("JSON.stringify(divineCuts('round1'))",context));
 assert.deepEqual([...en1].sort(),[...payload.view.round1.rows.filter(r=>r.status==='CUT').map(r=>r.id)].sort(),'Round 1 cuts match engine');
 const enF=JSON.parse(vm.runInContext("JSON.stringify(divineCuts('final'))",context));
 assert.deepEqual([...enF].sort(),[...payload.view.final.rows.filter(r=>r.rank!==1).map(r=>r.id)].sort(),'Final cuts exclude champion');
 assert(enF.every(id=>!payload.view.final.rows.filter(r=>r.rank===1).map(x=>x.id).includes(id)),'champion is never cut');
 // (B) A NON-FINAL match submit does NOT trigger the cutscene.
 vm.runInContext('cutsceneActive=false;',context);
 await click({action:'submit-match',stage:'round1',match:'0'});
 assert.equal(vm.runInContext('cutsceneActive',context),false,'a non-final match submit does not play the cutscene');
 assert.equal(vm.runInContext('resultFinal',context),false,'match 1 of 5 is not the final match');
 await click({action:'close-result'});
 // (C) SKIPPABLE: starting the cutscene flags it active and reveals the overlay; the
 //     single endCutscene() path (Skip button / click / Esc / completion all route here)
 //     hides the overlay, clears the flag, and lets the standings render.
 const overlayEl=context.document.querySelector('#cutscene');
 // playCutscene's promise resolves ONLY via endCutscene (the sandbox's setTimeout never
 // fires), so start it without awaiting, assert it is active, then drive the single
 // dismiss path that Skip/click/Esc all share.
 vm.runInContext("playCutscene(['Alpha','Bravo']);",context);
 assert.equal(vm.runInContext('cutsceneActive',context),true,'playCutscene marks the cutscene active and shows the overlay');
 assert.equal(overlayEl.hidden,false,'the overlay is visible while the cutscene plays');
 const carryStage=context.document.querySelector('#cutscene-stage').innerHTML;
 assert(carryStage.includes('crown-card')&&!carryStage.includes('cut-escort'),'crown card replaces all carrying figures');

 vm.runInContext('endCutscene();',context);
 assert.equal(vm.runInContext('cutsceneActive',context),false,'endCutscene (Skip/click/Esc) clears the active flag');
 assert.equal(overlayEl.hidden,true,'endCutscene hides the overlay so the standings show');
 // After dismissal the user is free to land on the resultFullscreen standings.
 vm.runInContext('state=fixture.state;view=fixture.view;',context);
 await click({action:'submit-match',stage:'round1',match:'4'});
 await flushMicro();
 assert.equal(vm.runInContext('cutsceneActive',context),false,'the ranking does not launch a cutscene');
 assert(resultEl.innerHTML.includes('data-action="advance-stage"'),'completed round offers Continue');
 await click({action:'close-result'});
 // (D) REDUCED MOTION: with matchMedia matches:true (the sandbox default) the animated
 //     carry is replaced by a STATIC summary carrying an 'ELIMINATED: names' caption.
 assert.equal(vm.runInContext("reducedMotion()",context),true,'sandbox defaults to reduced motion');
 vm.runInContext("playCutscene(['Casey','Dakota']);",context);
 const captionEl=context.document.querySelector('#cutscene-caption');
 assert(/THE ROSES BLOOM/.test(captionEl.innerHTML),'reduced motion shows the static THE ROSES BLOOM card');
 assert(captionEl.innerHTML.includes('Final'),'static beat labels the opened pavilion');
 vm.runInContext('endCutscene();',context);
 // (E) EMPTY eliminated list: playCutscene resolves immediately and never flags active.
 vm.runInContext('cutsceneActive=false;',context);
 await vm.runInContext('playCutscene([])',context);
 assert.equal(vm.runInContext('cutsceneActive',context),false,'playCutscene with no names resolves without showing the overlay');
 // Verdict play and a double dismiss stay harmless.
 context.window.CityWorld={setSuspended(){}};
 context.verdictCuts=payload.view.round1.rows.filter(r=>r.status==='CUT').map(r=>r.name);
 vm.runInContext("playCutscene(verdictCuts,'Know Thy Nature','round1');",context);
 vm.runInContext('endCutscene();',context);
 vm.runInContext('endCutscene();',context);assert.equal(vm.runInContext('cutsceneActive',context),false,'a second dismiss is harmless');
 console.log('FEAT-003 elimination cutscene: divineCuts per stage, no-trigger on non-final, crown card fallback, skippable single-dismiss path, reduced-motion static PAVILION OPEN, and empty-list skip passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
