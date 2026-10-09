// Arena world harness: runs city-timeline.js + city.js in a vm with a fake DOM.
// Pass 1: getContext('webgl') is null, so the static 2D fallback runs (AC 8, AC 9, budgets, still ceremony).
// Pass 2: a recording fake WebGL context (uniform declarations, AC 19 precision, dusk ease, AC 16 camera gating).
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const timelineSrc=fs.readFileSync(path.join(root,'static/city-timeline.js'),'utf8');
const citySrc=fs.readFileSync(path.join(root,'static/city.js'),'utf8');
const TAU=Math.PI*2,DEG=Math.PI/180;
const plain=v=>JSON.parse(JSON.stringify(v));
const angDist=(a,b)=>Math.abs(((a-b+Math.PI)%TAU+TAU)%TAU-Math.PI);
const flush=()=>new Promise(r=>setImmediate(r));
const BASE_DATE=Date.parse('2030-01-01T00:00:00Z');
const at=sec=>new Date(BASE_DATE+sec*1000).toISOString();
// Settings that put the countdown at a given progress p (100 s window, 1 s steps).
const settingsAt=p=>p>=1?{start_at:at(-10),disaster_started_at:at(-110)}:{start_at:at(100-p*100),disaster_started_at:at(-p*100)};
const stages=(r1='current',r2='sealed',fin='sealed')=>[{key:'settings',status:'complete'},{key:'round1',status:r1},{key:'round2',status:r2},{key:'final',status:fin}];

const BUDGET={
 webgl:{ground:108,hills:120,cypresses:192,floor:48,rings:192,wall:192,cavea:2304,facade:1776,masts:288,velarium:96,pulvinar:80,torches:480,gates:1742,spectators:3840,dais:44},
 static:{ground:108,hills:0,cypresses:0,floor:48,rings:0,wall:192,cavea:2304,facade:1776,masts:288,velarium:96,pulvinar:80,torches:480,gates:1742,spectators:1920,dais:44}};

