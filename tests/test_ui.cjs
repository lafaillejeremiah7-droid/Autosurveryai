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
const element=()=>({dataset:{},scrollTop:0,innerHTML:'',textContent:'',addEventListener(){},focus(){},appendChild(e){e.parentElement=this;}});
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
assert.equal(vm.runInContext("state.round1.players.p1.goals[0]",context),4);
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
 // Round 1 single-wheel model: the one Name wheel auto-assigns teams; no separate round1 wheel mode.
 const r1=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
  "import sys,json;sys.path.insert(0,'tests');from engine import IDS,new_state,evaluate;s=new_state();s['names']={p:'Player '+str(i+1) for i,p in enumerate(IDS)};\nfor i,p in enumerate(IDS[:3]):\n s['round1']['players'][p]['team']='A' if i<2 else 'B';s['round1']['assigned'].append(p)\ns['wheel']['text']='\\n'.join('Player '+str(i+1) for i in range(10))\nprint(json.dumps({'state':s,'view':evaluate(s),'revision':5}))"],{cwd:root,encoding:'utf8'}));
 vm.runInContext(`state=${JSON.stringify(r1.state)};view=${JSON.stringify(r1.view)};revision=5;wheelMode='free';`,context);
 // (a) No separate 'To Live · team draw' tab in the wheel-mode tabs.
 const tabsHTML=vm.runInContext('wheelModeTabs()',context);
 assert(!tabsHTML.includes('data-wheel-mode="round1"'));assert(!tabsHTML.includes('team draw'));
 assert(tabsHTML.includes('data-wheel-mode="free"'));assert(tabsHTML.includes('data-wheel-mode="round2"'));
 // (b) To Live screen no longer offers 'Open team wheel' but keeps a reachable 'Reset spin'.
 const r1Round=vm.runInContext("round('round1')",context);
 assert(!r1Round.includes('data-action="r1-wheel"'));
 assert(r1Round.includes('data-action="r1-reset"'));assert(r1Round.includes('Assign teams'));
 // The name->player mapping resolves a landed entry to the first unassigned tournament player.
 assert.equal(vm.runInContext("round1MatchForName('Player 7')",context),'p7');  // p7 is unassigned.
 assert.equal(vm.runInContext("round1MatchForName('Player 1')",context),null);  // p1 already teamed.
 assert.equal(vm.runInContext("round1MatchForName('Nobody')",context),null);    // not a roster player.
 // (c) Spinning the MAIN wheel onto an unassigned player's name issues PUT /api/round1-assign {spin,player}.
 const spun=JSON.parse(JSON.stringify(r1));spun.state.round1.players.p7.team='A';spun.state.round1.assigned.push('p7');spun.revision=6;
 vm.runInContext('render=()=>{};flush=async()=>{};drawWheel=()=>{};performance={now:()=>0};requestAnimationFrame=fn=>fn(0);',context);
 vm.runInContext("crypto={getRandomValues(a){a[0]=6;return a;}};",context);  // Force randomIndex -> entry 6 == 'Player 7'.
 let assignCalls=0;
 context.fetch=async(url,options)=>{assignCalls++;assert.equal(url,'/api/round1-assign');const body=JSON.parse(options.body);assert.equal(body.action,'spin');assert.equal(body.player,'p7');return {ok:true,json:async()=>spun};};
 await vm.runInContext('spinWheel()',context);
 assert.equal(assignCalls,1);
 assert.equal(vm.runInContext("state.round1.players.p7.team",context),'A');
 assert(vm.runInContext("state.round1.assigned",context).includes('p7'));
 // (d) Landing on an entry that is NOT a tournament player makes NO /api/round1-assign call.
 vm.runInContext(`state=${JSON.stringify(r1.state)};view=${JSON.stringify(r1.view)};revision=5;wheelMode='free';state.wheel.text='Ghost\\nSpecter';`,context);
 assignCalls=0;
 vm.runInContext("crypto={getRandomValues(a){a[0]=0;return a;}};",context);  // Lands on 'Ghost'.
 await vm.runInContext('spinWheel()',context);
 assert.equal(assignCalls,0);
 assert.equal(vm.runInContext("state.round1.assigned.length",context),3);  // Unchanged wheel-drawn teams.
 // (e) When names aren't complete/unique (view.names_ok false), landing on a matching player skips assignment
 //     but leaves a visible note instead of a silent no-op.
 vm.runInContext(`state=${JSON.stringify(r1.state)};view=${JSON.stringify(r1.view)};view.names_ok=false;revision=5;wheelMode='free';`,context);
 assignCalls=0;
 vm.runInContext("crypto={getRandomValues(a){a[0]=6;return a;}};",context);  // Lands on 'Player 7' (an unassigned roster player).
 await vm.runInContext('spinWheel()',context);
 assert.equal(assignCalls,0);  // No server assignment while names are incomplete.
 assert(/unique player names/.test(vm.runInContext("wheelLast.note",context)));  // Operator gets feedback.
 console.log('Round 1 UI: single Name wheel auto-assigns the landed player, no separate wheel/tab, reset reachable, non-roster names skip assignment, incomplete-names landing shows a note.');
 console.log('Round 2 UI: all eight lineups, six editable players, game selection, counters, clearing and reset passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
