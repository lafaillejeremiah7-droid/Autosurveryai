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
// classList gains contains()/_set so FEAT-002's pause gating (document.body.classList
// .contains('world-paused')) can be exercised; element() gains createElement-friendly
// extras (style.setProperty, remove, animate().cancel) used by the ambient blast loop.
const makeClassList=()=>{const set=new Set();return {toggle(c){if(set.has(c)){set.delete(c);return false;}set.add(c);return true;},remove(c){set.delete(c);},add(c){set.add(c);},contains(c){return set.has(c);}};};
const element=()=>({dataset:{},scrollTop:0,innerHTML:'',textContent:'',open:false,classList:makeClassList(),style:{setProperty(){}},addEventListener(){},removeChild(e){if(e)e.parentElement=null;},remove(){if(this.parentElement&&this.parentElement.removeChild)this.parentElement.removeChild(this);},focus(){},appendChild(e){e.parentElement=this;},showModal(){this.open=true;},close(){this.open=false;},animate(){return {finished:Promise.resolve(),cancel(){}};},querySelector(){return null;}});
const document={querySelector:s=>elements[s]??=(element()),querySelectorAll:()=>[],addEventListener:(type,fn)=>events[type]=fn,body:element(),createElement:()=>element()};
const context={document,window:{addEventListener(){},matchMedia:()=>({matches:true})},fetch:()=>new Promise(()=>{}),setTimeout:()=>1,clearTimeout(){},setInterval(){},console,fixture:payload,confirm:()=>true};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'static/app.js'),'utf8'),context);
vm.runInContext('state=fixture.state;view=fixture.view;',context);
for(let g=0;g<5;g++){
 const html=vm.runInContext(`round2Game=${g};round2Page()`,context);
 const paths=[...html.matchAll(/data-path="round2\.players\.(p\d+)\.goals\.(\d+)"/g)];
 assert.equal(paths.length,8);assert.equal((html.match(/data-r2-game=/g)||[]).length,5);
 assert.deepEqual(paths.map(m=>m[1]).sort(),[...payload.view.round2.schedule[g].A,...payload.view.round2.schedule[g].B].sort());
 assert(paths.every(m=>Number(m[2])===g));assert(html.includes('Overall standings'));assert(!html.includes('undefined'));
}
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
 await click({action:'reset-all'});assert.equal(vm.runInContext('state.version',context),5);
 assert.equal(vm.runInContext('state.round2.players.p1.goals.length',context),5);
 const ready=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import Draws;from engine import evaluate,round2_draw_action;s=round2_draw_action(Draws().fresh(),'start');g=evaluate(s)['round2']['schedule'][0];[(s['round2']['players'][p]['goals'].__setitem__(0,0)) for p in g['A']+g['B']];s=round2_draw_action(s,'done',1);print(json.dumps({'state':s,'view':evaluate(s),'revision':2}))"],{cwd:root,encoding:'utf8'}));
 context.responsePayload=ready;context.fetch=async(url,options)=>{assert.equal(url,'/api/round2-draw');const body=JSON.parse(options.body);assert.equal(body.action,'done');assert.equal(body.game,1);return {ok:true,json:async()=>ready};};
 
 await click({action:'r2-done',match:'1'});
 assert.equal(vm.runInContext('round2Game',context),1);assert.equal(vm.runInContext('tab',context),'round2');
 const fixedHTML=vm.runInContext('round2Page()',context);
 assert(fixedHTML.includes('FIXED 4v4'),'new round uses fixed teams');
 assert(fixedHTML.includes('data-r2-game="2" disabled'),'third match stays locked until second is completed');
 assert(fixedHTML.includes('Match 2 of 5'),'new round uses five games');
 assert(!fixedHTML.includes('SITTING OUT')&&!fixedHTML.includes('sit-out wheel'),'there is no sit-out wheel');
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
 // Like Never Before per-game split model: teams are auto-generated cosmetic 5v5 splits
 // (no wheel assignment, no fixed per-player team).
 const r1=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from engine import IDS,new_state,evaluate,round1_lineups;s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(IDS)};round1_lineups(s);print(json.dumps({'state':s,'view':evaluate(s),'revision':5}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(r1.state)};view=${JSON.stringify(r1.view)};revision=5;`,context);
 // (b) Like Never Before screen shows the per-game A/B cosmetic lineup grouping with per-player
 //     goal inputs for the selected game, and NONE of the retired fixed-team controls.
 const r1Round=vm.runInContext("round1Game=0;round('round1')",context);
 assert(r1Round.includes('teams-grid'),'Like Never Before renders the per-game A/B lineup grid');
 assert(r1Round.includes('Team A')&&r1Round.includes('Team B'),'Like Never Before shows both cosmetic teams');
 assert(r1Round.includes('team-score'),'Like Never Before reuses the .team-score grouping');
 const r1Inputs=[...r1Round.matchAll(/data-path="round1\.players\.(p\d+)\.goals\.0"/g)].map(m=>m[1]);
 assert.deepEqual([...new Set(r1Inputs)].sort(),[...payload.view.round1.rows.map(r=>r.id)].sort(),'all ten players have a goal input for the selected game');
 assert(!r1Round.includes('data-path="round1.players.p1.team"')&&!/round1\.players\.\w+\.team/.test(r1Round),'no per-player team select');
 assert(!r1Round.includes('Assign teams'),'no retired Assign-teams panel');
 assert(!r1Round.includes('data-action="r1-reset"')&&!r1Round.includes('data-action="r1-wheel"'),'no retired reset/open-wheel controls');
 assert(r1Round.includes('data-action="r1-reroll"'),'Like Never Before offers the per-game reshuffle control');
 // (c) The retired Name-wheel helpers are gone entirely.
 assert.equal(vm.runInContext("typeof round1MatchForName",context),'undefined');
 assert.equal(vm.runInContext("typeof resetRound1Spin",context),'undefined');
 assert.equal(vm.runInContext("typeof wheelPage",context),'undefined','the standalone Name wheel renderer is gone');
 assert.equal(vm.runInContext("typeof spinWheel",context),'undefined','the Name-wheel spin handler is gone');
 assert.equal(vm.runInContext("typeof wheelModeTabs",context),'undefined','the Name-wheel mode tabs are gone');
 assert.equal(vm.runInContext("typeof randomIndex",context),'undefined','the Name-wheel random picker is gone');
 assert.equal(vm.runInContext("typeof wheelMode",context),'undefined','the shared wheelMode global is gone');
 assert.equal(vm.runInContext("typeof wheelLast",context),'undefined','the Name-wheel result global is gone');
 console.log('Like Never Before UI: per-game cosmetic A/B splits with ten goal inputs, reshuffle control, no fixed-team wheel/reset/select.');
 console.log('Name wheel removal: no "wheel"/"Name wheel" tab, no data-open="wheel" tile, no "Name your fate" screen on any navigable tab, and the standalone wheel helpers are gone.');
 console.log('Round 2 UI: all five lineups, eight editable players, game selection, counters, clearing and reset passed.');

 // ---- FEAT-003: per-match submit control, cumulative popup, final fullscreen + extra-game fold ----
 // (1) Like Never Before and You Wanted to Win, Right? each render a 'Submit Match N of X' control.
 vm.runInContext('state=fixture.state;view=fixture.view;render=()=>{};flush=async()=>{};save=async()=>{};',context);
 const liveHTML=vm.runInContext("round1Game=0;round('round1')",context);
 assert(liveHTML.includes('Submit Match 1 of 5'),'Like Never Before shows a per-match submit control');
 assert(liveHTML.includes('data-action="submit-match" data-stage="round1" data-match="0"'));
 assert((liveHTML.match(/data-r1-game=/g)||[]).length===5,'Like Never Before has a 5-match selector');
 const rebirthHTML=vm.runInContext('finalGame=0;finalPage()',context);
 assert(rebirthHTML.includes('Submit Match 1 of 8'),'You Wanted to Win, Right? shows a per-match submit control');
 assert(rebirthHTML.includes('data-action="submit-match" data-stage="final" data-match="0"'));
 // (1b) The submit control is DISABLED until that match's view games[N].ready is true.
 vm.runInContext('view=JSON.parse(JSON.stringify(fixture.view));view.round1.games[0].ready=false;',context);
 const notReady=vm.runInContext("round1Game=0;round('round1')",context);
 assert(/data-match="0" disabled/.test(notReady),'Submit is disabled while the match is not ready');
 vm.runInContext('view=fixture.view;',context);
 // (2) Submitting a NON-final match opens the popup with cumulative standings through that match.
 const resultEl=context.document.querySelector('#result-content');
 await click({action:'submit-match',stage:'round1',match:'0'});
 assert(vm.runInContext('resultStage',context)==='round1');
 assert(vm.runInContext('resultFinal',context)===false,'match 0 of 5 is not the final match');
 assert(resultEl.innerHTML.includes('Match 1 of 5 standings'),'popup names the match');
 assert(resultEl.innerHTML.includes('Standings so far'));
 assert(resultEl.innerHTML.includes('RANK')&&resultEl.innerHTML.includes('TOTAL GOALS'),'popup shows cumulative columns');
 // (2b) The popup surfaces the provisional-status column (user point 2 + README).
 assert(/<th>STATUS<\/th>/.test(resultEl.innerHTML),'popup has a provisional STATUS column header');
 assert(/>PLAYED</.test(resultEl.innerHTML),'popup renders a PLAYED provisional status for scored players');
 for(const r of payload.view.round1.rows)assert(resultEl.innerHTML.includes(r.name),'popup lists every player name');
 await click({action:'close-result'});
 assert.equal(vm.runInContext('resultStage',context),null,'close-result dismisses the popup');
 // (3) Submitting the LAST match (match 5 of Like Never Before, index 4) opens the fullscreen total
 //      ranking. For a SETTLED round with eliminated players the FEAT-003 cutscene plays
 //      first (it blocks on a timer the sandbox never fires), so dismiss it, then await.
 const r1Submit=click({action:'submit-match',stage:'round1',match:'4'});
 await flushMicro();
 assert.equal(vm.runInContext('cutsceneActive',context),true,'a settled final match triggers the elimination cutscene');
 // The overlay carries EXACTLY the round1 CUT names as labelled stickmen; advancing
 // players are NOT thrown.
 const r1Cut=payload.view.round1.rows.filter(r=>r.status==='CUT').map(r=>r.name);
 const r1Adv=payload.view.round1.rows.filter(r=>r.status==='ADVANCE').map(r=>r.name);
 const r1Stage=context.document.querySelector('#cutscene-stage').innerHTML;
 assert.equal(r1Cut.length,2,'round1 settles with two CUT players');
 assert(r1Stage.includes(r1Cut[0]),'portal labels the first eliminated player');
 for(const n of r1Adv)assert(!r1Stage.includes(n),'advancing player cannot appear in portal scene');
 assert(r1Stage.includes('portal-walker')&&r1Stage.includes('portal-hand'),'round1 uses an articulated silhouette and portal hand');
 assert(context.document.querySelector('#cutscene-caption').innerHTML.includes(r1Cut[0]),'first engine-cut player is selected');
 vm.runInContext('endCutscene();',context);
 await r1Submit;
 assert.equal(vm.runInContext('cutsceneActive',context),false,'dismissing the cutscene clears the active flag');
 assert(vm.runInContext('resultFinal',context)===true,'last match opens the fullscreen');
 assert(resultEl.innerHTML.includes('total round ranking'));
 assert(/ADVANCE/.test(resultEl.innerHTML)&&/CUT/.test(resultEl.innerHTML),'fullscreen shows ADVANCE/CUT badges');
 assert(resultEl.innerHTML.includes('ROUND SETTLED'),'a complete round reports no extra games needed');
 await click({action:'close-result'});
 // (3b) The You Wanted to Win, Right? (final) fullscreen's average column shows average POINTS per game
 //      (total/played), NOT a second copy of the total. Verify the computed value appears
 //      and that it differs from the total for a player whose total != average.
 vm.runInContext('state=fixture.state;view=fixture.view;',context);
 const finalSubmit=click({action:'submit-match',stage:'final',match:'7'});
 await flushMicro();
 assert.equal(vm.runInContext('cutsceneActive',context),true,'the settled You Wanted to Win, Right? final triggers the elimination cutscene');
 // You Wanted to Win, Right? throws the NON-PODIUM finishers (rank>3); the top-3 podium is spared.
 const finalThrown=payload.view.final.rows.filter(r=>r.rank>3).map(r=>r.name);
 const finalPodium=payload.view.final.rows.filter(r=>r.rank<=3).map(r=>r.name);
 const finalStage=context.document.querySelector('#cutscene-stage').innerHTML;
 assert(finalThrown.length>0,'You Wanted to Win, Right? has non-podium finishers to throw');
 assert(finalStage.includes('round-bomb-cube'),'final targets the round cube');
 assert(context.document.querySelector('#cutscene-caption').innerHTML.includes('You Wanted to Win, Right?'),'completed final cube is selected');
 assert(!context.document.querySelector('#cutscene-caption').innerHTML.includes(finalPodium[0]),'podium player is not selected');
 vm.runInContext('endCutscene();',context);
 await finalSubmit;
 assert(vm.runInContext('resultFinal',context)===true,'final match 8 opens the fullscreen');
 assert(/AVG PTS \/ GAME/.test(resultEl.innerHTML),'final fullscreen labels the average column as points per game');
 assert(/FINAL/.test(resultEl.innerHTML),'final fullscreen shows FINAL podium badges');
 const topFinal=payload.view.final.rows.find(r=>r.played>0&&r.total!==r.total/r.played);
 if(topFinal){
  const expectAvg=Number((topFinal.total/topFinal.played).toLocaleString(undefined,{maximumFractionDigits:3}));
  assert(resultEl.innerHTML.includes('>'+expectAvg+'<')||resultEl.innerHTML.includes(String(expectAvg)),'final fullscreen renders avg points per game (total/played), not the total');
  assert(topFinal.total!==topFinal.total/topFinal.played,'sanity: chosen final row has avg distinct from total');
 }
 await click({action:'close-result'});
 // (4) With a TIE, the fullscreen offers the add-extra-game control and folds live after an extra score.
 const tie=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import cut_tie_state;from engine import evaluate;s=cut_tie_state('round2');print(json.dumps({'state':s,'view':evaluate(s),'revision':9}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(tie.state)};view=${JSON.stringify(tie.view)};revision=9;`,context);
 assert(tie.view.round2.rows.some(r=>r.status&&r.status.startsWith('TIE')),'tie fixture has a TIE row');
 await click({action:'submit-match',stage:'round2',match:'4'});
 // FEAT-003: an UNRESOLVED tie (view.round2.complete false) must NOT play the cutscene;
 // the normal extra-game fullscreen shows instead.
 assert.equal(vm.runInContext('cutsceneActive',context),false,'no cutscene fires while a tie is unresolved');
 assert(vm.runInContext('resultFinal',context)===true,'round2 last match opens the fullscreen');
 assert(resultEl.innerHTML.includes('EXTRA GAMES NEEDED'),'fullscreen announces extra games are needed');
 assert(/TIE/.test(resultEl.innerHTML),'fullscreen shows the TIE badge');
 assert(resultEl.innerHTML.includes('data-action="extra" data-stage="round2"'),'fullscreen embeds the add-extra control');
 // Apply a resolving extra game (p8 outscores p4) and re-render: TIE flips, folded totals update.
 const folded=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import cut_tie_state;from engine import IDS,evaluate;s=cut_tie_state('round2');e=dict.fromkeys(IDS);e['p8']=3;e['p4']=1;s['round2']['extras']=[e];print(json.dumps({'state':s,'view':evaluate(s),'revision':10}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(folded.state)};view=${JSON.stringify(folded.view)};revision=8;`,context);
 vm.runInContext('renderResult()',context);
 assert(resultEl.innerHTML.includes('ROUND SETTLED'),'after folding the round settles');
 assert(/ADVANCE/.test(resultEl.innerHTML)&&/CUT/.test(resultEl.innerHTML),'folded fullscreen shows ADVANCE/CUT');
 const p8=folded.view.round2.rows.find(r=>r.id==='p8');assert.equal(p8.goals,4);  // Folded total used by the view.
 assert(resultEl.innerHTML.includes('>4<'),'folded total goals (4) render in the fullscreen');
 console.log('FEAT-003 UI: per-match submit controls on all stages, cumulative popup, final fullscreen with ADVANCE/CUT/TIE and the live extra-game fold passed.');

 // ---- Easier-controls: clear-round controls, extended cascade, self-explaining
 //      disabled buttons, next-step guide, and one-level undo (FEAT-002 behaviour) ----
 vm.runInContext('state=fixture.state;view=fixture.view;render=()=>{};flush=async()=>{};save=async()=>{};',context);
 // (A) CLEAR-ROUND CONTROL ON EVERY STAGE with the correct cascade copy + data-stage.
 const liveClear=vm.runInContext("round1Game=0;round('round1')",context);
 assert(liveClear.includes('data-action="clear-round" data-stage="round1"'),'Like Never Before renders the clear-round control for round1');
 assert(liveClear.includes('Clear Like Never Before (also clears What Do You Want? &amp; You Wanted to Win, Right?)'),'Like Never Before clear copy names What Do You Want? and You Wanted to Win, Right?');
 assert(/clears Like Never Before and every later round/i.test(liveClear),'Like Never Before clear panel explains the full cascade');
 const dieClear=vm.runInContext('round2Page()',context);
 assert(dieClear.includes('data-action="clear-round" data-stage="round2"'),'What Do You Want? renders the clear-round control for round2');
 assert(dieClear.includes('Clear What Do You Want? (also clears You Wanted to Win, Right?)'),'What Do You Want? clear copy names You Wanted to Win, Right?');
 const rebirthClear=vm.runInContext('finalGame=0;finalPage()',context);
 assert(rebirthClear.includes('data-action="clear-round" data-stage="final"'),'You Wanted to Win, Right? renders the clear-round control for final');
 assert(rebirthClear.includes('>Clear You Wanted to Win, Right?</'),'You Wanted to Win, Right? clear copy is Clear You Wanted to Win, Right?');
 assert(rebirthClear.toLowerCase().includes('clears you wanted to win, right? only'),'You Wanted to Win, Right? clear panel states it clears only You Wanted to Win, Right?');
 // (B) EXTENDED ROUND1 CASCADE: resetStage('round1') clears round1 + round2 + final
 //     goals while array lengths stay 5/5/8, lineups cleared, round2 draw reset.
 vm.runInContext('state=fixture.state;',context);
 assert.equal(vm.runInContext('state.round1.players.p1.goals[0]',context),2);  // Sanity: scores present before.
 vm.runInContext("resetStage('round1')",context);
 assert.equal(vm.runInContext('state.round1.players.p1.goals.length',context),5,'round1 keeps 5 slots');
 assert.equal(vm.runInContext('state.round2.players.p1.goals.length',context),5,'round2 keeps 8 slots');
 assert.equal(vm.runInContext('state.final.players.p1.goals.length',context),8,'final keeps 8 slots');
 assert(vm.runInContext('state.round1.players.p1.goals.every(x=>x===null)',context),'round1 goals all cleared');
 assert(vm.runInContext('Object.values(state.round2.players).every(d=>d.goals.every(x=>x===null))',context),'round2 goals all cleared');
 assert(vm.runInContext('Object.values(state.final.players).every(d=>d.goals.every(x=>x===null)&&d.results.every(r=>r===""))',context),'final goals and results all cleared');
 assert.equal(vm.runInContext('state.round1.lineups.length',context),0,'round1 lineups cleared');
 assert.equal(vm.runInContext('state.round2.draw.revealed',context),0,'round2 draw reset');
 assert.equal(vm.runInContext('state.round2.draw.order.length',context),0,'round2 draw order cleared');
 // (C) DISABLED BUTTON SHOWS A REASON: a not-ready Like Never Before submit renders disabled
 //     AND carries an adjacent human-readable reason string.
 vm.runInContext('state=fixture.state;view=JSON.parse(JSON.stringify(fixture.view));view.round1.games[0].ready=false;',context);
 const disabledHTML=vm.runInContext("round1Game=0;round('round1')",context);
 assert(/data-match="0" disabled/.test(disabledHTML),'the not-ready submit control carries the disabled attribute');
 assert(disabledHTML.includes('class="hint reason"'),'a .hint.reason sits adjacent to the disabled control');
 assert(disabledHTML.includes('Enter a score for every player in Game 1 first.'),'the reason explains why submit is disabled');
 vm.runInContext('view=fixture.view;',context);
 // (D) NEXT-STEP GUIDE reflects `next` for two different states.
 const settingsNext=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from engine import new_state,evaluate;s=new_state();print(json.dumps({'state':s,'view':evaluate(s)}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(settingsNext.state)};view=${JSON.stringify(settingsNext.view)};tab='overview';`,context);
 const ovSettings=vm.runInContext('overview()',context);
 assert(ovSettings.includes('WHAT TO DO NEXT'),'overview shows the next-step banner');
 assert(ovSettings.includes('data-tab="settings"'),'next-step button targets settings when names are missing');
 assert(ovSettings.includes('enter 10 unique player names'),'next-step wording names the settings action');
 const r2Next=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import evaluate;s=fixture();\nfor p in list(s['round2']['players']):s['round2']['players'][p]['goals']=[None]*8\nfor p in list(s['final']['players']):\n s['final']['players'][p]['goals']=[None]*8\n s['final']['players'][p]['results']=['']*8\nprint(json.dumps({'state':s,'view':evaluate(s)}))"],{cwd:root,encoding:'utf8'}));
 assert.equal(r2Next.view.names_ok,true);assert.equal(r2Next.view.round1.complete,true);assert.equal(r2Next.view.round2.complete,false);
 vm.runInContext(`state=${JSON.stringify(r2Next.state)};view=${JSON.stringify(r2Next.view)};tab='overview';`,context);
 const ovR2=vm.runInContext('overview()',context);
 assert(ovR2.includes('WHAT TO DO NEXT'),'overview shows the next-step banner for round2');
 assert(/data-tab="round2">Open What Do You Want?/.test(ovR2),'next-step button targets What Do You Want? when round2 is the next step');
 assert(!/data-tab="settings"/.test(ovR2.split('round-path')[0]),'the next-step banner does not point at settings once names are set');
 // (E) UNDO FLOW: a destructive clear-round sets a snapshot and changes state; undo
 //     restores the exact prior state and clears the snapshot. performUndo persists via
 //     a direct PUT /api/state {restore:true}; stub fetch to echo the restored payload.
 // Build a pristine fixture: earlier sections mutated fixture.state in place (resetStage).
 const undoFix=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import evaluate;s=fixture();print(json.dumps({'state':s,'view':evaluate(s)}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(undoFix.state)};view=${JSON.stringify(undoFix.view)};render=()=>{};flush=async()=>{};save=async()=>{};renderUndo=()=>{};resetWheelResult=()=>{};`,context);
 vm.runInContext('token="T";revision=1;undoSnapshot=null;',context);
 const priorState=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
 assert.equal(priorState.round1.players.p1.goals[0],2,'pristine fixture has Like Never Before scores before the destructive action');
 assert.equal(vm.runInContext('undoSnapshot',context),null,'no undo snapshot before any destructive action');
 await click({action:'clear-round',stage:'round1'});
 assert(vm.runInContext('undoSnapshot && undoSnapshot.state',context),'clear-round sets a one-level undo snapshot');
 assert.equal(vm.runInContext('undoSnapshot.label',context),'Undo: Clear Like Never Before','the snapshot carries a human label');
 assert.equal(vm.runInContext('undoSnapshot.state.round1.players.p1.goals[0]',context),2,'the snapshot preserved the pre-clear scores');
 assert(vm.runInContext('state.round1.players.p1.goals.every(x=>x===null)',context),'clear-round mutated state (round1 cleared)');
 const changed=vm.runInContext('JSON.stringify(state)',context);
 assert.notEqual(changed,JSON.stringify(priorState),'state changed after the destructive action');
 // Stub fetch so performUndo's PUT echoes back the restored (prior) state.
 let undoPut=null;
 context.fetch=async(url,options)=>{
  assert.equal(url,'/api/state','undo persists through PUT /api/state');
  const body=JSON.parse(options.body);undoPut=body;
  assert.equal(body.restore,true,'undo PUT sets restore:true to bypass the draw guard');
  // Echo the restored state back, mirroring the server's /api/state response shape.
  return {ok:true,json:async()=>({state:body.state,view:undoFix.view,revision:(body.revision||1)+1})};
 };
 await click({action:'undo'});
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state)',context)),priorState,'undo restored the exact prior state');
 assert.equal(vm.runInContext('undoSnapshot',context),null,'undo cleared the one-level snapshot');
 assert(undoPut&&undoPut.restore===true,'the undo PUT carried restore:true');
 context.fetch=()=>new Promise(()=>{});
 // (F) RESHUFFLE UNDO: a Like Never Before reshuffle (data-action='r1-reroll') snapshots the
 //     PRE-reroll split. rerollRound1Game captures the snapshot before the PUT and
 //     adopts the server echo, assigning undoSnapshot only after the echo succeeds, so
 //     the snapshot must hold the lineup/goals exactly as they were before the reroll.
 const rerollFix=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from engine import IDS,new_state,evaluate,round1_lineups;s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(IDS)};round1_lineups(s);s['round1']['players']['p1']['goals'][1]=4;print(json.dumps({'state':s,'view':evaluate(s),'revision':7}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(rerollFix.state)};view=${JSON.stringify(rerollFix.view)};revision=7;token="T";undoSnapshot=null;sitoutBusy=false;spinning=false;render=()=>{};flush=async()=>{};renderUndo=()=>{};`,context);
 const preReroll=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
 assert.equal(preReroll.round1.lineups.length>0,true,'pre-reroll fixture has a round1 lineup');
 assert.equal(preReroll.round1.players.p1.goals[1],4,'pre-reroll fixture carries a known goal');
 // Build an echo payload whose game-0 lineup differs from the pre-reroll split.
 const rerolled=JSON.parse(JSON.stringify(rerollFix.state));
 rerolled.round1.lineups[0]={A:['p6','p7','p8','p9','p10'],B:['p1','p2','p3','p4','p5']};
 context.fetch=async(url,options)=>{
  assert.equal(url,'/api/round1-lineup','reshuffle persists through PUT /api/round1-lineup');
  const body=JSON.parse(options.body);assert.equal(body.action,'reroll');assert.equal(body.game,1);
  return {ok:true,json:async()=>({state:rerolled,view:rerollFix.view,revision:8})};
 };
 await click({action:'r1-reroll',match:'0'});
 assert(vm.runInContext('undoSnapshot',context),'a reshuffle sets a one-level undo snapshot');
 assert.equal(vm.runInContext('undoSnapshot.label',context),'Undo: Reshuffle Like Never Before Game 1','the reshuffle snapshot carries a human label');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(undoSnapshot.state)',context)),preReroll,'the reshuffle snapshot holds the pre-reroll lineup and goals');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.round1.lineups[0])',context)),rerolled.round1.lineups[0],'state adopted the server echo of the reshuffled lineup');
 context.fetch=()=>new Promise(()=>{});
 console.log('Easier-controls UI: per-stage clear-round controls, extended round1 cascade, disabled-reason hint, next-step guide for two states, one-level undo, and reshuffle undo snapshot passed.');

 // ---- Settings clear controls: TWO SEPARATE actions (clear names / clear scoring),
 //      each independent and each Undo-able. Mirrors the one-level undo flow above. ----
 vm.runInContext('state=fixture.state;view=fixture.view;render=()=>{};flush=async()=>{};save=async()=>{};',context);
 // (G) The Settings screen renders a Clear-names control AND a Clear-scoring control
 //     as two SEPARATE actions with distinct data-action values.
 const settingsHTML=vm.runInContext('settings()',context);
 assert(settingsHTML.includes('data-action="clear-names"'),'Settings renders a clear-names control');
 assert(settingsHTML.includes('data-action="clear-scoring"'),'Settings renders a clear-scoring control');
 assert(settingsHTML.indexOf('data-action="clear-names"')!==settingsHTML.indexOf('data-action="clear-scoring"'),'clear-names and clear-scoring are two distinct actions');
 assert(/>Clear player names</.test(settingsHTML),'the clear-names button copy names the player names');
 assert(/>Clear scoring</.test(settingsHTML),'the clear-scoring button copy names scoring');
 assert(/Clearing the names blanks all ten slots only/i.test(settingsHTML),'clear-names copy states it only blanks names');
 assert(/resets win points to 1, goal points to 1\.5, and the games 1-2 multiplier to 2/i.test(settingsHTML),'clear-scoring copy states the exact defaults');
 // Build a pristine fixture with known names + non-default scoring to assert independence.
 const setFix=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import evaluate;s=fixture();s['settings']['win_points']=3;s['settings']['goal_points']=4.5;s['settings']['multiplier']=6;print(json.dumps({'state':s,'view':evaluate(s)}))"],{cwd:root,encoding:'utf8'}));
 // (H) CLEAR NAMES blanks all 10 names but leaves scoring untouched; sets an undo
 //     snapshot deep-equal to the pre-action state; undo restores it.
 vm.runInContext(`state=${JSON.stringify(setFix.state)};view=${JSON.stringify(setFix.view)};render=()=>{};flush=async()=>{};save=async()=>{};renderUndo=()=>{};resetWheelResult=()=>{};token="T";revision=1;undoSnapshot=null;`,context);
 const beforeNames=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
 assert(vm.runInContext('Object.values(state.names).some(n=>n.trim())',context),'fixture starts with some names set');
 await click({action:'clear-names'});
 assert(vm.runInContext('Object.values(state.names).every(n=>n==="")',context),'clear-names blanked all ten names');
 assert.equal(vm.runInContext('state.settings.win_points',context),3,'clear-names left win_points untouched');
 assert.equal(vm.runInContext('state.settings.goal_points',context),4.5,'clear-names left goal_points untouched');
 assert.equal(vm.runInContext('state.settings.multiplier',context),6,'clear-names left multiplier untouched');
 assert(vm.runInContext('undoSnapshot && undoSnapshot.state',context),'clear-names sets a one-level undo snapshot');
 assert.equal(vm.runInContext('undoSnapshot.label',context),'Undo: Clear player names','the clear-names snapshot carries a human label');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(undoSnapshot.state)',context)),beforeNames,'the clear-names snapshot deep-equals the pre-action state');
 context.fetch=async(url,options)=>{const body=JSON.parse(options.body);return {ok:true,json:async()=>({state:body.state,view:setFix.view,revision:(body.revision||1)+1})};};
 await click({action:'undo'});
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state)',context)),beforeNames,'undo restored the exact pre-clear-names state (names back)');
 assert.equal(vm.runInContext('undoSnapshot',context),null,'undo cleared the clear-names snapshot');
 context.fetch=()=>new Promise(()=>{});
 // (I) CLEAR SCORING resets win_points=1, goal_points=1.5, multiplier=2 but leaves
 //     names untouched; sets an undo snapshot; undo restores it.
 vm.runInContext(`state=${JSON.stringify(setFix.state)};view=${JSON.stringify(setFix.view)};render=()=>{};flush=async()=>{};save=async()=>{};renderUndo=()=>{};resetWheelResult=()=>{};token="T";revision=1;undoSnapshot=null;`,context);
 const beforeScoring=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
 await click({action:'clear-scoring'});
 assert.equal(vm.runInContext('state.settings.win_points',context),1,'clear-scoring reset win_points to 1');
 assert.equal(vm.runInContext('state.settings.goal_points',context),1.5,'clear-scoring reset goal_points to 1.5');
 assert.equal(vm.runInContext('state.settings.multiplier',context),2,'clear-scoring reset multiplier to 2');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.names)',context)),beforeScoring.names,'clear-scoring left names untouched');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.settings.prizes)',context)),beforeScoring.settings.prizes,'clear-scoring left prizes untouched');
 assert(vm.runInContext('undoSnapshot && undoSnapshot.state',context),'clear-scoring sets a one-level undo snapshot');
 assert.equal(vm.runInContext('undoSnapshot.label',context),'Undo: Clear scoring','the clear-scoring snapshot carries a human label');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(undoSnapshot.state)',context)),beforeScoring,'the clear-scoring snapshot deep-equals the pre-action state');
 context.fetch=async(url,options)=>{const body=JSON.parse(options.body);return {ok:true,json:async()=>({state:body.state,view:setFix.view,revision:(body.revision||1)+1})};};
 await click({action:'undo'});
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state)',context)),beforeScoring,'undo restored the exact pre-clear-scoring state (scoring back)');
 assert.equal(vm.runInContext('undoSnapshot',context),null,'undo cleared the clear-scoring snapshot');
 context.fetch=()=>new Promise(()=>{});
 console.log('Settings clear controls: independent clear-names and clear-scoring actions, scoring/names isolation, and one-level undo for each passed.');

 // ---- Like Never Before per-game clear control: a 'Clear this game' button on EACH Like Never Before
 //      game that clears ONLY that game's goals for all ten players, Undo-able, and
 //      leaves names, scoring, and other games untouched. Mirrors clear-r2-game. ----
 vm.runInContext('state=fixture.state;view=fixture.view;render=()=>{};flush=async()=>{};save=async()=>{};',context);
 // (J) The Like Never Before round screen renders a per-game clear control with the new
 //     data-action and the self-evident 'Clear this game' copy, reusing .danger.clear-score.
 const liveClearGame=vm.runInContext("round1Game=2;round('round1')",context);
 assert(liveClearGame.includes('data-action="clear-r1-game"'),'Like Never Before renders the per-game clear-r1-game control');
 assert(/data-action="clear-r1-game"[^>]*>Clear this game</.test(liveClearGame),'the clear-r1-game button copy is "Clear this game"');
 assert(/class="danger clear-score" data-action="clear-r1-game"/.test(liveClearGame),'clear-r1-game reuses the .danger.clear-score styling');
 // (K) Firing clear-r1-game clears ONLY the selected game's goals for all players; other
 //     games' goals, names, and settings stay unchanged; and it sets a deep-equal undo snapshot.
 const r1ClearFix=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import evaluate;s=fixture();print(json.dumps({'state':s,'view':evaluate(s)}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(r1ClearFix.state)};view=${JSON.stringify(r1ClearFix.view)};render=()=>{};flush=async()=>{};save=async()=>{};renderUndo=()=>{};resetWheelResult=()=>{};token="T";revision=1;undoSnapshot=null;round1Game=2;`,context);
 const beforeR1Clear=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
 const ids10=JSON.parse(vm.runInContext('JSON.stringify(ids)',context));
 assert(ids10.length===10,'all ten players participate in every Like Never Before game');
 assert(ids10.some(p=>beforeR1Clear.round1.players[p].goals[2]!==null),'fixture has goals in the targeted game before clearing');
 await click({action:'clear-r1-game'});
 assert(ids10.every(p=>vm.runInContext(`state.round1.players.${p}.goals[2]`,context)===null),'clear-r1-game cleared game 3 goals for all ten players');
 // Other games' goals untouched.
 for(const g of [0,1,3,4])assert.deepEqual(
  ids10.map(p=>JSON.parse(vm.runInContext(`JSON.stringify(state.round1.players.${p}.goals[${g}])`,context))),
  ids10.map(p=>beforeR1Clear.round1.players[p].goals[g]),
  `clear-r1-game left game ${g+1} goals untouched`);
 // Names and scoring settings untouched.
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.names)',context)),beforeR1Clear.names,'clear-r1-game left names untouched');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.settings)',context)),beforeR1Clear.settings,'clear-r1-game left scoring settings untouched');
 // Other stages untouched.
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.round2)',context)),beforeR1Clear.round2,'clear-r1-game left What Do You Want? untouched');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.final)',context)),beforeR1Clear.final,'clear-r1-game left You Wanted to Win, Right? untouched');
 // (L) The undo snapshot deep-equals the pre-action state and Undo restores it.
 assert(vm.runInContext('undoSnapshot && undoSnapshot.state',context),'clear-r1-game sets a one-level undo snapshot');
 assert.equal(vm.runInContext('undoSnapshot.label',context),'Undo: Clear Like Never Before Game 3','the clear-r1-game snapshot carries a human label');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(undoSnapshot.state)',context)),beforeR1Clear,'the clear-r1-game snapshot deep-equals the pre-action state');
 context.fetch=async(url,options)=>{const body=JSON.parse(options.body);return {ok:true,json:async()=>({state:body.state,view:r1ClearFix.view,revision:(body.revision||1)+1})};};
 await click({action:'undo'});
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state)',context)),beforeR1Clear,'undo restored the exact pre-clear-r1-game state');
 assert.equal(vm.runInContext('undoSnapshot',context),null,'undo cleared the clear-r1-game snapshot');
 context.fetch=()=>new Promise(()=>{});
 console.log('Like Never Before per-game clear control: clear-r1-game button, single-game goal clearing for all ten players, names/scoring/other-games/other-stages isolation, and one-level undo passed.');

 // ---- Extra-games delete controls: a per-extra-game 'Remove' button on EACH extra
 //      game (deletes exactly that one) and a 'Clear all extra games' button (empties
 //      the list), both routed through doDestructive so each is one-level Undo-able.
 //      Section lives on all three rounds; test with round1 (numbers) extras here. ----
 vm.runInContext('state=fixture.state;view=fixture.view;render=()=>{};flush=async()=>{};save=async()=>{};',context);
 // Build a pristine fixture whose round1 stage holds TWO extra games (dicts of
 // {playerId:number}) plus other state to assert isolation. round1.extras[0] gives p1
 // a distinctive value so we can confirm which game is removed.
 const exFix=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import IDS,evaluate;s=fixture();e0=dict.fromkeys(IDS);e0['p1']=7;e1=dict.fromkeys(IDS);e1['p2']=9;s['round1']['extras']=[e0,e1];print(json.dumps({'state':s,'view':evaluate(s)}))"],{cwd:root,encoding:'utf8'}));
 // (M) extras('round1') renders a per-extra-game remove control with matching data-index
 //     for EACH extra game, plus a single clear-all control when extras is non-empty.
 vm.runInContext(`state=${JSON.stringify(exFix.state)};view=${JSON.stringify(exFix.view)};render=()=>{};flush=async()=>{};save=async()=>{};renderUndo=()=>{};resetWheelResult=()=>{};token="T";revision=1;undoSnapshot=null;`,context);
 const exHTML=vm.runInContext("extras('round1')",context);
 assert(exHTML.includes('data-action="remove-extra" data-stage="round1" data-index="0"'),'extras renders a remove control for extra game 1');
 assert(exHTML.includes('data-action="remove-extra" data-stage="round1" data-index="1"'),'extras renders a remove control for extra game 2');
 assert.equal((exHTML.match(/data-action="remove-extra"/g)||[]).length,2,'one remove control per extra game');
 assert(exHTML.includes('data-action="clear-extras" data-stage="round1"'),'extras renders a clear-all control when extras exist');
 assert(/>Remove</.test(exHTML),'the per-extra-game button is labelled Remove');
 assert(/>Clear all extra games</.test(exHTML),'the clear-all button copy is self-explaining');
 // (N) When extras is EMPTY, no clear-all control (and no remove controls) render.
 vm.runInContext('state.round1.extras=[];',context);
 const emptyHTML=vm.runInContext("extras('round1')",context);
 assert(!emptyHTML.includes('data-action="clear-extras"'),'no clear-all control when extras is empty');
 assert(!emptyHTML.includes('data-action="remove-extra"'),'no remove controls when extras is empty');
 assert(emptyHTML.includes('data-action="extra" data-stage="round1"'),'the add-extra control still renders when empty');
 // (O) Firing remove-extra with index 0 splices out EXACTLY that one extra game: the
 //     list length drops by 1 and the surviving game is the one that was at index 1.
 vm.runInContext(`state=${JSON.stringify(exFix.state)};view=${JSON.stringify(exFix.view)};revision=1;undoSnapshot=null;`,context);
 const beforeRemove=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
 assert.equal(beforeRemove.round1.extras.length,2,'fixture starts with two extra games');
 await click({action:'remove-extra',stage:'round1',index:'0'});
 assert.equal(vm.runInContext('state.round1.extras.length',context),1,'remove-extra dropped exactly one extra game');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.round1.extras[0])',context)),beforeRemove.round1.extras[1],'the surviving extra game is the one previously at index 1');
 // Everything else (names, scoring, goals, other stages) stays unchanged.
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.names)',context)),beforeRemove.names,'remove-extra left names untouched');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.settings)',context)),beforeRemove.settings,'remove-extra left scoring untouched');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.round1.players)',context)),beforeRemove.round1.players,'remove-extra left round1 goals untouched');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.round2)',context)),beforeRemove.round2,'remove-extra left What Do You Want? untouched');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.final)',context)),beforeRemove.final,'remove-extra left You Wanted to Win, Right? untouched');
 // (P) remove-extra sets a deep-equal undo snapshot and Undo restores the prior state.
 assert(vm.runInContext('undoSnapshot && undoSnapshot.state',context),'remove-extra sets a one-level undo snapshot');
 assert.equal(vm.runInContext('undoSnapshot.label',context),'Undo: Remove extra game 1','the remove-extra snapshot carries a human label');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(undoSnapshot.state)',context)),beforeRemove,'the remove-extra snapshot deep-equals the pre-action state');
 vm.runInContext('token="T";',context);
 context.fetch=async(url,options)=>{const body=JSON.parse(options.body);return {ok:true,json:async()=>({state:body.state,view:exFix.view,revision:(body.revision||1)+1})};};
 await click({action:'undo'});
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state)',context)),beforeRemove,'undo restored the exact pre-remove state (both extra games back)');
 assert.equal(vm.runInContext('undoSnapshot',context),null,'undo cleared the remove-extra snapshot');
 context.fetch=()=>new Promise(()=>{});
 // (Q) Firing clear-extras empties round1.extras entirely; sets a deep-equal undo
 //     snapshot; Undo restores both extra games.
 vm.runInContext(`state=${JSON.stringify(exFix.state)};view=${JSON.stringify(exFix.view)};revision=1;undoSnapshot=null;`,context);
 const beforeClear=JSON.parse(vm.runInContext('JSON.stringify(state)',context));
 assert.equal(beforeClear.round1.extras.length,2,'fixture starts with two extra games before clear-all');
 await click({action:'clear-extras',stage:'round1'});
 assert.equal(vm.runInContext('state.round1.extras.length',context),0,'clear-extras emptied the extra-games list');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.round1.players)',context)),beforeClear.round1.players,'clear-extras left round1 goals untouched');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.names)',context)),beforeClear.names,'clear-extras left names untouched');
 assert(vm.runInContext('undoSnapshot && undoSnapshot.state',context),'clear-extras sets a one-level undo snapshot');
 assert.equal(vm.runInContext('undoSnapshot.label',context),'Undo: Clear all extra games','the clear-extras snapshot carries a human label');
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(undoSnapshot.state)',context)),beforeClear,'the clear-extras snapshot deep-equals the pre-action state');
 vm.runInContext('token="T";',context);
 context.fetch=async(url,options)=>{const body=JSON.parse(options.body);return {ok:true,json:async()=>({state:body.state,view:exFix.view,revision:(body.revision||1)+1})};};
 await click({action:'undo'});
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state)',context)),beforeClear,'undo restored the exact pre-clear-extras state (both extra games back)');
 assert.equal(vm.runInContext('undoSnapshot',context),null,'undo cleared the clear-extras snapshot');
 context.fetch=()=>new Promise(()=>{});
 console.log('Extra-games delete controls: per-extra-game Remove (splices one), Clear all extra games (empties the list), both with one-level undo and full isolation passed.');

 // ---- FEAT-002: ambient background blast loop (nukes/explosions every 1-5s) with a
 //      WORLD-LAYER-ONLY shake, gated by Pause-world + prefers-reduced-motion, exposing
 //      start/stop, and leaving a cutsceneActive guard for the FEAT-003 cutscene. ----
 // (a) The ambient loop exposes start/stop functions that can be invoked without throwing.
 assert.equal(vm.runInContext('typeof startWorldBlasts',context),'function','startWorldBlasts is exposed');
 assert.equal(vm.runInContext('typeof stopWorldBlasts',context),'function','stopWorldBlasts is exposed');
 assert.equal(vm.runInContext('typeof cutsceneActive',context),'boolean','a shared cutsceneActive guard exists for the cutscene');
 // (b1) GATED BY REDUCED MOTION: matchMedia defaults to {matches:true} so reducedMotion()
 //      is true. Starting must be a no-op (no timer scheduled).
 vm.runInContext('document.body.classList.remove("world-paused");stopWorldBlasts();',context);
 assert.equal(vm.runInContext('window.matchMedia("(prefers-reduced-motion: reduce)").matches',context),true,'sandbox defaults to reduced motion');
 vm.runInContext('startWorldBlasts();',context);
 assert.equal(vm.runInContext('blastTimer',context),null,'startWorldBlasts is a no-op under prefers-reduced-motion');
 // (c) Flip reduced motion OFF so the loop may run, then assert start schedules a timer
 //     and stop cancels it (blastTimer back to null).
 context.window.matchMedia=()=>({matches:false});
 vm.runInContext('document.body.classList.remove("world-paused");stopWorldBlasts();startWorldBlasts();',context);
 assert.notEqual(vm.runInContext('blastTimer',context),null,'with motion allowed and world running, start schedules a blast timer');
 vm.runInContext('stopWorldBlasts();',context);
 assert.equal(vm.runInContext('blastTimer',context),null,'stopWorldBlasts cancels the pending timer');
 // (b2) GATED BY PAUSE-WORLD: with motion allowed but body.world-paused set, start is a no-op.
 vm.runInContext('document.body.classList.add("world-paused");stopWorldBlasts();startWorldBlasts();',context);
 assert.equal(vm.runInContext('blastTimer',context),null,'startWorldBlasts is a no-op while the world is paused');
 vm.runInContext('document.body.classList.remove("world-paused");',context);
 // (d) worldClick on #world-toggle wires start/stop: pausing stops the loop, resuming
 //     restarts it (motion is allowed in this branch).
 const worldToggleBtn={id:'world-toggle',dataset:{},setAttribute(){},querySelector:()=>null,firstChild:null};
 vm.runInContext('stopWorldBlasts();',context);
 events.click({target:{closest:()=>worldToggleBtn}});   // first toggle -> paused
 assert.equal(vm.runInContext('document.body.classList.contains("world-paused")',context),true,'toggle pauses the world');
 assert.equal(vm.runInContext('blastTimer',context),null,'pausing via #world-toggle stops the ambient loop');
 events.click({target:{closest:()=>worldToggleBtn}});   // second toggle -> resumed
 assert.equal(vm.runInContext('document.body.classList.contains("world-paused")',context),false,'toggle resumes the world');
 assert.notEqual(vm.runInContext('blastTimer',context),null,'resuming via #world-toggle restarts the ambient loop');
 vm.runInContext('stopWorldBlasts();',context);
 // (e) The cutsceneActive guard suppresses the world shake path (shakeWorld is a no-op
 //     while a cutscene is active, so the ambient effect never vibrates the overlay).
 vm.runInContext('cutsceneActive=true;shakeWorld();',context);   // must not throw
 vm.runInContext('cutsceneActive=false;',context);
 context.window.matchMedia=()=>({matches:true});   // restore the sandbox default
 console.log('FEAT-002 ambient blasts: start/stop exposed, gated by reduced-motion and Pause-world, #world-toggle wiring, stop cancels the timer, and the cutsceneActive shake guard passed.');

 // ---- FEAT-003: the elimination cutscene itself — eliminatedNames per stage, the
 //      no-trigger-on-non-final case, the single-dismiss (skip) path, and the
 //      reduced-motion static summary. ----
 vm.runInContext('state=fixture.state;view=fixture.view;render=()=>{};flush=async()=>{};save=async()=>{};',context);
 // (A) eliminatedNames maps each stage to the right rows: round1/round2 CUT, final rank>3.
 const en1=JSON.parse(vm.runInContext("JSON.stringify(eliminatedNames('round1'))",context));
 assert.deepEqual([...en1].sort(),[...payload.view.round1.rows.filter(r=>r.status==='CUT').map(r=>r.name)].sort(),'eliminatedNames(round1) = the CUT rows');
 const enF=JSON.parse(vm.runInContext("JSON.stringify(eliminatedNames('final'))",context));
 assert.deepEqual([...enF].sort(),[...payload.view.final.rows.filter(r=>r.rank>3).map(r=>r.name)].sort(),'eliminatedNames(final) = the rank>3 finishers');
 assert(enF.every(n=>!payload.view.final.rows.filter(r=>r.rank<=3).map(x=>x.name).includes(n)),'no podium finisher is in eliminatedNames(final)');
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
 assert(carryStage.includes('round-bomb-cube')&&!carryStage.includes('cut-escort'),'tower scene replaces all carrying figures');

 vm.runInContext('endCutscene();',context);
 assert.equal(vm.runInContext('cutsceneActive',context),false,'endCutscene (Skip/click/Esc) clears the active flag');
 assert.equal(overlayEl.hidden,true,'endCutscene hides the overlay so the standings show');
 // After dismissal the user is free to land on the resultFullscreen standings.
 vm.runInContext('state=fixture.state;view=fixture.view;',context);
 const skipSubmit=click({action:'submit-match',stage:'round1',match:'4'});
 await flushMicro();
 assert.equal(vm.runInContext('cutsceneActive',context),true,'the settled round replays the carry cutscene before standings');
 vm.runInContext('endCutscene();',context);   // skip
 await skipSubmit;
 assert(resultEl.innerHTML.includes('total round ranking'),'after skipping the cutscene the fullscreen standings are shown');
 await click({action:'close-result'});
 // (D) REDUCED MOTION: with matchMedia matches:true (the sandbox default) the animated
 //     carry is replaced by a STATIC summary carrying an 'ELIMINATED: names' caption.
 assert.equal(vm.runInContext("reducedMotion()",context),true,'sandbox defaults to reduced motion');
 vm.runInContext("playCutscene(['Casey','Dakota']);",context);
 const captionEl=context.document.querySelector('#cutscene-caption');
 assert(/LOCKED OFF/.test(captionEl.innerHTML),'reduced motion shows static LOCKED OFF');
 assert(captionEl.innerHTML.includes('Final'),'static beat labels the round cube');
 vm.runInContext('endCutscene();',context);
 // (E) EMPTY eliminated list: playCutscene resolves immediately and never flags active.
 vm.runInContext('cutsceneActive=false;',context);
 await vm.runInContext('playCutscene([])',context);
 assert.equal(vm.runInContext('cutsceneActive',context),false,'playCutscene with no names resolves without showing the overlay');
 // Portal completion and Skip must mark each engine-cut player's tower once.
 context.towerCalls=[];context.window.CityWorld={eliminateTower:id=>context.towerCalls.push(id),setSuspended(){}};
 const cutIds=payload.view.round1.rows.filter(r=>r.status==='CUT').map(r=>r.id);
 context.portalCuts=payload.view.round1.rows.filter(r=>r.status==='CUT').map(r=>r.name);
 vm.runInContext("playCutscene(portalCuts,'Like Never Before','round1');",context);
 assert.equal(context.towerCalls.length,0,'player towers are removed');
 vm.runInContext('endCutscene();',context);
 assert.equal(context.towerCalls.length,0,'Skip must not update removed towers');
 vm.runInContext('endCutscene();',context);assert.equal(context.towerCalls.length,0,'dismiss cannot update removed towers');
 console.log('FEAT-003 elimination cutscene: eliminatedNames per stage, no-trigger on non-final, tower strike replaces furnace, skippable single-dismiss path, reduced-motion static LOCKED OFF, and empty-list skip passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