function element(id){
 return {id,textContent:'',hidden:false,className:'',dataset:{},children:[],replaceCount:0,
  style:{setProperty(k,v){this[k]=v;}},
  replaceChildren(...c){this.children=c;this.replaceCount++;},
  setAttribute(k,v){this['attr:'+k]=v;},addEventListener(){},
  getBoundingClientRect(){return {width:1280,height:720,top:0,left:0,bottom:720,right:1280};}};
}
function fakeGL(){
 const rec={programs:[],locations:[],buffers:[],bufferData:new Map(),uniforms:{},bound:null};
 const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,DYNAMIC_DRAW:7,DEPTH_TEST:8,BLEND:9,TRIANGLES:10,FLOAT:11,DEPTH_BUFFER_BIT:12,SRC_ALPHA:13,ONE_MINUS_SRC_ALPHA:14,
  createShader:type=>({type,src:''}),shaderSource:(s,src)=>{s.src=src;},compileShader(){},getShaderParameter:()=>true,getShaderInfoLog:()=>'',
  createProgram:()=>{const p={shaders:[]};rec.programs.push(p);return p;},attachShader:(p,s)=>{p.shaders.push(s);},linkProgram(){},getProgramParameter:()=>true,getProgramInfoLog:()=>'',
  getUniformLocation:(p,name)=>{rec.locations.push({p,name});return {name};},
  getAttribLocation:()=>0,enableVertexAttribArray(){},vertexAttribPointer(){},
  createBuffer:()=>{const b={id:rec.buffers.length};rec.buffers.push(b);rec.bufferData.set(b,0);return b;},
  bindBuffer:(t,b)=>{rec.bound=b;},bufferData:()=>{rec.bufferData.set(rec.bound,rec.bufferData.get(rec.bound)+1);},
  uniform1f:(l,v)=>{rec.uniforms[l.name]=v;},uniform2f:(l,a,b)=>{rec.uniforms[l.name]=[a,b];},
  uniform3fv:(l,v)=>{rec.uniforms[l.name]=Array.from(v);},uniformMatrix4fv:(l,t,v)=>{rec.uniforms[l.name]=Array.from(v);},
  viewport(){},disable(){},enable(){},useProgram(){},drawArrays(){},clear(){},blendFunc(){},depthMask(){}};
 return {gl,rec};
}
function makeWorld({gl=null}={}){
 let now=1000;
 const rafs=[],classes=new Set(),warnings=[];
 const ctx2d={fills:0,createLinearGradient:()=>({addColorStop(){}}),fillRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){this.fills++;}};
 const elements={};
 const canvas=id=>Object.assign(element(id),{getContext:type=>type==='webgl'?gl:type==='2d'?ctx2d:null,replaceWith(n){elements['city-canvas']=n;}});
 elements['city-canvas']=canvas('city-canvas');
 for(const id of ['world','door-labels','city-status','city-damage','city-progress','ceremony-status'])elements[id]=element(id);
 const document={hidden:false,
  body:{classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},style:{setProperty(k,v){this[k]=v;}}},
  getElementById:id=>elements[id]||null,createElement:tag=>tag==='canvas'?canvas(''):element('')};
 const audio={birds:[],cues:[],ambientBirds(v){this.birds.push(v);},ambience(p,a){this.cues.push([p,a]);return null;}};
 let dateNow=BASE_DATE;
 const context={document,console:{log:console.log,warn:(...a)=>warnings.push(a.join(' ')),error:console.error},
  performance:{now:()=>now},requestAnimationFrame:fn=>{rafs.push(fn);return rafs.length;},innerHeight:720,devicePixelRatio:1,
  location:{reload(){}},matchMedia:()=>({matches:false,addEventListener(){}}),BrawlAudio:audio,addEventListener(){},__dateNow:()=>dateNow};
 context.window=context;
 vm.createContext(context);
 vm.runInContext('const __RealDate=Date;globalThis.Date=class extends __RealDate{static now(){return __dateNow();}};',context);
 vm.runInContext(timelineSrc,context);vm.runInContext(citySrc,context);
 const W=context.CityWorld;
 const api={W,context,elements,classes,audio,ctx2d,warnings,
  get now(){return now;},
  async step(ms){now+=ms;const fns=rafs.splice(0);for(const fn of fns)fn(now);await flush();},
  status:()=>plain(W.getStatus()),layout:()=>plain(W._debugLayout()),dynamic:()=>Array.from(W._debugDynamic())};
 return api;
}
function checkBudgets(s,mode,cap){
 const parts=s.debug.parts;
 assert.ok(s.debug.staticTriangles<=cap,mode+' static triangles '+s.debug.staticTriangles+' > '+cap+' parts '+JSON.stringify(parts));
 for(const [k,row] of Object.entries(BUDGET[mode])){
  assert.ok(k in parts,'missing part '+k+' '+JSON.stringify(parts));
  assert.ok(parts[k]<=row*1.1,mode+' part '+k+'='+parts[k]+' over budget '+row+' parts '+JSON.stringify(parts));
 }
 assert.equal(Object.values(parts).reduce((a,b)=>a+b,0),s.debug.staticTriangles,'parts sum to the static mesh');
 assert.ok(s.debug.dynamicTriangles<=4000,'dynamic '+s.debug.dynamicTriangles);
}
function checkLayout(L){
 assert.equal(L.gates.length,7);
 assert.deepEqual(L.gates.map(g=>g.key),['settings','round1','round2','final','overview','losers','triumph']);
 const halves=[11.7,9.5,8.8,9.5,13.1,11.9,11.9];
 L.gates.forEach((g,i)=>assert.ok(Math.abs(g.half/DEG-halves[i])<.15,g.key+' half '+g.half/DEG));
 for(let i=0;i<L.gates.length;i++)for(let j=i+1;j<L.gates.length;j++){
  const a=L.gates[i],b=L.gates[j];assert.ok(angDist(a.th,b.th)>a.half+b.half,a.key+' overlaps '+b.key);
 }
 const P=L.pulvinar;
 for(const g of L.gates)assert.ok(g.rows<=6||angDist(g.th,P.th)>g.half+P.half,'pulvinar overlaps '+g.key);
 for(const g of L.gates){
  assert.equal(g.rows,{7:3,8:4,9:5}[g.size],g.key+' rows');
  assert.ok(3.2+g.rows*1.4>=g.size*1.05-1e-9&&3.2+(g.rows-1)*1.4<g.size*1.05,g.key+' first unclipped tread');
  assert.ok(P.base>g.size*1.05+.6,'pulvinar base above '+g.key+' door label');
  const f=g.face,s=g.size;
  assert.ok(f.keystoneTop<f.bannerBottom,g.key+' keystone below banner');
  assert.ok(f.bannerTop<f.blockTop,g.key+' banner below block top');
  assert.ok(Math.abs(f.tunnelCeiling-f.archApex)<1e-9,g.key+' tunnel ceiling at arch apex');
  assert.ok(Math.abs(f.keystoneTop-.87*s)<1e-9&&Math.abs(f.bannerBottom-.88*s)<1e-9&&Math.abs(f.bannerTop-1.04*s)<1e-9&&Math.abs(f.blockTop-1.05*s)<1e-9);
  // Laurel circle inside the banner box (T/U) and in front of its surface (N).
  const lu=g.laurelAt[1]-g.pos[1];
  assert.ok(Math.abs(lu-f.bannerCenter)<1e-9,g.key+' laurel centered on banner');
  assert.ok(lu-f.laurel.r>=f.bannerBottom-1e-9&&lu+f.laurel.r<=f.bannerTop+1e-9,g.key+' laurel inside banner height');
  assert.ok(f.laurel.r<f.bannerHalfW,g.key+' laurel inside banner width');
  assert.ok(f.laurel.n>f.bannerFrontN,g.key+' laurel in front of banner');
  const off=g.laurelAt.map((v,i)=>v-g.pos[i]),alongN=off[0]*g.N[0]+off[2]*g.N[2];
  assert.ok(Math.abs(alongN-f.laurel.n)<1e-9,g.key+' laurel offset along N');
  assert.ok(f.tunnelLen<g.depthN,g.key+' tunnel '+f.tunnelLen+' fits block depth '+g.depthN);
  assert.ok(Math.abs(Math.hypot(...g.N)-1)<1e-9&&Math.abs(g.N[1])<1e-12,g.key+' N is a horizontal unit vector');
 }
 assert.ok(Math.abs(P.base-11.6)<.005&&Math.abs(P.s0-1.39)<.005&&Math.abs(P.s1-1.61)<.005,'pulvinar extent');
 assert.ok(P.s1<L.torchS,'pulvinar inside the torch ring');
 assert.ok(Math.abs(L.torchS-1.6925)<1e-9);
 assert.equal(L.torches.length,24);
}
function expectedSeats(L,lite){
 let n=0;const D=TAU/48;
 for(let r=0;r<12;r++)for(let j=0;j<48;j++){if(j%6===0)continue;for(let k=0;k<2;k++){
  const th=j*D+(k+.5)*D/2;
  if(r>=6&&r<=10&&angDist(th,L.pulvinar.th)<L.pulvinar.half)continue;
  if(L.gates.some(g=>r<g.rows&&angDist(th,g.th)<=g.half))continue;
  if(lite&&(r*96+j*2+k)%2)continue;n++;}}
 return n;
}
function centroid(data){let x=0,y=0,z=0,n=0;for(let i=0;i<data.length;i+=10){x+=data[i];y+=data[i+1];z+=data[i+2];n++;}return [x/n,y/n,z/n];}
const equalArrays=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

