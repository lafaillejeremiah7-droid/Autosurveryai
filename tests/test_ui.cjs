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
const element=()=>({dataset:{},scrollTop:0,innerHTML:'',textContent:'',open:false,classList:{toggle(){},remove(){},add(){}},addEventListener(){},focus(){},appendChild(e){e.parentElement=this;},showModal(){this.open=true;},close(){this.open=false;},animate(){return {finished:Promise.resolve()};},querySelector(){return null;}});
const document={querySelector:s=>elements[s]??=(element()),querySelectorAll:()=>[],addEventListener:(type,fn)=>events[type]=fn,body:element()};
const context={document,window:{addEventListener(){},matchMedia:()=>({matches:true})},fetch:()=>new Promise(()=>{}),setTimeout:()=>1,clearTimeout(){},setInterval(){},console,fixture:payload,confirm:()=>true};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'static/app.js'),'utf8'),context);
vm.runInContext('state=fixture.state;view=fixture.view;',context);
for(let g=0;g<8;g++){
 const html=vm.runInContext(`round2Game=${g};round2Page()`,context);
 const paths=[...html.matchAll(/data-path="round2\.players\.(p\d+)\.goals\.(\d+)"/g)];
 assert.equal(paths.length,6);assert.equal((html.match(/data-r2-game=/g)||[]).length,8);
 assert.deepEqual(paths.map(m=>m[1]).sort(),[...payload.view.round2.schedule[g].A,...payload.view.round2.schedule[g].B].sort());
 assert(paths.every(m=>Number(m[2])===g));assert(html.includes('Overall standings'));assert(!html.includes('undefined'));
}
vm.runInContext("resetStage('round2')",context);
assert.equal(vm.runInContext("state.round2.players.p1.goals.length",context),8);
assert.equal(vm.runInContext("state.final.players.p1.goals.length",context),10);
assert.equal(vm.runInContext("state.round1.players.p1.goals[0]",context),6);
// Exercise actual delegated match-selector and goal-counter handlers.
vm.runInContext('state=fixture.state;render=()=>{};flush=async()=>{};save=async()=>{};',context);
const click=dataset=>events.click({target:{closest:()=>({dataset,disabled:false})}});
(async()=>{
 await click({r2Game:'7'});assert.equal(vm.runInContext('round2Game',context),7);
 const p=payload.view.round2.schedule[7].A[0],target=`round2.players.${p}.goals.7`;
 await click({step:'1',target});assert.equal(vm.runInContext(`value('${target}')`,context),1);
 await click({action:'clear-r2-game'});assert.equal(vm.runInContext(`value('${target}')`,context),null);
 await click({action:'reset-all'});assert.equal(vm.runInContext('state.version',context),4);
 assert.equal(vm.runInContext('state.round2.players.p1.goals.length',context),8);
 const ready=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import Draws;from engine import evaluate,round2_draw_action;s=round2_draw_action(Draws().fresh(),'start');g=evaluate(s)['round2']['schedule'][0];[(s['round2']['players'][p]['goals'].__setitem__(0,0)) for p in g['A']+g['B']];s=round2_draw_action(s,'done',1);print(json.dumps({'state':s,'view':evaluate(s),'revision':2}))"],{cwd:root,encoding:'utf8'}));
 context.responsePayload=ready;context.fetch=async(url,options)=>{assert.equal(url,'/api/round2-draw');const body=JSON.parse(options.body);assert.equal(body.action,'done');assert.equal(body.game,1);return {ok:true,json:async()=>ready};};
 vm.runInContext('animateSitoutPair=async()=>{};',context);
 await click({action:'r2-done',match:'1'});
 assert.equal(vm.runInContext('round2Game',context),1);assert.equal(vm.runInContext('tab',context),'wheel');assert.equal(vm.runInContext('wheelMode',context),'round2');
 const drawHTML=vm.runInContext('sitoutWheelPage()',context);
 for(const p of ready.view.round2.schedule[1].sit)assert(drawHTML.includes(ready.state.names[p]));
 const lockedHTML=vm.runInContext('round2Page()',context);
 assert(lockedHTML.includes('data-r2-game="2" disabled'));assert(lockedHTML.includes('Match 2 of 8 done'));
 const wheelHTML=vm.runInContext("state=fixture.state;wheelMode='round2';sitoutWheelPage()",context);assert(wheelHTML.includes('Two sit out. Six play.'));
 // To Live per-game split model: teams are auto-generated cosmetic 5v5 splits
 // (no wheel assignment, no fixed per-player team). The one Name wheel is just a
 // plain name draw, so there is still no separate round1 wheel mode.
 const r1=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from engine import IDS,new_state,evaluate,round1_lineups;s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(IDS)};round1_lineups(s);s['wheel']['text']='\\n'.join('Player '+str(i+1) for i in range(10));print(json.dumps({'state':s,'view':evaluate(s),'revision':5}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(r1.state)};view=${JSON.stringify(r1.view)};revision=5;wheelMode='free';`,context);
 // (a) No separate 'To Live · team draw' tab in the wheel-mode tabs (still valid).
 const tabsHTML=vm.runInContext('wheelModeTabs()',context);
 assert(!tabsHTML.includes('data-wheel-mode="round1"'));assert(!tabsHTML.includes('team draw'));
 assert(tabsHTML.includes('data-wheel-mode="free"'));assert(tabsHTML.includes('data-wheel-mode="round2"'));
 // (b) To Live screen shows the per-game A/B cosmetic lineup grouping with per-player
 //     goal inputs for the selected game, and NONE of the retired fixed-team controls.
 const r1Round=vm.runInContext("round1Game=0;round('round1')",context);
 assert(r1Round.includes('teams-grid'),'To Live renders the per-game A/B lineup grid');
 assert(r1Round.includes('Team A')&&r1Round.includes('Team B'),'To Live shows both cosmetic teams');
 assert(r1Round.includes('team-score'),'To Live reuses the .team-score grouping');
 const r1Inputs=[...r1Round.matchAll(/data-path="round1\.players\.(p\d+)\.goals\.0"/g)].map(m=>m[1]);
 assert.deepEqual([...new Set(r1Inputs)].sort(),[...payload.view.round1.rows.map(r=>r.id)].sort(),'all ten players have a goal input for the selected game');
 assert(!r1Round.includes('data-path="round1.players.p1.team"')&&!/round1\.players\.\w+\.team/.test(r1Round),'no per-player team select');
 assert(!r1Round.includes('Assign teams'),'no retired Assign-teams panel');
 assert(!r1Round.includes('data-action="r1-reset"')&&!r1Round.includes('data-action="r1-wheel"'),'no retired reset/open-wheel controls');
 assert(r1Round.includes('data-action="r1-reroll"'),'To Live offers the per-game reshuffle control');
 // (c) The retired wheel helpers are gone; spinWheel() is a plain name draw.
 assert.equal(vm.runInContext("typeof round1MatchForName",context),'undefined');
 assert.equal(vm.runInContext("typeof resetRound1Spin",context),'undefined');
 vm.runInContext('render=()=>{};flush=async()=>{};drawWheel=()=>{};performance={now:()=>0};requestAnimationFrame=fn=>fn(0);',context);
 vm.runInContext("crypto={getRandomValues(a){a[0]=6;return a;}};",context);  // Force randomIndex -> entry 6.
 let assignCalls=0;
 context.fetch=async(url)=>{assignCalls++;throw new Error('spinWheel must not call any API: '+url);};
 await vm.runInContext('spinWheel()',context);
 assert.equal(assignCalls,0,'a plain name draw issues no /api/round1-assign (or any) call');
 assert(vm.runInContext("wheelLast&&wheelLast.name",context),'the wheel still surfaces the drawn name');
 console.log('To Live UI: per-game cosmetic A/B splits with ten goal inputs, reshuffle control, no fixed-team wheel/reset/select, plain name draw.');
 console.log('Round 2 UI: all eight lineups, six editable players, game selection, counters, clearing and reset passed.');

 // ---- FEAT-003: per-match submit control, cumulative popup, final fullscreen + extra-game fold ----
 // (1) To Live and Rebirth each render a 'Submit Match N of X' control.
 vm.runInContext('state=fixture.state;view=fixture.view;render=()=>{};flush=async()=>{};save=async()=>{};',context);
 const liveHTML=vm.runInContext("round1Game=0;round('round1')",context);
 assert(liveHTML.includes('Submit Match 1 of 5'),'To Live shows a per-match submit control');
 assert(liveHTML.includes('data-action="submit-match" data-stage="round1" data-match="0"'));
 assert((liveHTML.match(/data-r1-game=/g)||[]).length===5,'To Live has a 5-match selector');
 const rebirthHTML=vm.runInContext('finalGame=0;finalPage()',context);
 assert(rebirthHTML.includes('Submit Match 1 of 10'),'Rebirth shows a per-match submit control');
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
 // (3) Submitting the LAST match (match 5 of To Live, index 4) opens the fullscreen total ranking.
 await click({action:'submit-match',stage:'round1',match:'4'});
 assert(vm.runInContext('resultFinal',context)===true,'last match opens the fullscreen');
 assert(resultEl.innerHTML.includes('total round ranking'));
 assert(/ADVANCE/.test(resultEl.innerHTML)&&/CUT/.test(resultEl.innerHTML),'fullscreen shows ADVANCE/CUT badges');
 assert(resultEl.innerHTML.includes('ROUND SETTLED'),'a complete round reports no extra games needed');
 await click({action:'close-result'});
 // (3b) The Rebirth (final) fullscreen's average column shows average POINTS per game
 //      (total/played), NOT a second copy of the total. Verify the computed value appears
 //      and that it differs from the total for a player whose total != average.
 vm.runInContext('state=fixture.state;view=fixture.view;',context);
 await click({action:'submit-match',stage:'final',match:'9'});
 assert(vm.runInContext('resultFinal',context)===true,'final match 10 opens the fullscreen');
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
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import evaluate;s=fixture();d=s['round2']['players']['p4'];d['goals']=[3 if n is not None else None for n in d['goals']];print(json.dumps({'state':s,'view':evaluate(s),'revision':9}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(tie.state)};view=${JSON.stringify(tie.view)};revision=9;`,context);
 assert(tie.view.round2.rows.some(r=>r.status&&r.status.startsWith('TIE')),'tie fixture has a TIE row');
 await click({action:'submit-match',stage:'round2',match:'7'});
 assert(vm.runInContext('resultFinal',context)===true,'round2 last match opens the fullscreen');
 assert(resultEl.innerHTML.includes('EXTRA GAMES NEEDED'),'fullscreen announces extra games are needed');
 assert(/TIE/.test(resultEl.innerHTML),'fullscreen shows the TIE badge');
 assert(resultEl.innerHTML.includes('data-action="extra" data-stage="round2"'),'fullscreen embeds the add-extra control');
 // Apply a resolving extra game (p8 outscores p4) and re-render: TIE flips, folded totals update.
 const folded=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import IDS,evaluate;s=fixture();d=s['round2']['players']['p4'];d['goals']=[3 if n is not None else None for n in d['goals']];e=dict.fromkeys(IDS);e['p8']=5;e['p4']=1;s['round2']['extras']=[e];print(json.dumps({'state':s,'view':evaluate(s),'revision':10}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(folded.state)};view=${JSON.stringify(folded.view)};revision=10;`,context);
 vm.runInContext('renderResult()',context);
 assert(resultEl.innerHTML.includes('ROUND SETTLED'),'after folding the round settles');
 assert(/ADVANCE/.test(resultEl.innerHTML)&&/CUT/.test(resultEl.innerHTML),'folded fullscreen shows ADVANCE/CUT');
 const p8=folded.view.round2.rows.find(r=>r.id==='p8');assert.equal(p8.goals,23);  // Folded total used by the view.
 assert(resultEl.innerHTML.includes('>23<'),'folded total goals (23) render in the fullscreen');
 console.log('FEAT-003 UI: per-match submit controls on all stages, cumulative popup, final fullscreen with ADVANCE/CUT/TIE and the live extra-game fold passed.');

 // ---- Easier-controls: clear-round controls, extended cascade, self-explaining
 //      disabled buttons, next-step guide, and one-level undo (FEAT-002 behaviour) ----
 vm.runInContext('state=fixture.state;view=fixture.view;render=()=>{};flush=async()=>{};save=async()=>{};',context);
 // (A) CLEAR-ROUND CONTROL ON EVERY STAGE with the correct cascade copy + data-stage.
 const liveClear=vm.runInContext("round1Game=0;round('round1')",context);
 assert(liveClear.includes('data-action="clear-round" data-stage="round1"'),'To Live renders the clear-round control for round1');
 assert(liveClear.includes('Clear To Live (also clears To Die &amp; Rebirth)'),'To Live clear copy names To Die and Rebirth');
 assert(/clears To Live and every later round/i.test(liveClear),'To Live clear panel explains the full cascade');
 const dieClear=vm.runInContext('round2Page()',context);
 assert(dieClear.includes('data-action="clear-round" data-stage="round2"'),'To Die renders the clear-round control for round2');
 assert(dieClear.includes('Clear To Die (also clears Rebirth)'),'To Die clear copy names Rebirth');
 const rebirthClear=vm.runInContext('finalGame=0;finalPage()',context);
 assert(rebirthClear.includes('data-action="clear-round" data-stage="final"'),'Rebirth renders the clear-round control for final');
 assert(/>Clear Rebirth</.test(rebirthClear),'Rebirth clear copy is Clear Rebirth');
 assert(/clears Rebirth only/i.test(rebirthClear),'Rebirth clear panel states it clears only Rebirth');
 // (B) EXTENDED ROUND1 CASCADE: resetStage('round1') clears round1 + round2 + final
 //     goals while array lengths stay 5/8/10, lineups cleared, round2 draw reset.
 vm.runInContext('state=fixture.state;',context);
 assert.equal(vm.runInContext('state.round1.players.p1.goals[0]',context),6);  // Sanity: scores present before.
 vm.runInContext("resetStage('round1')",context);
 assert.equal(vm.runInContext('state.round1.players.p1.goals.length',context),5,'round1 keeps 5 slots');
 assert.equal(vm.runInContext('state.round2.players.p1.goals.length',context),8,'round2 keeps 8 slots');
 assert.equal(vm.runInContext('state.final.players.p1.goals.length',context),10,'final keeps 10 slots');
 assert(vm.runInContext('state.round1.players.p1.goals.every(x=>x===null)',context),'round1 goals all cleared');
 assert(vm.runInContext('Object.values(state.round2.players).every(d=>d.goals.every(x=>x===null))',context),'round2 goals all cleared');
 assert(vm.runInContext('Object.values(state.final.players).every(d=>d.goals.every(x=>x===null)&&d.results.every(r=>r===""))',context),'final goals and results all cleared');
 assert.equal(vm.runInContext('state.round1.lineups.length',context),0,'round1 lineups cleared');
 assert.equal(vm.runInContext('state.round2.draw.revealed',context),0,'round2 draw reset');
 assert.equal(vm.runInContext('state.round2.draw.order.length',context),0,'round2 draw order cleared');
 // (C) DISABLED BUTTON SHOWS A REASON: a not-ready To Live submit renders disabled
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
  "import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import evaluate;s=fixture();\nfor p in list(s['round2']['players']):s['round2']['players'][p]['goals']=[None]*8\nfor p in list(s['final']['players']):\n s['final']['players'][p]['goals']=[None]*10\n s['final']['players'][p]['results']=['']*10\nprint(json.dumps({'state':s,'view':evaluate(s)}))"],{cwd:root,encoding:'utf8'}));
 assert.equal(r2Next.view.names_ok,true);assert.equal(r2Next.view.round1.complete,true);assert.equal(r2Next.view.round2.complete,false);
 vm.runInContext(`state=${JSON.stringify(r2Next.state)};view=${JSON.stringify(r2Next.view)};tab='overview';`,context);
 const ovR2=vm.runInContext('overview()',context);
 assert(ovR2.includes('WHAT TO DO NEXT'),'overview shows the next-step banner for round2');
 assert(/data-tab="round2">Open To Die/.test(ovR2),'next-step button targets To Die when round2 is the next step');
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
 assert.equal(priorState.round1.players.p1.goals[0],6,'pristine fixture has To Live scores before the destructive action');
 assert.equal(vm.runInContext('undoSnapshot',context),null,'no undo snapshot before any destructive action');
 await click({action:'clear-round',stage:'round1'});
 assert(vm.runInContext('undoSnapshot && undoSnapshot.state',context),'clear-round sets a one-level undo snapshot');
 assert.equal(vm.runInContext('undoSnapshot.label',context),'Undo: Clear To Live','the snapshot carries a human label');
 assert.equal(vm.runInContext('undoSnapshot.state.round1.players.p1.goals[0]',context),6,'the snapshot preserved the pre-clear scores');
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
 // (F) RESHUFFLE UNDO: a To Live reshuffle (data-action='r1-reroll') snapshots the
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
 assert.equal(vm.runInContext('undoSnapshot.label',context),'Undo: Reshuffle To Live Game 1','the reshuffle snapshot carries a human label');
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
})().catch(e=>{console.error(e);process.exitCode=1;});
