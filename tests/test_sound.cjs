const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/app.js','utf8');
const audioCode=source.slice(source.indexOf('window.BrawlAudio='),source.indexOf('const value=path'));
function harness(){
 const nodes=[],buffers=[],events={},doc={hidden:false,addEventListener:(e,f)=>events[e]=f},clock={now:100000};
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
 const node=kind=>{const n={kind,frequency:param(),gain:param(),Q:param(),stopCalls:[],connect(){},disconnect(){},start(...args){this.startArgs=args;},stop(...args){this.stopCalls.push(args);}};nodes.push(n);return n;};
 class AudioContext{
  constructor(){this.state='running';this.currentTime=3;this.sampleRate=8000;this.destination={};}
  resume(){}createOscillator(){return node('oscillator');}createGain(){return node('gain');}createBiquadFilter(){return node('filter');}createBufferSource(){return node('buffer');}
  createBuffer(channels,length,sampleRate){const data=new Float32Array(length),b={length,sampleRate,duration:length/sampleRate,getChannelData:()=>data};buffers.push(b);return b;}
 }
 const button={setAttribute(){},textContent:''};
 const window={AudioContext};
 vm.runInNewContext(audioCode,{window,document:doc,$:()=>button,Math,Date:{now:()=>clock.now},Set,Number});
 return {a:window.BrawlAudio,nodes,buffers,events,button,doc,clock};
}
const generators=['roar','cheer','boo','horn','fanfare','hook','slam','shears','compost','victory'];
const {a,nodes,buffers,events,button,doc,clock}=harness();
// Locked: nothing sounds before a user gesture unlocks the AudioContext.
assert.equal(a.getStatus().unlocked,false);
for(const g of generators)a[g]();
assert.equal(nodes.length,0,'no nodes before a user gesture');
events.pointerdown();assert.equal(a.getStatus().unlocked,true);
// Every generator creates nodes once unlocked.
for(const g of generators){const before=nodes.length;const out=a[g]();assert(nodes.length>before,g+' creates nodes when unlocked');assert(out,g+' returns a node when it plays');}
// No scream, no recorded PCM, no 16 kHz buffer.
assert.equal(typeof a.scream,'undefined','the recorded scream is gone');
for(const old of ['explosion','portal','finalOmen','finalPurge','cut','doom'])assert.equal(typeof a[old],'undefined',old+' is gone');
assert(!/atob|pcm/i.test(audioCode),'no embedded PCM');
assert(!buffers.some(b=>b.sampleRate===16000),'no 16000 Hz recording buffer');
assert.deepEqual(Object.keys(a).sort(),['ambience','ambientBirds','boo','cheer','compost','fanfare','getStatus','hook','horn','roar','shears','slam','stop','toggle','unlock','victory'].sort());
// Audio-clock scheduling: a five-argument tone starts at currentTime; a delay of .4 starts at currentTime+.4.
let before=nodes.length;a.hook();
const whistle=nodes.slice(before).find(n=>n.kind==='oscillator');assert.deepEqual(whistle.startArgs,[3],'five-argument tone starts at currentTime');
before=nodes.length;a.cheer(false);
const starts=nodes.slice(before).filter(n=>n.kind==='oscillator').map(n=>n.startArgs[0]);
assert(starts.some(t=>Math.abs(t-3.3)<1e-9),'delayed bell starts at currentTime+.3: '+starts);
assert(starts.some(t=>t===3),'first whoop starts at currentTime');
before=nodes.length;a.fanfare();
const notes=nodes.slice(before).filter(n=>n.kind==='oscillator').map(n=>+n.startArgs[0].toFixed(2));
assert.deepEqual([...new Set(notes)],[3,3.19,3.38,3.57],'fanfare notes are staggered on the audio clock');
// Mute stops every active node and blocks new sounds; label text follows.
const live=nodes.filter(n=>n.onended&&n.kind!=='gain'&&n.kind!=='filter');assert(live.length>0);
a.toggle();
assert(live.every(n=>n.stopCalls.at(-1)?.length===0),'mute stops active nodes immediately');
assert.equal(button.textContent,'Garden sound off');
let count=nodes.length;for(const g of generators)assert.equal(a[g](),null,g+' returns null when muted');
assert.equal(nodes.length,count,'mute blocks every generator');
a.toggle();assert.equal(button.textContent,'Garden sound on');
// document.hidden blocks every generator too.
doc.hidden=true;count=nodes.length;for(const g of generators)a[g]();assert.equal(nodes.length,count,'hidden tab blocks every generator');doc.hidden=false;
// Ambience cadence. The periodic roar/murmur booms are disabled: the only
// ambience sound event is the one-time arrival 'begin' fanfare. Every
// non-arrival band now returns null and makes no nodes, muted or not.
count=nodes.length;
assert.equal(a.ambience(.1,false),null,'null below .3');assert.equal(a.ambience(.29,false),null);assert.equal(nodes.length,count,'quiet early garden');
// The old .3-.65 'murmur' band no longer booms: null, no nodes, any elapsed time.
assert.equal(a.ambience(.4,false),null,'mid band is silent (periodic boom disabled)');assert.equal(nodes.length,count,'mid band makes no nodes');
clock.now+=7001;assert.equal(a.ambience(.5,false),null,'mid band stays silent regardless of elapsed time');assert.equal(nodes.length,count);
// The old >=.65 'roar'/'big' band no longer booms either.
clock.now+=5201;assert.equal(a.ambience(.8,false),null,'periodic roar band is silent (boom disabled)');assert.equal(nodes.length,count,'roar band makes no nodes');
clock.now+=5201;assert.equal(a.ambience(.8,false),null,'still silent after a full cadence window');assert.equal(nodes.length,count);
clock.now+=5000;assert.equal(a.ambience(.95,false),null,'high-progress band is silent too');assert.equal(nodes.length,count,'big band makes no nodes');
// Arrival: begin exactly once, firing fanfare+roar; it never repeats on later ticks.
clock.now+=10;count=nodes.length;assert.equal(a.ambience(1,true),'begin');assert(nodes.length>count,'games-begin fanfare and roar');
assert.equal(a.ambience(1,true),null,'begin never repeats on later ticks');
clock.now+=10000;assert.equal(a.ambience(1,true),null,'no periodic boom even while arrived');
// Muted arrival edge still advances but emits no sound. Re-arm the begin edge
// (leave arrival), mute, then re-enter arrival: 'begin' fires on the edge yet
// creates no audio nodes while muted, and unmuting releases no backlog.
clock.now+=1;a.ambience(.8,false);a.toggle();assert.equal(button.textContent,'Garden sound off');
clock.now+=1;count=nodes.length;assert.equal(a.ambience(1,true),'begin','muted arrival edge still advances');
assert.equal(nodes.length,count,'muted arrival makes no nodes');
assert.equal(a.ambience(1,true),null,'muted begin edge still fires only once');
a.toggle();assert.equal(button.textContent,'Garden sound on');
count=nodes.length;assert.equal(a.ambience(1,true),null,'unmuting releases no backlog');assert.equal(nodes.length,count,'no deferred arrival nodes after unmute');
// Leaving arrival re-arms the begin edge; progress is clamped and non-finite becomes 0.
assert.equal(a.ambience(NaN,false),null);clock.now+=1;assert.equal(a.ambience(1,true),'begin','leaving arrival re-arms the begin edge');
clock.now+=20000;assert.equal(a.ambience(5,false),null,'progress clamps to 1 and still no periodic boom');
// Morning birds behave as before.
const beforeBirds=nodes.length;a.ambientBirds(true);assert(nodes.length>beforeBirds,'morning birds chirp when calm, unmuted and running');
const beforeOff=nodes.length;a.ambientBirds(false);assert.equal(nodes.length,beforeOff,'garden wind building (birds off) produces no chirp');
a.ambientBirds(false);a.toggle();const mutedCount=nodes.length;a.ambientBirds(true);assert.equal(nodes.length,mutedCount,'mute silences morning birds');a.toggle();
a.ambientBirds(false);doc.hidden=true;const hiddenCount=nodes.length;a.ambientBirds(true);assert.equal(nodes.length,hiddenCount,'hidden tab silences morning birds');doc.hidden=false;
a.stop();
console.log('Sound passed: unlock gate, every arena generator plays when unlocked and stays silent when muted or hidden, audio-clock delays, mute label and stop, ambience one-time begin fanfare with the periodic roar/murmur boom disabled (null and no nodes, muted or not), morning birds, and no recorded scream.');
