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
 console.log('Round 2 UI: all eight lineups, six editable players, game selection, counters, clearing and reset passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
