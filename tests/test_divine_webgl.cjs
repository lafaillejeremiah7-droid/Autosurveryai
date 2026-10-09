// Mock-WebGL regression: proves that the divine cutscene actually submits lit
// 3D triangle geometry to a GPU-style renderer, rather than showing flat SVG.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
let now=1000,frame=null,deleted=0,draws=0,uploaded=0,depthUsed=false;
const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
 ARRAY_BUFFER:5,DYNAMIC_DRAW:6,FLOAT:7,TRIANGLES:8,DEPTH_TEST:9,CULL_FACE:10,
 COLOR_BUFFER_BIT:0x4000,DEPTH_BUFFER_BIT:0x100,
 createShader(type){return {type};},shaderSource(){},compileShader(){},
 getShaderParameter(){return true;},getShaderInfoLog(){return '';},
 createProgram(){return {};},attachShader(){},linkProgram(){},
 getProgramParameter(){return true;},getProgramInfoLog(){return '';},
 createBuffer(){return {};},getAttribLocation(_p,name){return ['a_pos','a_normal','a_color','a_kind'].indexOf(name);},
 getUniformLocation(){return {};},viewport(){},clearColor(){},clear(){},
 enable(v){if(v===this.DEPTH_TEST)depthUsed=true;},disable(){},
 useProgram(){},uniformMatrix4fv(){},bindBuffer(){},
 bufferData(_target,mesh){uploaded=mesh.length;},enableVertexAttribArray(){},
 vertexAttribPointer(){},drawArrays(_mode,_first,count){draws++;assert(count>1000,'submits thousands of 3D vertices');},
 deleteBuffer(){deleted++;},deleteProgram(){deleted++;}
};
const canvas={width:0,height:0,getContext(type){assert.equal(type,'webgl');return gl;},
 getBoundingClientRect(){return {width:1200,height:580};}};
const model=Array.from({length:10},(_,i)=>({id:'p'+(i+1),tier:i%7,priorPruned:i===0||i===1,name:'Player '+(i+1)}));
const labels=model.map(()=>({style:{}}));
const context={window:{devicePixelRatio:1},performance:{now:()=>now},
 console,Math,Float32Array,requestAnimationFrame(fn){frame=fn;return 1;},
 cancelAnimationFrame(){frame=null;}};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/divine3d.js'),'utf8'),context);
const three=context.window.Divine3D;
assert.equal(typeof three.mount,'function');
assert.equal(three.mount(canvas,model,['p3','p7'],-1,labels),true);
assert.equal(three._debug().plants,10);
assert(three._debug().triangles>1000,'scene includes many surface-lit 3D triangles');
assert(uploaded>=three._debug().triangles*30,'vertices include 3D positions, normals, RGB and material: '+JSON.stringify({uploaded,triangles:three._debug().triangles,floats:three._debug().floats,draws}));
assert.equal(draws,1);
assert.equal(depthUsed,true,'depth-tested perspective rendering');
assert(labels.every(p=>p.style.left&&p.style.top),'labels use projection from 3D model space');
const EMERGENCE_FRAME=3.2;
const geo=three._geometry(model,['p3','p7'],-1,0);
assert.equal(geo.positions.length,10);
assert(geo.positions[0][2]!==geo.positions[5][2],'two spatially separated rows of roses');
assert(geo.triangles>1000);
assert(geo.gardenTriangles>3000,'detailed 3D garden includes thousands of architectural triangles');
assert.equal(geo.plantStages,7,'all seven competitive flower growth stages have dedicated meshes');
const meshes=three._growthMeshes();
assert.equal(meshes.length,7);
assert.deepEqual(meshes.map(x=>x.tier),[0,1,2,3,4,5,6]);
assert.equal(new Set(meshes.map(x=>x.triangles)).size,7,'all growth levels have distinctive 3D surface complexity');
assert(meshes[6].triangles>meshes[0].triangles*4,'full-bloom rose has substantially more modeled geometry than the zero-goal seedling');
const rendererSource=fs.readFileSync(path.join(__dirname,'../static/divine3d.js'),'utf8');
assert(rendererSource.includes('v_pos.z<-20.3'),'WebGL clips the hand behind the physical portal plane');
assert(geo.details.includes('fountains')&&geo.details.includes('gazebos')&&geo.details.includes('hedge maze')&&geo.details.includes('palace'),'3D field includes royal garden architecture');
assert(geo.portalPlane<0,'emerging hand is revealed in front of a physical portal plane');
assert(geo.handScale>=4.7,'enormous hand is nearly twice the previous 2.6x scale');
assert(geo.portalRadius>=15,'portal surrounds the gigantic hand, not a small halo');
assert(geo.portalRadius>=8,'portal is giant and centered over the plants');
assert.deepEqual(Array.from(geo.portalCenter.slice(0,1)),[0],'portal stays on the horizontal centerline');
assert(geo.portalCenter[1]>20,'portal is high above all rose flowers');
assert(geo.handScale>=2.5,'hand and shears are more than 2.5x original size');
assert.equal(geo.portalOpen,0,'portal starts closed at the beginning of contemplation');
assert.equal(three._geometry(model,['p3','p7'],-1,.18).handEmergence,0,'no giant hand before the portal opens');
assert(three._geometry(model,['p3','p7'],-1,.35).portalOpen>0,'portal opens first');
assert(three._geometry(model,['p3','p7'],-1,1.35).handEmergence>0,'hand slides out after portal opens');
const opening=three._geometry(model,['p3','p7'],-1,1.2);
assert.equal(opening.portalOpen,1,'giant portal is fully open after its entrance');
const emerging=three._geometry(model,['p3','p7'],-1,EMERGENCE_FRAME);
assert.equal(emerging.handEmergence,1,'giant hand has fully emerged before the five-second verdict');
const duringCut=three._geometry(model,['p3','p7'],0,0);
assert.equal(duringCut.portalOpen,1,'portal remains open while the shears cut');
assert.equal(duringCut.handScale,geo.handScale,'the same huge hand remains during elimination');
now=1520;frame();assert.equal(draws,2,'animation redraws WebGL geometry each frame');
assert.equal(three.mount(canvas,model,['p3','p7'],0,labels),true);
assert.equal(three._debug().step,0,'first target drives a new 3D pruning phase');
now=2650;frame();assert(three._debug().triangles>1000,'geometry rebuilds during cutting motion');
three.stop();assert.equal(three._debug(),null);
assert(deleted>=4,'GL resources are released between cut scenes');
const fallback={getContext(){return null;}};
assert.equal(three.mount(fallback,model,['p3','p7'],-1,labels),false,'no-WebGL fallback remains available');
console.log('PASS Divine 3D: actual WebGL geometry and depth rendering, ten plants in two rows, articulated cut phases, projected labels, animation and resource cleanup.');
