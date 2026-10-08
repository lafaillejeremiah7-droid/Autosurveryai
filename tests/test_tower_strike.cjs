const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/app.js','utf8');
const code=source.slice(source.indexOf('function cutsceneRoster'),source.indexOf('// ONE dismiss path'));
let now=0,id=0,ended=false;const jobs=new Map(),phases=[];
const stage={innerHTML:''},caption={innerHTML:''};
const ctx={window:{},state:{names:{p1:'Winner',p2:'Cut A',p3:'Cut B'}},cutsceneActive:true,cutsceneTimers:[],esc:s=>s,reducedMotion:()=>false,Math,
 $:s=>s==='#cutscene-stage'?stage:caption,
 setTimeout:(fn,delay)=>{jobs.set(++id,{fn,time:now+delay});return id;},
 endCutscene:()=>{ended=true;ctx.cutsceneActive=false;},navigator:{vibrate(){}}};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.strikePhase=(phase,name,x)=>phases.push({phase,name,x,time:now});
const advance=t=>{while(true){const next=[...jobs.entries()].filter(([,j])=>j.time<=t).sort((a,b)=>a[1].time-b[1].time)[0];if(!next)break;jobs.delete(next[0]);now=next[1].time;next[1].fn();}now=t;};
ctx.runTowerStrike(['Cut A','Cut B']);
assert(stage.innerHTML.includes('round-bomb-cube'));assert(!stage.innerHTML.includes('cut-escort'));
advance(1000);assert.deepEqual(phases.at(-1),{phase:'lock',name:'Cut A',x:450,time:1000});
advance(1600);assert.equal(phases.at(-1).phase,'inbound');
advance(2299);assert(!phases.some(p=>p.phase==='impact'));
advance(2300);assert.equal(phases.at(-1).phase,'impact');
advance(4000);assert.equal(phases.at(-1).phase,'off');
advance(5000);assert(!ended);advance(6000);assert.equal(phases.at(-1).name,'Cut B');assert.equal(phases.at(-1).phase,'lock');
advance(7300);assert.equal(phases.at(-1).phase,'impact');advance(9000);assert.equal(phases.at(-1).phase,'off');advance(10000);assert(ended);
assert(phases.filter(p=>p.phase==='impact').every(p=>p.name!=='Winner'));
// Cancellation suppresses pending callbacks and the next target.
ctx.cutsceneActive=true;ended=false;now=0;jobs.clear();phases.length=0;
ctx.runTowerStrike(['Cut A','Cut B']);ctx.cutsceneActive=false;advance(10000);
assert.equal(phases.length,1);assert(!ended);
console.log('Tower strike timing passed: cosmetic scan, correct targets, lock → inbound → impact → off, 5 seconds per target, animation rebuild, cancellation.');

ctx.cutsceneActive=true;ended=false;now=0;jobs.clear();phases.length=0;
ctx.portalPhase=(phase,name)=>phases.push({phase,name,time:now});
ctx.startRoundBomb=()=>{ended=true;ctx.cutsceneActive=false;};
ctx.runPortalSequence(['Cut A','Cut B']);
assert(stage.innerHTML.includes('portal-walker')&&stage.innerHTML.includes('portal-hand'));
assert(!stage.innerHTML.includes('Winner'));
advance(900);assert.equal(phases.at(-1).phase,'open');
advance(2850);assert.equal(phases.at(-1).phase,'grab');
advance(3550);assert.equal(phases.at(-1).phase,'drag');
advance(4100);assert.equal(phases.at(-1).phase,'gone');
advance(5000);assert.equal(phases.at(-1).name,'Cut B');assert(!ended);
advance(10000);assert(ended);
ctx.cutsceneActive=true;ended=false;now=0;jobs.clear();phases.length=0;ctx.reducedMotion=()=>true;
ctx.runPortalSequence(['Cut A']);assert.equal(phases.at(-1).phase,'gone');advance(5000);assert(ended);
console.log('Portal timing passed: correct cut players, walk → open → grab → drag → gone, independent five-second scenes, reduced motion.');
