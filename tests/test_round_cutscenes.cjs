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
 // (a) Round 2 settles through the real "Match 5 of 5 done" (r2-done) path.
 load(fx.r2before);
 const urls=[];context.fetch=async(url,o)=>{urls.push(url);assert.equal(JSON.parse(o.body).action,'done');assert.equal(JSON.parse(o.body).game,5);return reply(fx.settled);};
 const done=click({action:'r2-done',match:'5'});await flushMicro();
 assert.deepEqual(urls,['/api/round2-draw'],'Match 5 done goes through the round 2 draw endpoint');
 assert.equal(run('cutsceneActive'),true,'Match 5 of 5 done plays the Enough cutscene');
 assert.equal(run('plays.length'),1);
 const r2Cut=cutOf(fx.settled,'round2');assert.equal(r2Cut.length,2);
 assert.deepEqual(stageNames().sort(),[...r2Cut].sort(),'the Enough verdict names exactly the round 2 CUT players');
 assert($('#cutscene-label').textContent.includes('Enough'),'the cutscene is labelled Enough');
 run('endCutscene()');await done;
 assert.equal($('#result-dialog').open,true);assert.equal(run('resultStage'),'round2');assert.equal(run('resultFinal'),true);
 assert($('#result-dialog').classList.contains('fullscreen'),'standings open fullscreen after the cutscene');
 assert($('#result-content').innerHTML.includes('total round ranking'));

 // (b) Matches 1-4 done never play, even if the round looks settled.
 for(const m of [1,2,3,4]){
  load(fx.r2before);context.fetch=async()=>reply(fx.settled);
  await click({action:'r2-done',match:String(m)});await flushMicro();
  assert.equal(run('plays.length'),0,`Match ${m} done plays no cutscene`);assert.equal(run('resultFinal'),false);
 }

 // (c) Match 5 done with an unresolved cut tie: no cutscene, the TIE fullscreen opens.
 load(fx.r2before);context.fetch=async()=>reply(fx.r2tie);
 await click({action:'r2-done',match:'5'});await flushMicro();
 assert.equal(run('plays.length'),0,'an unresolved round 2 tie plays no cutscene');
 assert.equal(run('resultFinal'),true);assert($('#result-content').innerHTML.includes('EXTRA GAMES NEEDED'));

 // (d) Reported bug: close the TIE fullscreen and settle via the round screen's extras.
 load(fx.r2tie);context.fetch=async url=>{assert.equal(url,'/api/state');return reply(fx.r2tieSettled);};
 run('changed()');await run('save()');await flushMicro();
 assert.equal(run('cutsceneActive'),true,'settling the round 2 tie on the round screen plays the cutscene');
 assert.equal(run('plays.length'),1);
 assert.deepEqual(stageNames().sort(),cutOf(fx.r2tieSettled,'round2').sort());
 assert.equal(run('plays[0][2]'),'round2');
 run('endCutscene()');await flushMicro();
 assert.equal($('#result-dialog').open,true,'standings appear after the save-path cutscene');
 assert.equal(run('resultStage'),'round2');assert.equal(run('resultFinal'),true);
 assert($('#result-content').innerHTML.includes('ROUND SETTLED'));
 run('changed()');await run('save()');await flushMicro();
 assert.equal(run('plays.length'),1,'an unrelated later save does not replay');

 // (e) Entering the last regulation score never plays early (Submit plays instead).
 load(fx.r1notReady);context.fetch=async()=>reply(fx.settled);
 run('changed()');await run('save()');await flushMicro();
 assert.equal(run('plays.length'),0,'no cutscene from save() when the round was not ready before it');

 // (f) Race: the settling response is superseded by a newer edit; the next save still plays once.
 load(fx.r2tie);await run("openMatchResult('round2',4)");assert.equal($('#result-dialog').open,true);
 let release;context.fetch=()=>new Promise(r=>{release=()=>r(reply(fx.r2tieSettled));context.fetch=async()=>reply(fx.r2tieSettled);});
 run('changed()');const pending=run('save()');await flushMicro();
 run('changed()');release();await pending;await flushMicro();
 assert.equal(run('plays.length'),1,'a superseded settling save still plays exactly one cutscene');
 run('endCutscene()');await flushMicro();
 assert.equal($('#result-dialog').open,true);

 // (g) Final: one separate pruning scene per finalist who did not win.
 load(fx.settled);
 const fRows=fx.settled.view.final.rows;assert.equal(fRows.length,6,'six finalists');
 const expected=fRows.filter(r=>r.rank!==1).sort((x,y)=>x.rank-y.rank).map(r=>r.name);
 const champion=fRows.find(r=>r.rank===1).name;
 const finalNames=run("eliminatedNames('final')");
 assert.equal(finalNames.length,5);assert.deepEqual(finalNames,expected);
 assert(!finalNames.includes(champion),'champion not pruned');
 for(const [ranks,want] of [
  [[1,2,3,4,4,6],['D','E','F','G','H']],
  [[1,2,3,4,5,5],['D','E','F','G','H']],
  [[1,2,3,4,5,6,7,8],['D','E','F','G','H','I','J']],
  [[1,2,3,4],['D','E','F']]
 ]){
  context.synthetic=ranks.map((rank,i)=>({name:'CDEFGHIJ'[i],rank}));
  const got=run("view={final:{rows:synthetic}};eliminatedNames('final')");
  assert.deepEqual(got,want,'every player ranked below first is eliminated');
 }
 load(fx.settled);
 const fin=click({action:'submit-match',stage:'final',match:'7'});await flushMicro();
 assert.equal(run('plays.length'),1,'settled final triggers one cutscene');
 const scene=$('#cutscene-stage').innerHTML;
 const shown=[...scene.matchAll(/class="av-name">([^<]*)<\/span>/g)].map(m=>m[1]);
 assert.deepEqual(shown,[expected[0]],'only first losing finalist initially appears');
 assert(scene.includes('PRUNING 1 / 5'),'counter starts at 1 of 5');
 run('endCutscene()');await fin;
 load(fx.finalTie);
 await click({action:'submit-match',stage:'final',match:'7'});await flushMicro();
 assert.equal(run('plays.length'),0,'unresolved first-place tie plays nothing');

 // (h) No double-fire: Submit on a round 1 tie, then the extra game settles it in the fullscreen.
 load(fx.r1tie);
 await click({action:'submit-match',stage:'round1',match:'4'});await flushMicro();
 assert.equal(run('plays.length'),0);assert.equal($('#result-dialog').open,true);
 context.fetch=async()=>reply(fx.r1tieSettled);
 run('changed()');await run('save()');await flushMicro();
 assert.equal(run('plays.length'),1,'the settling save plays once');
 assert.deepEqual(stageNames().sort(),cutOf(fx.r1tieSettled,'round1').sort());
 assert($('#cutscene-label').textContent.includes('Know Thy Nature'));
 await click({action:'submit-match',stage:'round1',match:'4'});await flushMicro();
 assert.equal(run('plays.length'),1,'Submit while the cutscene runs cannot start a second one');
 run('endCutscene()');await flushMicro();
 assert.equal($('#result-dialog').open,true);assert.equal(run('resultStage'),'round1');
 assert.equal(run('plays.length'),1);
 console.log('Round cutscenes: Enough via Match 5 done, no play on matches 1-4 or ties, on-screen tie settle, no early fire, superseded save, final five individual prunings, no double-fire passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
