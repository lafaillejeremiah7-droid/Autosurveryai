(function(root){
 'use strict';
 function model(view,state){
  const r1=view.round1,r2=view.round2,final=view.final;
  const first=!!r1.complete,second=first&&!!r2.complete;
  const towers=Object.entries(state.names).map(([id,name],i)=>{
   const cut1=first&&r1.rows.some(r=>r.id===id&&r.status==='CUT');
   const cut2=second&&r2.rows.some(r=>r.id===id&&r.status==='CUT');
   return {id,name:name||'Player '+(i+1),cut:cut1||cut2,stage:cut1?'Like Never Before':cut2?'What Do You Want?':null,status:cut1?'CUT · TO LIVE':cut2?'CUT · TO DIE':second?'FINALIST':first?'SURVIVOR':'IN PLAY'};
  });
  const eligible=second&&!final.stale,rows=eligible?final.rows:[],complete=eligible&&!!final.complete;
  const slots=[2,1,3].map(place=>{
   const group=rows.filter(r=>r.rank<=place&&place<r.rank+rows.filter(p=>p.rank===r.rank).length);
   const tied=group.length>1||group.some(r=>String(r.status).startsWith('TIE'));
   const person=!tied&&group.length===1?group[0]:null;
   return {place,tied,person:person?.id||null,names:group.map(r=>r.name),points:person?.total??(group.length&&group.every(r=>r.total===group[0].total)?group[0].total:null),prize:complete&&person?person.prize:null};
  });
  return {towers,slots,complete,eligible,hasScores:rows.some(r=>r.game_points?.some(p=>p!==null)),tie:slots.some(s=>s.tied)};
 }
 if(typeof module==='object'&&module.exports){module.exports={model};return;}
 const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
 let lastModel=null;
 const snapshots=new Map(),settlements=new Map();
 function podium(host,m){
  if(!host)return;
  const key=host.id||'screen-podium',old=snapshots.get(key)||new Map();
  const header=m.complete?'THE THREE WHO ROSE':!m.eligible?'AWAITING SIX FINALISTS':m.tie?'PROVISIONAL · TIED POSITIONS':'PROVISIONAL · LIVE POINTS';
  host.dataset.settled=String(m.complete);
  host.classList.toggle('podium-celebrate',settlements.get(key)===false&&m.complete);settlements.set(key,m.complete);
  host.innerHTML='<div class="podium-heading"><span class="eyebrow">REBIRTH / '+header+'</span><p>'+(m.complete?'Final standings · all matches and podium ties settled.':'Positions can change. Prizes lock only after the final is settled.')+'</p></div><div class="monument-podium">'+m.slots.map(s=>'<article class="podium-place place-'+s.place+(s.tied?' podium-tie':'')+'" data-place="'+s.place+'"><div class="podium-label" '+(s.person?'data-podium-player="'+esc(s.person)+'"':'')+'><small>'+s.place+(s.place===1?'ST':s.place===2?'ND':'RD')+' PLACE'+(s.tied?' · TIED':'')+'</small><strong title="'+esc(s.names.join(' · '))+'">'+esc(s.names.join(' · ')||'Awaiting finalist')+'</strong><span>'+(s.points===null?'—':num(s.points)+' PTS')+'</span><b>'+(s.prize===null?'PRIZE PENDING':'$'+num(s.prize))+'</b></div><div class="podium-block" aria-hidden="true"><i>'+s.place+'</i></div></article>').join('')+'</div>';
  const next=new Map();
  for(const e of host.querySelectorAll('[data-podium-player]')){
   const rect=e.getBoundingClientRect(),previous=old.get(e.dataset.podiumPlayer);next.set(e.dataset.podiumPlayer,rect);
   if(previous&&Math.abs(previous.x-rect.x)>2&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.body.classList.contains('world-paused'))e.animate([{transform:'translateX('+(previous.x-rect.x)+'px)',opacity:.55},{transform:'translateX(0)',opacity:1}],{duration:650,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
  snapshots.set(key,next);
 }
 root.BrawlMonuments={model,
  render(view,state){
   const m=model(view,state);
   // Avoid resetting movement on unrelated saves or the one-second countdown tick.
   if(JSON.stringify(m)!==JSON.stringify(lastModel)){podium($('#city-podium'),m);root.CityWorld?.setMonuments(m);lastModel=m;}
  },
  renderScreen(view,state){podium($('#screen-podium'),model(view,state));}
 };
})(typeof window==='object'?window:globalThis);
