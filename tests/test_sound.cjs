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
const generators=['roar','cheer','boo','horn','fanfare','hook','slam','victory'];
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
assert.deepEqual(Object.keys(a).sort(),['ambience','ambientBirds','boo','cheer','fanfare','getStatus','hook','horn','roar','slam','stop','toggle','unlock','victory'].sort());
// Audio-clock scheduling: a five-argument tone starts at currentTime; a delay of .4 starts at currentTime+.4.
let before=nodes.length;a.hook();
const whistle=nodes.slice(before).find(n=>n.kind==='oscillator');assert.deepEqual(whistle.startArgs,[3],'five-argument tone starts at currentTime');
before=nodes.length;a.cheer(false);
const starts=nodes.slice(before).filter(n=>n.kind==='oscillator').map(n=>n.startArgs[0]);
assert(starts.some(t=>Math.abs(t-3.4)<1e-9),'delayed whoop starts at currentTime+.4: '+starts);
assert(starts.some(t=>t===3),'first whoop starts at currentTime');
before=nodes.length;a.fanfare();
const notes=nodes.slice(before).filter(n=>n.kind==='oscillator').map(n=>+n.startArgs[0].toFixed(2));
assert.deepEqual([...new Set(notes)],[3,3.18,3.36,3.54],'fanfare notes are staggered on the audio clock');
// Mute stops every active node and blocks new sounds; label text follows.
const live=nodes.filter(n=>n.onended&&n.kind!=='gain'&&n.kind!=='filter');assert(live.length>0);
a.toggle();
assert(live.every(n=>n.stopCalls.at(-1)?.length===0),'mute stops active nodes immediately');
assert.equal(button.textContent,'Arena sound off');
let count=nodes.length;for(const g of generators)assert.equal(a[g](),null,g+' returns null when muted');
assert.equal(nodes.length,count,'mute blocks every generator');
a.toggle();assert.equal(button.textContent,'Arena sound on');
// document.hidden blocks every generator too.
doc.hidden=true;count=nodes.length;for(const g of generators)a[g]();assert.equal(nodes.length,count,'hidden tab blocks every generator');doc.hidden=false;
// Ambience cadence.
count=nodes.length;
assert.equal(a.ambience(.1,false),null,'null below .3');assert.equal(a.ambience(.29,false),null);assert.equal(nodes.length,count,'quiet early arena');
assert.equal(a.ambience(.4,false),'murmur','murmur band .3 to .65');assert(nodes.length>count,'murmur makes a crowd sound');
assert.equal(a.ambience(.4,false),null,'murmur waits at least 7 s');
clock.now+=7001;assert.equal(a.ambience(.5,false),'murmur');
clock.now+=6999;assert.equal(a.ambience(.5,false),null);
// Roar at p >= .65 every 10000-6000p ms (p=.8 -> 5200 ms); big above .9.
clock.now+=5201;count=nodes.length;assert.equal(a.ambience(.8,false),'roar');assert(nodes.length>count,'roar makes sound');
clock.now+=5100;assert.equal(a.ambience(.8,false),null,'roar waits 5200 ms at p=.8');
clock.now+=101;assert.equal(a.ambience(.8,false),'roar');
clock.now+=4001;assert.equal(a.ambience(.95,false),null,'p=.95 waits 4300 ms');
clock.now+=300;assert.equal(a.ambience(.95,false),'big','big roar above .9 after 4300 ms');
// Arrival: begin exactly once, then roars every 4500 ms.
clock.now+=10;count=nodes.length;assert.equal(a.ambience(1,true),'begin');assert(nodes.length>count,'games-begin fanfare and roar');
assert.equal(a.ambience(1,true),null,'begin never repeats on later ticks');
clock.now+=4400;assert.equal(a.ambience(1,true),null);
clock.now+=101;assert.equal(a.ambience(1,true),'big','arrived cadence is 4500 ms');
assert.equal(a.ambience(1,true),null);
// Cadence advances while muted, without creating nodes.
a.toggle();count=nodes.length;clock.now+=4501;
assert.equal(a.ambience(1,true),'big','cadence advances while muted');assert.equal(nodes.length,count,'muted ambience makes no nodes');
a.toggle();assert.equal(a.ambience(1,true),null,'unmuting does not release a backlog');
// Leaving arrival re-arms the begin edge; progress is clamped and non-finite becomes 0.
assert.equal(a.ambience(NaN,false),null);clock.now+=1;assert.equal(a.ambience(1,true),'begin');
clock.now+=20000;assert.equal(a.ambience(5,false),'big','progress clamps to 1');
// Morning birds behave as before.
const beforeBirds=nodes.length;a.ambientBirds(true);assert(nodes.length>beforeBirds,'morning birds chirp when calm, unmuted and running');
const beforeOff=nodes.length;a.ambientBirds(false);assert.equal(nodes.length,beforeOff,'crowd building (birds off) produces no chirp');
a.ambientBirds(false);a.toggle();const mutedCount=nodes.length;a.ambientBirds(true);assert.equal(nodes.length,mutedCount,'mute silences morning birds');a.toggle();
a.ambientBirds(false);doc.hidden=true;const hiddenCount=nodes.length;a.ambientBirds(true);assert.equal(nodes.length,hiddenCount,'hidden tab silences morning birds');doc.hidden=false;
a.stop();
console.log('Sound passed: unlock gate, every arena generator plays when unlocked and stays silent when muted or hidden, audio-clock delays, mute label and stop, ambience begin/roar/big/murmur cadence (also while muted), morning birds, and no recorded scream.');