(async()=>{
 // ---------------- Pass 1: static fallback ----------------
 const S=makeWorld();
 const ST=301; // static mode redraws at most every 300 ms
 await S.step(ST);
 let s=S.status();
 assert.equal(s.mode,'static');assert.equal(s.rooms,5);assert.equal(s.gates.length,7);
 assert.equal(s.phase,'ARENA AT REST');assert.equal(s.progress,0);
 assert.ok(s.gates.every(g=>g.state==='open'));
 const L=S.layout();checkLayout(L);
 assert.equal(s.seats,expectedSeats(L,true),'seats count slots after skips and the static stride');
 assert.ok(s.spectators/s.seats>=.04&&s.spectators/s.seats<=.13,'p=0 fill '+s.spectators/s.seats);
 assert.equal(s.torchCount,24);assert.equal(s.torchesLit,0);assert.equal(s.dusk,0);
 assert.equal(S.elements['city-status'].textContent,'ARENA AT REST');
 assert.ok(S.ctx2d.fills>0,'static painter drew triangles');
 // Door labels: five Roman-numbered gates plus two decor markers in street view, reused across frames.
 const host=S.elements['door-labels'];
 assert.deepEqual(host.children.map(c=>c.textContent),['I / Players & rules','II / Be Better','III / Enough','IV / Forget The Past','V / Leaderboard',"Losers' Gate",'Triumph Gate']);
 assert.equal(host.children.filter(c=>c.className==='door-marker decor').length,2);
 const replaced=host.replaceCount;
 for(let i=0;i<3;i++){S.W.setPaused(false);await S.step(ST);}
 assert.equal(host.replaceCount,replaced,'labels reused (no per-frame DOM)');assert.equal(host.children.length,7);
 // Spectators rise with p.
 const fills=[];
 for(const p of [0,.5,1]){S.W.setSettings(settingsAt(p));await S.step(ST);const t=S.status();assert.equal(t.progress,p);fills.push(t);}
 assert.ok(fills[0].spectators<=fills[1].spectators&&fills[1].spectators<=fills[2].spectators,'spectators non-decreasing');
 assert.equal(fills[2].spectators,fills[2].seats,'full house at p=1');
 assert.equal(fills[2].phase,'THE GAMES BEGIN');
 assert.equal(S.context.document.body.style['--arena-heat'],'1');
 // Gate states and dusk.
 S.W.setTournament(stages('complete','current','sealed'));await S.step(ST);s=S.status();
 assert.deepEqual(s.gates.map(g=>g.state),['open','crowned','open','sealed','open','open','open']);
 assert.equal(s.duskTarget,1/3);assert.equal(s.dusk,s.duskTarget,'dusk snaps when still');
 assert.ok(host.children[3].className.includes('locked'),'sealed gate marker is locked');
 S.W.setTournament(stages('complete','complete','complete'));await S.step(ST);s=S.status();
 assert.equal(s.dusk,1);assert.equal(s.torchesLit,s.torchCount,'every torch lit at dusk 1');
 checkBudgets(s,'static',11000);
 // Birds: on while calm and dusk 0, off once a round is settled.
 S.W.setTournament(stages('current','sealed','sealed'));await S.step(ST);
 S.W.setSettings(settingsAt(.05));assert.equal(S.audio.birds.at(-1),true,'birds while calm at dusk 0');
 S.W.setTournament(stages('complete','current','sealed'));await S.step(ST);assert.ok(S.status().dusk>0);
 S.W.setSettings(settingsAt(.05));assert.equal(S.audio.birds.at(-1),false,'no birds once dusk > 0');
 assert.deepEqual(plain(S.audio.cues.at(-1)),[.05,false]);
 S.W.setSettings(settingsAt(1));assert.equal(S.audio.birds.at(-1),false,'no birds once the games begin');
 S.W.setSettings(settingsAt(.05));
 // Ceremony (AC 9) with still visuals (static mode, NFR3).
 let crowns=0,resolved=false;
 const pending=S.W.crownGate('round1','Be Better',()=>crowns++).then(()=>{resolved=true;});
 s=S.status();assert.equal(s.sceneView,'ceremony');assert.deepEqual(s.ceremony,{key:'round1',phase:'approach'});
 assert.ok(S.classes.has('gate-ceremony'));assert.equal(S.elements['ceremony-status'].textContent,'RETURNING TO THE ARENA: BE BETTER');
 await flush();s=S.status();assert.equal(s.ceremony.phase,'descend');
 assert.equal(s.gates[1].state,'open','no early wreath while the laurel descends');
 const laurelAt=L.gates[1].laurelAt;
 const ceremonySlice=()=>{const r=S.status().debug.ceremonyRange;return S.dynamic().slice(r[0],r[1]);};
 await S.step(500);const a05=ceremonySlice();
 await S.step(500);const a10=ceremonySlice();
 assert.ok(a05.length>0,'laurel drawn while descending');assert.ok(equalArrays(a05,a10),'still laurel does not move');
 centroid(a05).forEach((v,i)=>assert.ok(Math.abs(v-laurelAt[i])<1e-6,'laurel rests at laurelAt'));
 assert.equal(S.elements['ceremony-status'].textContent,'THE LAUREL DESCENDS');assert.equal(crowns,0);
 await S.step(500);s=S.status();
 assert.equal(crowns,1);assert.equal(s.ceremony.phase,'crowned');assert.equal(s.gates[1].state,'crowned');
 assert.equal(S.elements['ceremony-status'].textContent,'GATE CROWNED. ROUND COMPLETE');
 await S.step(500);const a20=ceremonySlice();await S.step(1000);const a30=ceremonySlice();
 assert.ok(a20.length>0&&equalArrays(a20,a30),'still crown ring is static (no petal burst)');
 assert.ok(!resolved);await S.step(2100);assert.equal(S.status().ceremony,null);await pending;assert.ok(resolved);assert.equal(crowns,1,'onCrown exactly once');
 assert.equal(S.status().sceneView,'ceremony');
 S.W.cancelCeremony();s=S.status();
 assert.equal(s.sceneView,'street');assert.equal(s.ceremony,null);assert.ok(!S.classes.has('gate-ceremony'));
 assert.deepEqual(s.cameraEye,[0,60,16]);
 S.W.cancelCeremony();assert.deepEqual(S.status(),s,'second cancelCeremony changes nothing');
 // Cancel mid-ceremony resolves at once without crowning.
 let midCrowns=0,midResolved=false;
 const mid=S.W.crownGate('round2',null,()=>midCrowns++).then(()=>{midResolved=true;});
 assert.equal(S.elements['ceremony-status'].textContent,'RETURNING TO THE ARENA');
 await flush();await S.step(500);S.W.cancelCeremony();await mid;
 assert.ok(midResolved);assert.equal(midCrowns,0);assert.equal(S.status().ceremony,null);assert.equal(S.status().sceneView,'street');
 // Unknown key resolves immediately without onCrown.
 let unknown=0;await S.W.crownGate('nope','X',()=>unknown++);assert.equal(unknown,0);assert.equal(S.status().ceremony,null);assert.equal(S.status().sceneView,'street');
 assert.equal(S.warnings.length,0);
 console.log('Arena static pass: parts '+JSON.stringify(s.debug.parts)+' total '+s.debug.staticTriangles);

 // ---------------- Pass 2: fake WebGL ----------------
 const {gl,rec}=fakeGL();
 const G=makeWorld({gl});
 const FR=33;
 G.W.setSettings(settingsAt(.1));G.W.setTournament(stages());
 await G.step(FR);
 s=G.status();assert.equal(s.mode,'webgl');assert.equal(s.rooms,5);assert.equal(G.warnings.length,0);
 checkLayout(G.layout());
 assert.equal(s.seats,expectedSeats(G.layout(),false));
 // Uniform declarations and AC 19 precision rule.
 const declared=src=>{const out={};for(const m of src.matchAll(/uniform\s+(?:(lowp|mediump|highp)\s+)?(\w+)\s+([^;]+);/g))for(const n of m[3].split(','))out[n.trim().replace(/\[.*$/,'')]=m[1]||null;return out;};
 assert.equal(rec.programs.length,2);
 for(const p of rec.programs){
  const [v,f]=[p.shaders.find(x=>x.type===gl.VERTEX_SHADER),p.shaders.find(x=>x.type===gl.FRAGMENT_SHADER)];
  const dv=declared(v.src),df=declared(f.src);
  for(const {name} of rec.locations.filter(l=>l.p===p))assert.ok(name in dv||name in df,'uniform '+name+' is declared');
  const shared=Object.keys(dv).filter(n=>n in df);
  for(const n of shared)assert.ok(dv[n]&&dv[n]===df[n],'uniform '+n+' shared with mismatched precision');
  assert.deepEqual(shared,[],'no uniform shared between stages');
 }
 assert.deepEqual(rec.locations.filter(l=>l.p===rec.programs[0]).map(l=>l.name),['u_vp','u_wtime','u_wheat','u_surge','u_center','u_eye','u_fog','u_heat','u_dusk','u_time']);
 assert.deepEqual(rec.locations.filter(l=>l.p===rec.programs[1]).map(l=>l.name),['u_heat','u_dusk','u_time']);
 // Worst-case budget: p=1 and three crowned gates.
 G.W.setSettings(settingsAt(1));G.W.setTournament(stages('complete','complete','complete'));await G.step(FR);
 checkBudgets(G.status(),'webgl',13500);
 const webglParts=G.status().debug.parts;
 // Reset to a calm morning before the ease test.
 G.W.setSettings(settingsAt(.1));G.W.setTournament(stages());
 // setPaused freezes elapsed (u_wtime).
 await G.step(FR);await G.step(FR);const w1=rec.uniforms.u_wtime;
 G.W.setPaused(true);await G.step(FR);const w2=rec.uniforms.u_wtime;
 for(let i=0;i<5;i++)await G.step(FR);G.W.setPaused(true);await G.step(FR);const w3=rec.uniforms.u_wtime;
 assert.equal(w2,w1,'paused frame does not advance');assert.equal(w3,w1,'elapsed frozen while paused');
 G.W.setPaused(false);await G.step(FR);assert.ok(rec.uniforms.u_wtime>w3,'elapsed resumes');
 // Dusk ease never rebuilds the static mesh.
 const staticBuffer=rec.buffers[0];
 let stable=0,last=-1;
 for(let i=0;i<200&&stable<3;i++){await G.step(FR);const r=G.status().debug.rebuilds;stable=r===last?stable+1:0;last=r;}
 assert.equal(stable,3,'world settles');
 const r0=G.status().debug.rebuilds,b0=rec.bufferData.get(staticBuffer);
 G.W.setTournament(stages('complete','current','sealed'));
 await G.step(FR);
 assert.equal(G.status().debug.rebuilds,r0+1,'duskTarget change rebuilds once');
 const b1=rec.bufferData.get(staticBuffer);assert.equal(b1,b0+1);
 for(let i=0;i<9;i++)await G.step(FR);
 s=G.status();assert.ok(s.dusk>0&&s.dusk<1/3,'dusk easing: '+s.dusk);
 for(let i=0;i<60;i++)await G.step(FR);
 s=G.status();
 assert.equal(s.debug.rebuilds,r0+1,'ease does not rebuild');assert.equal(rec.bufferData.get(staticBuffer),b1,'no static upload during ease');
 assert.equal(s.dusk,1/3,'clamped ease reaches the target exactly');
 assert.ok(Math.abs(rec.uniforms.u_dusk-1/3)<1e-12);
 // AC 16: the ceremony camera stays on its snapshot while paused, rumbles when not.
 async function ceremonyEyeAtAge2(pausedRun){
  let crowned=0;
  const done=G.W.crownGate('round1','Be Better',()=>crowned++);
  for(let i=0;i<400&&G.status().ceremony?.phase!=='descend';i++)await G.step(FR);
  assert.equal(G.status().ceremony.phase,'descend');
  const snapshot=G.status().cameraEye;
  G.W.setPaused(pausedRun);
  await G.step(2000);
  const eye=G.status().cameraEye;
  assert.equal(crowned,1);
  G.W.cancelCeremony();await done;G.W.setPaused(false);
  for(let i=0;i<200&&G.status().traveling;i++)await G.step(FR);
  return {snapshot,eye};
 }
 const paused=await ceremonyEyeAtAge2(true);
 assert.deepEqual(paused.eye,paused.snapshot,'paused ceremony camera equals the snapshot');
 const live=await ceremonyEyeAtAge2(false);
 assert.notDeepEqual(live.eye,live.snapshot,'unpaused ceremony camera rumbles');
 assert.equal(G.status().sceneView,'street');
 // Street camera: the aerial view sits high above the stands.
 assert.ok(G.status().cameraEye[1]>15);
 // A page load with settled rounds starts at the saved dusk (no sunset replay, no morning birds).
 const R=makeWorld({gl:fakeGL().gl});
 R.W.setSettings(settingsAt(.05));R.W.setTournament(stages('complete','complete','current'));
 assert.equal(R.status().dusk,2/3,'first setTournament snaps dusk');
 R.W.setSettings(settingsAt(.05));assert.equal(R.audio.birds.at(-1),false,'no birds on a reload after settled rounds');
 await R.step(FR);assert.equal(R.status().dusk,2/3,'no sunset replay after load');
 console.log('Arena WebGL pass: parts '+JSON.stringify(webglParts)+' total '+Object.values(webglParts).reduce((a,b)=>a+b,0));
 console.log('Arena static test passed: static + WebGL passes, AC 8, AC 9, AC 16, AC 19, budgets, dusk ease without rebuilds, still ceremony, labels, birds.');
})().catch(e=>{console.error(e);process.exit(1);});
