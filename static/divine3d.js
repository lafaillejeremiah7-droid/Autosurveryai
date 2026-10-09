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
 // Keep the dimensional scale fixed across all three rounds. The giant hand
 // passes through a portal above the center of the ten plants, not a palm halo.
 const PORTAL_CENTER=[0,38,-21],PORTAL_RADIUS=16.2,HAND_SCALE=5.0;
 const PORTAL_LEAD=.45,EMERGENCE_SECONDS=2.65,PORTAL_PLANE=-20.3;
 const ease=t=>t*t*(3-2*t);
 const portalOpening=(step,age)=>step<0?ease(clamp(age/1.15)):1;
 const handEmergence=(step,age)=>step<0?ease(clamp((age-PORTAL_LEAD)/EMERGENCE_SECONDS)):1;
 const pseudoRand=n=>{const t=Math.sin(n*127.1+311.7)*43758.5453;return t-Math.floor(t);};
 function multiply(a,b){const c=new Float32Array(16);for(let j=0;j<4;j++)for(let i=0;i<4;i++)for(let k=0;k<4;k++)c[j*4+i]+=a[k*4+i]*b[j*4+k];return c;}
 function perspective(fov,aspect,near,far){const f=1/Math.tan(fov/2);return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);}
 function lookAt(eye,target){const z=unit(vec(eye,target)),x=unit(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);}
 function project(p,m){const q=[0,0,0,0];for(let r=0;r<4;r++)q[r]=m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r];return [(q[0]/q[3]+1)*50,(1-q[1]/q[3])*50,q[3]];}
 const vertices=[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]];
 const sides=[[0,1,2,3],[5,4,7,6],[3,2,6,7],[4,5,1,0],[1,5,6,2],[4,0,3,7]];
 class Mesh{
  constructor(){this.data=[];this.triangles=0;}
  tri(a,b,c,col,kind=0){if([a,b,c,col].some(v=>!Array.isArray(v)||v.length!==3))throw Error('Invalid 3D triangle tuple '+JSON.stringify([a,b,c,col]));const n=unit(cross(vec(b,a),vec(c,a)));for(const p of [a,b,c])this.data.push(p[0],p[1],p[2],n[0],n[1],n[2],col[0],col[1],col[2],kind);this.triangles++;}
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

 // The same geometry style as the 3D garden, rebuilt into a richly layered,
 // formal royal grounds. Structural meshes are cached: dynamic action remains
 // only the 10 living competitors, vortex, floating petals and enormous hand.
 function hedge(m,x,y,z,w,d,h=2.1){
  m.box(x,y+h/2,z,w,h,d,[.09,.23,.13]);
  m.box(x,y+h-.17,z,w+.15,.45,d+.15,[.15,.39,.20]);
  const n=Math.ceil((w>d?w:d)/2.1);
  for(let i=0;i<n;i++){
   const alongX=w>d,t=(i+.5)/n-.5,px=x+(alongX?t*w:0),pz=z+(alongX?0:t*d);
   m.gem(px,y+h+.14,pz,.31,[.23,.47,.24],0,.55);
  }
 }
 function rose(m,x,y,z,tier=3,palette=0){
  const stems=[[.91,.47,.61],[.97,.73,.53],[.81,.66,.97],[1,.89,.64]];
  const col=stems[Math.floor(Math.abs(palette))%4];
  const height=.24+.11*tier;
  m.cylinder([x,y,z],[x,y+height,z],.065,[.13,.42,.20],.043,6);
  if(tier<2){m.gem(x,y+height,z,.14,[.18,.59,.29],0,1.2);return;}
  m.gem(x,y+height,z,.19,[.99,.90,.58],2,1.0);
  for(let i=0;i<5;i++){
   const a=i*TAU/5;
   m.gem(x+Math.cos(a)*.20,y+height+.055,z+Math.sin(a)*.20,.19,col,0,.85);
  }
 }
 function lamp(m,x,z,scale=1){
  m.box(x,1.55*scale,z,.18*scale,3.1*scale,.18*scale,[.66,.64,.48]);
  m.gem(x,3.15*scale,z,.48*scale,[.96,.78,.36],2,1.2);
  m.box(x,3.64*scale,z,.77*scale,.15*scale,.77*scale,[.88,.71,.37]);
  m.gem(x,3.9*scale,z,.32*scale,[1,.93,.62],2,1.4);
 }
 function arch(m,x,z,wide=5.0){
  const stone=[.81,.78,.66],trim=[.83,.67,.37];
  m.box(x-wide/2,3.0,z,.62,6,.72,stone);
  m.box(x+wide/2,3.0,z,.62,6,.72,stone);
  m.box(x,6.1,z,wide+.8,.65,.95,stone);
  m.box(x,6.58,z,wide+.9,.24,1.04,trim);
  for(let k=0;k<8;k++){
   const a=k*Math.PI/7,r=wide*.55;
   m.gem(x-r*Math.cos(a),6+Math.sin(a)*2.0,z+.22,.40,[.17,.43,.21],0,1.3);
  }
  for(let k=0;k<5;k++)rose(m,x+(k-2)*wide/5,6.43,z+.35,3,k);
 }
 function topiary(m,x,z,height=7){
  const dark=[.10,.28,.16],light=[.23,.46,.25];
  m.cylinder([x,0,z],[x,height*.6,z],.36,[.35,.26,.16],.24,7);
  for(let j=0;j<3;j++){
   const y=height*(.43+j*.21),r=(1.6-j*.26);
   m.sphere([x,y,z],r,.85+j*.06,r,dark,0,5,9);
   m.gem(x,y+.66,z,r*.71,light,0,.54);
  }
  m.gem(x,height+.55,z,.35,[.88,.72,.37],2,1.4);
 }
 function fountain(m,x,z){
  const pale=[.84,.83,.76],blue=[.19,.55,.62],shimmer=[.57,.82,.87];
  m.cylinder([x,.05,z],[x,.50,z],3.6,pale,3.9,20);
  m.cylinder([x,.54,z],[x,.62,z],3.15,blue,3.12,20);
  m.cylinder([x,.15,z],[x,1.52,z],.61,pale,.64,12);
  m.cylinder([x,1.48,z],[x,1.70,z],1.63,pale,1.72,14);
  m.cylinder([x,1.71,z],[x,1.75,z],1.34,blue,1.34,14);
  m.gem(x,2.55,z,.49,[.96,.77,.40],2,1.45);
  for(let j=0;j<12;j++){
   const a=j*TAU/12,u=x+2.45*Math.cos(a),v=z+2.45*Math.sin(a);
   m.gem(u,.77,v,.17,shimmer,2,1.9);
  }
  for(let i=0;i<8;i++){
   const a=i*TAU/8;
   m.cylinder([x+Math.cos(a)*.85,1.72,z+Math.sin(a)*.85],
      [x+Math.cos(a)*2.55,.67,z+Math.sin(a)*2.55],.042,shimmer,.024,5,2);
  }
 }
 function gazebo(m,x,z){
  const cream=[.83,.78,.65],gold=[.90,.69,.32];
  m.cylinder([x,0,z],[x,.52,z],5.0,cream,5.0,12);
  for(let i=0;i<8;i++){
   const a=i*TAU/8,p=[x+Math.cos(a)*4.0,z+Math.sin(a)*4.0];
   m.cylinder([p[0],.52,p[1]],[p[0],6.8,p[1]],.34,cream,.34,8);
   m.gem(p[0],6.98,p[1],.5,gold,2,.45);
  }
  m.cylinder([x,7.10,z],[x,8,z],5.05,[.21,.43,.30],2.2,12);
  m.gem(x,9.4,z,2.9,gold,0,1.08);
  m.gem(x,12.5,z,.58,[1,.85,.51],2,1.7);
 }
 function createField(){
  const m=new Mesh(),grass=[.11,.29,.19],floor=[.20,.36,.24],
      stone=[.77,.72,.62],gold=[.77,.60,.31];
  m.box(0,-1.05,0,70,2.1,73,[.08,.21,.15]);
  m.box(0,.012,0,64,.06,69,grass);
  // Checker lawn, flower island borders and textured grass tile pattern.
  for(let x=-30;x<=30;x+=5)for(let z=-30;z<=30;z+=5){
   const dark=(Math.round(x+z)/5)%2===0;
   m.box(x,.057,z,4.85,.04,4.85,dark?[.14,.34,.19]:[.15,.37,.21]);
   const seed=(x+31)*571+(z+31)*43;
   for(let i=0;i<3;i++){
    const px=x+(pseudoRand(seed+i*3)-.5)*3.7,pz=z+(pseudoRand(seed+i*5+17)-.5)*3.8;
    m.gem(px,.16,pz,.085,[.24,.47,.23],0,.75);
   }
  }
  // Grand forecourt: straight stone paths with gold-inlaid rims and stepped dais.
  m.box(0,.105,-.4,35,.12,28,floor);
  for(const x of [-17.0,17.0])m.box(x,.19,-.4,.27,.17,29,gold);
  m.box(0,.20,.30,35,.20,3.45,stone);
  m.box(0,.315,.30,35,.04,.16,gold);
  for(const x of [-14.75,14.75])m.box(x,.20,-.4,1.05,.19,28,stone);
  for(let n=0;n<18;n++)m.box(-17.0+n*2,.329,.30,.035,.023,3.2,[.89,.83,.65]);
  // Wide stepped entrance leading forward toward the viewer.
  for(let k=0;k<5;k++)m.box(0,.24-k*.035,16+k*1.9,31-k*.7,.23,1.65,stone);
  // Ten identical player plinths; stage-specific vegetation grows above.
  for(let i=0;i<10;i++){
   const [x,,z]=positions[i];
   m.cylinder([x,.12,z],[x,.43,z],1.80,[.67,.61,.49],1.91,12);
   m.cylinder([x,.44,z],[x,.56,z],1.96,gold,1.96,12);
   m.cylinder([x,.57,z],[x,.70,z],1.80,stone,1.80,12);
   for(let j=0;j<6;j++){
    const a=j*TAU/6;
    m.gem(x+Math.cos(a)*1.57,.78,z+Math.sin(a)*1.57,.11,[.95,.73,.35],2,.9);
   }
  }
  // Symmetrical hedge maze walls, elevated flower beds and marble edging.
  for(const s of [-1,1]){
   hedge(m,s*21,0,-3,2.4,39,2.9);
   hedge(m,s*28,0,2,1.4,48,3.7);
   hedge(m,s*24,0,19,9,1.55,2.1);
   hedge(m,s*24,0,-22,9,1.55,2.1);
   topiary(m,s*25,-14,8.2);
   topiary(m,s*25,12,7.0);
   gazebo(m,s*32,-29);
   fountain(m,s*26,0);
   arch(m,s*22,-7,6.6);
   for(let k=0;k<32;k++){
    const z=-20+k*1.30,x=s*(22.8+(k%4)*1.11);
    rose(m,x,.1,z,3,k);
   }
   for(let k=0;k<4;k++)lamp(m,s*18,-13+k*9,.9);
  }
  hedge(m,0,0,-26,55,1.7,3.9);
  hedge(m,0,0,25,55,1.7,2.8);
  // Royal rose arch behind the competition field; gilded lamps flank the portal.
  arch(m,-15,-23,6.3);arch(m,15,-23,6.3);
  for(let x=-14;x<=14;x+=4){
   rose(m,x,.1,-18.4,4,(x+20)/4);
   rose(m,x,.1,19.4,4,(x+24)/4);
  }
  // Palace terrace background, parapets and tall stone towers.
  m.box(0,5.8,-33.8,52,11.6,3.0,[.65,.64,.56]);
  m.box(0,12.3,-34.2,54,1.1,4.0,[.30,.39,.34]);
  for(let x=-25;x<=25;x+=5){
   m.box(x,9.0,-31.8,.63,5.7,.55,[.91,.88,.75]);
   m.gem(x,13.1,-34,.59,gold,2,.9);
  }
  for(const x of [-25,25]){
   m.box(x,12,-34,4.2,24,4.1,stone);
   m.gem(x,25,-34,3.5,gold,0,1.55);
  }
  return m;
 }
 let baseField=null;
 function addLeaf(m,root,direction,y,len,width,col){
  const x=root[0],z=root[2],p=[x,y,z],
      tip=[x+len*direction,y+len*.40,z+len*.22*direction],
      side=[x+len*.38*direction,y+len*.12,z+width];
  m.tri(p,tip,side,col);m.tri(p,side,tip,col);
  const back=[side[0],side[1],z-width];
  m.tri(p,back,tip,col);m.tri(p,tip,back,col);
 }
 function bloom(m,center,scale,petals,col,royal=false){
  const [x,y,z]=center;
  m.gem(x,y,z,scale*.41,[1,.84,.40],2,1.2);
  for(let layer=0;layer<(royal?3:2);layer++){
   const ring=petals+(layer%2?2:0),r=scale*(.38+layer*.34);
   for(let j=0;j<ring;j++){
    const a=j*TAU/ring+layer*.26;
    const tone=col.map((c,i)=>clamp(c+(layer===0?.13:layer===2?-.12:0)));
    m.gem(x+Math.cos(a)*r,y+layer*.07+.08*Math.sin(a*2),z+Math.sin(a)*r,
      scale*(royal?.39:.44),tone,layer===0?2:0,.72);
   }
  }
  if(royal){
   m.ring([x,y+.18,z],scale*1.34,.055,[.94,.75,.36],'xz',2);
   for(let i=0;i<5;i++){
    const a=i*TAU/5;m.gem(x+Math.cos(a)*scale*1.26,y+.30,z+Math.sin(a)*scale*1.26,
      scale*.18,[1,.92,.52],2,1.65);
   }
  }
 }
 // One goal -> the first split leaves; by 21 goals a full royal rose canopy.
 // Each tier has a distinct 3D silhouette, branching, buds and petal count.
 function plant(m,model,index,cutIds,step,age,elapsed){
  const [x,,z]=positions[index],tier=clamp(Math.floor(Number(model.tier)||0),0,6);
  const cutIndex=cutIds.indexOf(model.id),
   prior=!!model.priorPruned||cutIndex>=0&&cutIndex<step,cutting=cutIndex===step;
  const fall=prior?1:cutting?ease(clamp((age-.76)/.78)):0;
  const sway=prior?0:Math.sin(elapsed*1.4+index*1.31)*.055;
  const height=[.48,1.18,1.98,2.78,3.65,4.63,5.58][tier]*(prior?.64:1);
  const leafColor=prior?[.25,.27,.22]:tier>3?[.23,.56,.29]:[.21,.48,.24];
  const palette=[[.96,.48,.55],[.98,.72,.41],[.77,.57,.93],[.96,.86,.61]][index%4];
  const map=p=>{
   const t=fall*1.28,dir=index%2?-1:1;
   return [x+p[0]*Math.cos(t)+p[1]*Math.sin(t)*dir+sway*p[1],
     .75+p[1]*Math.cos(t)-p[0]*Math.sin(t)*dir,z+p[2]];
  };
  m.cylinder([x,.71,z],[x,.95,z],.89,[.42,.28,.18],1.04,10);
  m.cylinder([x,.96,z],[x,1.01,z],1.05,[.68,.50,.28],1.05,10);
  m.cylinder(map([0,.05,0]),map([0,height,0]),.10+tier*.016,[.11,.40,.16],.035+tier*.011,8);
  // Growth stage 0 is a seedling, not a pre-bloomed flower.
  if(tier===0){
   for(const d of [-1,1])addLeaf(m,map([0,.18,0]),d,.2,.20,.13,[.37,.69,.30]);
   m.gem(...map([0,height,0]),.20,[.35,.63,.27],0,1.18);
   return;
  }
  for(let j=0;j<Math.min(8,2+tier);j++){
   const a=j*TAU/3,y=.35+(height-.65)*(j/(3+tier));
   const dir=j%2?1:-1;
   const p=map([0,y,0]),q=map([dir*(.38+tier*.073),y+.20,Math.sin(a)*.30]);
   m.cylinder(p,q,.062,[.16,.48,.20],.025,6);
   m.gem(...q,.28+tier*.036,leafColor,0,.31);
   if(tier>=4)addLeaf(m,p,dir,p[1]+.16,.31,.18,[.30,.58,.25]);
  }
  if(tier===1){m.gem(...map([0,height,0]),.25,[.28,.59,.24],0,1.55);return;}
  if(tier===2){
   m.gem(...map([0,height,0]),.44,prior?[.30,.28,.25]:palette,0,1.6);
   m.gem(...map([0,height+.26,0]),.19,[.31,.59,.31],0,1.2);return;
  }
  const color=prior?[.33,.30,.30]:palette;
  bloom(m,map([0,height,0]),[0,0,0,.43,.58,.67,.82][tier],
    tier===3?5:tier===4?7:tier===5?9:12,color,tier>=5);
  if(tier>=4){
   for(let k=0;k<(tier===4?2:tier===5?4:6);k++){
    const a=k*TAU/Math.max(2,tier===4?2:tier===5?4:6);
    const by=height*(.52+(k%3)*.13),reach=.45+(k%2)*.33+tier*.03;
    const p=map([0,by,0]),q=map([Math.cos(a)*reach,by+reach*.43,Math.sin(a)*reach]);
    m.cylinder(p,q,.058,[.14,.42,.18],.028,6);
    bloom(m,q,tier===6?.34:.25,5,prior?[.28,.27,.26]:palette,false);
   }
  }
  // A golden rose cage and flowering coronet is earned, never present at 0 goals.
  if(tier>=5&&!prior){
   m.ring(map([0,height*.71,0]),tier===6?1.18:.80,.065,[.86,.67,.34],'xz',2);
   if(tier===6){
    for(let k=0;k<8;k++){
     const a=k*TAU/8;
     m.cylinder(map([Math.cos(a)*1.02,height*.55,Math.sin(a)*1.02]),
        map([Math.cos(a)*1.17,height*.94,Math.sin(a)*1.17]),.06,[.83,.66,.31],.05,5,2);
     m.gem(...map([Math.cos(a)*1.17,height*.96,Math.sin(a)*1.17]),.21,[1,.88,.47],2,1.6);
    }
   }
  }
  if(cutting&&age>.75&&age<1.6){
   for(let j=0;j<12;j++){
    const a=j*TAU/12,spread=clamp((age-.75)/.8);
    m.gem(x+Math.cos(a)*spread*1.8,height+Math.sin(j)*.3,
     z+Math.sin(a)*spread*1.8,.12,[1,.86,.51],2,1.45);
   }
  }
 }
 function portal(m,step,age,elapsed){
  const opening=portalOpening(step,age);
  if(opening<.008)return;
  const [x,y,z]=PORTAL_CENTER,r=PORTAL_RADIUS*opening,SEG=60;
  const ringpoint=(a,rr,zz=0)=>[x+Math.cos(a)*rr,y+Math.sin(a)*rr,z+zz];
  const colors=[[.025,.026,.09],[.078,.031,.21],[.17,.07,.38],[.075,.15,.36],[.05,.024,.12]];
  // Dark aperture from which the hand physically emerges, backlit rings and
  // layered animated vortex ribbons.
  for(let band=0;band<5;band++){
   const r0=band*r/5,r1=(band+1)*r/5,cc=colors[band];
   for(let i=0;i<SEG;i++){
    const a=i*TAU/SEG+elapsed*(band%2?-.12:.14),b=(i+1)*TAU/SEG+elapsed*(band%2?-.12:.14);
    m.quad(ringpoint(a,r0,-.9-band*.02),ringpoint(b,r0,-.9-band*.02),
       ringpoint(b,r1,-.9-band*.02),ringpoint(a,r1,-.9-band*.02),cc);
   }
  }
  for(const [ratio,width,color] of [[1,.42,[1,.76,.26]],[.96,.20,[.96,.90,.57]],
    [1.09,.17,[.61,.76,1]],[1.24,.11,[.70,.44,.99]],[.76,.09,[.44,.73,1]]]){
   m.ring([x,y,z+.13],r*ratio,width*opening,color,'xy',2);
  }
  for(let arm=0;arm<9;arm++)for(let j=0;j<16;j++){
   const a=arm*TAU/9+elapsed*(arm%2?-.6:.5)+j*.16;
   const rr=r*(.16+j*.046),end=[x+Math.cos(a+.27)*rr*1.03,y+Math.sin(a+.27)*rr*1.03,z+.32];
   const begin=[x+Math.cos(a)*rr,y+Math.sin(a)*rr,z+.32];
   m.cylinder(begin,end,.055*opening,[.58,.42+(j%5)*.05,1],.025*opening,5,2);
  }
  for(let j=0;j<36;j++){
   const a=j*TAU/36+elapsed*(j%3?-.19:.35),rr=r*(1.05+Math.sin(j*5+elapsed*2)*.055);
   const p=ringpoint(a,rr,.5);
   m.gem(...p,.13+(j%4)*.055,[1,.78+(j%3)*.06,.33],2,1.55);
  }
  // Concentric runic stones orbit the rim at different depths.
  for(let j=0;j<20;j++){
   const a=j*TAU/20+elapsed*.06,rr=r*1.32,p=ringpoint(a,rr,-.13);
   m.box(p[0],p[1],p[2],.47*opening,.55*opening,.32*opening,[.84,.73,.48],2);
  }
 }
 function hand(m,position,elapsed,step,age){
  const [x,y,z]=position,at=(a,b,c)=>[x+a,y+b,z+c];
  const gold=[.94,.72,.35],high=[1,.90,.58],dark=[.65,.40,.17],chrome=[.69,.87,1];
  // Sculpted arm disappearing into the portal rim.
  m.cylinder(at(0,8.4,-.85),at(0,1.56,.2),1.0,[.88,.60,.26],1.4,13,7);
  m.cylinder(at(0,5.95,-.55),at(0,3.15,-.24),1.48,gold,1.35,11,7);
  for(let i=0;i<4;i++){
   const yy=2.3+i*.67;
   m.ring(at(0,yy,0),1.20+i*.06,.10,[.98,.79,.38],'xz',8);
  }
  m.sphere(at(0,.70,.30),1.77,1.73,.82,gold,7,7,13);
  m.sphere(at(0,-.57,.75),1.68,1.28,.83,high,7,7,13);
  for(let i=0;i<4;i++){
   const dx=(i-1.5)*.76,len=2.45-Math.abs(i-1.5)*.29;
   const a=at(dx,-1.18,1.14),b=at(dx*.91,-1.18-len*.54,1.46),
      c=at(dx*.74,-1.18-len,1.95);
   m.cylinder(a,b,.34,gold,.29,10,7);
   m.cylinder(b,c,.29,high,.17,10,7);
   m.sphere(c,.22,.21,.24,[1,.94,.74],7);
   m.gem(...at(dx,-1.27,1.54),.18,dark,8,.50);
  }
  m.cylinder(at(-1.42,.31,1.03),at(-2.4,-1.2,1.86),.59,gold,.42,10,7);
  m.cylinder(at(-2.4,-1.2,1.86),at(-1.49,-2.17,2.26),.43,high,.25,9,7);
  // Giant steel shears pivot between the thumb and four curled fingers.
  const pivot=at(.86,-2.75,2.3);
  const close=step>=0?Math.sin(clamp((age-.47)/.42)*Math.PI)*.88:0,spread=.58-close;
  m.blade(pivot,at(3.82,-7.13,2.56),.71,chrome);
  m.blade(pivot,at(-1.48-spread*2.1,-7.24,2.48),.76,[.88,.94,.99]);
  m.sphere(pivot,.36,.38,.30,high,8);
  m.cylinder(pivot,at(1.15,-.81,2.49),.19,[.67,.60,.54],.11,8,7);
  m.ring(at(-.15,-3.36,2.70),.83,.18,[.96,.77,.35],'xy',8);
  m.ring(at(1.84,-3.28,2.69),.84,.19,[.99,.83,.47],'xy',8);
  for(const offset of [-.55,.55]){
   m.gem(...at(offset,-.71,1.22),.25,[1,.90,.59],8,1.7);
  }
  m.gem(...at(0,3.4,.1),.48,[.97,.80,.38],8,1.5);
 }
 function sceneGeometry(models,cutIds,step,age,elapsed){
  if(!baseField)baseField=createField();
  const m=new Mesh();
  m.data=baseField.data.slice();m.triangles=baseField.triangles;
  for(let i=0;i<10;i++)if(models[i])plant(m,models[i],i,cutIds,step,age,elapsed);
  // Airborne petals draw attention to the arena but do not replace any player.
  for(let j=0;j<22;j++){
   const x=(pseudoRand(j+2)*2-1)*16.5,z=(pseudoRand(j+44)*2-1)*13;
   const y=.3+pseudoRand(j+13)*8;
   const p=[x+.6*Math.sin(elapsed*.4+j),y+(elapsed*.45+j)%7,z+.7*Math.cos(elapsed*.3+j)];
   m.gem(...p,.10,pseudoRand(j)>.5?[.97,.68,.73]:[1,.84,.49],2,.32);
  }
  portal(m,step,age,elapsed);
  // All parts behind the portal plane remain invisible to the fragment shader.
  // The forearm, palm, fingers and shears move *forward through* the vortex,
  // rather than being teleported in front of it or simply dropped from above.
  const emergence=handEmergence(step,age);
  let hx=0,hy=40.7,hz=lerp(-53,-9.3,emergence);
  if(step>=0){
   const idx=models.findIndex(p=>p.id===cutIds[step]);
   if(idx>=0){
    const p=positions[idx],t=ease(clamp(age/.74));
    hx=lerp(0,p[0],t);hy=lerp(40.7,38.6,t);hz=lerp(-9.3,p[2],t);
   }
  }
  const start=m.data.length;
  if(step>=0||age>=PORTAL_LEAD){
   hand(m,[hx,hy,hz],elapsed,step,age);
   for(let i=start;i<m.data.length;i+=10){
    m.data[i]=hx+(m.data[i]-hx)*HAND_SCALE;
    m.data[i+1]=hy+(m.data[i+1]-hy)*HAND_SCALE;
    m.data[i+2]=hz+(m.data[i+2]-hz)*HAND_SCALE;
    m.data[i+9]=m.data[i+9]===8?8:7;
   }
  }
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
  const vertex='attribute vec3 a_pos,a_normal,a_color;attribute float a_kind;uniform mat4 u_vp;varying vec3 v_normal,v_color,v_pos;varying float v_kind;void main(){v_pos=a_pos;v_normal=a_normal;v_color=a_color;v_kind=a_kind;gl_Position=u_vp*vec4(a_pos,1.);}';
  const fragment='precision mediump float;varying vec3 v_normal,v_color,v_pos;varying float v_kind;void main(){if(v_kind>6.5&&v_kind<8.5&&(v_pos.z<-20.3||v_pos.y>54.2))discard;vec3 n=normalize(v_normal);float light=max(0.,dot(n,normalize(vec3(-.5,.95,.45))));vec3 col=v_color*(.33+light*.78);if(v_kind>1.5&&v_kind<6.5)col=v_color*(1.13+light*.24);if(v_kind>6.5)col=v_color*(.67+light*.66);float haze=clamp((length(v_pos-vec3(0.,6.,0.))-38.)/125.,0.,.22);col=mix(col,vec3(.24,.30,.29),haze);gl_FragColor=vec4(col,1.);}';
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
   gl.viewport(0,0,w,h);gl.clearColor(.027,.049,.074,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
   const now=performance.now(),age=(now-instance.start)/1000,elapsed=now/1000;
   // Wider, slightly higher framing fits the enormous portal and all ten pots.
   const eye=[0,37,69],target=[0,17,-2];
   const vp=multiply(perspective(70*Math.PI/180,w/h,.1,165),lookAt(eye,target));
   const mesh=sceneGeometry(models,cuts,step,age,elapsed);
   instance.triangles=mesh.triangles;instance.floats=mesh.data.length;
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
  _debug(){return active?{running:!active.stopped,triangles:active.triangles,floats:active.floats,plants:active.models.length,step:active.step,webgl:true}:null;},
  _geometry:(models,cuts,step,age=0)=>({triangles:sceneGeometry(models,cuts,step,age,0).triangles,positions:positions.map(x=>x.slice()),
   portalOpen:portalOpening(step,age),handScale:HAND_SCALE,portalCenter:PORTAL_CENTER.slice(),
   portalRadius:PORTAL_RADIUS,portalPlane:PORTAL_PLANE,handEmergence:handEmergence(step,age),portalLead:PORTAL_LEAD,
   gardenTriangles:baseField.triangles,plantStages:7,details:['marble paths','hedge maze','fountains','gazebos','rose arches','topiary','lamps','flower beds','palace']}),
  _growthMeshes:()=>Array.from({length:7},(_,tier)=>{
   const sample=new Mesh();
   plant(sample,{id:'seed',tier,priorPruned:false},0,[],-1,0,0);
   return {tier,triangles:sample.triangles};
  })
 };
})();
