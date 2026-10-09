/* Local, dependency-free 3D Roman amphitheater. Geometry and the crowd are deterministic;
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
 const TAU=Math.PI*2,up=[0,1,0];
 // Amphitheater frame: the sand is an ellipse; s scales it (1 = podium wall), th is the angle.
 const ARENA={cx:0,cz:-62,rx:34,rz:22};
 const SEG=48,ROWS=12,WALL_H=3.2,ROW_S=.055,ROW_RISE=1.4;
 const FACADE_S=1.76,FACADE_H=24,LEVEL_H=6,DSEG=TAU/SEG;
 const ep=(s,th,y=0)=>[ARENA.cx+ARENA.rx*s*Math.cos(th),y,ARENA.cz+ARENA.rz*s*Math.sin(th)];
 const inward=th=>norm([-Math.cos(th)/ARENA.rx,0,-Math.sin(th)/ARENA.rz]);
 const tangent=th=>norm([-ARENA.rx*Math.sin(th),0,ARENA.rz*Math.cos(th)]);
 const speed=th=>Math.hypot(ARENA.rx*Math.sin(th),ARENA.rz*Math.cos(th));
 const angDist=(a,b)=>Math.abs(((a-b+Math.PI)%TAU+TAU)%TAU-Math.PI);
 function multiply(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[c*4+r]+=a[k*4+r]*b[c*4+k];return out;}
 function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);}
 function lookAt(eye,target){const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
 function project(p,m){const q=[0,0,0,0];for(let r=0;r<4;r++)q[r]=m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r];return [q[0]/q[3],q[1]/q[3],q[2]/q[3],q[3]];}
 const CORNERS=[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]];
 const FACES=[[0,1,2,3],[5,4,7,6],[3,2,6,7],[4,5,1,0],[1,5,6,2],[4,0,3,7]];
 class Mesh{
  constructor(){this.data=[];}
  tri(a,b,c,col,kind=0){const n=norm(cross(sub(b,a),sub(c,a)));for(const p of [a,b,c])this.data.push(...p,...n,...col,kind);}
  quad(a,b,c,d,col,kind=0){this.tri(a,b,c,col,kind);this.tri(a,c,d,col,kind);}
  // A quad whose winding is flipped when needed so its normal faces `want`.
  oquad(a,b,c,d,want,col,kind=0){if(dot(cross(sub(b,a),sub(c,a)),want)<0)this.quad(a,d,c,b,col,kind);else this.quad(a,b,c,d,col,kind);}
  box(x,y,z,w,h,d,col,kind=0,roll=0){
   const co=Math.cos(roll),si=Math.sin(roll);
   const p=CORNERS.map(v=>{
    const vx=v[0]*w/2,vy=v[1]*h/2;return [x+vx*co-vy*si,y+vx*si+vy*co,z+v[2]*d/2];
   });
   for(const f of FACES)this.quad(...f.map(i=>p[i]),col,kind);
  }
  // Oriented box: corners are c +/- ux*w/2 +/- uy*h/2 +/- uz*d/2, same face order as box().
  obox(c,ux,uy,uz,w,h,d,col,kind=0){
   if(dot(cross(ux,uy),uz)<0)uz=mul(uz,-1);
   const p=CORNERS.map(v=>add(add(add(c,mul(ux,v[0]*w/2)),mul(uy,v[1]*h/2)),mul(uz,v[2]*d/2)));
   for(const f of FACES)this.quad(...f.map(i=>p[i]),col,kind);
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
  // Flat ring in the plane of unit vectors a and b, facing cross(a,b). Like ring(), the annulus
  // runs from r-width to r, so r is the outer radius.
  loop(c,a,b,r,width,col,kind=0,seg=16){
   const want=cross(a,b),at=(t,rr)=>add(c,add(mul(a,Math.cos(t)*rr),mul(b,Math.sin(t)*rr)));
   for(let i=0;i<seg;i++){const t0=i*TAU/seg,t1=(i+1)*TAU/seg;this.oquad(at(t0,r),at(t1,r),at(t1,r-width),at(t0,r-width),want,col,kind);}
  }
  // Triangle fan around c. col may be a function of the triangle index. Closed fans wrap around.
  fan(c,points,col,kind=0,want=null,closed=true){
   const n=points.length,count=closed?n:n-1;
   for(let i=0;i<count;i++){
    let a=points[i],b=points[(i+1)%n];
    if(want&&dot(cross(sub(a,c),sub(b,c)),want)<0)[a,b]=[b,a];
    this.tri(c,a,b,typeof col==='function'?col(i):col,kind);
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
 let tournament=[],unlocks={},routeTime=0,ceremony=null,ceremonyGeneration=0;
 let monuments=null,podiumSites=[],podiumTime=0,riseAt=null;
 const roomKeys=['settings','round1','round2','final','overview'];
 // Bronze (rules), crimson (Be Better), imperial purple (Enough), ochre (Forget The Past), gold (leaderboard).
 const roomColors=[[.71,.85,.60],[.95,.58,.68],[.70,.68,.92],[.97,.79,.43],[.70,.88,.77]];
 const GATES=[
  {key:'settings',deg:210,size:8},{key:'round1',deg:240,size:8},{key:'round2',deg:270,size:8},
  {key:'final',deg:300,size:8},{key:'overview',deg:330,size:9},
  {key:'losers',deg:180,size:7,decor:true,label:"Losers' Gate"},{key:'triumph',deg:0,size:7,decor:true,label:'Triumph Gate'}];
 const ROMAN=['I','II','III','IV','V'];
 // Emperor's box over rows 6 to 9 at 270 degrees.
 const PULV={th:1.5*Math.PI,half:8*Math.PI/180,rows:[6,9]};
 const PULV_S0=1.06+6*ROW_S,PULV_S1=1.06+10*ROW_S,PULV_BASE=WALL_H+6*ROW_RISE,PULV_TOP=15.9;
 // Stand torches on the top seat row, on segment boundaries (between seat slots).
 const TORCHES=Array.from({length:24},(_,i)=>i*TAU/24+Math.PI/24);
 const TORCH_S=1.06+11*ROW_S+ROW_S*.5,TORCH_Y=WALL_H+11*ROW_RISE;
 const PETALS=[[1,.55,.65],[.85,.2,.25],[1,.8,.35]];
 const media=window.matchMedia('(prefers-reduced-motion: reduce)');
 // Calm-morning ambience: birds are fully present near progress 0 and gone by this
 // threshold. The audio chirps in BrawlAudio use the same cutoff so the sky birds and
 // their song appear and disappear together.
 const BIRD_THRESHOLD=.2;
 let settings={},state={progress:0,phase:'THE GARDEN IS WAITING'},width=1,height=1,rooms=[],gates=[],dirty=true,geometryDirty=true;
 let bloomLevel=0,gardenFlowers=0,gardenHedges=0;
 let staticMesh=new Mesh(),staticArray=new Float32Array();
 let elapsed=0,lastFrame=0,lastSample=0,paused=false,suspended=false,inside=false,transition=null,lastBuild='',needsLayout=true;
 let dusk=0,duskTarget=0,seats=0,spectators=0,torchesLit=0,torchCount=0,torchSites=[];
 let surgeAt=null,surgeBig=false,surgeEnv=0;
 let partTris={},rebuilds=0,dynamicTriangles=0,ceremonyRange=[0,0],lastDynamic=[];
 // The viewer hovers high over the near rim, looking down into the arena.
 const baseCamera={eye:[0,56,25],target:[0,2,-54]};
 let sceneView='street',returnRoute=[];
 let camera={eye:baseCamera.eye.slice(),target:baseCamera.target.slice()},vp;
 let gl=null,ctx=null,program,skyProgram,staticBuffer,dynamicBuffer,skyBuffer,uniforms,skyUniforms;
 const fov=66*Math.PI/180;
 // Sky colors shared by the sky shader, the fog and the static fallback gradient.
 const skyStops=d=>({
  top:color([.16,.42,.70],[.10,.08,.22],d),
  bottom:d<=.7?color([.86,.83,.70],[.98,.55,.30],d/.7):color([.98,.55,.30],[.45,.22,.25],(d-.7)/.3)});
 const fogColor=(d,p)=>color(skyStops(d).bottom,[.80,.70,.52],p*.3);
 function shader(type,code){
  const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;
 }
 function link(v,f){const p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
 // No uniform is shared between the vertex and fragment stages: their default float
 // precisions differ (highp vs mediump), and GLSL ES 1.00 fails the link on a mismatch.
 const VERTEX_SRC='attribute vec3 a_pos,a_normal,a_color;attribute float a_kind;uniform mat4 u_vp;uniform float u_wtime,u_wheat,u_surge;uniform vec2 u_center;varying vec3 v_pos,v_normal,v_color;varying float v_kind;void main(){float wave=0.;if(a_kind>1.5&&a_kind<2.5){float ang=atan(a_pos.z-u_center.y,a_pos.x-u_center.x);float bob=max(0.,sin(u_wtime*5.+a_pos.x*.35+a_pos.z*.27));float mex=pow(max(0.,cos(ang-u_wtime*.9)),24.);wave=bob*.12*(.3+u_wheat)+mex*.9*u_wheat+u_surge*bob*.5;}vec3 p=a_pos+vec3(0.,wave,0.);v_pos=p;v_normal=a_normal;v_color=a_color;v_kind=a_kind;gl_Position=u_vp*vec4(p,1.);}';
 const FRAGMENT_SRC='precision mediump float;varying vec3 v_pos,v_normal,v_color;varying float v_kind;uniform vec3 u_eye,u_fog;uniform float u_heat,u_dusk,u_time;void main(){vec3 n=normalize(v_normal);float light=max(dot(n,normalize(vec3(-.4,.85,.45))),0.0);vec3 c=v_color*(mix(.46,.30,u_dusk)+light*.64*mix(vec3(1.),vec3(1.,.7,.48),u_dusk));if(v_kind>.5&&v_kind<1.5&&abs(n.y)<.5){float course=step(.92,fract(v_pos.y*1.1));float joint=step(.95,fract((v_pos.x+v_pos.z)*.7+floor(v_pos.y*1.1)*.5));c*=(1.-course*.12)*(1.-joint*.08);}if(v_kind>2.5)c=v_color*(1.2+sin(u_time*2.0+v_pos.x)*.06);float fog=clamp(1.0-exp(-length(v_pos-u_eye)*(.003+u_heat*.0015)),0.0,.88);c=mix(c,u_fog,fog*(v_kind>2.5?.45:1.0));float alpha=1.0;if(v_kind>3.5){vec2 uv=v_normal.xy;float r=length(uv);if(v_kind<4.5){alpha=(1.0-smoothstep(.05,1.0,r))*.38;c=mix(v_color,u_fog,.24);}else{float sway=sin(u_time*4.+uv.y*5.+v_pos.x)*.13*(uv.y+1.);float width=(1.-uv.y)*.4+.05;float core=clamp(1.-abs(uv.x+sway)/width,0.,1.);alpha=core*(1.0-smoothstep(.3,1.0,uv.y))*smoothstep(-1.,-.6,uv.y);c=mix(vec3(1.,.12,.015),vec3(1.,.84,.22),pow(core,2.)*(1.-uv.y)*.65);}if(alpha<.01)discard;}gl_FragColor=vec4(c,alpha);}';
 const SKY_VERTEX_SRC='attribute vec2 a_pos;varying vec2 v_uv;void main(){v_uv=a_pos*.5+.5;gl_Position=vec4(a_pos,0.,1.);}';
 const SKY_FRAGMENT_SRC='precision mediump float;varying vec2 v_uv;uniform float u_heat,u_dusk,u_time;float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}void main(){vec2 uv=v_uv;vec3 top=mix(vec3(.16,.42,.70),vec3(.10,.08,.22),u_dusk);vec3 bottom=u_dusk<=.7?mix(vec3(.86,.83,.70),vec3(.98,.55,.30),u_dusk/.7):mix(vec3(.98,.55,.30),vec3(.45,.22,.25),(u_dusk-.7)/.3);vec3 c=mix(bottom,top,smoothstep(.15,1.,uv.y));float cloud=noise(uv*vec2(5,10)+vec2(u_time*.009,0));cloud+=noise(uv*vec2(13,21)+vec2(u_time*.014,2))*.4;float cover=smoothstep(.7,1.2,cloud);c=mix(c,mix(vec3(.97,.95,.90),vec3(.92,.62,.52),u_dusk),cover*.25);float sun=exp(-length((uv-vec2(.72,mix(.80,.16,u_dusk)))*vec2(1.,1.7))*40.);c+=mix(vec3(1.,.92,.7),vec3(1.,.45,.2),u_dusk)*sun;c+=vec3(.80,.70,.52)*u_heat*.12*(1.-uv.y);if(u_dusk>.9)c+=vec3(step(.997,hash(floor(uv*240.))))*(u_dusk-.9)*10.*smoothstep(.4,1.,uv.y);gl_FragColor=vec4(c,1.);}';
 function initGL(){
  gl=canvas.getContext('webgl',{alpha:false,antialias:true,powerPreference:'low-power'});
  if(!gl)return false;
  program=link(VERTEX_SRC,FRAGMENT_SRC);
  uniforms={};for(const name of ['vp','wtime','wheat','surge','center','eye','fog','heat','dusk','time'])uniforms[name]=gl.getUniformLocation(program,'u_'+name);
  skyProgram=link(SKY_VERTEX_SRC,SKY_FRAGMENT_SRC);
  skyUniforms={};for(const name of ['heat','dusk','time'])skyUniforms[name]=gl.getUniformLocation(skyProgram,'u_'+name);
  staticBuffer=gl.createBuffer();dynamicBuffer=gl.createBuffer();skyBuffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  return true;
 }
 let mode='webgl';
 try{if(!initGL())mode='static';}catch(error){console.warn('Garden renderer uses static projection:',error.message);mode='static';}
 if(mode==='static'){
  // A fresh canvas can obtain 2D even if an attempted WebGL setup already claimed one.
  const fallback=document.createElement('canvas');fallback.id=canvas.id;fallback.setAttribute('aria-hidden','true');canvas.replaceWith(fallback);ctx=fallback.getContext('2d');
 }
 const surface=mode==='static'?document.getElementById('city-canvas'):canvas;
 const isMoving=()=>!paused&&!media.matches&&!suspended&&!inside&&mode==='webgl';
 // Front face vertical layout of a gate, all heights from y=0 at the gate (s = gate size).
 function faceLayout(s){
  return {openHalfW:.25*s,openTop:.55*s,archR:.25*s,archOut:.32*s,archApex:.8*s,keystoneTop:.87*s,tunnelCeiling:.8*s,tunnelLen:.6*s,
   bannerBottom:.88*s,bannerTop:1.04*s,bannerCenter:.96*s,bannerHalfW:.2*s,bannerH:.16*s,bannerN:.08,bannerD:.05,bannerFrontN:.105,
   laurelR:.075*s,laurelW:.025*s,laurelN:.14,ribbonY:.89*s,ribbonT:.05*s,blockTop:1.05*s};
 }
 const gatePoint=(g,t,u,n=0)=>add(add(add(g.pos,mul(g.T,t)),mul(g.U,u)),mul(g.N,n));
 function layout(){
  // Five garden pavilions at the ends of the winding palace hedge paths.
  const sites=[[-26,-35],[-14,-68],[0,-42],[14,-68],[26,-35]];
  rooms=roomKeys.map((key,i)=>{
   const [x,z]=sites[i],size=i===4?9:8,N=[0,0,1],pos=[x,0,z];
   return {key,pos,front:[x,0,z+size*.6],N,size,color:roomColors[i],
    laurelAt:[x,size*1.55,z],face:{keystoneTop:size*1.5,bannerBottom:size*.8,bannerTop:size*1.2,
     bannerHalfW:size*.25,bannerCenter:size*1.1,bannerFrontN:0,blockTop:size*1.6,
     tunnelCeiling:size*.8,openTop:size*.8,archR:size*.2,tunnelLen:size*.6,laurelR:.9,laurelN:0}};
  });
  gates=rooms;
  podiumSites=[2,1,3].map((place,i)=>({place,pos:[(i-1)*5.2,0,-99],size:2.1}));
  geometryDirty=true;needsLayout=false;positionLabels();
 }
 function resize(){
  const box=document.getElementById('world').getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);
  const dpr=Math.min(window.devicePixelRatio||1,mode==='static'?1:1.5);
  surface.width=Math.round(width*dpr);surface.height=Math.round(height*dpr);
  if(gl&&mode==='webgl')gl.viewport(0,0,surface.width,surface.height);
  needsLayout=true;geometryDirty=true;dirty=true;
 }
 function gateState(key){
  const stage=tournament.find(t=>t.key===key);
  if(stage?.status==='sealed')return 'sealed';
  if(['round1','round2','final'].includes(key)&&stage?.status==='complete'&&!(ceremony?.key===key&&ceremony.phase!=='crowned'))return 'crowned';
  return 'open';
 }
 // Angular clipping: the sub-intervals of [a,b] left after removing every [c.th-c.half, c.th+c.half].
 function subtract(a,b,cuts){
  let pieces=[[a,b]];
  for(const c of cuts){
   const base=a+(((c.th-a)%TAU)+TAU)%TAU;
   for(const center of [base,base-TAU]){
    const lo=center-c.half,hi=center+c.half,next=[];
    for(const [p,q] of pieces){
     if(hi<=p||lo>=q){next.push([p,q]);continue;}
     if(lo>p)next.push([p,lo]);
     if(hi<q)next.push([hi,q]);
    }
    pieces=next;
   }
  }
  return pieces.filter(([p,q])=>q-p>1e-4);
 }
 function cutsFor(part,row){
  if(part==='wall')return gates;
  const cuts=gates.filter(g=>row<g.rows);
  const pulvRows=part==='tread'?[6,9]:[7,9];
  if(row>=pulvRows[0]&&row<=pulvRows[1])cuts.push(PULV);
  return cuts;
 }
 function laurel(m,g,c){
  const [a,b]=dot(cross(g.T,g.U),g.N)>=0?[g.T,g.U]:[g.U,g.T];
  m.loop(c,a,b,g.face.laurelR,g.face.laurelW,[.27,.55,.22]);
 }
 function gateMesh(m,g){
  const st=gateState(g.key),sealed=st==='sealed',crowned=st==='crowned',s=g.size,f=g.face,{T,U,N}=g;
  const P=(t,u,n=0)=>gatePoint(g,t,u,n),Y=(p,y)=>[p[0],y,p[2]];
  const stone=sealed?[.52,.48,.44]:[.80,.73,.62],H=f.blockTop,W=g.width/2;
  // Block: two side faces on the clip rays and a 4-quad top strip back to the first unclipped row.
  const EmN=add(g.Em,mul(N,.06)),EpN=add(g.Ep,mul(N,.06)),bA=ep(g.sBack,g.th-g.half,0),bB=ep(g.sBack,g.th+g.half,0);
  m.oquad(Y(EmN,0),Y(bA,0),Y(bA,H),Y(EmN,H),mul(T,-1),stone,1);
  m.oquad(Y(EpN,0),Y(bB,0),Y(bB,H),Y(EpN,H),T,stone,1);
  for(let k=0;k<4;k++){
   const f0=add(mul(EmN,1-k/4),mul(EpN,k/4)),f1=add(mul(EmN,1-(k+1)/4),mul(EpN,(k+1)/4));
   m.oquad(Y(f0,H),Y(f1,H),ep(g.sBack,g.th-g.half+2*g.half*(k+1)/4,H),ep(g.sBack,g.th-g.half+2*g.half*k/4,H),up,stone);
  }
  // Front face: two jambs and seven strips from the arch up to the block top.
  const ow=f.openHalfW,ot=f.openTop,ar=f.archR;
  m.oquad(P(-W,0),P(-ow,0),P(-ow,H),P(-W,H),N,stone,1);
  m.oquad(P(ow,0),P(W,0),P(W,H),P(ow,H),N,stone,1);
  for(let k=0;k<7;k++){
   const a0=Math.PI*(1-k/7),a1=Math.PI*(1-(k+1)/7),x0=ar*Math.cos(a0),y0=ot+ar*Math.sin(a0),x1=ar*Math.cos(a1),y1=ot+ar*Math.sin(a1);
   m.oquad(P(x0,y0),P(x1,y1),P(x1,H),P(x0,H),N,stone,1);
  }
  // Seven voussoirs; the middle one is the keystone in the gate color.
  const rm=(f.archR+f.archOut)/2;
  for(let k=0;k<7;k++){
   const a=Math.PI*(k+.5)/7,rad=add(mul(T,Math.cos(a)),mul(U,Math.sin(a))),tan=add(mul(T,-Math.sin(a)),mul(U,Math.cos(a))),key=k===3;
   m.obox(add(P(0,ot,.04),mul(rad,rm)),rad,tan,N,f.archOut-f.archR,2*rm*Math.sin(Math.PI/14)*.94,.12,key?(crowned?[1,.8,.35]:sealed?[.40,.40,.42]:g.color):[.88,.84,.76],key&&crowned?3:0);
  }
  // Tunnel behind the opening, with a flat ceiling at the arch apex.
  const L=f.tunnelLen,tc=f.tunnelCeiling;
  m.oquad(P(-ow,.03,0),P(ow,.03,0),P(ow,.03,-L),P(-ow,.03,-L),up,[.30,.25,.18]);
  m.oquad(P(-ow,0,0),P(-ow,0,-L),P(-ow,tc,-L),P(-ow,tc,0),T,[.24,.18,.13]);
  m.oquad(P(ow,0,0),P(ow,0,-L),P(ow,tc,-L),P(ow,tc,0),mul(T,-1),[.24,.18,.13]);
  m.oquad(P(-ow,tc,0),P(ow,tc,0),P(ow,tc,-L),P(-ow,tc,-L),mul(U,-1),[.12,.10,.08]);
  m.oquad(P(-ow,0,-L),P(ow,0,-L),P(ow,tc,-L),P(-ow,tc,-L),N,[.07,.06,.05]);
  for(const side of [-1,1])m.obox(P(side*(ow-.1),.4*s,-L*.5),T,U,N,.15,.35,.15,sealed?[.25,.2,.15]:[1,.6,.25],sealed?0:3);
  // Banner between the keystone and the block top.
  m.obox(P(0,f.bannerCenter,f.bannerN),T,U,N,2*f.bannerHalfW,f.bannerH,f.bannerD,sealed?[.30,.30,.32]:g.banner);
  if(crowned)m.obox(P(0,f.bannerBottom+.01*s,f.bannerN+.01),T,U,N,2*f.bannerHalfW,.02*s,f.bannerD,[1,.8,.35],3);
  // Braziers on tripods in front of the gate.
  for(const side of [-1,1]){
   const b=P(side*s*.62,0,s*.5);
   m.box(b[0],.6,b[2],.18,1.2,.18,[.30,.24,.18]);
   m.gem(b[0],1.35,b[2],.4,sealed?[.30,.25,.20]:[1,.55,.2],sealed?0:3,.5);
  }
  if(crowned){
   laurel(m,g,g.laurelAt);
   for(const side of [-1,1]){const r=P(side*f.ribbonT,f.ribbonY,f.laurelN);m.gem(r[0],r[1],r[2],.03*s,[1,.8,.35],3);}
  }
 }
 function rebuildArena(){
  // The former circular stadium is now an open royal maze garden. All geometry
  // below is part of the same fullscreen WebGL scene, never an image backdrop.
  const m=new Mesh(),still=mode==='static';partTris={};rebuilds++;
  const part=(name,fn)=>{const before=m.data.length;fn();partTris[name]=(m.data.length-before)/30;};
  const stone=[.78,.77,.65],gravel=[.83,.77,.60],hedge=[.14,.36,.18],hedgeTip=[.21,.49,.25],gold=[.83,.67,.36];
  const bloom=Math.round(bloomLevel*3);
  const roseColors=[[.99,.42,.53],[.97,.73,.48],[.92,.67,.87],[.97,.93,.76]];
  gardenFlowers=0;gardenHedges=0;
  part('lawn',()=>{
   m.box(0,-.6,-61,180,1.2,182,[.21,.39,.23]);
   m.box(0,-.03,-61,111,.12,138,[.22,.45,.27]);
   // Formal cobblestone walks between raised green hedge walls.
   m.box(0,.035,-50,7,.08,120,gravel);
   for(const z of [-30,-48,-66,-84,-101])m.box(0,.05,z,78,.08,5,gravel);
   for(const x of [-34,-17,17,34])m.box(x,.045,-61,4,.08,100,gravel);
   // Palace terrace and stairway, beyond the fountain court.
   for(let k=0;k<6;k++)m.box(0,.15+k*.25,-127-k*1.7,78-k*2,.3,10,stone);
  });
  part('maze-hedges',()=>{
   const walls=[
    [-39,-58,3,78],[-29,-46,3,40],[-29,-88,3,40],
    [39,-58,3,78],[29,-46,3,40],[29,-88,3,40],
    [-9,-24,32,3],[9,-24,32,3],[-9,-38,31,3],[9,-53,31,3],
    [-9,-66,31,3],[9,-78,31,3],[-9,-92,31,3],[9,-106,31,3],
    [-19,-46,3,22],[19,-65,3,23],[-20,-84,3,20],[20,-92,3,24],
    [-47,-98,3,65],[47,-98,3,65],
    [-44,-126,92,3]
   ];
   for(const [x,z,w,d] of walls){
    const segments=Math.ceil(Math.max(w,d)/8),alongX=w>d;
    for(let i=0;i<segments;i++){
     const length=(alongX?w:d)/segments;
     const px=x+(alongX?(i-(segments-1)/2)*length:0);
     const pz=z+(alongX?0:(i-(segments-1)/2)*length);
     m.box(px,1.7,pz,alongX?length+.05:w,3.4,alongX?d:length+.05,hedge);
     m.box(px,3.35,pz,alongX?length+.04:w+.02,.55,alongX?d+.02:length+.04,hedgeTip);
     gardenHedges++;
    }
   }
   // Small hedge islands give the maze recognizable turns from above.
   for(let k=0;k<14;k++){const x=(k%7-3)*12,z=-35-Math.floor(k/7)*49;
    if(Math.abs(x)<10)continue;m.box(x,1.2,z,4,2.4,5,[.12,.34,.18]);}
  });
  part('rose-beds',()=>{
   // Each round complete opens a fresh section of roses. At zero completions
   // only rosebuds and stems exist; after Final, every section is in bloom.
   for(let i=0;i<112;i++){
    const lane=i%8,rank=Math.floor(i/8),side=lane<4?-1:1;
    const x=side*(5+(lane%4)*8)+Math.sin(i*13.1)*1.4,z=-19-rank*7.3;
    const y=.2+(i%4)*.05,col=roseColors[i%roseColors.length];
    m.box(x,.3,z,.13,.6,.13,[.12,.42,.17]);
    const open= (i%3)<bloom;
    if(open){
     m.gem(x,.95,z,.62,col,3,.55);gardenFlowers++;
     for(let k=0;k<5;k++){const angle=k*TAU/5;m.gem(x+Math.sin(angle)*.4,.76,z+Math.cos(angle)*.4,.28,
      color(col,[.95,.93,.78],.15),3,.4);}
    }else m.gem(x,.75,z,.19,[.43,.20,.22],3,1.2);
   }
  });
  part('pavilions',()=>{
   for(const g of rooms){
    const [x,,z]=g.pos,r=g.size,colorTop=g.color,stateGate=gateState(g.key),sealed=stateGate==='sealed';
    m.box(x,.2,z,r*2.1,.4,r*1.8,stone);
    for(const dx of [-r*.7,r*.7])for(const dz of [-r*.58,r*.58]){
     m.box(x+dx,3.3,z+dz,.46,6.2,.46,[.93,.91,.81]);
     m.box(x+dx,6.52,z+dz,.88,.34,.88,gold);
    }
    // A translucent-looking vaulted copper roof, lantern and finial.
    m.box(x,6.85,z,r*2.1,.7,r*1.78,sealed?[.36,.35,.32]:colorTop);
    m.gem(x,8.8,z,r*.75,sealed?[.35,.34,.31]:colorTop,0,.48);
    m.box(x,9.5,z,.2,2,.2,gold);
    m.gem(x,10.65,z,.35,gold,3,1.7);
    if(sealed)for(let k=0;k<5;k++)m.box(x+(k-2)*r*.34,2.7,z+r*.77,.16,5.2,.17,[.32,.34,.32]);
    else{
     m.box(x,1,z+r*.7,r*.6,1.7,.14,[.18,.41,.24]);
     m.loop([x,.55,z+r*1.02],[1,0,0],[0,0,-1],r*.55,.18,g.color,3);
    }
   }
  });
  part('royal-palace',()=>{
   const z=-133;
   m.box(0,9,z-1,56,18,18,[.89,.86,.77]);
   m.box(0,19,z-1,60,2,21,[.41,.53,.35]);
   m.box(0,24,z-1,28,8,12,[.91,.88,.78]);
   m.gem(0,31,z,3.5,gold,0,1.5);
   for(let k=-5;k<=5;k++){
    const x=k*4.4;
    m.box(x,9.2,z+8,.8,14,.8,[.97,.95,.85]);
    m.box(x,16.7,z+8,2,.6,1.2,gold);
    if(k%2===0)m.box(x,8,z+8.55,1.1,5,.2,[.17,.27,.22]);
   }
   for(const x of [-26,26]){m.box(x,14,z,5,28,5,stone);m.gem(x,30,z,4.5,gold,0,1.2);}
  });
  part('fountains',()=>{
   for(const [x,z,r] of [[0,-22,5],[0,-113,6],[-46,-66,4],[46,-66,4]]){
    m.loop([x,.18,z],[1,0,0],[0,0,-1],r,.8,stone);
    m.box(x,.14,z,r*1.28,.28,r*1.28,[.30,.60,.66]);
    m.gem(x,1.3,z,.7,[.91,.91,.79]);
    m.gem(x,3,z,.3,gold,3,3);
   }
  });
  part('rose-arches',()=>{
   for(let n=0;n<7;n++){
    const z=-19-n*15,x=n%2?-2:2;
    for(const off of [-4.7,4.7])m.box(x+off,2.5,z,.45,5,.45,[.71,.72,.62]);
    m.box(x,5.1,z,10,.5,.65,[.23,.44,.23]);
    m.gem(x,6.1,z,.8,bloom>n%3?roseColors[n%4]:[.22,.46,.23],3,1.1);
   }
  });
  staticMesh=m;staticArray=new Float32Array(m.data);
  if(mode==='webgl'){gl.bindBuffer(gl.ARRAY_BUFFER,staticBuffer);gl.bufferData(gl.ARRAY_BUFFER,staticArray,gl.STATIC_DRAW);}
  geometryDirty=false;lastBuild=state.progress+'|'+duskTarget+'|'+bloomLevel;dirty=true;
 }
 // A single low-poly bird: a shallow V of two wing triangles that gently flaps.
 function bird(mesh,x,y,z,scale,flap,col){
  const span=scale,drop=scale*(.3+flap*.5);
  const body=[x,y,z];
  mesh.tri(body,[x-span,y+drop,z-span*.2],[x-span*.5,y+scale*.08,z-span*.1],col);
  mesh.tri(body,[x+span*.5,y+scale*.08,z+span*.1],[x+span,y+drop,z+span*.2],col);
 }
 // Draw a handful of ambient birds across the morning sky. They only appear while the
 // arena is calm (progress<BIRD_THRESHOLD) and no round is settled yet (dusk 0), and fade
 // out as the crowd gathers. Under reduced motion or the static fallback they are drawn in
 // fixed poses with no animation, and when the world is paused the shared frozen `t` keeps
 // them still like the rest.
 function morningBirds(mesh,t){
  const p=state.progress;
  if(p>=BIRD_THRESHOLD||dusk>0)return;
  const fade=clamp(1-p/BIRD_THRESHOLD);
  const still=media.matches||mode==='static';
  const count=Math.max(0,Math.round(fade*5));
  const col=color([.1,.11,.14],[.16,.18,.2],p);
  for(let i=0;i<count;i++){
   const lane=rand(i+41),u=still?(.15+lane*.6):((t*(.012+lane*.01)+lane)%1);
   const x=mix(-120,130,u),y=40+lane*26+(still?0:Math.sin(t*.5+i)*2.5),z=-30-i*22;
   const flap=still?.5:(Math.sin(t*7+i*2)*.5+.5);
   bird(mesh,x,y,z,2.4+lane*1.6,flap,col);
  }
 }
 function flame(m,pos,size){
  if(mode==='static')m.gem(pos[0],pos[1]+size*.3,pos[2],size*.3,[1,.5,.12],3,1.6);
  else m.billboard(pos[0],pos[1]+size*.5,pos[2],size*.7,size*1.2,[1,.45,.1],5);
 }
 // A sparring gladiator at P facing f: two legs, torso, head, crest, sword arm, sword and a round shield.
 function gladiator(m,P,f,swing,col){
  const sd=norm(cross(up,f)),at=(x,y,z)=>add(add(add(P,mul(sd,x)),[0,y,0]),mul(f,z)),step=Math.sin(swing)*.12,skin=[.80,.60,.45];
  m.obox(at(-.16,.45,step),sd,up,f,.17,.9,.17,[.55,.38,.26]);
  m.obox(at(.16,.45,-step),sd,up,f,.17,.9,.17,[.55,.38,.26]);
  m.obox(at(0,1.25,0),sd,up,f,.55,.75,.3,col);
  m.obox(at(0,1.82,0),sd,up,f,.3,.32,.3,skin);
  m.obox(at(0,2.06,-.02),sd,up,f,.08,.16,.38,[.80,.18,.15]);
  const thrust=.2+Math.max(0,Math.sin(swing))*.25;
  m.obox(at(.36,1.3,thrust),sd,up,f,.14,.14,.55,skin);
  m.obox(at(.36,1.3,thrust+.7),sd,up,f,.06,.1,.9,[.85,.85,.82],3);
  m.loop(at(-.42,1.25,.22),sd,up,.42,.42,[.75,.55,.25]);
 }
 function portcullis(m,g,amount,sealed){
  const f=g.face,lift=amount*(f.openTop+f.archR),hgt=f.archApex,iron=[.20,.19,.18],P=(t,u,n)=>gatePoint(g,t,u,n);
  for(let i=0;i<6;i++)m.obox(P(-f.openHalfW+(i+.5)*2*f.openHalfW/6,lift+hgt/2,-.08),g.T,g.U,g.N,.1,hgt,.06,iron);
  for(const v of [.25,.5,.75])m.obox(P(0,lift+hgt*v,-.08),g.T,g.U,g.N,2*f.openHalfW,.12,.06,iron);
  if(sealed)m.obox(P(0,f.openTop,.06),g.T,g.U,g.N,.3*g.size,.04*g.size,.05,[.4,.19,.12],3);
 }
 function effects(t){
  const m=new Mesh(),still=media.matches||mode==='static';
  // Four fountains remain active independently of round completions.
  for(const [x,z,r] of [[0,-22,5],[0,-113,6],[-46,-66,4],[46,-66,4]]){
   const count=still?5:10;
   for(let i=0;i<count;i++){
    const angle=i*TAU/count,u=still?.45:(t*.57+i*.113)%1;
    const radius=r*.65*Math.sin(Math.PI*u),h=.5+Math.sin(Math.PI*u)*3.3;
    m.gem(x+Math.cos(angle)*radius,h,z+Math.sin(angle)*radius,.12,[.61,.89,.91],3,1.1);
   }
  }
  // Drifting rose petals increase after each round settles.
  const petals=8+Math.round(bloomLevel*55);
  for(let i=0;i<petals;i++){
   const x=(rand(i+201)-.5)*78,z=-17-rand(i+304)*99,u=still?.3:(t*(.03+rand(i+399)*.018)+rand(i+521))%1;
   m.gem(x+Math.sin(t*.54+i)*.4,still?.2:17*(1-u)+.2,z,.16,PETALS[i%PETALS.length],3,.46);
  }
  // Tournament podium stays bound to actual saved rank/results.
  if(monuments)for(const site of podiumSites){
   const slot=monuments.slots.find(s=>s.place===site.place);if(!slot)continue;
   const [x,,z]=site.pos,w=site.size,rise=monuments.complete?(still||riseAt===null?1:smooth(clamp((podiumTime-riseAt)/2.4))):0;
   const h=w*(.4+(4-site.place)*.28+rise*.9);
   const medal=site.place===1?[.94,.77,.34]:site.place===2?[.78,.79,.81]:[.68,.42,.27];
   m.box(x,h/2,z,w*1.6,h,w*1.3,slot.tied?[.37,.41,.36]:medal);
   m.box(x,h+.07,z,w*1.75,.15,w*1.45,[.9,.85,.71],3);
   if(monuments.complete)m.loop([x,h+.2,z],[1,0,0],[0,0,-1],w*.62,.15,[.93,.70,.35],3);
  }
  // Opening ceremony grows a halo of flowers around the cleared pavilion.
  const ceremonyStart=m.data.length;
  if(ceremony&&ceremony.at!==null){
   const g=rooms.find(r=>r.key===ceremony.key);
   if(g){
    const age=(performance.now()-ceremony.at)/1000,[x,,z]=g.pos;
    const spread=ceremony.phase==='crowned'?clamp((age-1.4)/3.6):0;
    m.loop([x,.13,z],[1,0,0],[0,0,-1],g.size*(.5+2*spread),.21,[.92,.72,.45],3);
    for(let i=0;i<24;i++){
     const angle=i*TAU/24,r=g.size*(.16+spread*1.5);
     const h=ceremony.phase==='crowned'?Math.max(.5,8*(1-spread)):10*(1-clamp(age/1.4))+3;
     m.gem(x+Math.cos(angle)*r,h+Math.sin(angle*2+age)*.7,z+Math.sin(angle)*r,.31,PETALS[i%PETALS.length],3,.5);
    }
   }
  }
  ceremonyRange=[ceremonyStart,m.data.length];
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
  gl.disable(gl.DEPTH_TEST);gl.useProgram(skyProgram);gl.bindBuffer(gl.ARRAY_BUFFER,skyBuffer);
  const a=gl.getAttribLocation(skyProgram,'a_pos');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
  gl.uniform1f(skyUniforms.heat,state.progress);gl.uniform1f(skyUniforms.dusk,dusk);gl.uniform1f(skyUniforms.time,elapsed);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.DEPTH_TEST);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
  gl.uniformMatrix4fv(uniforms.vp,false,vp);
  gl.uniform1f(uniforms.wtime,elapsed%(Math.PI*200));gl.uniform1f(uniforms.wheat,state.progress);gl.uniform1f(uniforms.surge,surgeEnv);gl.uniform2f(uniforms.center,ARENA.cx,ARENA.cz);
  gl.uniform3fv(uniforms.eye,camera.eye);gl.uniform3fv(uniforms.fog,fogColor(dusk,state.progress));
  gl.uniform1f(uniforms.heat,state.progress);gl.uniform1f(uniforms.dusk,dusk);gl.uniform1f(uniforms.time,elapsed);
  bindMesh(staticBuffer);gl.drawArrays(gl.TRIANGLES,0,staticArray.length/10);
  lastDynamic=effects(elapsed).data;dynamicTriangles=lastDynamic.length/30;
  const dynamic=new Float32Array(lastDynamic);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
  bindMesh(dynamicBuffer,dynamic);gl.drawArrays(gl.TRIANGLES,0,dynamic.length/10);
  gl.depthMask(true);gl.disable(gl.BLEND);
 }
 function drawStatic(){
  if(!ctx)return;
  const sky=skyStops(dusk);
  const rgb=c=>'rgb('+c.map(v=>Math.round(clamp(v)*255)).join(',')+')';
  const gradient=ctx.createLinearGradient(0,0,0,height);gradient.addColorStop(0,rgb(sky.top));gradient.addColorStop(1,rgb(sky.bottom));ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  lastDynamic=effects(5).data;dynamicTriangles=lastDynamic.length/30;
  const tris=[],data=staticMesh.data.concat(lastDynamic);
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
  const host=document.getElementById('door-labels');if(!host||!vp)return;
  const names=['Players & rules','Be Better','Enough','Forget The Past','Leaderboard'];
  const labelAt=g=>add(add(g.pos,[0,g.size*1.05+.6,0]),mul(g.N,.4));
  const items=sceneView==='podium'&&monuments?podiumSites.map(site=>({id:'place'+site.place,pos:add(site.pos,[0,6,0]),label:site.place+'. '+(monuments.slots.find(s=>s.place===site.place)?.names.join(' · ')||'Awaiting finalist')})):
   [...rooms.map((g,i)=>({id:g.key,pos:labelAt(g),label:ROMAN[i]+' / '+names[i],locked:gateState(g.key)==='sealed'})),
    ...(sceneView==='street'?gates.filter(g=>g.decor).map(g=>({id:g.key,pos:labelAt(g),label:g.label,decor:true})):[])];
  const signature=items.map(i=>i.id+':'+i.label+':'+!!i.locked+':'+!!i.decor).join('|');
  if(host.dataset.signature!==signature){host.replaceChildren(...items.map(i=>{const e=document.createElement('span');e.textContent=i.label;e.className='door-marker'+(i.locked?' locked':'')+(i.decor?' decor':'');return e;}));host.dataset.signature=signature;}
  const forward=norm(sub(camera.target,camera.eye));
  items.forEach((item,i)=>{const e=host.children[i],point=project(item.pos,vp),depth=dot(sub(item.pos,camera.eye),forward);e.hidden=inside||!!transition||depth<1||point[0]<-1||point[0]>1||point[1]<-.95||point[1]>.95;
   e.style.left=((point[0]+1)*width/2)+'px';e.style.top=((1-point[1])*height/2)+'px';e.style.opacity=String(clamp(1-depth/170,.5,1));
  });
 }
 function sample(now){
  const next=window.CityTimeline.sample(settings,now),arrived=next.remaining===0;
  if(next.progress!==state.progress)dirty=true;
  state=next;
  if(!suspended&&!paused){
   // Crowd ambience rides the countdown; roars and the games-begin fanfare surge the crowd.
   const ev=window.BrawlAudio?.ambience?.(next.progress,arrived);
   if((ev==='roar'||ev==='big'||ev==='begin')&&isMoving()){surgeAt=elapsed;surgeBig=ev!=='roar';}
   // Morning birdsong: on while the arena is calm and no round is settled, off once the crowd gathers.
   window.BrawlAudio?.ambientBirds?.(next.progress<BIRD_THRESHOLD&&!arrived&&dusk===0);
  }else window.BrawlAudio?.ambientBirds?.(false);
  document.body.style.setProperty('--arena-heat',String(state.progress));
  const label=document.getElementById('city-status'),pct=document.getElementById('city-damage'),bar=document.getElementById('city-progress');
  if(label)label.textContent=bloomLevel>=1?'ROYAL GARDEN IN FULL BLOOM':bloomLevel>0?'THE ROSES ARE BLOOMING':state.phase;
  if(pct)pct.textContent=Math.round(bloomLevel*100)+'% BLOOM';
  if(bar)bar.style.width=(bloomLevel*100)+'%';
 }
 function updateCamera(now,moving){
  if(transition){
   const u=clamp((now-transition.at)/transition.duration),scaled=u*(transition.nodes.length-1),index=Math.min(transition.nodes.length-2,Math.floor(scaled)),s=smooth(scaled-index),from=transition.nodes[index],to=transition.nodes[index+1];
   camera={eye:from.eye.map((v,i)=>mix(v,to.eye[i],s)),target:from.target.map((v,i)=>mix(v,to.target[i],s))};
   if(u===1){const done=transition.done;transition=null;done();}
   return;
  }
  if(ceremony&&ceremony.at!==null&&!media.matches&&mode==='webgl'){
   const age=(now-ceremony.at)/1000;camera={eye:ceremony.camera.eye.slice(),target:ceremony.camera.target.slice()};
   // Crowd-roar rumble at the crown moment; paused arena and reduced motion keep the camera still.
   if(!paused&&age>=1.4&&age<3){const k=1-(age-1.4)/1.6;camera.eye[0]+=Math.sin(age*43)*.08*k;camera.eye[1]+=Math.cos(age*37)*.05*k;}
   return;
  }
  if(inside||sceneView!=='street')return;
  camera={eye:baseCamera.eye.slice(),target:baseCamera.target.slice()};
  // Hovering aerial camera. The tiny motion suggests flight above the stands.
  if(moving){const hover=Math.sin(elapsed*.62)*.14;camera.eye[1]+=hover;camera.target[1]+=hover;}
  if(moving&&surgeEnv>0){camera.eye[0]+=Math.sin(elapsed*43)*surgeEnv*(surgeBig?.06:.03);camera.eye[1]+=Math.cos(elapsed*37)*surgeEnv*.03;}
 }
 function frame(now){
  requestAnimationFrame(frame);
  if(document.hidden){lastFrame=now;return;}
  if(now-lastFrame<(mode==='static'?300:width<600?40:32))return;
  const routeDelta=(now-lastFrame)/1000,dt=Math.min(.1,routeDelta);lastFrame=now;
  if(now-lastSample>950){sample(Date.now());lastSample=now;}
  const moving=isMoving();
  if(moving){
   elapsed+=dt;routeTime+=routeDelta;
   if(sceneView==='podium')podiumTime+=routeDelta;
  }
  // The sun lowers smoothly while the arena moves and snaps when it is still. Uniforms only, no rebuild.
  if(dusk!==duskTarget){dusk=moving?(dusk<duskTarget?Math.min(duskTarget,dusk+.3*dt):Math.max(duskTarget,dusk-.3*dt)):duskTarget;dirty=true;}
  surgeEnv=surgeAt===null?0:clamp(1-(elapsed-surgeAt)/1.6);
  if(ceremony&&ceremony.at!==null){
   const age=(now-ceremony.at)/1000;
   if(age>=1.4&&ceremony.phase!=='crowned'){ceremony.phase='crowned';geometryDirty=true;ceremony.onCrown?.();}
   const hud=document.getElementById('ceremony-status');if(hud)hud.textContent=age<1.4?'FLOWERS AWAKEN':'THE PAVILION BLOOMS';
   if(age>=5){const done=ceremony.done;ceremony=null;done?.();}
   dirty=true;
  }
  if(needsLayout)layout();
  if(geometryDirty||lastBuild!==state.progress+'|'+duskTarget+'|'+bloomLevel)rebuildArena();
  if(!moving&&!transition&&!dirty)return;
  updateCamera(now,moving);
  vp=multiply(perspective(fov,width/height,.3,900),lookAt(camera.eye,camera.target));
  if(mode==='webgl')drawGL();else drawStatic();
  positionLabels();dirty=false;
 }
 function travel(nodes,nextInside){
  inside=nextInside;dirty=true;
  if(transition){const finish=transition.done;transition=null;finish();}
  const route=[{eye:camera.eye.slice(),target:camera.target.slice()},...nodes];
  if(media.matches||mode==='static'){
   const to=nodes[nodes.length-1];camera={eye:to.eye.slice(),target:to.target.slice()};return Promise.resolve();
  }
  return new Promise(done=>{transition={at:performance.now(),duration:Math.min(4200,route.length*680),nodes:route,done};});
 }
 function home(){sceneView='street';return travel([{eye:[camera.eye[0],Math.max(camera.eye[1],30),camera.eye[2]+6],target:[0,0,ARENA.cz]},baseCamera],false);}
 function cancelCeremony(){
  ceremonyGeneration++;const done=ceremony?.done;ceremony=null;
  if(transition){const finish=transition.done;transition=null;finish();}
  done?.();document.body.classList.remove('gate-ceremony');resize();geometryDirty=true;dirty=true;
  if(sceneView==='ceremony')home();
 }
 const lifted=(p,y)=>[p[0],p[1]+y,p[2]];
 window.CityWorld={
  async crownGate(key,label,onCrown){
   label=String(label||'');
   if(needsLayout)layout();
   const gate=rooms.find(r=>r.key===key);if(!gate)return;
   const generation=++ceremonyGeneration;ceremony={key,phase:'approach',at:null};
   sceneView='ceremony';document.body.classList.add('gate-ceremony');resize();
   const hud=document.getElementById('ceremony-status');if(hud)hud.textContent='RETURNING TO THE GARDEN'+(label?': '+label.toUpperCase():'');
   const {front,N,size}=gate,gx=gate.pos[0];
   await travel([{eye:[gx*.25,32,-12],target:lifted(front,6)},{eye:lifted(add(front,mul(N,18)),12),target:lifted(front,size*.8)}],false);
   if(generation!==ceremonyGeneration)return;
   await new Promise(done=>{ceremony={key,phase:'descend',at:performance.now(),camera:{eye:camera.eye.slice(),target:camera.target.slice()},onCrown,done};dirty=true;});
  },
  cancelCeremony,
  setMonuments(value){
   if(monuments){
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
   const first=!tournament.length;
   tournament=stages.map(s=>({...s}));
   // Three settled rounds produce three distinct flushes of roses.
   bloomLevel=['round1','round2','final'].filter(k=>tournament.some(t=>t.key===k&&t.status==='complete')).length/3;
   duskTarget=.08;
   if(first)dusk=duskTarget;
   geometryDirty=true;dirty=true;
  },
  setSettings(value){settings={...value};sample(Date.now());dirty=true;},
  refreshRooms(){needsLayout=true;dirty=true;},
  setPaused(value){paused=!!value;dirty=true;},
  setSuspended(value){suspended=!!value;dirty=true;},
  enterRoom(key){
   if(needsLayout)layout();
   const gate=rooms.find(r=>r.key===(key==='sitout'?'round2':key));if(!gate)return Promise.resolve();
   const {front,N}=gate,gx=gate.pos[0];
   const route=[{eye:[gx*.28,35,-12],target:lifted(front,4)},{eye:lifted(add(front,mul(N,18)),13),target:lifted(front,5)},{eye:lifted(add(front,mul(N,5)),3.8),target:lifted(sub(front,mul(N,4)),3)}];
   returnRoute=route.slice(0,2).reverse();sceneView='street';return travel(route,true);
  },
  leaveRoom(){sceneView='street';return travel([...returnRoute,baseCamera],false);},
  visit(place){
   sceneView=place;
   return travel([{eye:[18,30,ARENA.cz+30],target:[0,0,ARENA.cz]},{eye:[0,12,ARENA.cz+18],target:[0,3,ARENA.cz]}],false);
  },
  home,
  getStatus(){
   return {mode,progress:state.progress,phase:state.phase,dusk,duskTarget,bloomLevel,gardenFlowers,gardenHedges,seats,spectators,torchesLit,torchCount,rooms:rooms.length,
    gates:gates.map(g=>({key:g.key,state:gateState(g.key)})),paused,inside,sceneView,cameraEye:camera.eye.slice(),traveling:!!transition,
    ceremony:ceremony?{key:ceremony.key,phase:ceremony.phase}:null,
    debug:{staticTriangles:staticArray.length/30,dynamicTriangles,rebuilds,parts:{...partTris},ceremonyRange:ceremonyRange.slice()}};
  },
  // Read-only test hooks (deep copies); app.js never uses them.
  _debugLayout(){
   return JSON.parse(JSON.stringify({
    gates:gates.map(g=>({key:g.key,th:g.th,half:g.half,rows:g.rows,size:g.size,pos:g.pos,N:g.N,T:g.T,depthN:g.depthN,laurelAt:g.laurelAt,
     face:{keystoneTop:g.face.keystoneTop,bannerBottom:g.face.bannerBottom,bannerTop:g.face.bannerTop,bannerHalfW:g.face.bannerHalfW,bannerCenter:g.face.bannerCenter,
      bannerFrontN:g.face.bannerFrontN,blockTop:g.face.blockTop,tunnelCeiling:g.face.tunnelCeiling,archApex:g.face.openTop+g.face.archR,tunnelLen:g.face.tunnelLen,
      laurel:{c:g.laurelAt,r:g.face.laurelR,n:g.face.laurelN}}})),
    pulvinar:{th:PULV.th,half:PULV.half,base:PULV_BASE,s0:PULV_S0,s1:PULV_S1},torches:TORCHES,torchS:TORCH_S}));
  },
  _debugDynamic(){return Array.from(lastDynamic);}
 };
 window.addEventListener('resize',resize);
 if(window.ResizeObserver){const observer=new ResizeObserver(resize);observer.observe(document.body);}
 if(media.addEventListener)media.addEventListener('change',()=>{dirty=true;});
 surface.addEventListener('webglcontextlost',e=>{e.preventDefault();paused=true;});
 surface.addEventListener('webglcontextrestored',()=>{try{initGL();geometryDirty=true;paused=false;resize();}catch{location.reload();}});
 resize();requestAnimationFrame(frame);
})();
