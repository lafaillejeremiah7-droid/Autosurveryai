// Verdict cutscene timing and markup. No browser needed. Run: node tests/test_verdict_cutscene.cjs
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/app.js','utf8');
const code=source.slice(source.indexOf('const titled='),source.indexOf('// ONE dismiss path'));
assert(code.length>1000,'slice markers present');
let now=0,id=0;const jobs=new Map(),phases=[],sounds=[],stageWrites=[],ended=[],gates=[];
const classList=()=>{const set=new Set();return {set,add(...c){for(const x of c){set.add(x);if(x.startsWith('verdict-')||x.startsWith('fc-'))phases.push({phase:x,time:now});}},remove(...c){c.forEach(x=>set.delete(x));},contains:c=>set.has(c),toggle(c,on){if(on===undefined?!set.has(c):on)set.add(c);else set.delete(c);}};};
const element=()=>({textContent:'',innerHTML:'',hidden:true,open:false,classList:classList(),setAttribute(){},showModal(){this.open=true;},close(){this.open=false;}});
const stage={_html:'',get innerHTML(){return this._html;},set innerHTML(v){this._html=v;stageWrites.push({time:now,html:v});}};
const els={'#cutscene-stage':stage};
const $=s=>els[s]??=element();
const audio={};for(const n of ['horn','boo','hook','cheer','slam','fanfare','victory','stop'])audio[n]=(...args)=>{sounds.push({name:n,args,time:now});return {};};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ctx={window:{BrawlAudio:audio},document:{body:element()},state:{names:{p1:'Winner',p2:'Cut A',p3:'Cut B'}},view:null,cutsceneActive:true,cutsceneTimers:[],cutsceneRunId:1,roomTransition:false,esc,reducedMotion:()=>false,Math,Array,Object,String,Set,$,
 setTimeout:(fn,delay)=>{jobs.set(++id,{fn,time:now+delay});return id;},
 endCutscene:()=>{ended.push(now);ctx.cutsceneActive=false;}};
vm.createContext(ctx);vm.runInContext(code,ctx);
const realGate=ctx.startGateCeremony;
const advance=t=>{while(true){const next=[...jobs.entries()].filter(([,j])=>j.time<=t).sort((a,b)=>a[1].time-b[1].time||a[0]-b[0])[0];if(!next)break;jobs.delete(next[0]);now=next[1].time;next[1].fn();}now=t;};
const overlay=$('#cutscene'),caption=$('#cutscene-caption');
const tags=html=>(html.match(/<[a-z][^>]*>/gi)||[]).length;
const reset=()=>{now=0;jobs.clear();phases.length=0;sounds.length=0;stageWrites.length=0;ended.length=0;gates.length=0;overlay.classList.set.clear();ctx.cutsceneActive=true;ctx.reducedMotion=()=>false;ctx.startGateCeremony=()=>gates.push(now);};
const lastPhase=()=>phases.filter(p=>p.phase.startsWith('verdict-')).at(-1);

