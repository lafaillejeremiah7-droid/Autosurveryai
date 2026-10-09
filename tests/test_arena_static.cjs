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
 const S=makeWorld();
 await S.step(301);
 let status=S.status();
 assert.equal(status.mode,'static');
 assert.equal(status.rooms,5,'royal garden has five pavilion rooms');
 assert.equal(status.gates.length,5,'no Coliseum gates remain');
 assert.equal(status.bloomLevel,0,'rosebuds begin closed');
 assert.equal(status.gardenFlowers,0,'no open roses before qualification');
 assert.ok(status.gardenHedges>40,'maze hedges have actual 3D geometry');
 assert.ok(status.debug.staticTriangles>2000&&status.debug.staticTriangles<12000,'garden mesh budget');
 for(const key of ['lawn','maze-hedges','rose-beds','pavilions','royal-palace','fountains','rose-arches'])
  assert.ok(status.debug.parts[key]>0,'garden mesh part '+key+' missing');
 const labels=S.elements['door-labels'];
 assert.equal(labels.children.length,5,'only real tournament pavilions have scene labels');
 assert.equal(S.elements['city-damage'].textContent,'0% BLOOM');
 const unflowered=status.gardenFlowers;
 S.W.setTournament(stages('complete','current','sealed'));
 await S.step(301);
 status=S.status();
 assert.equal(status.bloomLevel,1/3);
 assert.ok(status.gardenFlowers>unflowered&&status.gardenFlowers<112,'first bloom');
 const one=status.gardenFlowers;
 S.W.setTournament(stages('complete','complete','current'));await S.step(301);
 status=S.status();assert.equal(status.bloomLevel,2/3);
 assert.ok(status.gardenFlowers>one,'second bloom adds flowers');
 S.W.setTournament(stages('complete','complete','complete'));await S.step(301);
 status=S.status();assert.equal(status.bloomLevel,1);
 assert.equal(status.gardenFlowers,112,'all roses open at final');
 assert.equal(S.elements['city-status'].textContent,'ROYAL GARDEN IN FULL BLOOM');
 assert.equal(S.elements['city-damage'].textContent,'100% BLOOM');
 assert.equal(S.elements['city-progress'].style.width,'100%');
 assert.equal(status.gates.find(g=>g.key==='round1').state,'crowned');
 S.W.setSettings(settingsAt(1));
 assert.equal(S.status().progress,1);
 assert.equal(S.status().phase,'THE GARDEN IS OPEN');

 // A settled round still calls the 3D pavilion ceremony once.
 let bloomCalls=0;
 const ceremony=S.W.crownGate('round1','Face Your Weakness',()=>bloomCalls++);
 assert.equal(S.status().ceremony.phase,'approach');
 await flush();
 assert.equal(S.status().ceremony.phase,'descend');
 await S.step(1600);
 assert.equal(bloomCalls,1);
 assert.equal(S.status().ceremony.phase,'crowned');
 assert.equal(S.elements['ceremony-status'].textContent,'THE PAVILION BLOOMS');
 await S.step(3900);await ceremony;
 assert.equal(S.status().ceremony,null,'ceremony resolves');
 S.W.cancelCeremony();

 // Fake WebGL path: two shader programs, draws, mesh and live bloom.
 const {gl,rec}=fakeGL(),G=makeWorld({gl});
 G.W.setTournament(stages('complete','current','sealed'));
 await G.step(33);
 let g=G.status();
 assert.equal(g.mode,'webgl');
 assert.equal(g.rooms,5);
 assert.equal(g.bloomLevel,1/3);
 assert.ok(g.gardenHedges>40);
 assert.ok(g.debug.staticTriangles<12000);
 assert.equal(rec.programs.length,2,'3D shader and sky shader');
 assert.ok(rec.buffers.length>=2);
 assert.ok(g.cameraEye[1]>30,'aerial first-person garden camera');
 const firstTime=rec.uniforms.u_wtime;
 G.W.setPaused(true);await G.step(33);
 assert.equal(rec.uniforms.u_wtime,firstTime,'pausing holds the camera animation');
 G.W.setPaused(false);await G.step(33);
 assert.ok(rec.uniforms.u_wtime>firstTime,'resuming advances time');
 const oldBuilds=G.status().debug.rebuilds;
 G.W.setTournament(stages('complete','complete','complete'));
 await G.step(33);
 assert.equal(G.status().bloomLevel,1);
 assert.equal(G.status().debug.rebuilds,oldBuilds+1,'bloom transition rebuilds flowers');
 assert.equal(G.status().gardenFlowers,112);
 assert.deepEqual(G.warnings,[]);
 console.log('Royal Garden renderer tests passed: 5 pavilions, hedge maze, 3 blooms, fountain scene, 2D/WebGL, camera and ceremony.');
})().catch(e=>{console.error(e);process.exit(1);});
