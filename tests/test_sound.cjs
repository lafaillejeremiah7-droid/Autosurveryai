const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/app.js','utf8');
const audioCode=source.slice(source.indexOf('window.BrawlAudio='),source.indexOf('const value=path'));
function harness(){
 const nodes=[],buffers=[],events={};let now=100000;
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
 const node=kind=>{const n={kind,frequency:param(),gain:param(),stopCalls:[],connect(){},disconnect(){},start(...args){this.startArgs=args;},stop(...args){this.stopCalls.push(args);}};nodes.push(n);return n;};
 class AudioContext{
  constructor(){this.state='running';this.currentTime=3;this.sampleRate=8000;this.destination={};}
  resume(){}createOscillator(){return node('oscillator');}createGain(){return node('gain');}createBiquadFilter(){return node('filter');}createBufferSource(){return node('buffer');}
  createBuffer(channels,length,sampleRate){const data=new Float32Array(length),b={length,sampleRate,duration:length/sampleRate,getChannelData:()=>data};buffers.push(b);return b;}
 }
 const button={setAttribute(){},textContent:''};
 const window={AudioContext,atob:s=>Buffer.from(s,'base64').toString('binary')};
 vm.runInNewContext(audioCode,{window,document:{hidden:false,addEventListener:(e,f)=>events[e]=f},$:()=>button,Math,Date:{now:()=>now},Set});
 return {a:window.BrawlAudio,nodes,buffers,events,button};
}
const {a,nodes,buffers,events,button}=harness();
assert.equal(a.getStatus().unlocked,false);a.scream();assert.equal(nodes.length,0,'no scream before a user gesture');events.pointerdown();assert.equal(a.getStatus().unlocked,true);
a.portal();
const beforeScream=nodes.length;a.scream();
const voice=nodes.slice(beforeScream).find(n=>n.kind==='buffer');assert(voice,'scream plays a recorded buffer');
assert(!nodes.slice(beforeScream).some(n=>n.kind==='oscillator'),'recorded voice replaces the old oscillator beep');
assert.equal(voice.buffer.sampleRate,16000);assert.equal(voice.buffer.duration,1.15);
const pcm=voice.buffer.getChannelData(0),rms=data=>Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length);
assert(rms(pcm.subarray(1600,9600))>.12,'voice has audible recorded content');
assert(rms(pcm.subarray(9600,11200))>.12,'voice is still vocal at the intended hard cutoff');
assert(Math.max(...pcm.map(Math.abs))<1,'bundled recording does not clip');
assert.deepEqual(voice.startArgs,[3]);assert.deepEqual(voice.stopCalls,[[3.7]],'scream stops after 700 ms on the audio clock, without waiting for an animation timer');
const bufferCount=buffers.length;a.scream();assert.equal(buffers.length,bufferCount,'repeat scenes reuse the decoded recording');assert.deepEqual(voice.stopCalls.at(-1),[],'a replay cancels the previous voice');
const live=nodes.filter(n=>n.onended);a.cut();assert(live.every(n=>n.stopCalls.at(-1)?.length===0),'cut stops all live sounds immediately');
a.scream();const activeScream=nodes.filter(n=>n.onended&&n.stopCalls.at(-1)?.length);a.toggle();assert(activeScream.every(n=>n.stopCalls.at(-1)?.length===0),'mute stops an active recorded scream');const count=nodes.length;a.portal();a.scream();a.explosion();assert.equal(nodes.length,count,'mute blocks recorded and synthesized effects');assert.equal(button.textContent,'Sound off');a.toggle();
a.doom(.4,false);assert.equal(nodes.length,count,'quiet early city');a.doom(.8,false);assert(nodes.length>count,'near-doomsday explosions');const before=nodes.length;a.doom(1,true);assert(nodes.length>before,'arrival explosion');const arrival=nodes.length;a.doom(1,true);assert.equal(nodes.length,arrival,'arrival cannot repeat every countdown tick');
const beforeBirds=nodes.length;a.ambientBirds(true);assert(nodes.length>beforeBirds,'morning birds chirp when calm, unmuted and running');
const beforeOff=nodes.length;a.ambientBirds(false);assert.equal(nodes.length,beforeOff,'chaos (birds off) produces no chirp');
a.ambientBirds(false);a.toggle();const mutedCount=nodes.length;a.ambientBirds(true);assert.equal(nodes.length,mutedCount,'mute silences morning birds');a.toggle();
a.stop();
console.log('Sound passed: audible recorded voice, cached offline sample, exact 700 ms cutoff, immediate replay/skip/mute cleanup, morning bird chirps gated by mute and calm, and doomsday effects.');