// (1) Per-player verdict beats: enter 0, judge 900, down 1900, hook 2900, drag 3400, gone 4300, next at 5000.
reset();
ctx.runVerdictSequence(['Cut A','Cut B']);
assert.equal(stageWrites.length,1,'first beat builds the stage');
assert(stage.innerHTML.includes('arena-verdict')&&stage.innerHTML.includes('av-player')&&stage.innerHTML.includes('av-hook')&&stage.innerHTML.includes('av-thumb')&&stage.innerHTML.includes('av-portcullis'));
assert.equal((stage.innerHTML.match(/class="av-player"/g)||[]).length,1,'one stickman per beat');
assert(stage.innerHTML.includes('Cut A')&&!stage.innerHTML.includes('Cut B')&&!stage.innerHTML.includes('Winner'),'only the current cut name appears');
assert(tags(stage.innerHTML)<=200,'verdict stage tag count '+tags(stage.innerHTML));
assert.deepEqual(lastPhase(),{phase:'verdict-enter',time:0});
assert(caption.innerHTML.includes('INTO THE ARENA')&&caption.innerHTML.includes('Cut A'));
const expectBeat=(offset,name)=>{
 for(const [t,phase,word,sound] of [[900,'judge','THE EMPEROR DECIDES','horn'],[1900,'down','THUMBS DOWN','boo'],[2900,'hook','GET THE HOOK','hook'],[3400,'drag',"OFF TO THE LOSERS' GATE",'cheer'],[4300,'gone','ELIMINATED','slam']]){
  advance(offset+t-1);assert.notEqual(lastPhase().phase,'verdict-'+phase,phase+' not before '+t);
  advance(offset+t);assert.deepEqual(lastPhase(),{phase:'verdict-'+phase,time:offset+t});
  assert(overlay.classList.contains('verdict-'+phase)&&[...overlay.classList.set].filter(c=>c.startsWith('verdict-')).length===1,'exactly one verdict phase class');
  assert(caption.innerHTML.startsWith('<strong>'+word+'</strong><br>')&&caption.innerHTML.endsWith(name),'caption '+caption.innerHTML);
  const s=sounds.at(-1);assert.equal(s.name,sound);assert.equal(s.time,offset+t);
  if(sound==='cheer')assert.deepEqual(s.args,[false]);
 }
};
expectBeat(0,'Cut A');
assert.equal(stageWrites.length,1,'phases do not rebuild the stage mid-beat');
advance(4999);assert(stage.innerHTML.includes('Cut A'));
advance(5000);assert.equal(stageWrites.length,2,'next player rebuilds the stage');
assert(stage.innerHTML.includes('Cut B')&&!stage.innerHTML.includes('Cut A'),'second beat shows only the second cut name');
assert.deepEqual(lastPhase(),{phase:'verdict-enter',time:5000});
expectBeat(5000,'Cut B');
assert.deepEqual(gates,[]);advance(9999);assert.deepEqual(gates,[]);advance(10000);assert.deepEqual(gates,[10000],'gate ceremony follows the last player');
assert.deepEqual(phases.filter(p=>p.phase.startsWith('verdict-')).map(p=>p.phase.slice(8)),['enter','judge','down','hook','drag','gone','enter','judge','down','hook','drag','gone']);
assert.deepEqual(sounds.map(s=>s.name),['horn','boo','hook','cheer','slam','horn','boo','hook','cheer','slam']);
// Names are escaped into text nodes.
reset();ctx.runVerdictSequence(['<b>x</b>']);assert(stage.innerHTML.includes('&lt;b&gt;x&lt;/b&gt;')&&!stage.innerHTML.includes('<b>x</b>'));assert(caption.innerHTML.endsWith('&lt;b&gt;x&lt;/b&gt;'));
console.log('Verdict timing passed: enter, judge 900, down 1900, hook 2900, drag 3400, gone 4300, 5 s per gladiator, stage rebuilt per beat, only cut names, audio per beat, escaped names.');

// (2) Cancellation suppresses pending beats, sounds and the ceremony.
reset();ctx.runVerdictSequence(['Cut A','Cut B']);advance(1000);ctx.cutsceneActive=false;const seen=phases.length,heard=sounds.length;advance(20000);
assert.equal(phases.length,seen,'no phases after cancel');assert.equal(sounds.length,heard,'no sounds after cancel');assert.deepEqual(gates,[],'no ceremony after cancel');assert.equal(stageWrites.length,1);
console.log('Verdict cancellation passed.');

