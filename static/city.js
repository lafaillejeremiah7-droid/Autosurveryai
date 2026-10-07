/* Local, dependency-free 3D city. Geometry and damage are deterministic;
   only the camera and decorative effects animate. No tournament state is mutated here. */
(function(){
 'use strict';
 const canvas=document.getElementById('city-canvas');
 if(!canvas)return;
 const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const mix=(a,b,t)=>a+(b-a)*t;
 const color=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
 const add=(a,b)=>a.map((v,i)=>v+b[i]);
 const sub=(a,b)=>a.map((v,i)=>v-b[i]);
 const mul=(a,s)=>a.map(v=>v*s);
 const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const norm=a=>mul(a,1/(Math.hypot(...a)||1));
 const rand=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
 const smooth=t=>t*t*(3-2*t);
 function multiply(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
 function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);}
 function lookAt(eye,target){const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
 function project(p,m){const q=[0,0,0,0];for(let r=0;r<4;r++)q[r]=m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r];return [q[0]/q[3],q[1]/q[3],q[2]/q[3],q[3]];}
 class Mesh{
  constructor(){this.data=[];}
  tri(a,b,c,col,kind=0){const n=norm(cross(sub(b,a),sub(c,a)));for(const p of [a,b,c])this.data.push(...p,...n,...col,kind);}
  quad(a,b,c,d,col,kind=0){this.tri(a,b,c,col,kind);this.tri(a,c,d,col,kind);}
  box(x,y,z,w,h,d,col,kind=0,roll=0){
   const co=Math.cos(roll),si=Math.sin(roll);
   const p=[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]].map(v=>{
    const vx=v[0]*w/2,vy=v[1]*h/2;return [x+vx*co-vy*si,y+vx*si+vy*co,z+v[2]*d/2];
   });
   for(const f of [[0,1,2,3],[5,4,7,6],[3,2,6,7],[4,5,1,0],[1,5,6,2],[4,0,3,7]])this.quad(...f.map(i=>p[i]),col,kind);
  }
  gem(x,y,z,r,col,kind=0,stretch=1){
   const p=[[x+r,y,z],[x,y,z+r],[x-r,y,z],[x,y,z-r]],a=[x,y+r*stretch,z],b=[x,y-r*stretch,z];
   for(let i=0;i<4;i++){this.tri(a,p[i],p[(i+1)%4],col,kind);this.tri(b,p[(i+1)%4],p[i],col,kind);}
  }
  ring(x,y,z,r,width,col,kind=3){
   for(let i=0;i<24;i++){const a=i*Math.PI/12,b=(i+1)*Math.PI/12;
    this.quad([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],[x+Math.cos(b)*(r-width),y,z+Math.sin(b)*(r-width)],[x+Math.cos(a)*(r-width),y,z+Math.sin(a)*(r-width)],col,kind);
   }
  }
  line(a,b,width,col){const right=mul(norm(cross(sub(b,a),sub(camera.eye,a))),width);this.quad(add(a,right),sub(a,right),sub(b,right),add(b,right),col,3);}
  billboard(x,y,z,w,h,col,kind){
   const right=norm(cross([0,1,0],sub(camera.eye,[x,y,z])));
   for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]){
    this.data.push(x+right[0]*u*w/2,y+v*h/2,z+right[2]*u*w/2,u,v,0,...col,kind);
   }
  }
 }
 const buildings=[];
 for(let row=0;row<18;row++)for(let col=0;col<19;col++){
  const id=row*19+col,x=(col-9)*15,z=16-row*15;
  if(rand(id+12)<.12)continue;
  buildings.push({id,x,z,w:6+rand(id+33)*5,d:6+rand(id+8)*4,h:8+Math.pow(rand(id+70),2)*57,threshold:.18+rand(id+411)*.58,tint:rand(id+126)});
 }
 let tournament=[],unlocks={},routeTime=0;
 let monuments=null,towerSites=[],podiumSites=[],falls={},towerTime=0,podiumTime=0,riseAt=null;
 const roomKeys=['settings','round1','round2','final','overview'];
 const roomColors=[[.6,.91,1],[.47,.94,.71],[1,.66,.29],[1,.34,.3],[.93,.77,.45]];
 const media=window.matchMedia('(prefers-reduced-motion: reduce)');
 let settings={},state={progress:0,phase:'CITY AT PEACE'},width=1,height=1,rooms=[],dirty=true,geometryDirty=true;
 let staticMesh=new Mesh(),staticArray=new Float32Array(),fireSites=[],damageCount=0,activeBuildings=buildings;
 let elapsed=0,lastFrame=0,lastSample=0,paused=false,suspended=false,inside=false,transition=null,lastBuild=-1,needsLayout=true;
 const baseCamera={eye:[62,53,101],target:[0,3,-35]};
 let camera={eye:baseCamera.eye.slice(),target:baseCamera.target.slice()},vp;
 let gl=null,ctx=null,program,skyProgram,staticBuffer,dynamicBuffer,skyBuffer,uniforms,skyUniforms;
 const fov=50*Math.PI/180;
 function shader(type,code){
  const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;
 }
 function link(v,f){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
 function initGL(){
  gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'low-power'});
  if(!gl)return false;
  program=link(
   'attribute vec3 a_pos,a_normal,a_color;attribute float a_kind;uniform mat4 u_vp;varying vec3 v_pos,v_normal,v_color;varying float v_kind;void main(){v_pos=a_pos;v_normal=a_normal;v_color=a_color;v_kind=a_kind;gl_Position=u_vp*vec4(a_pos,1.0);}',
   'precision mediump float;varying vec3 v_pos,v_normal,v_color;varying float v_kind;uniform vec3 u_eye,u_fog;uniform float u_doom,u_time;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}void main(){vec3 n=normalize(v_normal);float light=max(dot(n,normalize(vec3(-.4,.85,.45))),0.0);vec3 c=v_color*(.44+light*.64);if(v_kind>.5&&v_kind<1.5&&abs(n.y)<.5){vec2 uv=vec2(abs(n.x)>.5?v_pos.z:v_pos.x,v_pos.y)*vec2(.5,.6);vec2 cell=fract(uv);float win=step(.14,cell.x)*step(cell.x,.74)*step(.2,cell.y)*step(cell.y,.8);float lit=step(.24+u_doom*.63,hash(floor(uv)));vec3 glass=mix(vec3(.07,.2,.28),vec3(.18,.62,.72),light*.4);c=mix(c,mix(glass,vec3(.55,.9,1.0)*(1.0-u_doom*.45),lit*.65),win*.9);}if(v_kind>2.5)c=v_color*(1.2+sin(u_time*2.0+v_pos.x)*.06);float fog=clamp(1.0-exp(-length(v_pos-u_eye)*(.003+u_doom*.004)),0.0,.88);c=mix(c,u_fog,fog*(v_kind>2.5?.45:1.0));float alpha=1.0;if(v_kind>3.5){vec2 uv=v_normal.xy;float r=length(uv);if(v_kind<4.5){alpha=(1.0-smoothstep(.05,1.0,r))*.38;c=mix(v_color,u_fog,.24);}else{float sway=sin(u_time*4.+uv.y*5.+v_pos.x)*.13*(uv.y+1.);float width=(1.-uv.y)*.4+.05;float core=clamp(1.-abs(uv.x+sway)/width,0.,1.);alpha=core*(1.0-smoothstep(.3,1.0,uv.y))*smoothstep(-1.,-.6,uv.y);c=mix(vec3(1.,.12,.015),vec3(1.,.84,.22),pow(core,2.)*(1.-uv.y)*.65);}if(alpha<.01)discard;}gl_FragColor=vec4(c,alpha);}');
  uniforms={};for(const name of ['vp','eye','fog','doom','time'])uniforms[name]=gl.getUniformLocation(program,'u_'+name);
  skyProgram=link('attribute vec2 a_pos;varying vec2 v_uv;void main(){v_uv=a_pos*.5+.5;gl_Position=vec4(a_pos,0.,1.);}',
   'precision mediump float;varying vec2 v_uv;uniform float u_doom,u_time;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}void main(){vec2 uv=v_uv;vec3 top=mix(vec3(.07,.26,.44),vec3(.028,.04,.07),u_doom);vec3 bottom=mix(vec3(.64,.82,.83),vec3(.47,.18,.08),u_doom);vec3 c=mix(bottom,top,smoothstep(.15,1.,uv.y));float cloud=noise(uv*vec2(5,10)+vec2(u_time*.009,0));cloud+=noise(uv*vec2(13,21)+vec2(u_time*.014,2))*.4;float cover=smoothstep(.7-u_doom*.35,1.2-u_doom*.25,cloud);c=mix(c,mix(vec3(.83,.88,.86),vec3(.075,.075,.09),u_doom),cover*(.22+u_doom*.58));float sun=exp(-length((uv-vec2(.73,.76))*vec2(1.,1.7))*40.);c+=vec3(1.,.7,.34)*sun*(1.-u_doom*.92);gl_FragColor=vec4(c,1.);}');
  skyUniforms={doom:gl.getUniformLocation(skyProgram,'u_doom'),time:gl.getUniformLocation(skyProgram,'u_time')};
  staticBuffer=gl.createBuffer();dynamicBuffer=gl.createBuffer();skyBuffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  return true;
 }
 let mode='webgl';
 try{if(!initGL())mode='static';}catch(error){console.warn('City renderer uses static projection:',error.message);mode='static';}
 if(mode==='static'){
  // A fresh canvas can obtain 2D even if an attempted WebGL setup already claimed one.
  const fallback=document.createElement('canvas');fallback.id=canvas.id;fallback.setAttribute('aria-hidden','true');canvas.replaceWith(fallback);ctx=fallback.getContext('2d');
 }
 const surface=mode==='static'?document.getElementById('city-canvas'):canvas;
 document.body.classList.add('city-ready');
 function groundPoint(px,py){
  const forward=norm(sub(baseCamera.target,baseCamera.eye)),right=norm(cross(forward,[0,1,0])),up=cross(right,forward);
  const nx=px/width*2-1,ny=1-py/height*2,tan=Math.tan(fov/2);
  const ray=norm(add(forward,add(mul(right,nx*width/height*tan),mul(up,ny*tan))));
  return add(baseCamera.eye,mul(ray,-baseCamera.eye[1]/Math.min(-.01,ray[1])));
 }
 function layout(){
  const rect=surface.getBoundingClientRect(),grid=document.getElementById('monitors');
  if(!grid||!grid.children.length)return;
  const area=grid.getBoundingClientRect(),cols=width<600?2:width<1000?3:5,countRows=Math.ceil(5/cols);
  rooms=roomKeys.map((key,i)=>{
   const row=Math.floor(i/cols),col=i%cols,items=Math.min(cols,5-row*cols);
   const fx=(col+.5)/items,px=area.left-rect.left+area.width*fx;
   const py=area.top-rect.top+area.height*(row+.62)/countRows;
   const point=groundPoint(px,py),pixelSize=Math.min(width<600?92:135,area.width/cols*.59);
   const neighbour=groundPoint(px+pixelSize*.58,py);
   const size=clamp(Math.hypot(...sub(point,neighbour))*1.45,5,20);
   return {key,pos:point,size,pixelSize,color:roomColors[i]};
  });
  const locate=(selector,scale)=>Array.from(document.querySelectorAll(selector)).map(e=>{
   const r=e.getBoundingClientRect(),px=r.left-rect.left+r.width/2,py=r.bottom-rect.top-(e.dataset.place?118:62);
   const pos=groundPoint(px,py),side=groundPoint(px+Math.min(r.width*.2,scale),py);
   return {id:e.dataset.player,place:Number(e.dataset.place),pos,size:Math.max(.3,Math.hypot(...sub(pos,side)))};
  });
  towerSites=locate('#player-towers .player-tower',22);
  podiumSites=locate('#city-podium .podium-place',48);
  geometryDirty=true;needsLayout=false;positionLabels();
 }
 function resize(){
  const box=document.getElementById('world').getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);
  const dpr=Math.min(window.devicePixelRatio||1,mode==='static'?1:1.5);
  surface.width=Math.round(width*dpr);surface.height=Math.round(height*dpr);
  if(gl&&mode==='webgl')gl.viewport(0,0,surface.width,surface.height);
  needsLayout=true;geometryDirty=true;dirty=true;
 }
 function roomMesh(mesh,room){
  const locked=tournament.some(t=>t.key===room.key&&t.status==='sealed');
  const [x,,z]=room.pos,s=room.size,h=s*.82,wall=locked?[.025,.035,.045]:[.92,.96,.97],dark=[.06,.16,.21],light=locked?[.045,.055,.065]:room.color;
  mesh.box(x,-.32,z,s*1.45,.65,s*1.42,[.3,.44,.5]);
  mesh.box(x,.12,z,s,.24,s,[.64,.78,.8]);
  mesh.box(x,h/2,z-s/2,s,h,.23,wall);
  mesh.box(x-s/2,h/2,z,.25,h,s,wall);
  mesh.box(x+s/2,h/2,z,.25,h,s,wall);
  // Open entrance and exposed ceiling grid reveal a real interior, furniture and light.
  for(const side of [-1,1]){
   mesh.box(x+side*s*.45,h*.51,z+s*.48,.22,h,.27,wall);
   mesh.box(x+side*s*.42,h*.5,z+s*.5,.065,h*.94,.08,light,3);
  }
  mesh.box(x,h,z,s*1.03,.24,s*.15,wall);
  for(let j=0;j<5;j++)mesh.box(x,h,z-s*.45+j*s*.22,s,.12,.12,light,3);
  mesh.box(x,h,z-s*.5,s+.2,.22,.26,wall);
  mesh.box(x,h,z+s*.5,s+.2,.26,.32,wall);
  mesh.box(x,h-.15,z+s*.515,s*.85,.07,.09,light,3);
  mesh.box(x,h*.23,z-s*.2,s*.65,h*.32,s*.2,wall);
  mesh.box(x,h*.58,z-s*.46,s*.63,h*.42,.12,dark);
  mesh.box(x,h*.6,z-s*.38,s*.49,.07,.04,light,3);
  mesh.box(x,h*.52,z-s*.38,s*.3,.045,.04,light,3);
  mesh.box(x,h*.68,z-s*.38,s*.49,.045,.04,light,3);
  mesh.box(x,h*.19,z+s*.15,s*.19,h*.36,s*.19,[.19,.3,.34]);
  mesh.box(x,.18,z+s*.46,s*.82,.06,.18,light,3);
 }
 function rebuild(){
  const p=state.progress,m=new Mesh();fireSites=[];damageCount=0;
  m.box(0,-1,-90,900,1,720,color([.25,.41,.44],[.06,.075,.08],p));
  // Roads, pavements, and illuminated transit lanes between city blocks.
  for(let k=-14;k<=14;k++){
   m.box(k*15+7.5,-.41,-110,3.5,.12,450,color([.15,.24,.29],[.065,.07,.075],p));
   m.box(0,-.4,7.5+k*15,425,.12,3.4,color([.15,.24,.29],[.065,.07,.075],p));
   m.box(k*15+6,-.31,-95,.06,.04,360,color([.35,.78,.84],[.1,.14,.15],p),p<.3?3:0);
  }
  const forward=norm(sub(baseCamera.target,baseCamera.eye));
  const commandDepth=rooms.length?Math.max(...rooms.map(r=>dot(sub(r.pos,baseCamera.eye),forward)+r.size*1.4)):0;
  activeBuildings=buildings.filter(b=>dot(sub([b.x,0,b.z],baseCamera.eye),forward)>commandDepth);
  for(const b of activeBuildings){
   const damage=clamp((p-b.threshold)/(1-b.threshold)),h=b.h*(1-.86*Math.pow(damage,1.15));
   if(damage>0)damageCount++;
   const tint=color([.38+b.tint*.25,.55+b.tint*.2,.62+b.tint*.16],[.12,.105,.1],damage*.88+p*.2);
   m.box(b.x,-.1,b.z,b.w+2,.45,b.d+2,color([.57,.67,.68],[.19,.17,.15],p));
   m.box(b.x,h*.43,b.z,b.w,h*.86,b.d,tint,1);
   const tilt=damage>.15?(damage-.15)*.52*(rand(b.id+77)>.5?1:-1):0;
   m.box(b.x+Math.sin(tilt)*h*.05,h*.92,b.z,b.w*.91,h*.16,b.d*.94,tint,1,tilt);
   if(damage<.15){
    m.box(b.x,h+.2,b.z,b.w*.83,.42,b.d*.85,color([.65,.8,.8],[.19,.22,.23],p));
    m.box(b.x+b.w*.35,h*.5,b.z+b.d*.501,.1,h,.06,color([.1,.65,.78],[.2,.09,.04],p),3);
    if(b.h>36)m.box(b.x,h+2,b.z,.16,4,.16,[.51,.66,.7]);
   }
   if(damage>.06){
    fireSites.push({...b,damage,h});
    for(let j=0;j<4;j++){
     const a=rand(b.id*13+j)*6.28,r=3+rand(b.id*27+j)*5;
     m.box(b.x+Math.cos(a)*r,.2+damage,b.z+Math.sin(a)*r,1+damage*3,.6+damage*2,1.2+damage*2,[.16,.145,.13],0,a);
    }
    m.gem(b.x,h,b.z,b.w*.3,[.16,.16,.15],0,.6);
   }
  }
  // A protected command platform is part of the city geometry, not a background card.
  for(const room of rooms)roomMesh(m,room);
  staticMesh=m;staticArray=new Float32Array(m.data);
  if(mode==='webgl'){gl.bindBuffer(gl.ARRAY_BUFFER,staticBuffer);gl.bufferData(gl.ARRAY_BUFFER,staticArray,gl.STATIC_DRAW);}
  geometryDirty=false;lastBuild=p;
 }
 function aircraft(mesh,x,y,z,scale,angle,col){
  const cs=Math.cos(angle),sn=Math.sin(angle);
  const tr=p=>[x+(p[0]*cs-p[1]*sn)*scale,y+(p[0]*sn+p[1]*cs)*scale,z+p[2]*scale];
  const vertices=[[4,0,0],[-3,0,.6],[-3,0,-.6],[-1,.35,0],[-1,0,4],[-1,0,-4],[-3,1.4,0]];
  for(const f of [[0,1,3],[0,3,2],[0,4,1],[0,2,5],[1,6,2],[1,2,3]])mesh.tri(...f.map(i=>tr(vertices[i])),col);
 }
 function effects(t){
  const m=new Mesh(),p=state.progress;
  const stops=tournament.map(stage=>({...stage,room:rooms.find(r=>r.key===stage.key)})).filter(s=>s.room);
  for(let i=0;i<stops.length;i++){
   const stop=stops[i],room=stop.room,[x,,z]=room.pos,size=room.size;
   const opening=media.matches||mode==='static'||unlocks[stop.key]===undefined?1:clamp((routeTime-unlocks[stop.key]-1.1)/1.1);
   const sealed=stop.status==='sealed',amount=sealed?0:opening;
   // Two physical shutter panels slide apart after the route's light reaches the room.
   if(sealed||amount<1)for(const side of [-1,1]){
    m.box(x+side*size*(.24+amount*.55),size*.4,z+size*.49,size*.47,size*.78,.22,[.075,.12,.16]);
    m.box(x+side*size*(.24+amount*.55),size*.4,z+size*.51,size*.39,.08,.03,sealed?[.4,.19,.12]:room.color,3);
   }
   if(stop.status==='current')m.ring(x,.27,z,size*.78,.12,room.color.map(v=>v*(.72+Math.sin(t*3)*.2)));
   if(i===0)continue;
   const prev=stops[i-1].room,a=add(prev.pos,[0,.24,prev.size*2]),b=add(room.pos,[0,.24,size*2]);
   const roadColor=sealed?[.10,.16,.19]:[.32,.9,.72];
   const length=Math.hypot(...sub(b,a)),steps=Math.max(3,Math.ceil(length/2));
   for(let step=0;step<steps;step++){
    const point=a.map((v,j)=>mix(v,b[j],step/(steps-1)));
    m.box(point[0],.03,point[2],1.6,.3,1.6,sealed?[.035,.04,.05]:[.12,.23,.25]);
   }
   m.line(a,b,.7,[.025,.055,.075]);m.line(a,b,.13,roadColor);
   m.line(add(room.pos,[0,.24,size*.48]),b,.13,roadColor);
   m.line(add(prev.pos,[0,.24,prev.size*.48]),a,.13,roadColor);
   if(!sealed){
    const u=unlocks[stop.key]!==undefined&&routeTime-unlocks[stop.key]<1.1?clamp((routeTime-unlocks[stop.key])/1.1):(t*.28)%1;
    const light=a.map((v,j)=>mix(v,b[j],u));m.gem(light[0],light[1]+.15,light[2],.45,[.7,1,.87],3);
   }
  }

  // Player monuments are driven solely by settled tournament results, never disaster time.
  if(monuments){
   for(const site of towerSites){
    const player=monuments.towers.find(p=>p.id===site.id);if(!player)continue;
    const [x,,z]=site.pos,w=site.size,h=w*4.6;
    const falling=player.cut?(media.matches||mode==='static'||falls[player.id]===undefined?1:clamp((towerTime-falls[player.id])/2.4)):0;
    const bend=smooth(falling)*1.48,remaining=1-falling*.78;
    m.box(x,-.1,z,w*1.7,.2,w*1.5,[.08,.13,.16]);
    if(falling<1){
     m.box(x+Math.sin(bend)*h*.28,h*remaining/2,z,w,h*remaining,w*.8,player.cut?[.15,.12,.12]:[.22,.36,.4],1,-bend);
     if(!player.cut){
      for(let j=0;j<6;j++)m.box(x,h*(j+.6)/6,z+w*.41,w*.8,.07,w*.03,[.43,.95,.79],3);
      m.gem(x,h+.25,z,w*.22,[.65,1,.85],3);
     }
    }
    if(falling>0){
     for(let j=0;j<5;j++)m.box(x+(j-2)*w*.3,.2+w*.1,z+Math.sin(j*2)*w*.5,w*.65,.2+w*.3,w*.6,[.18,.15,.14],0,j*.7);
     if(falling<1)m.ring(x,.2,z,w*(1+falling*2),.1,[.75*(1-falling),.45*(1-falling),.25*(1-falling)]);
    }
   }
   for(const site of podiumSites){
    const slot=monuments.slots.find(s=>s.place===site.place);if(!slot)continue;
    const [x,,z]=site.pos,w=site.size;
    const rise=monuments.complete?(media.matches||mode==='static'||riseAt===null?1:smooth(clamp((podiumTime-riseAt)/2.4))):0;
    const h=w*(.4+(4-site.place)*.28+rise*.9);
    const col=site.place===1?[.93,.7,.25]:site.place===2?[.6,.76,.82]:[.72,.39,.22];
    m.box(x,h/2,z,w*1.6,h,w*1.25,slot.tied?[.17,.22,.28]:col);
    m.box(x,h+.03,z,w*1.66,.09,w*1.3,slot.tied?[.4,.46,.5]:col.map(c=>Math.min(1,c*1.3)),3);
    if(monuments.complete){m.ring(x,.2,z,w*1.15,.08,col);m.gem(x,h+w*.4,z,w*.22,col,3);}
   }
  }
  // Early sky traffic becomes falling, burning aircraft as destruction rises.
  const planes=p<.2?2:Math.floor(3+p*4);
  for(let i=0;i<planes;i++){
   const u=(t/(27-i*1.3)+i*.29)%1,x=mix(-135,145,u),z=-10-i*25;
   const falling=p>.48&&i%2===0,y=falling?62*(1-u*u)+3:45+i*6+Math.sin(u*6.28)*3;
   aircraft(m,x,y,z,1.2,falling?-u*.85:0,color([.62,.79,.84],[.12,.13,.16],p));
   if(falling)for(let j=1;j<8;j++)m.gem(x-j*2,y+j*.8,z,1+j*.21,[.12,.12,.13]);
  }
  if(p<.18)return m;
  const visibleSites=fireSites.filter((b,i)=>i%Math.max(1,Math.floor(fireSites.length/55))===0).slice(0,55);
  for(const b of visibleSites){
   const r=1.2+b.damage*3.7,y=.3+b.h*.1;
   if(mode==='static')m.gem(b.x,y+r,b.z,r*1.6,[1,.38,.06]);
   else m.billboard(b.x,y+r*1.5,b.z,r*4,r*5,[1,.38,.06],5);
   for(let j=0;j<3;j++){
    const u=(t*.07+j*.33+b.id*.123)%1,drift=u*(4+p*8);
    if(mode==='static')m.gem(b.x+drift,y+4+u*(13+p*17),b.z-u*3,r*(1+u),[.12,.12,.13]);
    else m.billboard(b.x+drift,y+4+u*(13+p*17),b.z-u*3,r*(4+u*3),r*(4+u*3),[.12,.12,.13],4);
   }
  }
  // Missiles travel toward repeatable impact sites. Density and cadence grow with p.
  const count=Math.floor(2+p*12);
  for(let i=0;i<count;i++){
   const b=activeBuildings[Math.floor(rand(i+810)*activeBuildings.length)],cycle=8-p*4,u=(t/cycle+i*.137)%1;
   if(u<.88){
    const q=u/.88,start=[b.x-60,76+rand(i+90)*35,b.z-25],end=[b.x,3,b.z];
    const head=start.map((v,k)=>mix(v,end[k],q)),tail=start.map((v,k)=>mix(v,end[k],Math.max(0,q-.14)));
    m.line(tail,head,.11+p*.14,[1,.4,.07]);m.gem(...head,.32,[1,.86,.48],3);
   }else{
    const age=(u-.88)/.12,r=2+age*(8+p*10);
    m.gem(b.x,2+Math.sin(age*Math.PI)*5,b.z,(1-age)*(3+p*6),[1,.43*(1-age),.05],3,1.4);
    m.ring(b.x,.3,b.z,r,.15+p*.3,[.75*(1-age),.19*(1-age),.03],3);
   }
  }
  if(p>.65)for(let i=0;i<70;i++){
   const u=(t*.11+rand(i+331))%1;
   m.gem((rand(i+113)-.5)*160+u*10,2+u*50,-rand(i+981)*160,.07+rand(i)*.11,[.8,.34,.08],3);
  }
  return m;
 }
 function bindMesh(buffer,array){
  gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  if(array)gl.bufferData(gl.ARRAY_BUFFER,array,gl.DYNAMIC_DRAW);
  for(const [name,size,offset] of [['a_pos',3,0],['a_normal',3,12],['a_color',3,24],['a_kind',1,36]]){
   const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,40,offset);
  }
 }
 function drawGL(){
  const fog=color([.49,.68,.74],[.23,.14,.105],state.progress);
  gl.disable(gl.DEPTH_TEST);gl.useProgram(skyProgram);gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);
  const a=gl.getAttribLocation(skyProgram,'a_pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  gl.uniform1f(skyUniforms.doom,state.progress);gl.uniform1f(skyUniforms.time,elapsed);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.DEPTH_TEST);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
  gl.uniformMatrix4fv(uniforms.vp,false,vp);gl.uniform3fv(uniforms.eye,camera.eye);gl.uniform3fv(uniforms.fog,fog);gl.uniform1f(uniforms.doom,state.progress);gl.uniform1f(uniforms.time,elapsed);
  bindMesh(staticBuffer);gl.drawArrays(gl.TRIANGLES,0,staticArray.length/10);
  const dynamic=new Float32Array(effects(elapsed).data);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  bindMesh(dynamicBuffer,dynamic);gl.drawArrays(gl.TRIANGLES,0,dynamic.length/10);
  gl.depthMask(true);gl.disable(gl.BLEND);
 }
 function drawStatic(){
  if(!ctx)return;
  const top=color([.12,.32,.48],[.025,.035,.06],state.progress),bottom=color([.63,.82,.85],[.42,.18,.09],state.progress);
  const rgb=c=>'rgb('+c.map(v=>Math.round(clamp(v)*255)).join(',')+')';
  const gradient=ctx.createLinearGradient(0,0,0,height);gradient.addColorStop(0,rgb(top));gradient.addColorStop(1,rgb(bottom));ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  const tris=[],data=staticMesh.data.concat(effects(5).data);
  for(let i=0;i<data.length;i+=30){
   const vertices=[0,10,20].map(k=>project(data.slice(i+k,i+k+3),vp));
   if(vertices.some(v=>v[3]<=0)||vertices.every(v=>Math.abs(v[0])>1.2||Math.abs(v[1])>1.2))continue;
   const n=data.slice(i+3,i+6),lit=.42+Math.max(0,dot(n,norm([-.4,.85,.45])))*.64;
   tris.push({vertices,z:vertices.reduce((s,v)=>s+v[2],0),col:rgb(data.slice(i+6,i+9).map(v=>v*(data[i+9]>2.5?1.2:lit)))});
  }
  tris.sort((a,b)=>b.z-a.z);
  for(const tri of tris){ctx.beginPath();tri.vertices.forEach((v,i)=>{const x=(v[0]+1)*width/2,y=(1-v[1])*height/2;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fillStyle=tri.col;ctx.fill();}
 }
 function positionLabels(){
  if(!vp)return;
  const grid=document.getElementById('monitors'),rect=surface.getBoundingClientRect();if(!grid)return;
  const area=grid.getBoundingClientRect();
  for(const room of rooms){
   const button=grid.querySelector('[data-open="'+room.key+'"]');if(!button)continue;
   const point=project(add(room.pos,[0,0,room.size*.38]),vp);
   button.style.left=((point[0]+1)*width/2+rect.left-area.left)+'px';
   button.style.top=((1-point[1])*height/2+rect.top-area.top+70)+'px';
   button.style.setProperty('--room-height',(room.pixelSize+62)+'px');
   button.style.setProperty('--room-width',Math.min(width<600?148:185,area.width/(width<600?2:width<1000?3:5)-10)+'px');
  }
 }
 function sample(now){
  const next=window.CityTimeline.sample(settings,now);
  if(next.progress!==state.progress){geometryDirty=true;dirty=true;}
  state=next;
  document.body.style.setProperty('--city-doom',String(state.progress));
  const label=document.getElementById('city-status'),pct=document.getElementById('city-damage'),bar=document.getElementById('city-progress');
  if(label)label.textContent=state.phase;
  if(pct)pct.textContent=Math.round(state.progress*100)+'%';
  if(bar)bar.style.width=(state.progress*100)+'%';
 }
 function updateCamera(now,moving){
  if(transition){
   const u=clamp((now-transition.at)/transition.duration),s=smooth(u);
   camera={eye:transition.from.eye.map((v,i)=>mix(v,transition.to.eye[i],s)),target:transition.from.target.map((v,i)=>mix(v,transition.to.target[i],s))};
   if(u===1){const done=transition.done;transition=null;done();}
   return;
  }
  if(inside)return;
  camera={eye:baseCamera.eye.slice(),target:baseCamera.target.slice()};
  if(moving){
   camera.eye[0]+=Math.sin(elapsed*.07)*1.8;camera.eye[1]+=Math.sin(elapsed*.09)*.4;
   // Tremors affect the 3D view only. The HUD, score fields, and room buttons stay usable.
   if(state.progress>.22){
    const pulse=Math.pow(Math.max(0,Math.sin(elapsed*(1+state.progress*1.5))),18)*state.progress*.42;
    camera.eye[0]+=Math.sin(elapsed*43)*pulse;camera.eye[1]+=Math.cos(elapsed*39)*pulse*.7;
   }
  }
 }
 function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden){lastFrame=now;return;}
  if(now-lastFrame<(mode==='static'?300:width<600?40:32))return;
  const routeDelta=(now-lastFrame)/1000,dt=Math.min(.1,routeDelta);lastFrame=now;
  if(now-lastSample>950){sample(Date.now());lastSample=now;}
  const moving=!paused&&!media.matches&&!suspended&&!inside&&mode==='webgl';
  if(moving){
   elapsed+=dt;routeTime+=routeDelta;
   const visible=id=>{const e=document.getElementById(id);if(!e)return false;const r=e.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;};
   if(visible('player-towers'))towerTime+=routeDelta;
   if(visible('city-podium'))podiumTime+=routeDelta;
  }
  if(needsLayout)layout();
  if(geometryDirty||lastBuild!==state.progress)rebuild();
  if(!moving&&!transition&&!dirty)return;
  updateCamera(now,moving);
  vp=multiply(perspective(fov,width/height,.3,900),lookAt(camera.eye,camera.target));
  if(mode==='webgl')drawGL();else drawStatic();
  positionLabels();dirty=false;
 }
 function travel(to,nextInside){
  inside=nextInside;dirty=true;
  if(transition){const finish=transition.done;transition=null;finish();}
  if(media.matches||mode==='static'){
   camera={eye:to.eye.slice(),target:to.target.slice()};return Promise.resolve();
  }
  return new Promise(done=>{transition={at:performance.now(),duration:nextInside?780:650,from:{eye:camera.eye.slice(),target:camera.target.slice()},to,done};});
 }
 window.CityWorld={
  setMonuments(value){
   if(monuments){
    for(const player of value.towers){
     if(!player.cut)delete falls[player.id];
     else if(!monuments.towers.find(p=>p.id===player.id)?.cut)falls[player.id]=towerTime;
    }
    if(value.complete&&!monuments.complete)riseAt=podiumTime;
    if(!value.complete)riseAt=null;
   }
   monuments=value;needsLayout=true;dirty=true;
  },
  setTournament(stages){
   const signature=JSON.stringify(stages.map(s=>[s.key,s.status]));
   if(signature===JSON.stringify(tournament.map(s=>[s.key,s.status])))return;
   for(const stage of stages){
    const previous=tournament.find(s=>s.key===stage.key);
    if(stage.status==='sealed')delete unlocks[stage.key];
    else if(previous?.status==='sealed')unlocks[stage.key]=routeTime;
   }
   tournament=stages.map(s=>({...s}));geometryDirty=true;dirty=true;
  },
  setSettings(value){settings={...value};sample(Date.now());dirty=true;},
  refreshRooms(){needsLayout=true;dirty=true;},
  setPaused(value){paused=!!value;dirty=true;},
  setSuspended(value){suspended=!!value;dirty=true;},
  enterRoom(key){const room=rooms.find(r=>r.key===(key==='sitout'?'round2':key));if(!room)return Promise.resolve();const [x,,z]=room.pos,s=room.size;return travel({eye:[x,s*.65,z+s*1.6],target:[x,s*.45,z-s*.3]},true);},
  leaveRoom(){return travel(baseCamera,false);},
  getStatus(){return {mode,progress:state.progress,phase:state.phase,damagedBuildings:damageCount,buildings:activeBuildings.length,fireSites:fireSites.length,rooms:rooms.length,paused,inside};}
 };
 window.addEventListener('resize',resize);
 if(window.ResizeObserver){const observer=new ResizeObserver(resize);observer.observe(document.body);}
 if(media.addEventListener)media.addEventListener('change',()=>{dirty=true;});
 surface.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;});
 surface.addEventListener('webglcontextrestored',()=>{try{initGL();geometryDirty=true;paused=false;resize();}catch{location.reload();}});
 resize();requestAnimationFrame(frame);
})();
