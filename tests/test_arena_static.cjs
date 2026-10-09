// Royal Garden WebGL and 2D fallback tests with a fake DOM.
// Pass 1: static 2D fallback, five pavilions and three flower-bloom phases.
// Pass 2: fake WebGL, aerial camera, pause/resume and dynamic mesh rebuilds.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const timelineSrc=fs.readFileSync(path.join(root,'static/city-timeline.js'),'utf8');
const citySrc=fs.readFileSync(path.join(root,'static/city.js'),'utf8');
const plain=v=>JSON.parse(JSON.stringify(v));
const flush=()=>new Promise(r=>setImmediate(r));
const BASE_DATE=Date.parse('2030-01-01T00:00:00Z');
const at=sec=>new Date(BASE_DATE+sec*1000).toISOString();
// Settings that put the countdown at a given progress p (100 s window, 1 s steps).
const settingsAt=p=>p>=1?{start_at:at(-10),disaster_started_at:at(-110)}:{start_at:at(100-p*100),disaster_started_at:at(-p*100)};
const stages=(r1='current',r2='sealed',fin='sealed')=>[{key:'settings',status:'complete'},{key:'round1',status:r1},{key:'round2',status:r2},{key:'final',status:fin}];

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
 assert.equal(Object.values(status.debug.parts).reduce((sum,n)=>sum+n,0),status.debug.staticTriangles,'part triangle counts sum to mesh');
 assert.ok(status.debug.dynamicTriangles<4000,'bounded petals/fountain mesh');
 for(const key of ['lawn','maze-hedges','rose-beds','pavilions','royal-palace','fountains','rose-arches'])
  assert.ok(status.debug.parts[key]>0,'garden mesh part '+key+' missing');
 const labels=S.elements['door-labels'];
 assert.equal(labels.children.length,5,'only real tournament pavilions have scene labels');
 assert.equal(S.elements['city-damage'].textContent,'0% BLOOM');
 // Match progress changes while pavilion status stays 'current'. Both the HUD
 // and actual roses must update; identical saves must not rebuild the geometry.
 const partial=fraction=>stages().map(s=>({...s,progress:s.key==='round1'?fraction:0}));
 S.W.setTournament(partial(.2));await S.step(301);
 assert.equal(S.status().bloomLevel,.2/3);
 assert.equal(S.elements['city-damage'].textContent,'7% BLOOM');
 const firstMatchFlowers=S.status().gardenFlowers;
 assert(firstMatchFlowers>0,'first match opens roses before the round settles');
 S.W.setTournament(partial(.4));await S.step(301);
 assert.equal(S.elements['city-damage'].textContent,'13% BLOOM');
 assert(S.status().gardenFlowers>firstMatchFlowers,'same-status match advances the flowers');
 const cachedBuilds=S.status().debug.rebuilds;
 S.W.setTournament(partial(.4));await S.step(301);
 assert.equal(S.status().debug.rebuilds,cachedBuilds,'unchanged progress reuses geometry');
 S.W.setTournament(partial(.2));await S.step(301);
 assert.equal(S.status().gardenFlowers,firstMatchFlowers,'correction restores the exact prior bloom');
 S.W.setTournament(partial(0));await S.step(301);
 assert.equal(S.status().gardenFlowers,0,'reset closes the roses again');
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
 S.W.setTournament(stages('complete','complete','current').map(s=>({...s,progress:1})));await S.step(301);
 assert.equal(S.status().bloomLevel,.99,'unsettled final cannot claim full bloom');
 assert.equal(S.elements['city-damage'].textContent,'99% BLOOM');
 assert(S.status().gardenFlowers<112,'title tie leaves roses unopened');
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
 const ceremony=S.W.crownGate('round1','Know Thy Nature',()=>bloomCalls++);
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
 G.W.setTournament(stages('complete','current','sealed').map(s=>({...s,progress:s.key==='round2'?.2:0})));await G.step(33);
 assert.equal(G.status().bloomLevel,(1+.2)/3,'WebGL also updates within the second round');
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
 console.log('Royal Garden renderer passed: live match bloom, corrections, resets, title ties, cached geometry, 2D/WebGL, camera and ceremony.');
})().catch(e=>{console.error(e);process.exit(1);});