// (3) Reduced-motion summary: every name, a closed gate, thumbs down, ELIMINATED caption, 3000 ms to the ceremony.
reset();ctx.reducedMotion=()=>true;
ctx.buildVerdictSummary(['Cut A','Cut B']);
assert(stage.innerHTML.includes('av-summary'));
assert.equal((stage.innerHTML.match(/class="av-player"/g)||[]).length,2,'one stickman per cut name');
assert(stage.innerHTML.includes('Cut A')&&stage.innerHTML.includes('Cut B')&&!stage.innerHTML.includes('Winner'));
assert(stage.innerHTML.includes('av-gate')&&stage.innerHTML.includes('av-thumb'));
assert(overlay.classList.contains('verdict-summary'));
assert(caption.innerHTML.startsWith('<strong>ELIMINATED</strong><br>')&&caption.innerHTML.includes('Cut A')&&caption.innerHTML.includes('Cut B'));
assert.deepEqual(sounds.map(s=>s.name),['boo'],'summary boos once');
assert(tags(stage.innerHTML)<=200,'summary stage tag count '+tags(stage.innerHTML));
advance(2999);assert.deepEqual(gates,[]);advance(3000);assert.deepEqual(gates,[3000]);
console.log('Reduced-motion summary passed: all cut names, ELIMINATED, one boo, ceremony at 3000 ms.');

