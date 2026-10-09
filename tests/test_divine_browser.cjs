// Real Chromium / SwiftShader smoke test for the Divine Selection renderer.
// This intentionally checks the SERVER script route and live WebGL shader,
// since isolated Node mesh tests cannot detect a missing JS asset or GL link.
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const os=require('node:os'),fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'divine-real-browser-'));
const server=spawn(process.env.PYTHON||'python3',['app.py','--port','0','--no-browser','--data',path.join(tmp,'state.json')],{cwd:repo});
const url=new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>reject(Error('Local Python server did not start')),20000);
 let stdout='';
 server.stdout.on('data',x=>{stdout+=x.toString();const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
 server.on('error',reject);server.on('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code));});
});
(async()=>{
 const base=await url;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE||'/usr/bin/google-chrome',args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-gpu-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto(base,{waitUntil:'domcontentloaded'});
  assert.equal(response.status(),200);
  const asset=await page.request.get(base+'/divine3d.js');
  assert.equal(asset.status(),200,'cutscene JavaScript must be served by app.py');
  assert((await asset.text()).includes('PORTAL_PLANE=44'),'served code should contain the overhead portal');
  const status=await page.evaluate(()=>{
   if(!window.Divine3D)throw Error('The Divine3D script was NOT loaded by the browser');
   const canvas=document.createElement('canvas');
   canvas.id='divine-webgl-smoke';
   Object.assign(canvas.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:'9999',display:'block'});
   document.body.appendChild(canvas);
   const gl=canvas.getContext('webgl',{alpha:false,antialias:true});
   if(!gl)throw Error('Chromium could not create a WebGL context');
   const models=Array.from({length:10},(_,i)=>({id:'p'+(i+1),name:'Plant '+(i+1),tier:i%7,priorPruned:false}));
   const labels=models.map(()=>({style:{}}));
   if(!window.Divine3D.mount(canvas,models,['p2','p9'],-1,labels))throw Error('Live WebGL shader compile or link failed');
   const s=window.Divine3D._debug();
   return {running:s.running,triangles:s.triangles,portalAxis:window.Divine3D._geometry(models,['p2','p9'],-1,0).portalAxis};
  });
  assert(status.running&&status.triangles>1000&&status.portalAxis==='y','real GPU-style scene must render many triangles');
  await page.waitForTimeout(3700);
  const stage=await page.evaluate(()=>{
   const s=window.Divine3D._debug();
   return {running:s.running,triangles:s.triangles,phase:s.phase,handY:s.hand?.[1]};
  });
  assert(stage.running&&stage.triangles>1000&&stage.handY<44,'hand must descend BELOW the overhead portal before five seconds');
  // Print one compact visual sample for design inspection; large images are
  // intentionally not saved to the repo.
  const jpg=await page.screenshot({type:'jpeg',quality:46});
  console.log('DIVINE_ARRIVAL_JPEG_BASE64='+jpg.toString('base64'));
  const next=await page.evaluate(()=>{
   const m=Array.from({length:10},(_,i)=>({id:'p'+(i+1),name:'Plant '+(i+1),tier:i%7,priorPruned:false}));
   return window.Divine3D.setAction(0,m,['p2','p9']);
  });
  assert(next,'renderer continues into pruning without recreating canvas');
  await page.waitForTimeout(1080);
  const action=await page.evaluate(()=>window.Divine3D._debug());
  assert(action.phase==='pruning'&&action.step===0,'first snip uses the same WebGL scene');
  assert.deepEqual(errors,[],'no browser errors during portal emergence and first cut');
  console.log('PASS real Chrome + SwiftShader: served /divine3d.js, linked shader, visible descended hand, 3D portal and continuous pruning.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.kill());
