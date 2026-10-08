const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/app.js','utf8');
const nodes=[],speechCalls=[],events={};let now=100000;
const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
const node=()=>{const n={frequency:param(),gain:param(),connect(){},start(){},stop(){this.stopped=true;}};nodes.push(n);return n;};
class AudioContext{constructor(){this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination={};}resume(){}createOscillator(){return node();}createGain(){return node();}createBiquadFilter(){return node();}createBufferSource(){return node();}createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}}
const button={setAttribute(){},textContent:''};
const window={AudioContext,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{speak:u=>speechCalls.push(u.text),cancel(){speechCalls.push('CANCEL');}}};
vm.runInNewContext(source.slice(source.indexOf('window.BrawlAudio='),source.indexOf('const value=path')),{window,document:{hidden:false,addEventListener:(e,f)=>events[e]=f},$:()=>button,Math,Date:{now:()=>now},Set});
const a=window.BrawlAudio;assert.equal(a.getStatus().unlocked,false);events.pointerdown();assert.equal(a.getStatus().unlocked,true);
a.portal();a.help();assert(speechCalls.includes('Help me!'));a.scream();const sounds=nodes.filter(n=>n.stopped!==undefined||n.onended);assert(sounds.length);a.cut();assert(sounds.every(n=>n.stopped),'cut scream must stop every live source immediately');assert.equal(speechCalls.at(-1),'CANCEL');
a.toggle();const count=nodes.length;a.portal();a.help();a.explosion();assert.equal(nodes.length,count,'muted effects must not create sources');assert.equal(button.textContent,'Sound off');a.toggle();
a.doom(.4,false);assert.equal(nodes.length,count,'quiet early city');a.doom(.8,false);assert(nodes.length>count,'near-doomsday explosions');const before=nodes.length;a.doom(1,true);assert(nodes.length>before,'arrival explosion');const arrival=nodes.length;a.doom(1,true);assert.equal(nodes.length,arrival,'arrival cannot repeat every countdown tick');a.stop();
console.log('Sound passed: gesture unlock, Help me, abrupt scream cutoff, mute, near-doomsday effects, and single arrival burst.');