// (4) Final: six finalists, three hooked losers (never a podium name), judge 1650, hook 3500, ceremony 5300.
const finalRows=['Gold','Silver','Bronze','Fourth','Fifth','Sixth'].map((name,i)=>({rank:i+1,name}));
ctx.view={final:{rows:finalRows}};
reset();
ctx.startFinalSequence(['Fourth','Fifth','Sixth']);
const fin=stage.innerHTML;
assert(fin.includes('fc-judgment')&&fin.includes('av-gate')&&fin.includes('av-emperor'));
assert.equal((fin.match(/class="fc-person /g)||[]).length,6,'six finalists');
const losers=[...fin.matchAll(/class="fc-person fc-loser"[^>]*>.*?<span class="fc-name">([^<]*)<\/span>/g)].map(m=>m[1]);
assert.deepEqual(losers.sort(),['Fifth','Fourth','Sixth'],'exactly the three non-podium finalists are losers');
for(const p of ['Gold','Silver','Bronze'])assert(!losers.includes(p),p+' is never hooked');
assert.equal((fin.match(/fc-hook-n/g)||[]).length,3,'three hooks');
assert(tags(fin)<=200,'final stage tag count '+tags(fin));
assert(caption.innerHTML.startsWith('<strong>FORGET THE PAST</strong>'));
assert(overlay.classList.contains('final-mode')&&overlay.classList.contains('fc-intro'));
advance(1649);assert(!overlay.classList.contains('fc-judge'));
advance(1650);assert(overlay.classList.contains('fc-judge'));assert(caption.innerHTML.includes('THE EMPEROR DECIDES'));assert.deepEqual(sounds.map(s=>s.name),['horn']);
advance(3499);assert(!overlay.classList.contains('fc-hook'));
advance(3500);assert(overlay.classList.contains('fc-hook'));assert(caption.innerHTML.includes('THREE ARE HOOKED')&&caption.innerHTML.includes('THREE REMAIN'));assert.deepEqual(sounds.map(s=>s.name),['horn','boo','hook']);
advance(5299);assert.deepEqual(gates,[]);advance(5300);assert.deepEqual(gates,[5300]);
reset();ctx.reducedMotion=()=>true;ctx.startFinalSequence(['Fourth','Fifth','Sixth']);
assert(overlay.classList.contains('fc-hook'),'reduced motion shows the end state at once');
advance(1399);assert.deepEqual(gates,[]);advance(1400);assert.deepEqual(gates,[1400]);
console.log('Final verdict passed: six finalists, three hooked non-podium losers, judge 1650, hook 3500, ceremony 5300 (1400 under reduced motion).');

// (5) Champions screen: laurels, 25 petals, CHAMPION caption, victory, auto-end 6400 / 3000.
reset();ctx.startFinalSequence(['Fourth','Fifth','Sixth']);jobs.clear();
ctx.revealFinalWinners(ctx.cutsceneRunId);
const win=stage.innerHTML;
assert(win.includes('THE CHAMPIONS')&&(win.match(/class="fc-laurel"/g)||[]).length===3&&(win.match(/class="fc-petal"/g)||[]).length===25);
assert(win.includes('Gold')&&win.includes('Silver')&&win.includes('Bronze')&&!win.includes('Fourth'));
assert(tags(win)<=200,'champions stage tag count '+tags(win));
assert(caption.innerHTML.startsWith('<strong>CHAMPION</strong><br>Gold'));
assert(overlay.classList.contains('fc-winners')&&!overlay.classList.contains('fc-hook')&&!overlay.classList.contains('fc-judge'));
assert.equal(sounds.at(-1).name,'victory');
advance(6399);assert.deepEqual(ended,[]);advance(6400);assert.deepEqual(ended,[6400]);
reset();ctx.reducedMotion=()=>true;ctx.revealFinalWinners(ctx.cutsceneRunId);advance(3000);assert.deepEqual(ended,[3000]);
reset();ctx.revealFinalWinners(ctx.cutsceneRunId+1);assert.deepEqual(sounds,[],'a stale run never reveals');
console.log('Champions passed: laurels, petals, CHAMPION caption, victory, auto-end.');

// (6) Crown fallback (no 3D arena): GATE CROWNED card, fanfare, ends at 2500 (1500 reduced).
reset();ctx.runCrownFallback('Be Better');
assert(stage.innerHTML.includes('crown-card')&&stage.innerHTML.includes('Be Better'));
assert(caption.innerHTML.startsWith('<strong>GATE CROWNED</strong><br>Be Better'));
assert.deepEqual(sounds.map(s=>s.name),['fanfare']);
advance(2499);assert.deepEqual(ended,[]);advance(2500);assert.deepEqual(ended,[2500]);
reset();ctx.reducedMotion=()=>true;ctx.runCrownFallback('Be Better');advance(1500);assert.deepEqual(ended,[1500]);
console.log('Crown fallback passed: GATE CROWNED, fanfare, ends at 2500 ms (1500 reduced).');

(async()=>{
 // (7) startGateCeremony: fallback when crownGate is missing; crownGate wiring when present.
 reset();ctx.startGateCeremony=realGate;
 vm.runInContext("ceremonyLabel='Be Better';ceremonyStage='round1';",ctx);
 overlay.classList.add('verdict-mode','verdict-gone');
 await ctx.startGateCeremony();
 assert(overlay.classList.contains('crown-mode')&&!overlay.classList.contains('verdict-gone')&&!overlay.classList.contains('verdict-mode'));
 assert.equal($('#cutscene .eyebrow').textContent,'ROUND COMPLETE');assert.equal($('#cutscene-label').textContent,'Be Better: The gate is crowned');
 assert(caption.innerHTML.includes('GATE CROWNED'));
 reset();ctx.startGateCeremony=realGate;const calls=[];
 ctx.window.CityWorld={setSuspended(){},crownGate:async(key,label,onCrown)=>{calls.push([key,label]);onCrown();}};
 $('#result-dialog').open=true;
 await ctx.startGateCeremony();
 assert.deepEqual(calls,[['round1','Be Better']]);
 assert.deepEqual(sounds.map(s=>s.name+(s.args.length?':'+s.args.join(','):'')),['fanfare','cheer:true'],'crown moment plays fanfare and a big cheer');
 assert.equal($('#ceremony-hud').hidden,false);assert.equal(vm.runInContext('cutsceneReturnResult',ctx),true);assert.equal($('#result-dialog').open,false);
 assert.deepEqual(ended,[0],'non-final ceremony ends the cutscene');
 delete ctx.window.CityWorld;
 console.log('Gate ceremony passed: crown fallback heading, crownGate(key,label,onCrown) wiring, fanfare + cheer at the crown, HUD shown, result dialog returns.');
})().catch(e=>{console.error(e);process.exitCode=1;});
