// Elimination cutscene at the end of every round, driven through the real click and
// save handlers. No browser or third-party packages needed. Run: node tests/test_round_cutscenes.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const py=`
import sys,json;sys.path.insert(0,'tests')
from copy import deepcopy
from test_tournament import fixture,cut_tie_state,final_tie_state
from engine import IDS,evaluate
def pack(s):return {'state':s,'view':evaluate(s)}
out={'settled':pack(fixture())}
s=fixture();s['round2']['draw']['completed']=4;out['r2before']=pack(s)
out['r2tie']=pack(cut_tie_state('round2'))
s=cut_tie_state('round2');e=dict.fromkeys(IDS);e['p8']=3;e['p4']=1;s['round2']['extras']=[e];out['r2tieSettled']=pack(s)
s=cut_tie_state('round1');out['r1tie']=pack(s)
tied=[r['id'] for r in out['r1tie']['view']['round1']['rows'] if str(r['status']).startswith('TIE')]
e=dict.fromkeys(IDS)
for i,p in enumerate(tied):e[p]=1 if i==0 else 0
s['round1']['extras']=[e];out['r1tieSettled']=pack(s)
s=fixture();s['round1']['players']['p1']['goals'][4]=None;out['r1notReady']=pack(s)
out['finalTie']=pack(final_tie_state())
print(json.dumps(out))`;
const fx=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',py],{cwd:root,encoding:'utf8'}));
assert.equal(fx.r2before.view.round2.ready,false,'fixture: round 2 is not ready before Match 5 done');
assert.equal(fx.r2tie.view.round2.ready,true);assert.equal(fx.r2tie.view.round2.complete,false,'fixture: round 2 cut tie');
assert.equal(fx.r2tieSettled.view.round2.complete,true,'fixture: the extra game settles round 2');
assert.equal(fx.r1tie.view.round1.complete,false);assert.equal(fx.r1tieSettled.view.round1.complete,true,'fixture: the extra game settles round 1');
assert.equal(fx.r1notReady.view.round1.ready,false);
assert.equal(fx.finalTie.view.final.complete,false,'fixture: unresolved final tie');

const makeClassList=()=>{const set=new Set();return {toggle(c,force){const on=force===undefined?!set.has(c):!!force;if(on)set.add(c);else set.delete(c);return on;},remove(...c){c.forEach(x=>set.delete(x));},add(...c){c.forEach(x=>set.add(x));},contains(c){return set.has(c);}};};
const element=()=>({dataset:{},scrollTop:0,innerHTML:'',textContent:'',open:false,classList:makeClassList(),style:{setProperty(){}},addEventListener(){},removeChild(e){if(e)e.parentElement=null;},remove(){},focus(){},appendChild(e){e.parentElement=this;},showModal(){this.open=true;},close(){this.open=false;},animate(){return {finished:Promise.resolve(),cancel(){}};},querySelector(){return null;},setAttribute(){}});
const elements={},events={};
const document={querySelector:s=>elements[s]??=(element()),querySelectorAll:()=>[],addEventListener:(type,fn)=>events[type]=fn,removeEventListener(){},body:element(),createElement:()=>element()};
const context={document,window:{addEventListener(){},matchMedia:()=>({matches:true})},fetch:()=>new Promise(()=>{}),setTimeout:()=>1,clearTimeout(){},setInterval(){},console,fx,confirm:()=>true};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'static/app.js'),'utf8'),context);
// Count every cutscene start (internal callers resolve the global binding).
vm.runInContext('var plays=[];const realPlay=playCutscene;playCutscene=(...a)=>{plays.push(a);return realPlay(...a);};token="t";',context);
const run=s=>vm.runInContext(s,context);
const $=s=>document.querySelector(s);
const click=dataset=>events.click({target:{closest:()=>({dataset,disabled:false})}});
const flushMicro=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const reply=p=>({ok:true,json:async()=>({state:p.state,view:p.view,revision:1})});
const load=(p,{dialog=false}={})=>{
 run(`cutsceneActive=false;dirty=false;saving=false;saveFailed=false;settleBaseView=null;plays.length=0;revision=1;state=JSON.parse(${JSON.stringify(JSON.stringify(p.state))});view=JSON.parse(${JSON.stringify(JSON.stringify(p.view))});`);
 if(!dialog)run('closeResult()');
};
const stageNames=()=>[...$('#cutscene-stage').innerHTML.matchAll(/<span class="av-name">([^<]*)<\/span>/g)].map(m=>m[1]);
const cutOf=(p,key)=>p.view[key].rows.filter(r=>r.status==='CUT').map(r=>r.name);

(async()=>{
 // Match 5 and tied extra games never launch pruning automatically.
 load(fx.r2before);
 context.fetch=async(url,o)=>{assert.equal(url,'/api/round2-draw');assert.equal(JSON.parse(o.body).game,5);return reply(fx.settled);};
 await click({action:'r2-done',match:'5'});await flushMicro();
 assert.equal(run('cutsceneActive'),false);
 assert.equal(run('plays.length'),0);
 assert($('#result-content').innerHTML.includes('data-action="advance-stage" data-stage="round2"'));
 const cuts=cutOf(fx.settled,'round2');assert.equal(cuts.length,2);
 const advancing=click({action:'advance-stage',stage:'round2'});await flushMicro();
 assert.equal(run('cutsceneActive'),true,'Continue triggers a cinematic judgement');
 assert.equal(run("ceremonyStage"),'round2');
 let html=$('#cutscene-stage').innerHTML;
 assert(html.includes('divine-hand-art')&&html.includes('divine-shears'),'divine shears visible');
 assert.equal((html.match(/class="divine-plant /g)||[]).length,10,'all ten plants appear');
 for(const cut of cuts)assert(html.includes(cut),'both losers present');
 assert(!html.includes('divine-plant severing'),'nothing is pruned during deliberation');
 run('endCutscene()');await advancing;
 assert.equal(run('cutsceneActive'),false);
 assert.equal(run('tab'),'final','the next pavilion opens after judgement');
 // Transition is not replayed when returning in the same page session.
 load(fx.settled);run("tab='round2';");await click({action:'advance-stage',stage:'round2'});await flushMicro();
 assert.equal(run('cutsceneActive'),false);
 // Round 1 has the same deliberate transition, but the earlier two cuts are not
 // shown as already pruned until Round 2.
 load(fx.settled);run("visitedVerdicts.clear();tab='round1';");
 await click({action:'submit-match',stage:'round1',match:'4'});await flushMicro();
 assert.equal(run('plays.length'),0);
 const forward=click({action:'advance-stage',stage:'round1'});await flushMicro();
 assert.equal(run('cutsceneActive'),true);
 assert.equal((($('#cutscene-stage').innerHTML).match(/class="divine-plant /g)||[]).length,10);
 assert(!$('#cutscene-stage').innerHTML.includes('prior-pruned'),'all plants eligible in Round 1');
 run('endCutscene()');await forward;
 assert.equal(run('tab'),'round2');
 // Unresolved ties cannot trigger early pruning or display a Continue button.
 load(fx.r2tie);run("tab='round2';");
 await click({action:'submit-match',stage:'round2',match:'4'});await flushMicro();
 assert.equal(run('cutsceneActive'),false);
 assert(!$('#result-content').innerHTML.includes('data-action="advance-stage"'));
 context.fetch=async()=>reply(fx.r2tieSettled);
 run('changed()');await run('save()');await flushMicro();
 assert.equal(run('plays.length'),0,'tie resolution never interrupts with a cutscene');
 assert($('#result-content').innerHTML.includes('data-action="advance-stage"'),'resolved tie offers Continue');
 // The final uses the same 3D garden, with five cuts and a single champion.
 load(fx.settled);
 const expected=fx.settled.view.final.rows.filter(r=>r.rank!==1).sort((a,b)=>a.rank-b.rank).map(r=>r.id);
 assert.equal(expected.length,5);
 const fin=click({action:'submit-match',stage:'final',match:'7'});await flushMicro();
 assert.equal(run('cutsceneActive'),true);
 assert.equal(run('ceremonyStage'),'final');
 assert.equal(run('plays.length'),0,'old stick-figure verdict is not called');
 assert.deepEqual(JSON.parse(run("JSON.stringify(divineCuts('final'))")),expected);
 assert($('#cutscene-stage').innerHTML.includes('divine-canvas'));
 assert.equal((($('#cutscene-stage').innerHTML).match(/class="divine-plant /g)||[]).length,10);
 run('endCutscene()');await fin;
  console.log('PASS explicit divine selection, two correct eliminations, ten displayed plants, no early or repeated cutscene, tie resolution, and final champion ceremony.');
})().catch(e=>{console.error(e);process.exitCode=1;});
