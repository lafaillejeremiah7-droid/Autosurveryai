'use strict';
let state,view,revision,token,tab='wheel',timer,dirty=false,saving=false,editVersion=0,saveFailed=false;
let finalGame=0,wheelAngle=0,spinning=false,wheelLast=null,lastMonitor=null,saveTask=null;
const ids=Array.from({length:10},(_,i)=>`p${i+1}`);
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v===null||v===undefined?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:3});
const money=v=>v===null||v===undefined?'Unassigned':Number(v).toLocaleString('en-US',{style:'currency',currency:'USD'});
const tabs=[['wheel','Name wheel'],['settings','Players & rules'],['round1','To Live'],['round2','To Die'],['final','Rebirth'],['overview','Leaderboard']];
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const value=path=>path.split('.').reduce((a,k)=>a[k],state);
const setValue=(path,v)=>{const a=path.split('.');const k=a.pop();a.reduce((o,p)=>o[p],state)[k]=v;};
function inp(path,label,type='number',disabled=false){return `<input data-path="${path}" aria-label="${esc(label)}" type="${type}" ${type==='number'?'min="0" max="100000" step="'+(path.startsWith('settings')?'any':'1')+'"':'maxlength="40"'} value="${esc(value(path))}" ${disabled?'disabled':''}>`;}
function select(path,choices,label,disabled=false){return `<select data-path="${path}" aria-label="${esc(label)}" ${disabled?'disabled':''}><option value="">—</option>${choices.map(v=>`<option value="${v}" ${value(path)===v?'selected':''}>${v}</option>`).join('')}</select>`;}
const badge=status=>`<span class="status ${status.startsWith('TIE')?'tie':status.toLowerCase()}">${esc(status)}</span>`;
const table=(heads,rows)=>`<div class="scroll"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const card=(label,n,sub)=>`<div class="card"><label>${label}</label><strong>${n}</strong><small>${sub}</small></div>`;
const notice=issues=>issues.length?`<div class="notice warning">${issues.map(x=>`<div>${esc(x)}</div>`).join('')}</div>`:'';
function title(eye,name,desc,pill=''){return `<div class="eyebrow">${eye}</div><div class="topline"><h1 id="screen-title">${name}</h1>${pill?`<span class="pill">${pill}</span>`:''}</div><p>${desc}</p>`;}
function panel(name,body,right=''){return `<section class="panel"><div class="panel-head"><h2>${name}</h2>${right}</div>${body}</section>`;}
const wheelNames=()=>state.wheel.text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
function renderRoom(){
 const registered=Object.values(state.names).filter(x=>x.trim()).length;
 $('#room-stats').innerHTML=`<div><b>${registered}<small> / 10</small></b><small>REGISTERED</small></div><div><b>${money(view.pool)}</b><small>PRIZE POOL</small></div>`;
 const config=[
 ['wheel','01 / RANDOM SELECT','NAME<br>YOUR FATE.',`${wheelNames().length} ENTRIES / NO FIXED LIMIT`,'<div class="wheel-mini"></div>'],
 ['settings','02 / CONFIGURATION','THE<br>ROSTER.',`${registered} / 10 PLAYERS READY`,`<div class="mini-meter">${ids.map((p,i)=>`<i class="${i<registered?'':'off'}"></i>`).join('')}</div>`],
 ['round1','03 / ROUND ONE','TO<br>LIVE.',`${view.round1.games.filter(g=>g.ready).length} / 5 GAMES RECORDED`,'<div class="giant">01</div>'],
 ['round2','04 / ROUND TWO','TO<br>DIE.',`${view.round2.games.filter(g=>g.ready).length} / 5 GAMES RECORDED`,'<div class="giant">02</div>'],
 ['final','05 / THE FINAL','REBIRTH.',`${view.final.games.filter(g=>g.ready).length} / 10 GAMES RECORDED`,'<div class="giant">03</div>'],
 ['overview','06 / LIVE STANDINGS','THE<br>AFTERMATH.',`${money(view.awarded)} / PRIZES ASSIGNED`,'<div class="mini-podium"><span>2</span><span>1</span><span>3</span></div>']];
 $('#monitors').innerHTML=config.map(([k,no,name,sub,art])=>`<button class="monitor monitor-${k}" data-open="${k}" aria-label="Open ${tabs.find(t=>t[0]===k)[1]} monitor"><div class="monitor-face"><div class="screen-ticker"><span>BH / ${no}</span><span>● LIVE</span></div><div class="preview">${art}<h2>${name}</h2><p>${sub}</p></div><div class="screen-bottom"><span>${view[k]?.complete?'TRANSMISSION COMPLETE':'CLICK TO ENTER'}</span><span>↗</span></div></div><span class="bezel-label">BRAWL SYSTEMS / ${no.slice(0,2)}</span></button>`).join('');
}
function overview(){
 const final=view.final, finished=final.complete; const next=!view.names_ok?'settings':!view.round1.complete?'round1':!view.round2.complete?'round2':'final';
 const done=[view.round1,view.round2,final].filter(r=>r.complete).length;
 let html=title('MONITOR 06 / LIVE FEED','Leaderboard','Run every round, track every player, and settle the podium.',finished?'TOURNAMENT COMPLETE':'TOURNAMENT IN PROGRESS');
 html+=`<div class="cards">${card('REGISTERED PLAYERS',Object.values(state.names).filter(v=>v.trim()).length,'10 tournament places')}${card('PRIZE POOL',money(view.pool),'Top 3 finishers')}${card('ROUNDS COMPLETE',`${done} / 3`,'Two cutting rounds + final')}${card('PRIZES ASSIGNED',money(view.awarded),'Tied prizes remain unassigned')}</div>`;
 html+=`<div class="round-path">${[['round1','01 · To Live','10 players → 8 survivors'],['round2','02 · To Die','8 players → 6 survivors'],['final','03 · Rebirth','6 players → 3 prize winners']].map(([k,t,d])=>`<button data-tab="${k}" class="${next===k?'accent':''}">${t}<small>${view[k].complete?'Complete':d}</small></button>`).join('')}</div>`;
 const podium=[1,2,3].map(rank=>{const row=final.rows.find(r=>r.rank===rank&&r.status==='FINAL');return `<div class="card"><label>${['1ST PLACE','2ND PLACE','3RD PLACE'][rank-1]}</label><strong>${row?esc(row.name):'Awaiting result'}</strong><div class="money">${money(state.settings.prizes[rank-1])}</div><small>${row?fmt(row.total)+' points':'Final standings decide this prize'}</small></div>`;}).join('');
 html+=panel('The podium',`<div class="podium">${podium}</div>`);
 const rowmap=key=>Object.fromEntries(view[key].rows.map(r=>[r.id,r]));const a=rowmap('round1'),b=rowmap('round2'),c=rowmap('final');
 html+=panel('Every player',table(['PLAYER','TO LIVE','TO DIE','FINAL RANK','TOTAL POINTS','PRIZE'],ids.map(p=>`<tr><td>${esc(state.names[p]||'Player '+(ids.indexOf(p)+1))}</td><td>${badge(a[p]?.status||'PENDING')}</td><td>${b[p]?badge(b[p].status):'—'}</td><td class="calc">${fmt(c[p]?.rank)}</td><td class="calc">${fmt(c[p]?.total)}</td><td class="calc">${c[p]?money(c[p].prize):'—'}</td></tr>`)),`<button data-action="csv">Export CSV</button>`);
 if(final.rows.length)html+=panel('Final standings',table(['RANK','PLAYER','WIN POINTS','GOAL POINTS','TOTAL','PRIZE','STATUS'],final.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${fmt(r.win_points)}</td><td class="calc">${fmt(r.goal_points)}</td><td class="calc">${fmt(r.total)}</td><td class="calc">${money(r.prize)}</td><td>${badge(r.status)}</td></tr>`)));
 return html;
}
function settings(){return title('MONITOR 02 / CONFIGURATION','Players & rules','Enter ten unique names. Scoring settings and prizes update throughout the tournament.')+`<div class="settings-grid">${panel('The roster',`<div class="name-grid">${ids.map((p,i)=>`<label><small>PLAYER ${String(i+1).padStart(2,'0')}</small>${inp('names.'+p,'Player '+(i+1)+' name','text')}</label>`).join('')}</div>`)}<div>${panel('Final scoring',[['win_points','Points per win'],['goal_points','Points per goal'],['multiplier','Games 1–2 multiplier']].map(([k,label])=>`<div class="field"><label>${label}</label>${inp('settings.'+k,label)}</div>`).join('')+'<div class="hint">The multiplier applies to win points and goal points in games 1 and 2 only.</div>')}${panel('Prize money',[0,1,2].map((i)=>`<div class="field"><label>${['1st','2nd','3rd'][i]} place ($)</label>${inp('settings.prizes.'+i,'Prize '+(i+1))}</div>`).join('')+`<div class="notice">Total prize pool: <b>${money(view.pool)}</b></div>`)}</div></div>`+notice(view.names_ok?[]:['Names must be filled in and unique before anyone advances.'])+panel('Start over','<p>Download a backup first if you want to keep this tournament.</p><button class="danger" data-action="reset-all">Clear tournament</button>');}
function extras(key){const stage=state[key],v=view[key];if(!v.rows.length)return '';
 let html='<p class="hint">Enter extra-game scores only for tied players. Complete every player in the tied group. If a tie remains, add another extra game. Earlier results are kept; regulation averages and totals stay unchanged.</p>';
 stage.extras.forEach((extra,i)=>{html+=`<h3>Extra game ${i+1}</h3><div class="extra-grid">${v.rows.map(r=>`<label>${esc(r.name)}<span class="game-pair">${key==='final'?inp(`${key}.extras.${i}.${r.id}.goals`,`${r.name} extra ${i+1} goals`)+select(`${key}.extras.${i}.${r.id}.result`,['W','L'],`${r.name} extra ${i+1} result`):inp(`${key}.extras.${i}.${r.id}`,`${r.name} extra ${i+1} goals`)}</span></label>`).join('')}</div>`;});
 return panel('Extra games',html,`<button data-action="extra" data-stage="${key}" ${v.stale||!v.ready?'disabled':''}>+ Add extra game</button>`);
}
function round(key){const n=key==='round1'?1:2,v=view[key],size=n===1?5:4,rows=v.rows;
 let html=title(`ROUND 0${n}`,n===1?'To Live':'To Die',n===1?'5v5 · Five games · Top four from each team advance.':'3v3 · New teams of four · Top three from each team advance.',`${n===1?'10 → 8':'8 → 6'} PLAYERS`)+notice(v.issues);
 if(v.stale)html+=`<button class="danger" data-action="reset-stage" data-stage="${key}">Reset To Die and Rebirth for this roster</button>`;
 if(!rows.length)return html+panel('Waiting for survivors','<div class="empty">Finish To Live and resolve cut ties. The eight survivors will appear here automatically.</div>');
 html+=`<div class="games">${v.games.map(g=>`<div class="game ${g.ready?'ready':''}"><b>Game ${g.game}</b>A: ${g.counts.A}/${n===1?5:3} · B: ${g.counts.B}/${n===1?5:3}</div>`).join('')}</div>`;
 html+=panel('Player scores',table(['PLAYER','TEAM',...Array.from({length:5},(_,i)=>`G${i+1} GOALS`),'TOTAL','PLAYED','AVG / MATCH','TEAM RANK','DECISION'],rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${select(`${key}.players.${r.id}.team`,['A','B'],`${r.name} team`,v.stale)}</td>${Array.from({length:5},(_,i)=>`<td>${inp(`${key}.players.${r.id}.goals.${i}`,`${r.name} game ${i+1} goals`,'number',v.stale)}</td>`).join('')}<td class="calc">${r.goals}</td><td class="calc">${r.played}</td><td class="calc">${r.average.toFixed(3)}</td><td class="calc">${fmt(r.rank)}</td><td>${badge(r.status)}</td></tr>`)),`<small>${size} players per team</small>`);
 html+=`<div class="notice">${n===1?'All ten players play every game. Enter 0 for a game played with no goals.':'Blank = sat out. Zero = played and scored no goals. Each team needs three scores and one blank in each game. Averages restart this round.'}</div>`+extras(key);return html;
}
function counter(path,label,disabled=false){return `<div class="counter"><button data-step="-1" data-target="${path}" aria-label="Subtract one goal for ${esc(label)}" ${disabled?'disabled':''}>−</button>${inp(path,label+' goals','number',disabled)}<button data-step="1" data-target="${path}" aria-label="Add one goal for ${esc(label)}" ${disabled?'disabled':''}>+</button></div>`;}
function finalPage(){const v=view.final,g=finalGame;
 let html=title('ROUND 03 / THE FINAL','Rebirth','Six finalists. Ten rotations. Every goal and win counts.',`GAMES 1 & 2 ×${fmt(state.settings.multiplier)}`)+notice(v.issues);
 if(v.stale)html+='<button class="danger" data-action="reset-stage" data-stage="final">Reset Rebirth for this roster</button>';
 if(!v.rows.length)return html+panel('Waiting for finalists','<div class="empty">Finish To Die and resolve cut ties. Your six finalists will appear automatically.</div>');
 html+=`<div class="score-help">GOAL = ${fmt(state.settings.goal_points)} PTS / WIN = ${fmt(state.settings.win_points)} PTS · Games 1–2 ×${fmt(state.settings.multiplier)} · Games 3–10 ×1</div>`;
 html+=`<div class="match-tabs" aria-label="Final match selector">${v.games.map((m,i)=>`<button data-game="${i}" aria-pressed="${i===g}" class="${i===g?'active':''} ${m.ready?'ready':''}">G${i+1}${i<2?' ×'+fmt(state.settings.multiplier):''}</button>`).join('')}</div>`;
 const schedule=v.schedule[g],rowmap=Object.fromEntries(v.rows.map(r=>[r.id,r]));
 html+=`<div class="match-topline"><div><h2>Game ${g+1} <span class="stage-title-number">/ 10</span></h2><p>Enter each player’s goals, then mark the winning team.</p></div><button class="danger clear-score" data-action="clear-game" ${v.stale?'disabled':''}>Clear this game</button></div><div class="teams-grid">`;
 for(const team of ['A','B']){
  const won=schedule[team].every(p=>state.final.players[p].results[g]==='W'),lost=schedule[team].every(p=>state.final.players[p].results[g]==='L');
  html+=`<section class="team-score team-${team.toLowerCase()}"><div class="team-head"><div><small>GAME ${g+1}</small><h2>Team ${team}</h2></div><button data-winner="${team}" aria-pressed="${won}" class="${won?'accent':''}" ${v.stale?'disabled':''}>${won?'✓ WIN RECORDED':lost?'LOSS RECORDED':'Mark win +1'}</button></div>${schedule[team].map(p=>`<div class="player-score"><div class="player-name">${esc(state.names[p])}<small>${fmt(rowmap[p].game_points[g])} POINTS THIS GAME</small></div>${counter(`final.players.${p}.goals.${g}`,`${state.names[p]} game ${g+1}`,v.stale)}</div>`).join('')}</section>`;
 }
 html+='</div><p class="hint">Marking the winner adds one win to each teammate and records a loss for each opponent. Enter 0 for a played game with no goals. Win and goal points calculate as you enter either value. Played counts complete goal/result pairs; prizes wait for all ten games.</p>';
 html+=panel('Live standings',table(['RANK','PLAYER','GOALS','WINS','PLAYED','WIN PTS','GOAL PTS','TOTAL PTS','PRIZE','STATUS'],v.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${r.goals}</td><td class="calc">${r.wins}</td><td class="calc">${r.played}</td><td class="calc">${fmt(r.win_points)}</td><td class="calc">${fmt(r.goal_points)}</td><td class="calc"><b>${fmt(r.total)}</b></td><td class="calc">${money(r.prize)}</td><td>${badge(r.status)}</td></tr>`)));
 html+=`<details><summary>View all ten team rotations</summary><p class="hint">Every pair are teammates four times and opponents six times. Slots and match order stay fixed. Double games still carry extra weight.</p>${table(['GAME','TEAM A','TEAM B','STATUS'],v.schedule.map(m=>`<tr><td>${m.game}${m.game<=2?' ×'+fmt(state.settings.multiplier):''}</td><td>${m.A.map(p=>esc(state.names[p])).join(' · ')}</td><td>${m.B.map(p=>esc(state.names[p])).join(' · ')}</td><td>${v.games[m.game-1].ready?'✓ COMPLETE':'PENDING'}</td></tr>`))}</details>`;
 html+=`<details><summary>View points per game</summary>${table(['PLAYER',...Array.from({length:10},(_,i)=>`G${i+1}`)],v.rows.map(r=>`<tr><td>${esc(r.name)}</td>${r.game_points.map(p=>`<td class="calc">${fmt(p)}</td>`).join('')}</tr>`))}</details>`;
 return html+extras('final');
}
function wheelPage(){const names=wheelNames();
 return title('MONITOR 01 / RANDOM SELECT','Name your fate.','Add, change, or delete names below. Every line is one entry. This wheel has no fixed player limit.',`${names.length} ENTRIES`)+`<div class="wheel-layout"><section class="wheel-stage"><div class="wheel-wrap"><canvas id="wheel-canvas" width="880" height="880" aria-label="Name selection wheel"></canvas><button class="wheel-hub" data-action="spin" ${spinning||!names.length?'disabled':''}>${spinning?'…':'SPIN'}</button></div><div class="wheel-actions"><button class="accent" data-action="spin" ${spinning||!names.length?'disabled':''}>${spinning?'DRAWING…':'SPIN THE WHEEL ↗'}</button></div><div id="wheel-result" class="wheel-result ${spinning?'is-spinning':''}" role="status" aria-live="polite"><small>${spinning?'THE WHEEL IS TURNING':wheelLast?'SELECTED ENTRY':'AWAITING YOUR DRAW'}</small><strong>${spinning?'WHO WILL IT BE?':wheelLast?esc(wheelLast.name):names.length?'Your next name awaits.':'Add names to begin.'}</strong>${wheelLast&&!spinning?'<div class="toolbar"><button data-action="remove-winner" '+(wheelLast.removed?'disabled':'')+'>'+(wheelLast.removed?'Removed from wheel':'Remove this entry')+'</button><button data-action="roster-winner">Add to tournament roster</button></div>':''}</div><p class="draw-help">The wheel and tournament roster are separate. You can add a drawn player to an empty tournament slot.</p></section><section class="entry-editor"><div class="panel-head"><h2>The entry list</h2><span id="entry-count" class="count">${names.length} NAMES</span></div><label for="wheel-entries" class="hint">One name per line. Type or paste a list. Delete a line to remove an entry. Repeated names receive extra entries.</label><textarea id="wheel-entries" data-path="wheel.text" spellcheck="false" placeholder="Type a name, then press Enter…" ${spinning?'disabled':''}>${esc(state.wheel.text)}</textarea><div class="toolbar"><button data-action="wheel-roster" ${spinning?'disabled':''}>Use tournament names</button><button data-action="wheel-shuffle" ${spinning||names.length<2?'disabled':''}>Shuffle</button><button class="danger" data-action="wheel-clear" ${spinning||!names.length?'disabled':''}>Clear list</button></div><label class="field hint"><span>Remove each winner automatically</span><input type="checkbox" data-check="wheel.remove_winner" ${state.wheel.remove_winner?'checked':''} ${spinning?'disabled':''}></label><p class="hint">Names save automatically and are included in your tournament backup. Large lists remain selectable even when labels are too small to display.</p></section></div>`;
}
function randomIndex(n){
 if(!Number.isSafeInteger(n)||n<1||n>4294967296)throw new Error('Invalid entry count.');
 const limit=4294967296-(4294967296%n),a=new Uint32Array(1);do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%n;
}
function drawWheel(names=wheelNames(),angle=wheelAngle){
 const canvas=$('#wheel-canvas');if(!canvas)return;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const size=canvas.width,c=size/2,r=c-12,palette=['#d73076','#eadcbb','#672e50','#ada5b5','#ed84b3','#3c334d'];
 ctx.clearRect(0,0,size,size);ctx.save();ctx.translate(c,c);ctx.rotate(angle);const n=names.length||1;
 // All entries keep equal odds; bound the number of visible slices for huge lists.
 const slices=Math.min(n,360),step=Math.PI*2/slices;
 for(let i=0;i<slices;i++){
  ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,r,i*step,(i+1)*step);ctx.closePath();ctx.fillStyle=names.length?palette[i%palette.length]:'#332937';ctx.fill();
  if(n<=60){ctx.save();ctx.rotate((i+.5)*step);ctx.textAlign='right';ctx.textBaseline='middle';ctx.fillStyle=i%palette.length===1||i%palette.length===3||i%palette.length===4?'#271c2d':'#fff6fa';ctx.font=`bold ${n>24?15:n>12?19:25}px Arial`;let label=names[i]||'ADD YOUR NAMES';while(ctx.measureText(label).width>r*.66&&label.length>2)label=label.slice(0,-2);if(label!==(names[i]||'ADD YOUR NAMES'))label+='…';ctx.fillText(label,r-27,0);ctx.restore();}
 }
 ctx.beginPath();ctx.arc(0,0,r,0,2*Math.PI);ctx.strokeStyle='#806076';ctx.lineWidth=8;ctx.stroke();ctx.restore();
 if(n>60){ctx.fillStyle='#18111bc9';ctx.beginPath();ctx.arc(c,c,r*.63,0,2*Math.PI);ctx.fill();ctx.fillStyle='#ffe7f1';ctx.textAlign='center';ctx.font='bold 28px Arial';ctx.fillText(`${n.toLocaleString()} entries`,c,c-120);}
}
async function spinWheel(){
 if(spinning)return;await flush();const names=wheelNames();if(!names.length)return;
 const index=randomIndex(names.length);spinning=true;wheelLast=null;render();
 const step=2*Math.PI/names.length;
 const target=((-(index+.5)*step)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
 const start=wheelAngle,end=start+2*Math.PI*6+((target-start%(2*Math.PI)+2*Math.PI)%(2*Math.PI));
 const duration=reducedMotion()?0:4300;const started=performance.now();
 await new Promise(resolve=>{function frame(now){const t=duration?Math.min(1,(now-started)/duration):1;wheelAngle=start+(end-start)*(1-Math.pow(1-t,4));drawWheel(names,wheelAngle);if(t<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
 wheelAngle=target;wheelLast={name:names[index],index,removed:false};spinning=false;
 if(state.wheel.remove_winner){names.splice(index,1);state.wheel.text=names.join('\n');wheelLast.removed=true;changed();}
 render();
}
function render(){
 if(!state)return;renderRoom();
 if(!$('#screen-dialog').open)return;
 const active=document.activeElement,path=active?.dataset.path,start=active?.selectionStart,end=active?.selectionEnd;
 const scrollTop=$('#screen-scroll').scrollTop,scrolls=[...document.querySelectorAll('.scroll')].map(e=>e.scrollLeft),textScroll=active?.scrollTop;
 const openDetails=[...document.querySelectorAll('#content details')].map(d=>d.open);
 $('#nav').innerHTML=tabs.map(([k,label],i)=>`<button data-tab="${k}" class="${tab===k?'active':''}" aria-current="${tab===k?'page':'false'}"><b>0${i+1}</b>${label}<span>${view[k]?.complete?'✓':''}</span></button>`).join('');
 $('#breadcrumb').textContent=`BH / MONITOR 0${tabs.findIndex(t=>t[0]===tab)+1} / ${tabs.find(t=>t[0]===tab)[1].toUpperCase()}`;
 $('#content').innerHTML=(state.legacy_final?'<div class="notice">Your old five-game final is archived in the downloadable backup. The ten-game rotation final starts fresh. Earlier rounds are preserved.</div>':'')+(tab==='overview'?overview():tab==='settings'?settings():tab==='final'?finalPage():tab==='wheel'?wheelPage():round(tab));
 [...document.querySelectorAll('.scroll')].forEach((e,i)=>e.scrollLeft=scrolls[i]||0);
 [...document.querySelectorAll('#content details')].forEach((e,i)=>e.open=openDetails[i]||false);
 $('#screen-scroll').scrollTop=scrollTop;
 if(tab==='wheel')drawWheel();
 if(path){const el=[...document.querySelectorAll('[data-path]')].find(e=>e.dataset.path===path);if(el){el.focus({preventScroll:true});if(start!=null)try{el.setSelectionRange(start,end);el.scrollTop=textScroll||0;}catch{}}}
}
async function openScreen(key,source){
 if(!state)return;if(spinning)return;await flush();tab=key;
 const dialog=$('#screen-dialog'),already=dialog.open;
 if(!already){lastMonitor=key;dialog.showModal();}render();$('#screen-scroll').scrollTop=0;
 if(!already&&source&&!reducedMotion()){
  const from=source.getBoundingClientRect(),to=dialog.getBoundingClientRect();
  dialog.animate([{transform:`translate(${from.left+from.width/2-to.left-to.width/2}px,${from.top+from.height/2-to.top-to.height/2}px) scale(${from.width/to.width},${from.height/to.height})`,opacity:.4},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:430,easing:'cubic-bezier(.2,.7,.2,1)'});
 }
 $('#close-screen').focus({preventScroll:true});
}
async function closeScreen(){
 if(spinning){error('Wait for the wheel to finish its draw.');return;}
 await flush();const dialog=$('#screen-dialog'),target=document.querySelector(`[data-open="${lastMonitor}"]`);
 if(target&&!reducedMotion()){
  const from=dialog.getBoundingClientRect(),to=target.getBoundingClientRect();
  await dialog.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${to.left+to.width/2-from.left-from.width/2}px,${to.top+to.height/2-from.top-from.height/2}px) scale(${to.width/from.width},${to.height/from.height})`,opacity:0}],{duration:280,easing:'ease-in'}).finished;
 }
 dialog.close();target?.focus({preventScroll:true});
}
function error(message){$('#error').hidden=!message;$('#error').textContent=message||'';
 // Native dialogs are in the top layer: put errors inside while one is open.
 const parent=$('#screen-dialog').open?$('.screen-shell'):document.body;if($('#error').parentElement!==parent)parent.appendChild($('#error'));
}
function changed(){dirty=true;saveFailed=false;editVersion++;$('#save-status').textContent='Unsaved changes…';clearTimeout(timer);timer=setTimeout(save,250);}
async function save(){
 clearTimeout(timer);if(saving)return saveTask;if(!dirty)return;
 saving=true;dirty=false;const seq=editVersion;$('#save-status').textContent='Saving…';
 saveTask=(async()=>{
  try{const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state,revision})});const data=await res.json();if(!res.ok)throw new Error(data.error);revision=data.revision;view=data.view;
   if(seq===editVersion){state=data.state;render();}error('');$('#save-status').textContent=dirty?'Unsaved changes…':'All changes saved';$('#retry-save').hidden=true;
  }catch(e){saveFailed=true;dirty=true;error(e.message);$('#save-status').textContent='Not saved';$('#retry-save').hidden=false;}
  finally{saving=false;}
 })();await saveTask;if(dirty&&!saveFailed)return save();
}
async function flush(){clearTimeout(timer);if(saving)await saveTask;await save();if(dirty||saveFailed)throw new Error('Save your changes successfully before continuing.');}
function resetStage(key){for(const k of key==='round2'?['round2','final']:[key]){state[k].extras=[];state[k].roster=[];for(const d of Object.values(state[k].players)){d.goals=Array(k==='final'?10:5).fill(null);if(k==='final')d.results=Array(10).fill('');else d.team='';}}}
function markWinner(team,game=finalGame){const match=view.final.schedule[game];if(!match||view.final.stale)return;for(const t of ['A','B'])for(const p of match[t])state.final.players[p].results[game]=t===team?'W':'L';}
function resetWheelResult(){wheelLast=null;wheelAngle=0;}
document.addEventListener('input',e=>{const el=e.target;if(!el.dataset.path||el.tagName==='SELECT')return;if(!el.checkValidity()){error(el.validationMessage);return;}setValue(el.dataset.path,el.type==='number'?(el.value===''?null:Number(el.value)):el.value);if(el.dataset.path==='wheel.text')resetWheelResult();changed();});
document.addEventListener('change',e=>{const el=e.target;if(el.tagName==='SELECT'&&el.dataset.path){setValue(el.dataset.path,el.value);changed();}if(el.dataset.check){setValue(el.dataset.check,el.checked);changed();}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.disabled)return;try{
 if(b.dataset.open){await openScreen(b.dataset.open,b);return;}
 if(b.dataset.tab){await openScreen(b.dataset.tab);return;}
 if(b.dataset.game!==undefined){await flush();finalGame=Number(b.dataset.game);render();return;}
 if(b.dataset.step){const current=value(b.dataset.target);setValue(b.dataset.target,Math.max(0,Math.min(100000,(current??0)+Number(b.dataset.step))));changed();await save();return;}
 if(b.dataset.winner){markWinner(b.dataset.winner);changed();await save();return;}
 const action=b.dataset.action,key=b.dataset.stage;
 if(action==='csv'){await flush();window.location='/api/standings.csv';}
 if(action==='extra'){state[key].extras.push(Object.fromEntries(ids.map(p=>[p,key==='final'?{goals:null,result:''}:null])));changed();await save();}
 if(action==='clear-game'&&confirm('Clear goals and results for this game only?')){await flush();for(const p of view.final.schedule[finalGame].A.concat(view.final.schedule[finalGame].B)){state.final.players[p].goals[finalGame]=null;state.final.players[p].results[finalGame]='';}changed();await save();}
 if(action==='reset-stage'&&confirm('Clear this round’s scores and all later scores? Earlier rounds are kept.')){await flush();resetStage(key);changed();await save();}
 if(action==='reset-all'&&confirm('Clear the tournament and wheel? Download a backup first to keep them.')){await flush();state={version:2,wheel:{text:'',remove_winner:false},names:Object.fromEntries(ids.map(p=>[p,''])),settings:{win_points:1,goal_points:1.5,multiplier:2,prizes:[18,8,4]}};for(const k of ['round1','round2','final'])state[k]={roster:[],extras:[],players:Object.fromEntries(ids.map(p=>[p,k==='final'?{goals:Array(10).fill(null),results:Array(10).fill('')}:{team:'',goals:Array(5).fill(null)}]))};resetWheelResult();changed();await save();}
 if(action==='spin')await spinWheel();
 if(action==='wheel-clear'&&!spinning&&confirm('Remove every name from the wheel? Tournament players stay unchanged.')){state.wheel.text='';resetWheelResult();changed();await save();}
 if(action==='wheel-roster'&&!spinning){if(state.wheel.text.trim()&&!confirm('Replace the wheel list with the current tournament names?'))return;state.wheel.text=Object.values(state.names).filter(n=>n.trim()).join('\n');resetWheelResult();changed();await save();}
 if(action==='wheel-shuffle'&&!spinning){const names=wheelNames();for(let i=names.length-1;i>0;i--){const j=randomIndex(i+1);[names[i],names[j]]=[names[j],names[i]];}state.wheel.text=names.join('\n');resetWheelResult();changed();await save();}
 if(action==='remove-winner'&&wheelLast&&!wheelLast.removed){const names=wheelNames();names.splice(wheelLast.index,1);state.wheel.text=names.join('\n');wheelLast.removed=true;wheelAngle=0;changed();await save();}
 if(action==='roster-winner'&&wheelLast){const name=wheelLast.name;if(name.length>40)throw new Error('Tournament names must be 40 characters or fewer. Shorten this wheel entry first.');if(Object.values(state.names).some(n=>n.trim().toLowerCase()===name.toLowerCase()))throw new Error('That name is already on the tournament roster.');const p=ids.find(p=>!state.names[p].trim());if(!p)throw new Error('All ten tournament slots are filled. Change the roster in Players & rules.');state.names[p]=name;changed();await save();}
 }catch(err){error(err.message);}});
$('#close-screen').onclick=()=>closeScreen().catch(e=>error(e.message));
$('#screen-dialog').addEventListener('cancel',e=>{e.preventDefault();closeScreen().catch(err=>error(err.message));});
$('#home-link').onclick=e=>{e.preventDefault();if($('#screen-dialog').open)closeScreen().catch(err=>error(err.message));};
$('#retry-save').onclick=()=>save();
$('#backup').onclick=async()=>{try{await flush();window.location='/api/backup';}catch(e){error(e.message);}};
$('#restore').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(spinning)throw new Error('Wait for the current draw to finish.');const parsed=JSON.parse(await file.text());if(!confirm('Replace the current tournament and wheel with this backup?'))return;await flush();const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state:parsed,revision})});const data=await res.json();if(!res.ok)throw new Error(data.error);state=data.state;view=data.view;revision=data.revision;resetWheelResult();error('');render();$('#save-status').textContent='Backup restored and saved';}catch(err){error(err.message);}finally{e.target.value='';}};
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
function clock(){$('#room-clock').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});}clock();setInterval(clock,30000);
fetch('/api/state').then(r=>r.json()).then(data=>{({state,view,revision,token}=data);render();$('#save-status').textContent='All changes saved';}).catch(e=>error('Cannot reach the Python app. '+e.message));
