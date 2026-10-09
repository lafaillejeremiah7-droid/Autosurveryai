// Royal Garden: deterministic cutscene timing test, no browser dependency.
// Run: node tests/test_verdict_cutscene.cjs
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../static/app.js'),'utf8');
const from=src.indexOf('let cutsceneTimers='),to=src.indexOf('async function startGateCeremony(){',from);
assert(from>=0&&to>from,'Verdict functions exist');
const code=src.slice(from,to);
function rig(){
 let now=0,nextId=0;
 const timers=new Map(),sounds=[],scenes=[],completed=[],phaseHistory=[];
 const active=new Set();
 const classList={add(...cs){for(const c of cs){active.add(c);if(c.startsWith('verdict-'))phaseHistory.push([now,c]);}},
  remove(...cs){cs.forEach(c=>active.delete(c));},contains:c=>active.has(c)};
 const stage={_html:'',set innerHTML(s){this._html=s;scenes.push({time:now,html:s});},get innerHTML(){return this._html;}};
 const caption={innerHTML:''},heading={textContent:''};
 const nodes={'#cutscene':{classList},'#cutscene-stage':stage,'#cutscene-caption':caption,'#cutscene-label':heading};
 const audio={};for(const n of ['horn','shears','hook','compost','slam'])audio[n]=()=>sounds.push({time:now,name:n});
 const context={
  cutsceneActive:true,ceremonyStage:'final',window:{BrawlAudio:audio},
  $:key=>nodes[key],esc:x=>String(x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  startGateCeremony:()=>completed.push(now),
  setTimeout:(fn,delay)=>{const id=++nextId;timers.set(id,{time:now+delay,fn});return id;},
  clearTimeout:id=>timers.delete(id),Math,Array,Object,String,Set
 };
 vm.createContext(context);
 vm.runInContext(code+';globalThis.verdictTest={runVerdictSequence,runReducedFinalPruning,buildVerdictScene,buildVerdictSummary};',context);
 function advance(target){
  assert(target>=now,'Time runs forward');
  for(let safety=0;safety<500;safety++){
   const jobs=[...timers.entries()].filter(([,t])=>t.time<=target).sort((a,b)=>a[1].time-b[1].time||a[0]-b[0]);
   if(!jobs.length){now=target;return;}
   const [id,t]=jobs[0];timers.delete(id);now=t.time;t.fn();
  }
  throw Error('Infinite cutscene timers');
 }
 return {context,stage,caption,heading,sounds,scenes,completed,phaseHistory,advance};
}
const names=['Luna','Rose','Thorn','Cedar','Violet'];
const normal=rig();
normal.context.verdictTest.runVerdictSequence(names);
assert(normal.stage.innerHTML.includes('PRUNING 1 / 5'));
assert(normal.stage.innerHTML.includes('Luna'));
assert(!normal.stage.innerHTML.includes('Rose'));
for(let i=0;i<5;i++){
 const start=i*5000;
 normal.advance(start+1900);
 assert.equal(normal.sounds.filter(s=>s.name==='shears').length,i+1,'snip exactly once for finalist '+(i+1));
 normal.advance(start+3400);
 assert.equal(normal.sounds.filter(s=>s.name==='compost').length,i+1,'compost impact for finalist '+(i+1));
 normal.advance(start+4300);
 assert(normal.caption.innerHTML.includes('PRUNED'),'player '+(i+1)+' pruned');
 normal.advance(start+4999);
 assert(normal.stage.innerHTML.includes(names[i]),'same player remains until their scene ends');
 if(i<4){normal.advance(start+5000);assert(normal.stage.innerHTML.includes(names[i+1]),'next player gets separate scene');}
}
normal.advance(25000);
assert.equal(normal.scenes.length,5,'five distinct 5-second scenes, not a group shot');
assert.deepEqual(normal.completed,[25000],'ceremony only after fifth player');
assert.deepEqual(normal.sounds.filter(s=>s.name==='shears').map(s=>s.time),[1900,6900,11900,16900,21900]);
const still=rig();
still.context.verdictTest.runReducedFinalPruning(names);
assert(still.stage.innerHTML.includes('PRUNING 1 / 5'));
for(let i=0;i<5;i++){
 const start=i*1600;
 still.advance(start);
 assert(still.stage.innerHTML.includes(names[i]),'one reduced-motion player at a time');
 still.advance(start+600);
 assert(still.caption.innerHTML.includes('PRUNED'),'static snip scene ends with PRUNED');
 if(i<4)still.advance(start+1600);
}
still.advance(8000);
assert.equal(still.scenes.length,5,'five individual accessible still scenes');
assert.deepEqual(still.completed,[8000]);
assert.equal(still.sounds.filter(s=>s.name==='shears').length,5);
assert.equal(still.sounds.filter(s=>s.name==='compost').length,5);
const escape=rig();
escape.context.verdictTest.runVerdictSequence(['<script>x</script>']);
assert(!escape.stage.innerHTML.includes('<script>')&&escape.stage.innerHTML.includes('&lt;script&gt;'),'escapes player names');
const cancelled=rig();
cancelled.context.verdictTest.runVerdictSequence(names);
cancelled.advance(1000);cancelled.context.cutsceneActive=false;
cancelled.advance(27000);
assert.equal(cancelled.scenes.length,1,'cancel suppresses later scenes');
assert.deepEqual(cancelled.completed,[],'cancel suppresses ceremony');
console.log('PASS Royal Garden final: five sequential snip/compost scenes, five individual reduced-motion scenes, correct timing, escape and cancellation.');
