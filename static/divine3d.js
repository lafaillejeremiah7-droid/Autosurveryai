/* Royal Garden Divine Selection: the same dependency-free, low-poly WebGL
 * geometry approach as city.js, rendered into an independent cinematic canvas.
 * All plants, the golden hand, and the articulated giant shears are genuine 3D
 * meshes with normals, lighting, depth testing and a perspective camera. */
(function(){
 'use strict';
 const TAU=Math.PI*2,clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
 const lerp=(a,b,t)=>a+(b-a)*t,vec=(a,b)=>a.map((v,i)=>v-b[i]);
 const add=(a,b)=>a.map((v,i)=>v+b[i]),mul=(a,k)=>a.map(v=>v*k);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2]];
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),unit=a=>mul(a,1/(Math.hypot(...a)||1));
 const GOLD=[1,.79,.38],PALE=[1,.97,.76],STEEL=[.65,.86,.95],SHADOW=[.05,.22,.14];
 const positions=Array.from({length:10},(_,i)=>[(i%5-2)*5.8,0,i<5?-5.3:6.2]);
 function multiply(a,b){const c=new Float32Array(16);for(let j=0;j<4;j++)for(let i=0;i<4;i++)for(let k=0;k<4;k++)c[j*4+i]+=a[k*4+i]*b[j*4+k];return c;}
 function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);}
 function lookAt(eye,target){const z=unit(vec(eye,target)),x=unit(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
 function project(p,m){const q=[0,0,0,0];for(let r=0;r<4;r++)q[r]=m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r];return [(q[0]/q[3]+1)*50,(1-q[1]/q[3])*50,q[3]];}
 const vertices=[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]];
 const sides=[[0,1,2,3],[5,4,7,6],[3,2,6,7],[4,5,1,0],[1,5,6,2],[4,0,3,7]];
 class Mesh{
  constructor(){this.data=[];this.triangles=0;}
  tri(a,b,c,col,kind=0){if([a,b,c,col].some(v=>!Array.isArray(v)||v.length!==3))throw Error('Invalid 3D triangle tuple '+JSON.stringify([a,b,c,col]));const n=unit(cross(vec(b,a),vec(c,a)));for(const p of [a,b,c])this.data.push(...p,...n,...col,kind);this.triangles++;}
  quad(a,b,c,d,col,kind=0){this.tri(a,b,c,col,kind);this.tri(a,c,d,col,kind);}
  box(x,y,z,w,h,d,col,kind=0){const p=vertices.map(v=>[x+v[0]*w*.5,y+v[1]*h*.5,z+v[2]*d*.5]);for(const face of sides)this.quad(...face.map(i=>p[i]),col,kind);}
  gem(x,y,z,r,col,kind=0,stretch=1){const p=[[x+r,y,z],[x,y,z+r],[x-r,y,z],[x,y,z-r]],top=[x,y+r*stretch,z],bot=[x,y-r*stretch,z];for(let i=0;i<4;i++){this.tri(top,p[i],p[(i+1)%4],col,kind);this.tri(bot,p[(i+1)%4],p[i],col,kind);}}
  cylinder(a,b,r,col,other=r,segments=8,kind=0){
   const axis=unit(vec(b,a)),side=unit(cross(axis,Math.abs(axis[1])>.85?[1,0,0]:[0,1,0])),perp=cross(axis,side);
   const ring=(p,rad,t)=>add(p,add(mul(side,Math.cos(t)*rad),mul(perp,Math.sin(t)*rad)));
   for(let i=0;i<segments;i++){
    const t0=i*TAU/segments,t1=(i+1)*TAU/segments;
    const u=ring(a,r,t0),v=ring(a,r,t1),w=ring(b,other,t1),x=ring(b,other,t0);
    this.quad(u,x,w,v,col,kind);this.tri(a,v,u,col,kind);this.tri(b,x,w,col,kind);
   }
  }
  sphere(c,rx,ry,rz,col,kind=0,rings=5,slices=10){
   const pt=(phi,th)=>[c[0]+rx*Math.cos(th)*Math.sin(phi),c[1]+ry*Math.cos(phi),c[2]+rz*Math.sin(th)*Math.sin(phi)];
   for(let k=0;k<rings;k++)for(let i=0;i<slices;i++){
    const p=k*Math.PI/rings,q=(k+1)*Math.PI/rings,a=i*TAU/slices,b=(i+1)*TAU/slices;
    this.quad(pt(p,a),pt(p,b),pt(q,b),pt(q,a),col,kind);
   }
  }
  ring(center,r,tube,col,axis='xy',kind=0){
   const coord=(angle,rad)=>axis==='xy'?[center[0]+Math.cos(angle)*rad,center[1]+Math.sin(angle)*rad,center[2]]:
        [center[0]+Math.cos(angle)*rad,center[1],center[2]+Math.sin(angle)*rad];
   const N=20;
   for(let i=0;i<N;i++){
    const a=i*TAU/N,b=(i+1)*TAU/N;
    const p=coord(a,r),q=coord(b,r);
    this.cylinder(p,q,tube,col,tube,5,kind);
   }
  }
  blade(start,tip,breadth,col){
   const d=unit(vec(tip,start)),s=unit(cross(d,[0,0,1]));
   const left=add(start,mul(s,breadth)),right=add(start,mul(s,-breadth));
   const mid=add(mul(start,.56),mul(tip,.44)),shoulder=add(mid,mul(s,breadth*.85));
   this.tri(left,shoulder,tip,col,2);this.tri(right,tip,shoulder,[.80,.95,1],2);
   this.tri(left,tip,right,[.38,.62,.76]);this.cylinder(start,tip,.045,PALE,.012,5,2);
  }
 }
 function plant(mesh,model,index,cutIds,step,age,elapsed){
  const [x,,z]=positions[index];
  const cutIndex=cutIds.indexOf(model.id),wasCut=model.priorPruned||cutIndex>=0&&cutIndex<step;
  const cutting=cutIndex>=0&&cutIndex===step;
  const fall=cutting?clamp((age-.9)/.86):wasCut?1:0;
  const tier=Math.max(0,Math.min(6,Number(model.tier)||0));
  const h=.95+tier*.40,roseRadius=.11+tier*.1;
  const rise=Math.sin(elapsed*1.15+index*1.8)*.05;
  const wilt=wasCut?0.48:1;
  const face=wasCut?[.27,.29,.22]:tier<2?[.28,.62,.36]:[[.94,.57,.63],[.99,.7,.48],[.84,.65,.95],[.95,.88,.58]][index%4];
  const centerY=.16,top=h*wilt;
  // Rotating the full flower around its roots makes a cut physically collapse in 3D.
  const transform=p=>{const y=p[1],theta=fall*1.34,dir=index%2?-1:1;return [x+p[0]*Math.cos(theta)+y*Math.sin(theta)*dir,centerY+p[0]*(-Math.sin(theta))*dir+y*Math.cos(theta)+rise*(1-fall),z+p[2]];};
  const pot=[.33,.26,.19];
  mesh.cylinder([x,.12,z],[x,.5,z],.67,pot,.80,10);
  mesh.cylinder([x,.52,z],[x,.58,z],.82,[.58,.41,.27],.82,10);
  const base=transform([0,.36,0]),tip=transform([0,top,0]);
  mesh.cylinder(base,tip,.085+tier*.009,wasCut?SHADOW:[.15,.48,.22],.05+tier*.006,7);
  for(let j=0;j<3+(tier>3?2:0);j++){
   const yy=.65+(top-.75)*(j/(4+(tier>3?2:0))),direction=(j%2?1:-1);
   const a=transform([0,yy,0]),b=transform([direction*(.45+tier*.05),yy+.19,.03]);
   mesh.cylinder(a,b,.043,[.12,.38,.17],.018,6);
   mesh.gem(...b,.25+tier*.026,wasCut?SHADOW:[.30,.65,.28],0,.30);
  }
  if(tier<=1){mesh.gem(...tip,roseRadius,wasCut?SHADOW:[.24,.59,.29],0,1.6);return;}
  const petals=tier>=6?11:tier>=4?8:5;
  mesh.gem(...tip,roseRadius*.85,[.99,.90,.62],2,1.1);
  for(let i=0;i<petals;i++){
   const ang=i*TAU/petals,offset=roseRadius*(tier>=4?.84:.55);
   const p=transform([Math.cos(ang)*offset,top+(i%2)*.12,Math.sin(ang)*offset]);
   const cc=face.map((v,j)=>clamp(v+(i%2?-.12:.055)));
   mesh.gem(...p,roseRadius*(tier>=5?.85:.72),cc,wasCut?0:2,tier>=4?.7:1.12);
  }
  if(cutting&&age>.9&&age<1.65){
   for(let i=0;i<10;i++){
    const theta=i*TAU/10;
    const p=[tip[0]+Math.cos(theta)*(age-.7)*2,tip[1]+Math.sin(i*2+age*4)*.4,tip[2]+Math.sin(theta)*(age-.7)*2];
    mesh.gem(...p,.12,PALE,2,1.6);
   }
  }
 }
 function hand(mesh,position,elapsed,step,age){
  const [x,y,z]=position,coord=(a,b,c)=>[x+a,y+b,z+c];
  const radiance=.18+.045*Math.sin(elapsed*2);
  // Two wide rings sit physically behind the enormous hand as a radiant halo.
  mesh.ring(coord(0,1.3,-1.6),4.1,.075,[1,.73,.3],'xy',2);
  mesh.ring(coord(0,1.3,-1.63),5.1,.035,[.94,.85,.54],'xy',2);
  for(let i=0;i<12;i++){const a=i*TAU/12;mesh.cylinder(coord(Math.cos(a)*4.5,1.3+Math.sin(a)*4.5,-1.7),coord(Math.cos(a)*6,1.3+Math.sin(a)*6,-1.7),.11,GOLD,.012,5,2);}
  // Low-poly sculpted divine wrist and palm; each finger is an articulated 3D tube.
  mesh.cylinder(coord(0,6.9,-.5),coord(0,1.5,.2),1.05,[.95,.76,.38],1.5,12,2);
  mesh.sphere(coord(0,.65,.1),1.55,1.55,.73,[1,.82,.49],2);
  mesh.sphere(coord(0,-.55,.58),1.55,1.22,.69,[1,.91,.64],2);
  for(let i=0;i<4;i++){
   const dx=(i-1.5)*.65,len=2.1-(Math.abs(i-1.5))*.31;
   const from=coord(dx,-1.05,.75),middle=coord(dx*.96,-1.05-len*.62,1.12),tip=coord(dx*.80,-1.05-len,1.60);
   mesh.cylinder(from,middle,.31,[1,.85,.47],.255,8,2);
   mesh.cylinder(middle,tip,.255,[.99,.80,.44],.17,8,2);
   mesh.sphere(tip,.19,.23,.2,PALE,2);
  }
  mesh.cylinder(coord(-1.2,.12,.9),coord(-2.25,-1.25,1.65),.48,[1,.83,.49],.30,9,2);
  mesh.cylinder(coord(-2.25,-1.25,1.65),coord(-1.3,-2.1,2.1),.30,PALE,.21,7,2);
  // Actual intersecting 3D blade geometry, rotating one wing for the snipping motion.
  const pivot=coord(1.05,-2.45,2.0);
  const snip=step>=0?Math.sin(clamp((age-.65)/.46)*Math.PI)*.94:0;
  const spread=.60-snip;
  const t1=coord(4.0,-6.9,2.2),t2=coord(-1.4-spread*2,-7.0,2.2);
  mesh.blade(pivot,t1,.66,STEEL);mesh.blade(pivot,t2,.62,[.93,.96,1]);
  mesh.sphere(pivot,.35,.35,.27,PALE,2);
  mesh.cylinder(pivot,coord(1.1,-.5,2.1),.13,[.55,.65,.70],.13,8);
  mesh.ring(coord(.05,-3.2,2.3),.74,.17,GOLD,'xy',2);
  mesh.ring(coord(1.85,-3.0,2.3),.80,.17,GOLD,'xy',2);
  mesh.gem(...coord(0,-3.65,1.9),radiance,[1,.94,.57],2,1.8);
 }
 function sceneGeometry(models,cutIds,step,age,elapsed){
  const m=new Mesh();
  m.box(0,-.55,0,43,1.1,29,[.16,.31,.22]);
  m.box(0,-.08,0,38,.12,25,[.24,.39,.25]);
  for(const z of [-10,1,12])m.box(0,-.025,z,41,.10,.48,[.52,.47,.29]);
  for(const x of [-17.4,17.4]){
   m.box(x,4,0,1.05,8,1.05,[.74,.74,.61]);
   m.gem(x,9,0,1.3,[.93,.74,.33],2,1.35);
   m.box(x,10.9,0,.25,2.3,.25,PALE,2);
  }
  for(let i=0;i<10;i++){
   const [x,,z]=positions[i];
   m.cylinder([x,-.02,z],[x,.2,z],1.32,[.61,.57,.42],1.35,10);
   if(models[i])plant(m,models[i],i,cutIds,step,age,elapsed);
  }
  let hx=0,hy=14.9+.22*Math.sin(elapsed*1.7),hz=-.3;
  if(step>=0){
   const index=models.findIndex(p=>p.id===cutIds[step]);
   if(index>=0){const p=positions[index],t=clamp(age/.72);t*=t*(3-2*t);hx=lerp(0,p[0],t);hz=lerp(-.3,p[2],t);hy=lerp(14.9,10.3,t);}
  }
  hand(m,[hx,hy,hz],elapsed,step,age);
  return m;
 }
 function compile(gl,type,source){
  const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
  return s;
 }
 function init(canvas){
  const gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'low-power'});
  if(!gl)return null;
  const vertex='attribute vec3 a_pos,a_normal,a_color;attribute float a_kind;uniform mat4 u_vp;varying vec3 v_normal,v_color;varying float v_kind;void main(){v_normal=a_normal;v_color=a_color;v_kind=a_kind;gl_Position=u_vp*vec4(a_pos,1.);}';
  const fragment='precision mediump float;varying vec3 v_normal,v_color;varying float v_kind;void main(){vec3 n=normalize(v_normal);float light=max(0.,dot(n,normalize(vec3(-.5,.95,.45))));vec3 col=v_color*(.37+light*.78);if(v_kind>1.5)col=v_color*(1.25+light*.25);gl_FragColor=vec4(col,1.);}';
  const program=gl.createProgram();
  gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const buffer=gl.createBuffer(),attrs=[];
  for(const [name,size,offset] of [['a_pos',3,0],['a_normal',3,12],['a_color',3,24],['a_kind',1,36]])attrs.push([gl.getAttribLocation(program,name),size,offset]);
  return {gl,program,buffer,attrs,uniform:gl.getUniformLocation(program,'u_vp')};
 }
 let active=null;
 function stop(){
  if(!active)return;
  active.stopped=true;
  if(typeof cancelAnimationFrame==='function'&&active.raf)cancelAnimationFrame(active.raf);
  const {gl,buffer,program}=active;
  try{gl.deleteBuffer(buffer);gl.deleteProgram(program);}catch{}
  active=null;
 }
 function mount(canvas,models,cuts,step,labels){
  stop();
  if(!canvas||!canvas.getContext)return false;
  let renderer;
  try{renderer=init(canvas);}catch(e){console.warn('Divine 3D renderer unavailable:',e.message);return false;}
  if(!renderer)return false;
  const instance={...renderer,canvas,models,cuts,step,labels:Array.from(labels||[]),start:performance.now(),raf:0,stopped:false,triangles:0};
  active=instance;
  const frame=()=>{
   if(instance.stopped||active!==instance)return;
   const rect=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,1.5);
   const w=Math.max(1,Math.floor(rect.width*dpr)),h=Math.max(1,Math.floor(rect.height*dpr));
   if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
   const {gl,program,buffer,attrs,uniform}=instance;
   gl.viewport(0,0,w,h);gl.clearColor(.06,.16,.15,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
   const now=performance.now(),age=(now-instance.start)/1000,elapsed=now/1000;
   const eye=[0,21.4,32.2],target=[0,4.1,.4];
   const vp=multiply(perspective(53*Math.PI/180,w/h,.1,125),lookAt(eye,target));
   const mesh=sceneGeometry(models,cuts,step,age,elapsed);
   instance.triangles=mesh.triangles;
   gl.useProgram(program);gl.uniformMatrix4fv(uniform,false,vp);
   gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.data),gl.DYNAMIC_DRAW);
   for(const [loc,size,offset] of attrs)if(loc>=0){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,40,offset);}
   gl.drawArrays(gl.TRIANGLES,0,mesh.data.length/10);
   instance.labels.forEach((el,i)=>{
    const p=positions[i];if(!p||!el||!el.style)return;
    const xy=project([p[0],.36,p[2]],vp);
    el.style.left=xy[0].toFixed(2)+'%';el.style.top=xy[1].toFixed(2)+'%';
   });
   instance.raf=requestAnimationFrame(frame);
  };
  frame();
  return true;
 }
 window.Divine3D={
  mount,stop,
  // Nonmutating inspection for regression checks.
  _debug(){return active?{running:!active.stopped,triangles:active.triangles,plants:active.models.length,step:active.step,webgl:true}:null;},
  _geometry:(models,cuts,step,age=0)=>({triangles:sceneGeometry(models,cuts,step,age,0).triangles,positions:positions.map(x=>x.slice())})
 };
})();
