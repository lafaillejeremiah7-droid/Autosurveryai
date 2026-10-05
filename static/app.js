'use strict';
let state,view,revision,token,tab='overview',timer,dirty=false,saving=false,editVersion=0,saveFailed=false;
const ids=Array.from({length:10},(_,i)=>`p${i+1}`);
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v===null||v===undefined?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:3});
const money=v=>v===null||v===undefined?'Unassigned':Number(v).toLocaleString('en-US',{style:'currency',currency:'USD'});
const tabs=[['overview','Overview'],['settings','Settings'],['round1','Round 1'],['round2','Round 2'],['final','The Death Valley']];
const value=path=>path.split('.').reduce((a,k)=>a[k],state);
const setValue=(path,v)=>{const a=path.split('.');const k=a.pop();a.reduce((o,p)=>o[p],state)[k]=v;};
function inp(path,label,type='number',disabled=false){return `<input data-path="${path}" aria-label="${esc(label)}" type="${type}" ${type==='number'?'min="0" max="100000" step="'+(path.startsWith('settings')?'any':'1')+'"':'maxlength="40"'} value="${esc(value(path))}" ${disabled?'disabled':''}>`;}
function select(path,choices,label,disabled=false){return `<select data-path="${path}" aria-label="${esc(label)}" ${disabled?'disabled':''}><option value="">—</option>${choices.map(v=>`<option value="${v}" ${value(path)===v?'selected':''}>${v}</option>`).join('')}</select>`;}
const badge=status=>`<span class="status ${status.startsWith('TIE')?'tie':status.toLowerCase()}">${esc(status)}</span>`;
const table=(heads,rows)=>`<div class="scroll"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const card=(label,n,sub)=>`<div class="card"><label>${label}</label><strong>${n}</strong><small>${sub}</small></div>`;
const notice=issues=>issues.length?`<div class="notice warning">${issues.map(x=>`<div>${esc(x)}</div>`).join('')}</div>`:'';
function title(eye,name,desc,pill=''){return `<div class="eyebrow">${eye}</div><div class="topline"><h1>${name}</h1>${pill?`<span class="pill">${pill}</span>`:''}</div><p>${desc}</p>`;}
function panel(name,body,right=''){return `<section class="panel"><div class="panel-head"><h2>${name}</h2>${right}</div>${body}</section>`;}
function overview(){
 const final=view.final, finished=final.complete; const next=!view.names_ok?'settings':!view.round1.complete?'round1':!view.round2.complete?'round2':'final';
 const done=[view.round1,view.round2,final].filter(r=>r.complete).length;
 let html=title('10 players. One champion.','Tournament overview','Run every round, track every player, and settle the podium.',finished?'TOURNAMENT COMPLETE':'TOURNAMENT IN PROGRESS');
 html+=`<div class="cards">${card('REGISTERED PLAYERS',Object.values(state.names).filter(v=>v.trim()).length,'10 tournament places')}${card('PRIZE POOL',money(view.pool),'Top 3 finishers')}${card('ROUNDS COMPLETE',`${done} / 3`,'Two cutting rounds + final')}${card('PRIZES ASSIGNED',money(view.awarded),'Tied prizes remain unassigned')}</div>`;
 html+=`<div class="round-path">${[['round1','01 · Natural Selection','10 players → 8 survivors'],['round2','02 · Natural Selection','8 players → 6 survivors'],['final','03 · The Death Valley','6 players → 3 prize winners']].map(([k,t,d])=>`<button data-tab="${k}" class="${next===k?'accent':''}">${t}<small>${view[k].complete?'Complete':d}</small></button>`).join('')}</div>`;
 const podium=[1,2,3].map(rank=>{const row=final.rows.find(r=>r.rank===rank&&r.status==='FINAL');return `<div class="card"><label>${['1ST PLACE','2ND PLACE','3RD PLACE'][rank-1]}</label><strong>${row?esc(row.name):'Awaiting result'}</strong><div class="money">${money(state.settings.prizes[rank-1])}</div><small>${row?fmt(row.total)+' points':'Final standings decide this prize'}</small></div>`;}).join('');
 html+=panel('The podium',`<div class="podium">${podium}</div>`);
 const rowmap=key=>Object.fromEntries(view[key].rows.map(r=>[r.id,r]));const a=rowmap('round1'),b=rowmap('round2'),c=rowmap('final');
 html+=panel('Every player',table(['PLAYER','ROUND 1','ROUND 2','FINAL RANK','TOTAL POINTS','PRIZE'],ids.map(p=>`<tr><td>${esc(state.names[p]||'Player '+(ids.indexOf(p)+1))}</td><td>${badge(a[p]?.status||'PENDING')}</td><td>${b[p]?badge(b[p].status):'—'}</td><td class="calc">${fmt(c[p]?.rank)}</td><td class="calc">${fmt(c[p]?.total)}</td><td class="calc">${c[p]?money(c[p].prize):'—'}</td></tr>`)),`<button data-action="csv">Export CSV</button>`);
 if(final.rows.length)html+=panel('Final standings',table(['RANK','PLAYER','WIN POINTS','GOAL POINTS','TOTAL','PRIZE','STATUS'],final.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${fmt(r.win_points)}</td><td class="calc">${fmt(r.goal_points)}</td><td class="calc">${fmt(r.total)}</td><td class="calc">${money(r.prize)}</td><td>${badge(r.status)}</td></tr>`)));
 return html;
}
function settings(){return title('Tournament setup','Players & rules','Enter ten unique names. Scoring settings and prizes update throughout the tournament.')+`<div class="settings-grid">${panel('The roster',`<div class="name-grid">${ids.map((p,i)=>`<label><small>PLAYER ${String(i+1).padStart(2,'0')}</small>${inp('names.'+p,'Player '+(i+1)+' name','text')}</label>`).join('')}</div>`)}<div>${panel('Final scoring',[['win_points','Points per win'],['goal_points','Points per goal'],['multiplier','Games 1–2 multiplier']].map(([k,label])=>`<div class="field"><label>${label}</label>${inp('settings.'+k,label)}</div>`).join('')+'<div class="hint">The multiplier applies to win points and goal points in games 1 and 2 only.</div>')}${panel('Prize money',[0,1,2].map((i)=>`<div class="field"><label>${['1st','2nd','3rd'][i]} place ($)</label>${inp('settings.prizes.'+i,'Prize '+(i+1))}</div>`).join('')+`<div class="notice">Total prize pool: <b>${money(view.pool)}</b></div>`)}</div></div>`+notice(view.names_ok?[]:['Names must be filled in and unique before anyone advances.'])+panel('Start over','<p>Download a backup first if you want to keep this tournament.</p><button class="danger" data-action="reset-all">Clear tournament</button>');}
function extras(key){const stage=state[key],v=view[key];if(!v.rows.length)return '';
 let html='<p class="hint">Enter extra-game scores only for tied players. Complete every player in the tied group. If a tie remains, add another extra game. Earlier results are kept; regulation averages and totals stay unchanged.</p>';
 stage.extras.forEach((extra,i)=>{html+=`<h3>Extra game ${i+1}</h3><div class="extra-grid">${v.rows.map(r=>`<label>${esc(r.name)}<span class="game-pair">${key==='final'?inp(`${key}.extras.${i}.${r.id}.goals`,`${r.name} extra ${i+1} goals`)+select(`${key}.extras.${i}.${r.id}.result`,['W','L'],`${r.name} extra ${i+1} result`):inp(`${key}.extras.${i}.${r.id}`,`${r.name} extra ${i+1} goals`)}</span></label>`).join('')}</div>`;});
 return panel('Extra games',html,`<button data-action="extra" data-stage="${key}" ${v.stale||!v.ready?'disabled':''}>+ Add extra game</button>`);
}
function round(key){const n=key==='round1'?1:2,v=view[key],size=n===1?5:4,rows=v.rows;
 let html=title('Natural Selection Edition',`Round ${n}`,n===1?'5v5 · Five games · Top four from each team advance.':'3v3 · New teams of four · Top three from each team advance.',`${n===1?'10 → 8':'8 → 6'} PLAYERS`)+notice(v.issues);
 if(v.stale)html+=`<button class="danger" data-action="reset-stage" data-stage="${key}">Reset Round 2 and Final for this roster</button>`;
 if(!rows.length)return html+panel('Waiting for survivors','<div class="empty">Finish Round 1 and resolve cut ties. The eight survivors will appear here automatically.</div>');
 html+=`<div class="games">${v.games.map(g=>`<div class="game ${g.ready?'ready':''}"><b>Game ${g.game}</b>A: ${g.counts.A}/${n===1?5:3} · B: ${g.counts.B}/${n===1?5:3}</div>`).join('')}</div>`;
 html+=panel('Player scores',table(['PLAYER','TEAM',...Array.from({length:5},(_,i)=>`G${i+1} GOALS`),'TOTAL','PLAYED','AVG / MATCH','TEAM RANK','DECISION'],rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${select(`${key}.players.${r.id}.team`,['A','B'],`${r.name} team`,v.stale)}</td>${Array.from({length:5},(_,i)=>`<td>${inp(`${key}.players.${r.id}.goals.${i}`,`${r.name} game ${i+1} goals`,'number',v.stale)}</td>`).join('')}<td class="calc">${r.goals}</td><td class="calc">${r.played}</td><td class="calc">${r.average.toFixed(3)}</td><td class="calc">${fmt(r.rank)}</td><td>${badge(r.status)}</td></tr>`)),`<small>${size} players per team</small>`);
 html+=`<div class="notice">${n===1?'All ten players play every game. Enter 0 for a game played with no goals.':'Blank = sat out. Zero = played and scored no goals. Each team needs three scores and one blank in each game. Averages restart this round.'}</div>`+extras(key);return html;
}
function finalPage(){const v=view.final;
 let html=title('The final','The Death Valley','3v3 · Five games · Everyone starts at zero.',`GAMES 1 & 2 ×${fmt(state.settings.multiplier)}`)+notice(v.issues);
 if(v.stale)html+='<button class="danger" data-action="reset-stage" data-stage="final">Reset the final for this roster</button>';
 if(!v.rows.length)return html+panel('Waiting for finalists','<div class="empty">Finish Round 2 and resolve cut ties. The six finalists will appear here automatically.</div>');
 html+=`<div class="games">${v.games.map(g=>`<div class="game ${g.ready?'ready':''}"><b>Game ${g.game}${g.game<=2?' · ×'+fmt(state.settings.multiplier):''}</b>${g.scores}/6 scores · ${g.wins} W / ${g.losses} L</div>`).join('')}</div>`;
 const rows=[...v.rows].sort((a,b)=>ids.indexOf(a.id)-ids.indexOf(b.id));
 html+=panel('Goals & results',table(['PLAYER',...Array.from({length:5},(_,i)=>`GAME ${i+1} · GOALS / W–L`)],rows.map(r=>`<tr><td>${esc(r.name)}</td>${Array.from({length:5},(_,i)=>`<td><div class="game-pair">${inp(`final.players.${r.id}.goals.${i}`,`${r.name} final game ${i+1} goals`,'number',v.stale)}${select(`final.players.${r.id}.results.${i}`,['W','L'],`${r.name} final game ${i+1} result`,v.stale)}</div></td>`).join('')}</tr>`)));
 html+=panel('Live standings',table(['RANK','PLAYER','WIN POINTS','GOAL POINTS','TOTAL POINTS','PRIZE','STATUS'],v.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${fmt(r.win_points)}</td><td class="calc">${fmt(r.goal_points)}</td><td class="calc"><b>${fmt(r.total)}</b></td><td class="calc">${money(r.prize)}</td><td>${badge(r.status)}</td></tr>`)));
 html+=panel('Points per game',table(['PLAYER','GAME 1','GAME 2','GAME 3','GAME 4','GAME 5'],rows.map(r=>`<tr><td>${esc(r.name)}</td>${r.game_points.map(p=>`<td class="calc">${fmt(p)}</td>`).join('')}</tr>`)));
 return html+extras('final');
}
function render(){
 const active=document.activeElement,path=active?.dataset.path,start=active?.selectionStart,end=active?.selectionEnd,scrolls=[...document.querySelectorAll('.scroll')].map(e=>e.scrollLeft);
 $('#nav').innerHTML=tabs.map(([k,label],i)=>`<button data-tab="${k}" class="${tab===k?'active':''}"><b>0${i+1}</b>${label}<span>${view[k]?.complete?'✓':''}</span></button>`).join('');
 $('#breadcrumb').textContent='TOURNAMENT / '+tabs.find(t=>t[0]===tab)[1].toUpperCase();
 $('#content').innerHTML=tab==='overview'?overview():tab==='settings'?settings():tab==='final'?finalPage():round(tab);
 [...document.querySelectorAll('.scroll')].forEach((e,i)=>e.scrollLeft=scrolls[i]||0);
 if(path){const el=[...document.querySelectorAll('[data-path]')].find(e=>e.dataset.path===path);if(el){el.focus({preventScroll:true});if(start!=null)try{el.setSelectionRange(start,end);}catch{}}}
}
function error(message){$('#error').hidden=!message;$('#error').textContent=message||'';}
function changed(){dirty=true;saveFailed=false;editVersion++;$('#save-status').textContent='Unsaved changes…';clearTimeout(timer);timer=setTimeout(save,250);}
async function save(){
 clearTimeout(timer);if(saving||!dirty)return;saving=true;dirty=false;const seq=editVersion;
 $('#save-status').textContent='Saving…';
 try{const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state,revision})});const data=await res.json();if(!res.ok)throw new Error(data.error);revision=data.revision;view=data.view;
  if(seq===editVersion){state=data.state;render();}error('');$('#save-status').textContent=dirty?'Unsaved changes…':'All changes saved';
 }catch(e){saveFailed=true;dirty=true;error(e.message);$('#save-status').textContent='Not saved — retry after fixing';}
 finally{saving=false;if(dirty&&!saveFailed)save();}
}
async function flush(){clearTimeout(timer);await save();while(saving)await new Promise(r=>setTimeout(r,30));if(dirty||saveFailed)throw new Error('Save your changes successfully before continuing.');}
document.addEventListener('input',e=>{const el=e.target;if(!el.dataset.path)return;if(!el.checkValidity()){error(el.validationMessage);return;}setValue(el.dataset.path,el.type==='number'?(el.value===''?null:Number(el.value)):el.value);changed();});
document.addEventListener('change',e=>{if(e.target.tagName==='SELECT'&&e.target.dataset.path){setValue(e.target.dataset.path,e.target.value);changed();}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
 if(b.dataset.tab){await flush();tab=b.dataset.tab;render();return;}
 const action=b.dataset.action,key=b.dataset.stage;
 if(action==='csv'){await flush();window.location='/api/standings.csv';}
 if(action==='extra'){state[key].extras.push(Object.fromEntries(ids.map(p=>[p,key==='final'?{goals:null,result:''}:null])));changed();await save();}
 if(action==='reset-stage'&&confirm('Clear this round’s scores and all later scores? Earlier rounds are kept.')){await flush();for(const k of key==='round2'?['round2','final']:['final']){state[k].extras=[];state[k].roster=[];for(const d of Object.values(state[k].players)){d.goals=[null,null,null,null,null];if(k==='final')d.results=['','','','',''];else d.team='';}}changed();await save();}
 if(action==='reset-all'&&confirm('Clear all players, settings, and scores? Download a backup first to keep them.')){await flush();const fresh={version:1,names:Object.fromEntries(ids.map(p=>[p,''])),settings:{win_points:1.5,goal_points:1.5,multiplier:2,prizes:[18,8,4]}};for(const k of ['round1','round2','final'])fresh[k]={roster:[],extras:[],players:Object.fromEntries(ids.map(p=>[p,k==='final'?{goals:Array(5).fill(null),results:Array(5).fill('')}:{team:'',goals:Array(5).fill(null)}]))};state=fresh;changed();await save();}
 }catch(e){error(e.message);}});
$('#backup').onclick=async()=>{try{await flush();window.location='/api/backup';}catch(e){error(e.message);}};
$('#restore').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());if(!confirm('Replace the current tournament with this backup?'))return;await flush();const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state:parsed,revision})});const data=await res.json();if(!res.ok)throw new Error(data.error);state=data.state;view=data.view;revision=data.revision;error('');render();$('#save-status').textContent='Backup restored and saved';}catch(err){error(err.message);}finally{e.target.value='';}};
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
fetch('/api/state').then(r=>r.json()).then(data=>{({state,view,revision,token}=data);render();$('#save-status').textContent='All changes saved';}).catch(e=>error('Cannot reach the Python app. '+e.message));
