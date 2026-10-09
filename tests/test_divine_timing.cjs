// Deterministic divine hand timing and target selection, no browser dependencies.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const payload=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
 "import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import evaluate;s=fixture();print(json.dumps({'state':s,'view':evaluate(s)}))"],{cwd:root,encoding:'utf8'}));
let now=0,seq=0;
const timers=new Map(),sounds=[];
const classList=()=>{const s=new Set();return {add(...a){a.forEach(x=>s.add(x));},remove(...a){a.forEach(x=>s.delete(x));},contains:x=>s.has(x),toggle(x,v){let on=v===undefined?!s.has(x):!!v;if(on)s.add(x);else s.delete(x);return on;}}};
const nodes={},elem=()=>({innerHTML:'',textContent:'',hidden:false,open:false,style:{},classList:classList(),dataset:{},addEventListener(){},setAttribute(){},remove(){},focus(){},showModal(){this.open=true;},close(){this.open=false;},querySelector(){return null;}});
const document={querySelector:s=>nodes[s]??=elem(),querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},body:elem(),createElement:()=>elem()};
const context={document,window:{matchMedia:()=>({matches:false}),addEventListener(){},BrawlAudio:{unlock(){},shears(){sounds.push(now);},stop(){}}},fetch:()=>new Promise(()=>{}),setInterval:()=>0,setTimeout(fn,delay){let id=++seq;timers.set(id,{fn,at:now+delay});return id;},clearTimeout(id){timers.delete(id);},console};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root,'static/app.js'),'utf8'),context);
context.payload=payload;
vm.runInContext('state=payload.state;view=payload.view;',context);
const run=s=>vm.runInContext(s,context);
const advance=at=>{
 for(let n=0;n<1000;n++){
  const due=[...timers.entries()].filter(([,t])=>t.at<=at).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0]);
  if(!due.length){now=at;return;}
  const [id,t]=due[0];timers.delete(id);now=t.at;t.fn();
 }
 throw Error('timers did not finish');
};
const stage=document.querySelector('#cutscene-stage'),overlay=document.querySelector('#cutscene');
const cutIds=JSON.parse(run("JSON.stringify(divineCuts('round1'))"));
assert.equal(cutIds.length,2);
const goalTier=JSON.parse(run("JSON.stringify(plantGardenModel('round1'))"));
assert(goalTier.some(p=>p.tier>0),'show actual growth stages');
(async()=>{
 const promise=run("playDivineCutscene('round1')");
 assert.equal(run('cutsceneActive'),true);
 assert.equal((stage.innerHTML.match(/class="divine-plant /g)||[]).length,10);
 assert(stage.innerHTML.includes('divine-hand-art'));
 assert(stage.innerHTML.includes('is-thinking'));
 assert(!stage.innerHTML.includes('divine-plant severing'),'no cut during contemplation');
 advance(4999);
 assert.deepEqual(sounds,[],'no scissors sound before five seconds');
 assert(stage.innerHTML.includes('is-thinking'),'still deliberating at 4.999 seconds');
 advance(5000);
 assert.deepEqual(sounds,[5000],'first snip exactly at 5 seconds');
 let target=[...stage.innerHTML.matchAll(/class="divine-plant severing" data-player="(p\d+)"/g)].map(x=>x[1]);
 assert.deepEqual(target,[cutIds[0]]);
 advance(6749);
 assert.deepEqual(sounds,[5000]);
 advance(6750);
 assert.deepEqual(sounds,[5000,6750],'second distinct snip 1.75 seconds later');
 target=[...stage.innerHTML.matchAll(/class="divine-plant severing" data-player="(p\d+)"/g)].map(x=>x[1]);
 assert.deepEqual(target,[cutIds[1]],'second target is the other eliminated competitor');
 assert(stage.innerHTML.includes('class="divine-plant severed" data-player="'+cutIds[0]+'"'));
 advance(8500);
 assert.deepEqual(sounds,[5000,6750],'no third snip');
 advance(9350);
 assert(overlay.classList.contains('divine-leaving'),'fade out starts after verdict');
 advance(10000);
 await promise;
 assert.equal(run('cutsceneActive'),false);
 assert.equal(overlay.hidden,true);
 // In Round 2, previously eliminated competitors stay visible but cannot be snipped again.
 now=0;timers.clear();sounds.length=0;
 const second=run("playDivineCutscene('round2')");
 const oldCuts=JSON.parse(run("JSON.stringify(divineModels('round2').filter(p=>p.priorPruned).map(p=>p.id))"));
 const newCuts=JSON.parse(run("JSON.stringify(divineCuts('round2'))"));
 assert.equal(oldCuts.length,2);
 assert.equal(newCuts.length,2);
 assert.equal((stage.innerHTML.match(/class="divine-plant /g)||[]).length,10);
 for(const id of oldCuts)assert(stage.innerHTML.includes('class="divine-plant prior-pruned" data-player="'+id+'"'));
 for(const id of newCuts)assert(!oldCuts.includes(id));
 run('endCutscene()');await second;
 assert.equal(sounds.length,0,'skipping before deliberation never snips a player');
 console.log('PASS divine judgement: 10 plants, 5,000ms thinking, two engine-selected snips, completed fade, prior cuts and safe skip.');
})().catch(e=>{console.error(e);process.exitCode=1;});
