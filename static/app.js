'use strict';
let state,view,revision,token,tab='settings',timer,dirty=false,saving=false,editVersion=0,saveFailed=false;
let sitoutBusy=false,sitoutAnimating=false;
let finalGame=0,round2Game=0,round1Game=0,wheelAngle=0,spinning=false,lastMonitor=null,saveTask=null;
let resultStage=null,resultMatch=null,resultFinal=false;
const ids=Array.from({length:10},(_,i)=>`p${i+1}`);
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v===null||v===undefined?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:3});
const playedLabel=(n,regulation)=>n>regulation?`${regulation} + ${n-regulation} EXTRA`:`${n}/${regulation}`;
const money=v=>v===null||v===undefined?'Unassigned':Number(v).toLocaleString('en-US',{style:'currency',currency:'USD'});
const tabs=[['settings','Players & rules'],['round1','Like Never Before'],['round2','What Do You Want?'],['final','You Wanted to Win, Right?'],['overview','Leaderboard']];
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const value=path=>path.split('.').reduce((a,k)=>a[k],state);
const setValue=(path,v)=>{const a=path.split('.');const k=a.pop();a.reduce((o,p)=>o[p],state)[k]=v;};
function gameTeams(key,g){return key==='round1'?state.round1.lineups[g]:view[key]?.schedule?.[g];}
function teamGoals(key,g,teams=gameTeams(key,g)){return Object.fromEntries(['A','B'].map(t=>[t,(teams?.[t]||[]).reduce((sum,p)=>sum+(state[key].players[p].goals[g]||0),0)]));}
function goalRule(path){
 const m=path.match(/^(round1|round2|final)\.players\.(p\d+)\.goals\.(\d+)$/);
 if(!m)return /^(round1|round2|final)\.extras\./.test(path)&&!path.endsWith('.result')?{max:3,message:'A player can score at most 3 goals in an extra game.'}:null;
 const [,key,p,index]=m,g=Number(index),teams=gameTeams(key,g),team=['A','B'].find(t=>teams?.[t].includes(p));
 if(!team)return {max:3,message:'A player can score at most 3 goals per match.'};
 const totals=teamGoals(key,g,teams),other=team==='A'?'B':'A',limit=totals[other]>=3?2:3;
 const max=Math.max(0,limit-(totals[team]-(value(path)||0)));
 return {max,message:totals[other]>=3?`Team ${other} already has 3 goals. Team ${team} is limited to 2 total; this player can have at most ${max}.`:`Team ${team} can score at most 3 goals combined; this player can have at most ${max}.`};
}
function enterGoal(path,n){
 const rule=goalRule(path),old=value(path);
 if(rule&&n!==null&&n>rule.max&&!(old!==null&&old>rule.max&&n<=old)){error(rule.message);return false;}
 setValue(path,n);return true;
}
function refreshGoalControls(){
 for(const el of document.querySelectorAll('input[data-path]')){const rule=goalRule(el.dataset.path);if(rule)el.max=Math.max(rule.max,value(el.dataset.path)||0);}
 for(const b of document.querySelectorAll('button[data-step]')){const rule=goalRule(b.dataset.target);if(!rule)continue;const key=b.dataset.target.split('.')[0],n=value(b.dataset.target)||0;b.disabled=!!view[key].stale||sitoutBusy||spinning||(Number(b.dataset.step)>0?n>=rule.max:n<=0);}
 for(const el of document.querySelectorAll('[data-score-stage]')){const totals=teamGoals(el.dataset.scoreStage,Number(el.dataset.scoreGame));el.textContent=`Team A ${totals.A} : ${totals.B} Team B`;}
}
function matchScoreboard(key,g){const totals=teamGoals(key,g);return `<div class="notice match-score"><strong data-score-stage="${key}" data-score-game="${g}">Team A ${totals.A} : ${totals.B} Team B</strong><span>3 goals maximum per team. Once one team has 3, the other can have at most 2.</span></div>`;}
function inp(path,label,type='number',disabled=false){const rule=type==='number'?goalRule(path):null;const max=rule?Math.max(rule.max,value(path)||0):100000;return `<input data-path="${path}" aria-label="${esc(label)}" type="${type}" ${type==='number'?'min="0" max="'+max+'" step="'+(path.startsWith('settings')?'any':'1')+'"':'maxlength="40"'} value="${esc(value(path))}" ${disabled?'disabled':''}>`;}
function select(path,choices,label,disabled=false){return `<select data-path="${path}" aria-label="${esc(label)}" ${disabled?'disabled':''}><option value="">—</option>${choices.map(v=>`<option value="${v}" ${value(path)===v?'selected':''}>${v}</option>`).join('')}</select>`;}
const badge=status=>`<span class="status ${status.startsWith('TIE')?'tie':status.toLowerCase()}">${esc(status)}</span>`;
const table=(heads,rows)=>`<div class="scroll"><table><thead><tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const card=(label,n,sub)=>`<div class="card"><label>${label}</label><strong>${n}</strong><small>${sub}</small></div>`;
const notice=issues=>issues.length?`<div class="notice warning">${issues.map(x=>`<div>${esc(x)}</div>`).join('')}</div>`:'';
function title(eye,name,desc,pill=''){return `<div class="eyebrow">${eye}</div><div class="topline"><h1 id="screen-title">${name}</h1>${pill?`<span class="pill">${pill}</span>`:''}</div><p>${desc}</p>`;}
function panel(name,body,right=''){return `<section class="panel"><div class="panel-head"><h2>${name}</h2>${right}</div>${body}</section>`;}
// A visible, always-available 'Clear this round' .danger panel. The copy states the
// exact downstream cascade (round1 clears all three, round2 clears round2+final,
// final clears only final). Clearing routes through doDestructive so it is undoable.
const clearRoundBlurb={round1:'Clears Like Never Before and every later round (What Do You Want? and You Wanted to Win, Right?). Earlier rounds do not exist for Like Never Before, so nothing before it is touched.',round2:'Clears What Do You Want? and You Wanted to Win, Right?. Like Never Before and its results are kept.',final:'Clears You Wanted to Win, Right? only. Like Never Before and What Do You Want? are kept.'};
function clearRoundPanel(key){return panel('Clear this round','<p class="hint">'+clearRoundBlurb[key]+' You can Undo this straight afterwards.</p><button class="danger" data-action="clear-round" data-stage="'+key+'">'+clearRoundCopy[key]+'</button>');}
function roomLock(key){
 if(key==='round1')return view.names_ok?'':'Enter ten unique player names in Players & rules.';
 if(key==='round2'||key==='sitout')return !view.names_ok?'Enter ten unique player names first.':view.round1.complete?'':'Finish Like Never Before and resolve its cut ties.';
 if(key==='final')return !view.names_ok?'Enter ten unique player names first.':!view.round1.complete?'Finish Like Never Before and resolve its cut ties.':view.round2.complete?'':'Finish What Do You Want? and resolve its cut ties.';
 return '';
}
function lockAttrs(key){const reason=roomLock(key);return reason?' disabled aria-disabled="true" title="'+esc(reason)+'"':'';}
function survivalStages(){
 const setup={key:'settings',label:'Players & rules',status:view.names_ok?'complete':'current',detail:view.names_ok?'Roster ready · rules editable':'Enter ten unique names'};
 return [setup,...[['round1','Like Never Before'],['round2','What Do You Want?'],['final','You Wanted to Win, Right?']].map(([key,label])=>{
  const v=view[key],reason=roomLock(key),status=reason?'sealed':v.complete?'complete':'current';
  const cut=v.rows.filter(r=>r.status==='CUT').map(r=>r.name);
  const detail=reason||(status==='complete'?(key==='final'?'Podium settled':cut.length?'Cut: '+cut.join(' · '):'Qualification settled'):v.ready?'Resolve extra-game ties':v.games.filter(g=>g.ready).length+' / '+v.games.length+' matches');
  return {key,label,status,detail};
 })];
}
function renderRoom(){
 const registered=Object.values(state.names).filter(x=>x.trim()).length;
 $('#room-stats').innerHTML='<div><b>'+registered+'<small> / 10</small></b><small>REGISTERED</small></div><div><b>'+money(view.pool)+'</b><small>PRIZE POOL</small></div>';
 const rooms=[
  ['settings','01','Players & rules',registered+' / 10 PLAYERS READY'],
  ['round1','02','Like Never Before',view.round1.games.filter(g=>g.ready).length+' / 5 MATCHES'],
  ['round2','03','What Do You Want?',view.round2.games.filter(g=>g.ready).length+' / 8 MATCHES'],
  ['final','04','You Wanted to Win, Right?',view.final.games.filter(g=>g.ready).length+' / 8 MATCHES'],
  ['overview','05','Leaderboard',money(view.awarded)+' AWARDED']
 ];
 const stages=survivalStages(),stageMap=Object.fromEntries(stages.map(s=>[s.key,s]));
 const route=$('#survival-route');
 if(route)route.innerHTML=stages.map((s,i)=>'<button data-open="'+s.key+'" class="route-stop '+s.status+'" '+lockAttrs(s.key)+' '+(s.status==='current'?'aria-current="step"':'')+'><small>0'+(i+1)+' / '+s.status.toUpperCase()+'</small><strong>'+s.label+'</strong><span>'+esc(s.detail)+'</span></button>').join('');
 window.CityWorld?.setTournament?.(stages);
 $('#monitors').innerHTML=rooms.map(([key,no,label,sub])=>'<button class="city-room '+(stageMap[key]?.status||'')+'" data-open="'+key+'" '+lockAttrs(key)+' aria-label="Enter '+label+' room"><span class="room-entry">'+(roomLock(key)?'LOCKED':'ENTER ROOM ↗')+'</span><span class="room-label"><small>ROOM '+no+' / '+(stageMap[key]?.status.toUpperCase()||'OPEN')+'</small><strong>'+label+'</strong><span>'+esc(roomLock(key)||sub)+'</span></span></button>').join('');
 window.BrawlMonuments?.render(view,state);
 window.CityWorld?.refreshRooms();
 window.CityWorld?.setSettings(state.settings);
 updateCountdown();
}
// (a) A prominent, friendly 'what to do next' callout driven by the existing `next`
// computation and the current stage's first unmet issue, with a button that opens the
// relevant screen (reusing data-tab so the normal dispatcher handles it).
function nextStepBanner(next,finished){
 if(finished)return `<div class="notice next-step done"><div><div class="eyebrow">WHAT TO DO NEXT</div><strong>Tournament complete. Review the podium below.</strong></div></div>`;
 const tieIn=key=>view[key].rows.some(r=>r.status&&r.status.startsWith('TIE'));
 let msg,label,target=next;
 if(next==='settings'){msg='Start here: enter 10 unique player names.';label='Open Players & rules';}
 else if(next==='round1'){msg=tieIn('round1')?'Resolve the Like Never Before tie (add extra games) before What Do You Want?.':(view.round1.issues[0]||'Score the five Like Never Before games, then submit.');label='Open Like Never Before';}
 else if(next==='round2'){msg=view.round2.issues[0]||'Draw sit-outs and play the eight What Do You Want? matches.';label='Open What Do You Want?';}
 else{msg=view.final.issues[0]||'Play the eight You Wanted to Win, Right? games to decide the podium.';label='Open You Wanted to Win, Right?';}
 return `<div class="notice next-step"><div><div class="eyebrow">WHAT TO DO NEXT</div><strong>${esc(msg)}</strong></div><button class="accent" data-tab="${target}">${label} ↗</button></div>`;
}
function overview(){
 const final=view.final, finished=final.complete; const next=!view.names_ok?'settings':!view.round1.complete?'round1':!view.round2.complete?'round2':'final';
 const done=[view.round1,view.round2,final].filter(r=>r.complete).length;
 let html=title('ROOM 05 / LIVE FEED','Leaderboard','Run every round, track every player, and settle the podium.',finished?'TOURNAMENT COMPLETE':'TOURNAMENT IN PROGRESS');
 html+=nextStepBanner(next,finished);
 html+=`<div class="cards">${card('REGISTERED PLAYERS',Object.values(state.names).filter(v=>v.trim()).length,'10 tournament places')}${card('PRIZE POOL',money(view.pool),'Top 3 finishers')}${card('ROUNDS COMPLETE',`${done} / 3`,'Two cutting rounds + final')}${card('PRIZES ASSIGNED',money(view.awarded),'Tied prizes remain unassigned')}</div>`;
 html+=`<div class="round-path">${[['round1','01 · Like Never Before','10 players → 8 survivors'],['round2','02 · What Do You Want?','8 players → 6 survivors'],['final','03 · You Wanted to Win, Right?','6 players → 3 prize winners']].map(([k,t,d])=>`<button data-tab="${k}" ${lockAttrs(k)} class="${next===k?'accent':''}">${t}<small>${view[k].complete?'Complete':d}</small></button>`).join('')}</div>`;
 html+='<section id="screen-podium" aria-label="Live final podium"></section>';
 const rowmap=key=>Object.fromEntries(view[key].rows.map(r=>[r.id,r]));const a=rowmap('round1'),b=rowmap('round2'),c=rowmap('final');
 html+=panel('Every player',table(['PLAYER','LIKE NEVER BEFORE','WHAT DO YOU WANT?','FINAL RANK','TOTAL POINTS','PRIZE'],ids.map(p=>`<tr><td>${esc(state.names[p]||'Player '+(ids.indexOf(p)+1))}</td><td>${badge(a[p]?.status||'PENDING')}</td><td>${b[p]?badge(b[p].status):'—'}</td><td class="calc">${fmt(c[p]?.rank)}</td><td class="calc">${fmt(c[p]?.total)}</td><td class="calc">${c[p]?money(c[p].prize):'—'}</td></tr>`)),`<button data-action="csv">Export CSV</button>`);
 if(final.rows.length)html+=panel('Final standings',table(['RANK','PLAYER','WIN POINTS','GOAL POINTS','TOTAL','PRIZE','STATUS'],final.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${fmt(r.win_points)}</td><td class="calc">${fmt(r.goal_points)}</td><td class="calc">${fmt(r.total)}</td><td class="calc">${money(r.prize)}</td><td>${badge(r.status)}</td></tr>`)));
 return html;
}
function playerSettings(){return title('ROOM 01 / CONFIGURATION','Players & rules','Enter ten unique names. Scoring settings and prizes update throughout the tournament.')+`<div class="settings-grid">${panel('The roster',`<div class="name-grid">${ids.map((p,i)=>`<label><small>PLAYER ${String(i+1).padStart(2,'0')}</small>${inp('names.'+p,'Player '+(i+1)+' name','text')}</label>`).join('')}</div><p class="hint">Clearing the names blanks all ten slots only. Scoring, prizes, and every round score stay as they are. You can Undo this straight afterwards.</p><button class="danger" data-action="clear-names">Clear player names</button>`)}<div>${panel('Final scoring',[['win_points','Points per win'],['goal_points','Points per goal'],['multiplier','Games 1–2 multiplier']].map(([k,label])=>`<div class="field"><label>${label}</label>${inp('settings.'+k,label)}</div>`).join('')+'<div class="hint">The multiplier applies to win points and goal points in games 1 and 2 only.</div><p class="hint">Clearing scoring resets win points to 1, goal points to 1.5, and the games 1-2 multiplier to 2. Names, prizes, and round scores are untouched. You can Undo this straight afterwards.</p><button class="danger" data-action="clear-scoring">Clear scoring</button>')}${panel('Prize money',[0,1,2].map((i)=>`<div class="field"><label>${['1st','2nd','3rd'][i]} place ($)</label>${inp('settings.prizes.'+i,'Prize '+(i+1))}</div>`).join('')+`<div class="notice">Total prize pool: <b>${money(view.pool)}</b></div>`)}</div></div>`+notice(view.names_ok?[]:['Names must be filled in and unique before anyone advances.'])+panel('Start over','<p>Download a backup first if you want to keep this tournament.</p><button class="danger" data-action="reset-all">Clear tournament</button>');}

let countdownDraft=null,roomTransition=false;
function localStartValue(iso){
 if(!iso)return '';
 const d=new Date(iso);if(!Number.isFinite(d.getTime()))return '';
 const pad=n=>String(n).padStart(2,'0');
 return String(d.getFullYear()).padStart(4,'0')+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());
}
function countdownSettings(){
 const current=countdownDraft===null?localStartValue(state.settings.start_at):countdownDraft;
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;
 return '<section class="panel settings-countdown"><div class="panel-head"><h2>Doomsday countdown</h2></div><form id="countdown-form"><label for="starts-at">Tournament starts · '+esc(zone)+'<input id="starts-at" data-path="settings.start_at" type="datetime-local" required min="1970-01-01T00:00" max="9999-12-31T23:59" step="60" value="'+esc(current)+'" aria-describedby="start-help"></label><button type="submit" class="accent">Save countdown</button><button type="button" class="danger" data-action="clear-start" '+(!state.settings.start_at?'disabled':'')+'>Clear countdown</button></form><p id="start-help">A changed start time begins a clean city. Small changes build throughout the countdown, reaching full destruction at zero. Refreshing preserves the damage. Pause world stops motion, not the timer.</p></section>';
}
function settings(){
 const html=playerSettings(),at=html.indexOf('<div class="settings-grid">');
 return html.slice(0,at)+countdownSettings()+html.slice(at);
}
async function saveStartTime(){
 const input=$('#starts-at');
 if(!input||!input.reportValidity())return;
 const iso=new Date(input.value);
 if(!Number.isFinite(iso.getTime())||localStartValue(iso.toISOString())!==input.value){error('Choose a valid date and time in your local timezone.');return;}
 await flush();
 state.settings.start_at=iso.toISOString();countdownDraft=null;
 changed();await save();updateCountdown();
}
document.addEventListener('submit',e=>{
 if(e.target.id!=='countdown-form')return;e.preventDefault();
 saveStartTime().catch(err=>error(err.message));
});

function extras(key){const stage=state[key],v=view[key];if(!v.rows.length)return '';
 let html='<p class="hint">Enter extra-game scores only for tied players. Their totals and averages include these games, but places stay tied until everyone in the group has a score (and W/L in You Wanted to Win, Right?). If a tie remains, add another game for that remaining group. Already settled places stay fixed. Remove deletes one extra game; Clear all removes every extra game in this round. Either action can be undone.</p>';
 stage.extras.forEach((extra,i)=>{html+=`<div class="extra-head"><h3>Extra game ${i+1}</h3><button class="danger" data-action="remove-extra" data-stage="${key}" data-index="${i}">Remove</button></div><div class="extra-grid">${v.rows.map(r=>`<label>${esc(r.name)}<span class="game-pair">${key==='final'?inp(`${key}.extras.${i}.${r.id}.goals`,`${r.name} extra ${i+1} goals`)+select(`${key}.extras.${i}.${r.id}.result`,['W','L'],`${r.name} extra ${i+1} result`):inp(`${key}.extras.${i}.${r.id}`,`${r.name} extra ${i+1} goals`)}</span></label>`).join('')}</div>`;});
 const actions=`<button data-action="extra" data-stage="${key}" ${v.stale||!v.ready?'disabled':''}>+ Add extra game</button>${stage.extras.length?`<button class="danger" data-action="clear-extras" data-stage="${key}">Clear all extra games</button>`:''}`;
 return panel('Extra games',html,actions);
}
// Per-match submit + popup/fullscreen. Submitting a non-final match shows cumulative
// round standings THROUGH that match (computed client-side); submitting the last match
// shows the fullscreen total round ranking with ADVANCE/CUT/TIE and the add-extra flow.
const stageMeta={round1:{count:5,label:'Like Never Before'},round2:{count:8,label:'What Do You Want?'},final:{count:8,label:'You Wanted to Win, Right?'}};
function provisionalRanks(rows,compare){
 rows.sort((a,b)=>compare(a,b)||a.name.localeCompare(b.name));
 let rank=1;
 return rows.map((r,i)=>{if(i&&compare(rows[i-1],r)!==0)rank=i+1;return {rank,name:r.name,total:r.total,average:r.average,status:r.played?'PLAYED':'PENDING'};});
}
// Cumulative standings through match index n (0-based) for a stage, computed from the
// per-game data already in state so no server round-trip is needed. round1/round2 use
// goals + average over games 0..n; the final sums per-game points via view game_points.
function cumulativeStandings(key,n){
 const v=view[key];
 if(key==='final'){
  const rows=v.rows.map(r=>{
   let total=0,played=0;
   for(let g=0;g<=n;g++){const pts=r.game_points[g],d=state.final.players[r.id];if(pts!==null&&pts!==undefined)total+=pts;if(d.goals[g]!==null&&d.results[g])played++;}
   return {id:r.id,name:r.name,total,average:played?total/played:0,played};
  });
  return provisionalRanks(rows,(a,b)=>b.total-a.total);
 }
 // Like Never Before has no sit-out schedule; every player plays every game. Derive an
 // {A,B,sit:[]} shape from the per-game cosmetic lineups so the popup grouping
 // matches, falling back to all-of-A when a game's split is not yet generated.
 const schedule=v.schedule||v.games.map(m=>({A:(m.teams&&m.teams.A.length?m.teams.A.concat(m.teams.B):ids),B:[],sit:[]}));
 const rows=v.rows.map(r=>{
  const d=state[key].players[r.id];let total=0,played=0;
  for(let g=0;g<=n;g++){
   if(schedule[g]&&schedule[g].sit&&schedule[g].sit.includes(r.id))continue;
   const val=d.goals[g];if(val!==null&&val!==undefined){total+=val;played++;}
  }
  return {id:r.id,name:r.name,total,average:played?total/played:0,played};
 });
 return provisionalRanks(rows,(a,b)=>b.total*(a.played||1)-a.total*(b.played||1));
}
// The accent 'Submit Match N of X' panel for Like Never Before and You Wanted to Win, Right? (mirrors What Do You Want?'s
// .match-completion look). Disabled until that match's view games[match].ready is true
// and the stage is not stale. Client-side: validates readiness then opens the popup.
function matchSubmit(key,match){
 const v=view[key],meta=stageMeta[key],last=match===meta.count-1;
 const ready=v.games[match]&&v.games[match].ready,allReady=v.games.every(g=>g.ready);
 const sub=last?(allReady?'Submit the final match to see the full round ranking and resolve any ties.':'Finish every match, then submit to see the round ranking.'):'Submit to see the cumulative round standings so far.';
 const disabled=v.stale||!ready||(last&&!allReady);
 // Explain WHY the submit is disabled, adjacent to the control (no silent no-op).
 const reason=v.stale?(v.issues[0]||'This round is out of sync with the roster. Clear it first.'):!ready?`Enter a score for every player in Game ${match+1} first.`:(last&&!allReady)?'Finish every match before submitting the final round ranking.':'';
 const btn=`<button class="accent" data-action="submit-match" data-stage="${key}" data-match="${match}" ${disabled?`disabled title="${esc(reason)}" aria-disabled="true"`:''}>${last?`Submit Match ${match+1} of ${meta.count} — show round ranking`:`Submit Match ${match+1} of ${meta.count}`}</button>`;
 return `<div class="panel match-completion"><div><h2>Match ${match+1} of ${meta.count}</h2><p>${sub}</p>${disabled&&reason?`<p class="hint reason">${esc(reason)}</p>`:''}</div>${btn}</div>`;
}
function resultPopup(key,match){
 const meta=stageMeta[key],rows=cumulativeStandings(key,match);
 const avgHead=key==='final'?'AVG PTS':'AVG / MATCH';
 const body=table(['RANK','PLAYER',key==='final'?'TOTAL PTS':'TOTAL GOALS',avgHead,'STATUS'],rows.map(r=>`<tr><td class="calc">${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${fmt(r.total)}</td><td class="calc">${fmt(r.average)}</td><td>${badge(r.status)}</td></tr>`));
 return `<header class="result-head"><div><div class="eyebrow">${meta.label.toUpperCase()} / CUMULATIVE</div><h1 id="result-title">Match ${match+1} of ${meta.count} standings</h1><p>Cumulative round standings through match ${match+1}. Provisional only — the full round ranking appears after the last match.</p></div><button class="result-close" data-action="close-result">Close ✕</button></header>${panel('Standings so far',body)}`;
}
function resultFullscreen(key){
 const v=view[key],meta=stageMeta[key];
 const tied=v.rows.some(r=>r.status&&r.status.startsWith('TIE'));
 const avgHead=key==='final'?'AVG PTS / GAME':'AVG / MATCH';
 const rowsSorted=[...v.rows].sort((a,b)=>(a.rank||99)-(b.rank||99));
 // round1/round2 rows carry an 'average' (goals per match). Final rows carry no
 // 'average', so derive average points per game from total points / games played
 // rather than falling back to the total (which would print the total twice).
 const avgOf=r=>key==='final'?(r.played?r.total/r.played:0):(r.average!==undefined?r.average:0);
 const body=table(['RANK','PLAYER',key==='final'?'TOTAL PTS':'TOTAL GOALS',avgHead,'STATUS'],rowsSorted.map(r=>`<tr><td class="calc">${fmt(r.rank)}</td><td>${esc(r.name)}</td><td class="calc">${fmt(r.total??r.goals)}</td><td class="calc">${fmt(avgOf(r))}</td><td>${badge(r.status)}</td></tr>`));
 const boundary=key==='final'?'podium':'cut line';
 let html=`<header class="result-head"><div><div class="eyebrow">${meta.label.toUpperCase()} / FINAL RANKING</div><h1 id="result-title">${meta.label} — total round ranking</h1><p>${!v.ready?'This round is incomplete. Finish the missing scores or resolve the roster change.':tied?`A tie affects the ${boundary}. Complete extra games before this round can close.`:`Round complete. No ties affect the ${boundary}.`}</p></div><button class="result-close" data-action="close-result">Close ✕</button></header>`;
 html+=`<div class="result-banner ${v.complete?'done':'tie'}">${v.complete?'✓ ROUND SETTLED — no extra games needed.':tied?'⚠ EXTRA GAMES NEEDED — resolve the tied players below.':'ROUND INCOMPLETE — '+v.issues.map(esc).join(' ')}</div>`;
 html+=panel('Total round ranking',body);
 if(tied||state[key].extras.length)html+=extras(key);
 return html;
}
function captureInputFocus(root){
 const active=document.activeElement,path=active?.dataset.path;if(!path)return null;
 const matches=[...document.querySelectorAll(`${root} [data-path]`)].filter(e=>e.dataset.path===path),index=matches.indexOf(active);
 return index<0?null:{path,index,start:active.selectionStart,end:active.selectionEnd,scrollTop:active.scrollTop};
}
function restoreInputFocus(root,focus){
 if(!focus)return;
 const el=[...document.querySelectorAll(`${root} [data-path]`)].filter(e=>e.dataset.path===focus.path)[focus.index];
 if(!el)return;el.focus({preventScroll:true});
 if(focus.start!=null)try{el.setSelectionRange(focus.start,focus.end);}catch{}
 el.scrollTop=focus.scrollTop||0;
}
function renderResult(){
 const dialog=$('#result-dialog');if(!dialog.open)return;
 if(roomLock(resultStage)){closeResult();return;}
 renderSaveControls();
 const scrollTop=$('#result-content').scrollTop||0;
 const openDetails=[...document.querySelectorAll('#result-content details')].map(d=>d.open);
 const focus=captureInputFocus('#result-content');
 $('#result-content').innerHTML=resultFinal?resultFullscreen(resultStage):resultPopup(resultStage,resultMatch);
 [...document.querySelectorAll('#result-content details')].forEach((e,i)=>e.open=openDetails[i]||false);
 $('#result-content').scrollTop=scrollTop;
 restoreInputFocus('#result-content',focus);
}
async function openMatchResult(key,match){
 if(cutsceneActive)return;
 const locked=roomLock(key);if(locked){error(locked);return;}
 const v=view[key],meta=stageMeta[key];
 if(v.stale||!v.games[match]||!v.games[match].ready){error(v.stale?'Clear this round first — its player roster changed.':`Finish entering match ${match+1} scores and results first.`);return;}
 resultStage=key;resultMatch=match;resultFinal=(match===meta.count-1)&&v.games.every(g=>g.ready);
 // FEAT-003: at the end-of-round moment, if the round is SETTLED (no unresolved tie) and
 // there are players to eliminate, play the tower-strike cutscene BEFORE the standings.
 // An unresolved tie (v.complete false) falls through to the normal extra-game fullscreen.
 if(resultFinal&&v.complete){
  const names=eliminatedNames(key);
  if(names.length)await playCutscene(names,meta.label,key);
 }
 const dialog=$('#result-dialog');
 dialog.classList.toggle('fullscreen',resultFinal);
 if(!dialog.open)dialog.showModal();
 renderResult();
 if(!reducedMotion())dialog.animate([{opacity:0,transform:'scale(.97)'},{opacity:1,transform:'scale(1)'}],{duration:resultFinal?360:220,easing:'cubic-bezier(.2,.7,.2,1)'});
 const first=$('#result-content').querySelector('.result-close');first?.focus({preventScroll:true});
}
function closeResult(){
 const dialog=$('#result-dialog');resultStage=null;resultFinal=false;dialog.classList.remove('fullscreen');dialog.close();
 renderSaveControls();
}
function round(key){
 if(key==='round2')return round2Page();
 const v=view.round1;
 let html=title('ROUND 01','Like Never Before','Five games with fresh random 5v5 teams. Each team can score at most 3 goals per match. The top eight individual scorers advance.','10 → 8 PLAYERS')+notice(v.issues);
 html+=`<div class="games">${v.games.map(g=>`<div class="game ${g.ready?'ready':''}"><b>Game ${g.game}</b>A: ${g.counts.A}/5 · B: ${g.counts.B}/5</div>`).join('')}</div>`;
 round1Game=Math.min(round1Game,4);
 html+=matchScoreboard('round1',round1Game);
 const g=round1Game,match=v.games[g].teams,rowmap=Object.fromEntries(v.rows.map(r=>[r.id,r]));
 html+=`<div class="match-tabs" aria-label="Like Never Before match selector">${v.games.map((m,i)=>`<button data-r1-game="${i}" aria-pressed="${i===round1Game}" class="${i===round1Game?'active':''} ${m.ready?'ready':''}">G${i+1}</button>`).join('')}</div>`;
 const scored=v.games[g].counts.A+v.games[g].counts.B>0;
 const rerollOff=sitoutBusy||spinning||scored;
 const rerollWhy=scored?'This game already has scores. Clear them before reshuffling.':spinning?'Wait for the wheel to finish.':sitoutBusy?'Wait for the current draw to finish.':'';
 html+=`<div class="match-topline"><div><h2>Game ${g+1} <span class="stage-title-number">/ 5</span></h2><p>Fresh random teams for this game. Enter each player’s goals, including 0 for a game played with no goals.</p>${rerollOff&&rerollWhy?`<p class="hint reason">${esc(rerollWhy)}</p>`:''}</div><div class="match-topline-actions"><button class="danger" data-action="r1-reroll" data-match="${g}" ${rerollOff?`disabled title="${esc(rerollWhy)}" aria-disabled="true"`:''}>Reshuffle teams</button><button class="danger clear-score" data-action="clear-r1-game">Clear this game</button></div></div><div class="teams-grid">`;
 for(const team of ['A','B'])html+=`<section class="team-score team-${team.toLowerCase()}"><div class="team-head"><div><small>GAME ${g+1} / RANDOM SPLIT</small><h2>Team ${team}</h2></div></div>${match[team].map(p=>`<div class="player-score"><div class="player-name">${esc(rowmap[p].name)}<small>${fmt(rowmap[p].average)} GOALS / MATCH · ${playedLabel(rowmap[p].played,5)} PLAYED</small></div>${counter(`round1.players.${p}.goals.${g}`,`${rowmap[p].name} game ${g+1}`,v.stale)}</div>`).join('')}</section>`;
 html+='</div><p class="hint">Teams are reshuffled per game and share a 3-goal allowance. Individual totals decide advancement. Reshuffling is locked once a game has any score. All ten players play every game.</p>';
 html+=matchSubmit('round1',round1Game);
 html+=panel('Player scores',table(['PLAYER',...Array.from({length:5},(_,i)=>`G${i+1} GOALS`),'TOTAL','PLAYED','AVG / MATCH','RANK','DECISION'],v.rows.map(r=>`<tr><td>${esc(r.name)}</td>${Array.from({length:5},(_,i)=>`<td>${inp(`round1.players.${r.id}.goals.${i}`,`${r.name} game ${i+1} goals`)}</td>`).join('')}<td class="calc">${r.goals}</td><td class="calc">${r.played}</td><td class="calc">${r.average.toFixed(3)}</td><td class="calc">${fmt(r.rank)}</td><td>${badge(r.status)}</td></tr>`)),`<small>Top 8 of 10 advance</small>`);
 return html+extras('round1')+clearRoundPanel('round1');
}
function round2Page(){
 const v=view.round2;round2Game=Math.min(round2Game,Math.max(0,v.draw.revealed-1));const g=round2Game;
 let html=title('ROUND 02','What Do You Want?','Eight rotating 3v3 games. Everyone plays six and sits out two. The top six overall advance.','8 → 6 PLAYERS')+notice(v.issues);
 if(v.stale)return html+notice(['This roster changed since What Do You Want? was scored. Clearing What Do You Want? and You Wanted to Win, Right? re-syncs them to the current survivors.'])+clearRoundPanel('round2');
 if(!v.rows.length)return html+panel('Waiting for survivors','<div class="empty">Finish Like Never Before and resolve cut ties. The eight survivors will appear automatically.</div>')+clearRoundPanel('round2');
 if(!v.draw.order.length)return html+panel('Draw the first sit-outs',`<p>The dashboard randomly assigns the eight survivors to a balanced rotation. Everyone sits twice and plays six times.</p><button class="accent" data-action="r2-start" ${v.stale||sitoutBusy?'disabled':''}>Draw Match 1 sit-outs ↗</button>${v.stale||sitoutBusy?'<p class="hint">'+(v.stale?'Clear What Do You Want? first — the roster changed since this draw.':'Wait for the current draw to finish.')+'</p>':''}`)+clearRoundPanel('round2');
 html+=`<div class="score-help">AVERAGE = THIS ROUND’S GOALS / MATCHES PLAYED · Six matches each · Wins give no points</div>`;
 html+=`<div class="match-tabs" aria-label="Round 2 match selector">${v.games.map((m,i)=>{const off=i>=v.draw.revealed||sitoutBusy;const why=i>=v.draw.revealed?`Finish Match ${v.draw.completed+1} before opening Match ${i+1}.`:'Wait for the current draw to finish.';return `<button data-r2-game="${i}" ${off?`disabled title="${esc(why)}" aria-disabled="true"`:''} aria-pressed="${i===g}" class="${i===g?'active':''} ${m.ready?'ready':''}">G${i+1}</button>`;}).join('')}</div>`;
 const match=v.schedule[g],rowmap=Object.fromEntries(v.rows.map(r=>[r.id,r]));
 html+=matchScoreboard('round2',g);
 const r2ClearOff=v.stale||sitoutBusy,r2ClearWhy=v.stale?'Clear What Do You Want? first — the roster changed since this draw.':'Wait for the current draw to finish.';
 html+=`<div class="match-topline"><div><h2>Game ${g+1} <span class="stage-title-number">/ 8</span></h2><p>Use the scheduled teams. Enter six goal scores, including zeros.</p>${r2ClearOff?`<p class="hint reason">${esc(r2ClearWhy)}</p>`:''}</div><button class="danger clear-score" data-action="clear-r2-game" ${r2ClearOff?`disabled title="${esc(r2ClearWhy)}" aria-disabled="true"`:''}>Clear this game</button></div>`;
 html+=`<div class="notice"><b>SITTING OUT:</b> ${match.sit.map(p=>esc(state.names[p])).join(' · ')}. Their goal cells stay blank. <button data-action="r2-wheel" ${sitoutBusy?'disabled':''}>View sit-out wheel ↗</button></div><div class="teams-grid">`;
 for(const team of ['A','B'])html+=`<section class="team-score team-${team.toLowerCase()}"><div class="team-head"><div><small>GAME ${g+1} / ROTATING LINEUP</small><h2>Team ${team}</h2></div></div>${match[team].map(p=>`<div class="player-score"><div class="player-name">${esc(state.names[p])}<small>${fmt(rowmap[p].average)} GOALS / MATCH · ${playedLabel(rowmap[p].played,6)} PLAYED</small></div>${counter(`round2.players.${p}.goals.${g}`,`${state.names[p]} game ${g+1}`,v.stale||sitoutBusy)}</div>`).join('')}</section>`;
 html+='</div><p class="hint">A blank active-player score is still missing. A zero counts as played. Scheduled sit-outs never count as zero-goal matches. Round 1 scores do not carry over.</p>';
 const doneOff=sitoutBusy||v.stale||g!==v.draw.completed||!v.games[g].ready;
 const doneWhy=v.stale?'Clear What Do You Want? first — the roster changed since this draw.':sitoutBusy?'Wait for the current draw to finish.':g<v.draw.completed?`Match ${g+1} is already marked done. Open the latest match to continue.`:g>v.draw.completed?`Finish Match ${v.draw.completed+1} before opening this one.`:!v.games[g].ready?`Enter the six scheduled scores for Game ${g+1} first.`:'';
 html+=`<div class="panel match-completion"><div><h2>${v.draw.completed===8?'All 8 matches marked done':g<v.draw.completed?'This match is already marked done':`Match ${g+1} of 8`}</h2><p>${v.draw.completed===8?'Resolve any cut ties to open You Wanted to Win, Right?.':'Enter the six scores, then draw the next pair of sit-outs.'}</p>${doneOff&&doneWhy?`<p class="hint reason">${esc(doneWhy)}</p>`:''}</div><button class="accent" data-action="r2-done" data-match="${g+1}" ${doneOff?`disabled title="${esc(doneWhy)}" aria-disabled="true"`:''}>${g===7?'Match 8 of 8 done — finish round':`Match ${g+1} of 8 done — draw next sit-outs`}</button></div>`;
 html+=panel('Overall standings',table(['RANK','PLAYER','TOTAL GOALS','PLAYED','SIT-OUTS DRAWN','AVG / MATCH','DECISION'],v.rows.map(r=>`<tr><td class="calc">${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${r.goals}</td><td class="calc">${playedLabel(r.played,6)}</td><td class="calc">${r.sit_outs}/2</td><td class="calc">${r.average.toFixed(3)}</td><td>${badge(r.status)}</td></tr>`)));
 html+=`<details><summary>View revealed rotations and sit-outs</summary><p class="hint">The saved draw guarantees six games and two sit-outs per person, with no consecutive sit-outs. Each player teams up with everyone once or twice and faces everyone two or three times. Refreshing keeps the same draw. ${v.draw.mode==='preserved'?'This round retains its existing schedule because scores were already entered.':''}</p>${table(['GAME','TEAM A','TEAM B','SIT OUT'],v.schedule.slice(0,v.draw.revealed).map(m=>`<tr><td>${m.game}</td><td>${m.A.map(p=>esc(state.names[p])).join(' · ')}</td><td>${m.B.map(p=>esc(state.names[p])).join(' · ')}</td><td>${m.sit.map(p=>esc(state.names[p])).join(' · ')}</td></tr>`))}</details>`;
 return html+extras('round2')+clearRoundPanel('round2');
}
function counter(path,label,disabled=false){const n=value(path)||0,rule=goalRule(path);return `<div class="counter"><button data-step="-1" data-target="${path}" aria-label="Subtract one goal for ${esc(label)}" ${disabled||n<=0?'disabled':''}>−</button>${inp(path,label+' goals','number',disabled)}<button data-step="1" data-target="${path}" aria-label="Add one goal for ${esc(label)}" ${disabled||(rule&&n>=rule.max)?'disabled':''}>+</button></div>`;}
function finalPage(){const v=view.final,g=finalGame;
 let html=title('ROUND 03 / THE FINAL','You Wanted to Win, Right?','Six finalists. Ten rotations. Every goal and win counts.',`GAMES 1 & 2 ×${fmt(state.settings.multiplier)}`)+notice(v.issues);
 html+='<section id="screen-podium" aria-label="Live final podium"></section>';
 if(v.stale)html+=notice(['This roster changed since You Wanted to Win, Right? was scored. Clearing You Wanted to Win, Right? re-syncs it to the current finalists.']);
 if(!v.rows.length)return html+panel('Waiting for finalists','<div class="empty">Finish What Do You Want? and resolve cut ties. Your six finalists will appear automatically.</div>')+clearRoundPanel('final');
 html+=`<div class="score-help">GOAL = ${fmt(state.settings.goal_points)} PTS / WIN = ${fmt(state.settings.win_points)} PTS · Games 1–2 ×${fmt(state.settings.multiplier)} · Games 3–8 ×1</div>`;
 html+=`<div class="match-tabs" aria-label="Final match selector">${v.games.map((m,i)=>`<button data-game="${i}" aria-pressed="${i===g}" class="${i===g?'active':''} ${m.ready?'ready':''}">G${i+1}${i<2?' ×'+fmt(state.settings.multiplier):''}</button>`).join('')}</div>`;
 const schedule=v.schedule[g],rowmap=Object.fromEntries(v.rows.map(r=>[r.id,r]));
 html+=matchScoreboard('final',g);
 const fClearOff=v.stale||sitoutBusy,fClearWhy=v.stale?'Clear You Wanted to Win, Right? first — the roster changed since these scores.':'Wait for the current draw to finish.';
 html+=`<div class="match-topline"><div><h2>Game ${g+1} <span class="stage-title-number">/ 8</span></h2><p>Enter each player’s goals, then mark the winning team.</p>${fClearOff?`<p class="hint reason">${esc(fClearWhy)}</p>`:''}</div><button class="danger clear-score" data-action="clear-game" ${fClearOff?`disabled title="${esc(fClearWhy)}" aria-disabled="true"`:''}>Clear this game</button></div><div class="teams-grid">`;
 for(const team of ['A','B']){
  const won=schedule[team].every(p=>state.final.players[p].results[g]==='W'),lost=schedule[team].every(p=>state.final.players[p].results[g]==='L');
  html+=`<section class="team-score team-${team.toLowerCase()}"><div class="team-head"><div><small>GAME ${g+1}</small><h2>Team ${team}</h2></div><button data-winner="${team}" aria-pressed="${won}" class="${won?'accent':''}" ${v.stale?`disabled title="${esc(v.issues[0]||'Clear You Wanted to Win, Right? first — the roster changed since these scores.')}" aria-disabled="true"`:''}>${won?'✓ WIN RECORDED':lost?'LOSS RECORDED':'Mark win +1'}</button></div>${schedule[team].map(p=>`<div class="player-score"><div class="player-name">${esc(state.names[p])}<small>${fmt(rowmap[p].game_points[g])} POINTS THIS GAME</small></div>${counter(`final.players.${p}.goals.${g}`,`${state.names[p]} game ${g+1}`,v.stale||sitoutBusy)}</div>`).join('')}</section>`;
 }
 html+='</div><p class="hint">Marking the winner adds one win to each teammate and records a loss for each opponent. Enter 0 for a played game with no goals. Win and goal points calculate as you enter either value. Played counts complete goal/result pairs; prizes wait for all eight games.</p>';
 html+=panel('Live standings',table(['RANK','PLAYER','GOALS','WINS','PLAYED','WIN PTS','GOAL PTS','TOTAL PTS','PRIZE','STATUS'],v.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${r.goals}</td><td class="calc">${r.wins}</td><td class="calc">${r.played}</td><td class="calc">${fmt(r.win_points)}</td><td class="calc">${fmt(r.goal_points)}</td><td class="calc"><b>${fmt(r.total)}</b></td><td class="calc">${money(r.prize)}</td><td>${badge(r.status)}</td></tr>`)));
 html+=matchSubmit('final',g);
 html+=`<details><summary>View all eight team rotations</summary><p class="hint">Eight different team splits are played. Everyone plays eight matches, with changing teammates and opponents. Slots and match order stay fixed. Games 1 and 2 carry double weight at the default multiplier.</p>${table(['GAME','TEAM A','TEAM B','STATUS'],v.schedule.map(m=>`<tr><td>${m.game}${m.game<=2?' ×'+fmt(state.settings.multiplier):''}</td><td>${m.A.map(p=>esc(state.names[p])).join(' · ')}</td><td>${m.B.map(p=>esc(state.names[p])).join(' · ')}</td><td>${v.games[m.game-1].ready?'✓ COMPLETE':'PENDING'}</td></tr>`))}</details>`;
 html+=`<details><summary>View points per game</summary>${table(['PLAYER',...Array.from({length:10},(_,i)=>`G${i+1}`)],v.rows.map(r=>`<tr><td>${esc(r.name)}</td>${r.game_points.map(p=>`<td class="calc">${fmt(p)}</td>`).join('')}</tr>`))}</details>`;
 return html+extras('final')+clearRoundPanel('final');
}
async function rerollRound1Game(game){
 if(sitoutBusy||spinning)return;
 sitoutBusy=true;
 // Snapshot the pre-reroll state so Undo can restore the prior split. The server
 // echo overwrites state below, so capture before the PUT and keep the snapshot.
 const snap={state:clone(state),label:'Undo: Reshuffle Like Never Before Game '+(game+1)};
 try{
  await flush();
  const res=await fetch('/api/round1-lineup',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({action:'reroll',game:game+1,revision})});
  const data=await res.json();if(!res.ok)throw new Error(data.error);
  ({state,view,revision}=data);undoSnapshot=snap;$('#save-status').textContent='Teams reshuffled';error('');
 }catch(err){error(err.message);}finally{sitoutBusy=false;render();}
}
function sitoutCandidates(){
 const v=view.round2,g=Math.min(round2Game,Math.max(0,v.draw.revealed-1));
 return view.round1.survivors.filter(p=>v.schedule.slice(0,g).filter(m=>m.sit.includes(p)).length<2 && (g===0||!v.schedule[g-1].sit.includes(p)));
}
function sitoutWheelPage(){
 const v=view.round2,g=Math.min(round2Game,Math.max(0,v.draw.revealed-1));
 let html=title('ROOM 03 / WHAT DO YOU WANT?','Two sit out. Six play.','Automatic draws keep every player at exactly two sit-outs across eight matches.','BALANCED RANDOM DRAW');
 if(!view.round1.complete)return html+panel('Waiting for survivors','<p>Finish Like Never Before and resolve cut ties. Only the eight survivors participate in this draw.</p>');
 if(v.stale)return html+notice(v.issues)+`<button data-tab="round2">Open What Do You Want?</button>`;
 if(!v.draw.order.length)return html+panel('Ready to draw','<p>Start once. The dashboard saves a randomized rotation and reveals two sit-outs for each match. The open name list does not change these eight players.</p><button class="accent" data-action="r2-start" '+(sitoutBusy?'disabled':'')+'>Draw Match 1 sit-outs ↗</button>');
 const pair=v.schedule[g].sit;
 html+=`<div class="wheel-layout"><section class="wheel-stage"><div class="wheel-wrap"><canvas id="wheel-canvas" width="880" height="880" aria-label="Round 2 sit-out wheel"></canvas><div class="wheel-hub sitout-hub">${sitoutAnimating?'DRAW':'SAVED'}</div></div><div class="wheel-result" role="status" aria-live="polite"><small>MATCH ${g+1} OF 8 / ${sitoutAnimating?'DRAWING TWO NAMES':'SITTING OUT'}</small><strong>${sitoutAnimating?'Who sits this match?':pair.map(p=>esc(state.names[p])).join('<br>')}</strong><button class="accent" data-action="r2-scores" ${sitoutBusy?'disabled':''}>Enter Match ${g+1} goals ↗</button></div><p class="draw-help">The wheel reveals a saved random rotation. The result stays the same if you refresh or reopen this screen.</p></section><section>${panel('Rest count',table(['PLAYER','SIT-OUTS DRAWN'],v.rows.map(r=>`<tr><td>${esc(r.name)}</td><td class="calc">${r.sit_outs} / 2</td></tr>`)))}<div class="notice">After entering all six goal scores, click <b>“Match ${g+1} of 8 done”</b> in What Do You Want?. The next pair appears here automatically. Nobody sits in consecutive matches.</div><p class="hint">${v.draw.mode==='preserved'?'Existing scores were detected, so this round keeps its original schedule. New rounds use a random draw.':'The app randomly assigns players to rotation slots once, then reveals the next pair after each completed match. This guarantees equal playing time.'}</p></section></div>`;
 return html;
}
async function animateSitoutPair(){
 const candidates=sitoutCandidates(),names=candidates.map(p=>state.names[p]);
 const pair=view.round2.schedule[round2Game].sit;
 for(const p of pair){
  const index=candidates.indexOf(p),step=2*Math.PI/names.length;
  const target=((-(index+.5)*step)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
  const start=wheelAngle,end=start+2*Math.PI*3+((target-start%(2*Math.PI)+2*Math.PI)%(2*Math.PI));
  const duration=reducedMotion()?0:1500,started=performance.now();
  await new Promise(resolve=>{function frame(now){const t=duration?Math.min(1,(now-started)/duration):1;wheelAngle=start+(end-start)*(1-Math.pow(1-t,4));drawWheel(names,wheelAngle);if(t<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
  wheelAngle=target;
 }
}
async function progressRound2(action,game){
 if(sitoutBusy||spinning)return false;sitoutBusy=true;
 try{
  await flush();render();
  const res=await fetch('/api/round2-draw',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({action,game,revision})});
  const data=await res.json();if(!res.ok)throw new Error(data.error);
  ({state,view,revision}=data);round2Game=Math.min(view.round2.draw.completed,7);
  $('#save-status').textContent='Draw saved';error('');
  if(action==='done'&&view.round2.draw.completed===8){tab='round2';return true;}
  tab='sitout';spinning=true;sitoutAnimating=true;render();$('#screen-scroll').scrollTop=0;
  await animateSitoutPair();
  return true;
 }finally{spinning=false;sitoutAnimating=false;sitoutBusy=false;render();}
}
function drawWheel(names=[],angle=wheelAngle){
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
function render(){
 if(!state)return;renderRoom();renderUndo();renderSaveControls();
 if(!$('#screen-dialog').open)return;
 if(roomLock(tab))tab=!view.names_ok?'settings':!view.round1.complete?'round1':'round2';
 const focus=captureInputFocus('#content');
 const scrollTop=$('#screen-scroll').scrollTop,scrolls=[...document.querySelectorAll('#content .scroll')].map(e=>e.scrollLeft);
 const openDetails=[...document.querySelectorAll('#content details')].map(d=>d.open);
 $('#nav').innerHTML=tabs.map(([k,label],i)=>`<button data-tab="${k}" ${lockAttrs(k)} class="${tab===k?'active':''}" aria-current="${tab===k?'page':'false'}"><b>0${i+1}</b>${label}<span>${view[k]?.complete?'✓':''}</span></button>`).join('');
 $('#breadcrumb').textContent=tab==='sitout'?'BH / ROOM 03 / WHAT DO YOU WANT?':`BH / ROOM 0${tabs.findIndex(t=>t[0]===tab)+1} / ${tabs.find(t=>t[0]===tab)[1].toUpperCase()}`;
 $('#content').innerHTML=(state.legacy_round2?'<div class="notice">Your old Round 2 and final are archived in the downloadable backup. What Do You Want? now uses eight rotating games, so those stages start fresh. Like Never Before, names, and settings are preserved.</div>':state.legacy_final?'<div class="notice">Your old five-game final is archived in the downloadable backup.</div>':'')+(tab==='overview'?overview():tab==='settings'?settings():tab==='final'?finalPage():tab==='sitout'?sitoutWheelPage():round(tab));
 window.BrawlMonuments?.renderScreen(view,state);
 [...document.querySelectorAll('#content .scroll')].forEach((e,i)=>e.scrollLeft=scrolls[i]||0);
 [...document.querySelectorAll('#content details')].forEach((e,i)=>e.open=openDetails[i]||false);
 $('#screen-scroll').scrollTop=scrollTop;
 if(tab==='sitout')drawWheel(sitoutCandidates().map(p=>state.names[p]));
 restoreInputFocus('#content',focus);
}
async function openScreen(key,source){
 if(!state||spinning||sitoutBusy||roomTransition||cutsceneActive)return;
 roomTransition=true;
 try{
  await flush();
  const locked=roomLock(key);if(locked){error(locked);return;}
  tab=key;
  const dialog=$('#screen-dialog'),already=dialog.open;
  lastMonitor=key==='sitout'?'round2':key;
  if(!already){
   document.body.classList.add('entering-room');
   $('#walkway-view')?.scrollIntoView?.({block:'center',behavior:'instant'});
   await window.CityWorld?.enterRoom(lastMonitor);
   dialog.showModal();document.body.classList.add('inside-room');
  }
  render();$('#screen-scroll').scrollTop=0;
  if(!already&&!reducedMotion())dialog.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:230,easing:'ease-out'});
  $('#close-screen').focus({preventScroll:true});
 }finally{roomTransition=false;document.body.classList.remove('entering-room');}
}
async function closeScreen(){
 if(roomTransition||cutsceneActive)return;
 if(spinning||sitoutBusy){error('Wait for the wheel to finish its draw.');return;}
 const dialog=$('#screen-dialog');if(!dialog.open)return;
 roomTransition=true;
 try{
  await flush();
  dialog.close();document.body.classList.remove('inside-room');
  document.body.classList.add('entering-room');
  renderSaveControls();
  await window.CityWorld?.leaveRoom();
  document.querySelector('[data-open="'+lastMonitor+'"]')?.focus({preventScroll:true});
 }finally{roomTransition=false;document.body.classList.remove('entering-room');}
}
function renderSaveControls(){
 const controls=$('#save-controls');if(!controls)return;
 const slot=$('#result-dialog').open?$('#result-save-slot'):$('#screen-dialog').open?$('#screen-save-slot'):$('#room-save-slot');
 if(slot&&controls.parentElement!==slot)slot.appendChild(controls);
 const undo=$('#undo-action');if(undo)undo.disabled=spinning||sitoutBusy;
}
function error(message){$('#error').hidden=!message;$('#error').textContent=message||'';
 // Native dialogs are in the top layer: put errors inside the TOPMOST open one.
 const parent=$('#result-dialog').open?$('#result-dialog'):$('#screen-dialog').open?$('.screen-shell'):document.body;if($('#error').parentElement!==parent)parent.appendChild($('#error'));
}
function changed(){dirty=true;saveFailed=false;editVersion++;$('#save-status').textContent='Unsaved changes…';clearTimeout(timer);timer=setTimeout(save,250);}
async function save(){
 clearTimeout(timer);if(saving)return saveTask;if(!dirty)return;
 saving=true;dirty=false;const seq=editVersion;$('#save-status').textContent='Saving…';
 saveTask=(async()=>{
  try{const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state,revision})});const data=await res.json();if(!res.ok)throw new Error(data.error);
   // Extra games may settle a submitted round after its last scheduled match.
   // Trigger only on that round's incomplete -> complete save, never on unrelated edits.
   const settledStage=seq===editVersion&&$('#result-dialog').open&&resultFinal&&resultStage&&!view[resultStage].complete&&data.view[resultStage].complete?resultStage:null;
   saveFailed=false;revision=data.revision;view=data.view;
   if(seq===editVersion){state=data.state;render();renderResult();}error('');$('#save-status').textContent=dirty?'Unsaved changes…':'All changes saved';$('#retry-save').hidden=true;
   if(settledStage&&!cutsceneActive)playCutscene(eliminatedNames(settledStage),stageMeta[settledStage].label,settledStage);
  }catch(e){saveFailed=true;dirty=true;error(e.message);$('#save-status').textContent='Not saved';$('#retry-save').hidden=false;}
  finally{saving=false;}
 })();await saveTask;if(dirty&&!saveFailed)return save();
}
async function flush(){clearTimeout(timer);if(saving)await saveTask;await save();if(dirty||saveFailed)throw new Error('Save your changes successfully before continuing.');}
const clone=o=>{try{return structuredClone(o);}catch{return JSON.parse(JSON.stringify(o));}};
// One-level undo: a single snapshot of state taken BEFORE a destructive action.
// Taking any new destructive action replaces it; Undo restores it and persists.
let undoSnapshot=null;
function doDestructive(label,fn){undoSnapshot={state:clone(state),label};fn();changed();}
function renderUndo(){
 const btn=$('#undo-action'),labelEl=$('#undo-label');if(!btn)return;
 if(undoSnapshot){btn.hidden=false;if(labelEl)labelEl.textContent=undoSnapshot.label;}
 else btn.hidden=true;
}
async function performUndo(){
 if(!undoSnapshot||spinning||sitoutBusy)return;
 // Keep the snapshot until the restore has actually persisted. If flush() or the PUT
 // throws, leave undoSnapshot in place and re-render the Undo button so the user can
 // retry instead of losing the restored state.
 const snap=undoSnapshot,prior=snap.state;
 // Undo may restore a saved sit-out draw that differs from the server's current draw
 // (e.g. undoing a Clear that blanked the draw). The normal save path rejects an edited
 // draw, so persist through the restore flag like a backup restore does.
 try{
  await flush();
  const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state:prior,revision,restore:true})});
  const data=await res.json();if(!res.ok)throw new Error(data.error);
  undoSnapshot=null;
  state=data.state;view=data.view;revision=data.revision;countdownDraft=null;resetWheelResult();error('');render();renderResult();$('#save-status').textContent='Undo applied';
 }catch(err){undoSnapshot=snap;renderUndo();throw err;}
}
const resetCascade=key=>key==='round1'?['round1','round2','final']:key==='round2'?['round2','final']:['final'];
// Human-readable labels for the per-round clear-round controls and their cascade.
const clearRoundLabel={round1:'Clear Like Never Before',round2:'Clear What Do You Want?',final:'Clear You Wanted to Win, Right?'};
const clearRoundCopy={round1:'Clear Like Never Before (also clears What Do You Want? &amp; You Wanted to Win, Right?)',round2:'Clear What Do You Want? (also clears You Wanted to Win, Right?)',final:'Clear You Wanted to Win, Right?'};
function resetStage(key){for(const k of resetCascade(key)){state[k].extras=[];state[k].roster=[];if(k==='round2')state[k].draw={order:[],revealed:0,completed:0,mode:'random'};if(k==='round1')state[k].lineups=[];for(const d of Object.values(state[k].players)){d.goals=Array(k==='final'?8:k==='round2'?8:5).fill(null);if(k==='final')d.results=Array(8).fill('');}}}
function markWinner(team,game=finalGame){const match=view.final.schedule[game];if(!match||view.final.stale)return;for(const t of ['A','B'])for(const p of match[t])state.final.players[p].results[game]=t===team?'W':'L';}
function resetWheelResult(){wheelAngle=0;}
document.addEventListener('input',e=>{const el=e.target;if(el.id==='starts-at'){countdownDraft=el.value;return;}if(!el.dataset.path||el.tagName==='SELECT')return;const next=el.type==='number'?(el.value===''?null:Number(el.value)):el.value,rule=goalRule(el.dataset.path);if(rule&&next!==null&&Number.isFinite(next)&&next>=0&&Number.isInteger(next)){if(!enterGoal(el.dataset.path,next)){el.value=value(el.dataset.path)??'';return;}}else{if(!el.checkValidity()){error(el.validationMessage);return;}setValue(el.dataset.path,next);}refreshGoalControls();changed();});
document.addEventListener('change',e=>{const el=e.target;if(el.tagName==='SELECT'&&el.dataset.path){setValue(el.dataset.path,el.value);changed();}if(el.dataset.check){setValue(el.dataset.check,el.checked);changed();}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.disabled)return;try{if(b.dataset.action==='edit-start'){await setStartTime();return;}worldClick(e);
 if(b.dataset.open){await openScreen(b.dataset.open,b);return;}
 if(b.dataset.tab){await openScreen(b.dataset.tab);return;}
 if(b.dataset.r2Game!==undefined){if(sitoutBusy||Number(b.dataset.r2Game)>=view.round2.draw.revealed)return;await flush();round2Game=Number(b.dataset.r2Game);render();return;}
 if(b.dataset.r1Game!==undefined){await flush();round1Game=Number(b.dataset.r1Game);render();return;}
 if(b.dataset.game!==undefined){await flush();finalGame=Number(b.dataset.game);render();return;}
 if(b.dataset.step){const current=value(b.dataset.target);if(!enterGoal(b.dataset.target,Math.max(0,(current??0)+Number(b.dataset.step))))return;refreshGoalControls();changed();await save();return;}
 if(b.dataset.winner){markWinner(b.dataset.winner);changed();await save();return;}
 const action=b.dataset.action,key=b.dataset.stage;
 if(['street-home','visit-towers','visit-podium'].includes(action)){if(roomTransition||cutsceneActive)return;await flush();roomTransition=true;try{$('#walkway-view')?.scrollIntoView?.({block:'center',behavior:'instant'});if(action==='street-home')await window.CityWorld?.home();else await window.CityWorld?.visit(action==='visit-towers'?'towers':'podium');}finally{roomTransition=false;}return;}
 if(action==='clear-start'){await flush();doDestructive('Undo: Clear countdown',()=>{state.settings.start_at='';state.settings.disaster_started_at='';countdownDraft=null;});await save();return;}
 if(action==='r1-reroll'){await rerollRound1Game(Number(b.dataset.match));return;}
 if(action==='r2-start'){await progressRound2('start');return;}
 if(action==='r2-done'){const match=Number(b.dataset.match),completed=await progressRound2('done',match);if(completed)await openMatchResult('round2',match-1);return;}
 if(action==='submit-match'){await flush();await openMatchResult(key,Number(b.dataset.match));return;}
 if(action==='close-result'){closeResult();return;}
 if(action==='r2-wheel'){await openScreen('sitout');return;}
 if(action==='r2-scores'){await openScreen('round2');return;}
 if(action==='csv'){await flush();window.location='/api/standings.csv';}
 if(action==='extra'){state[key].extras.push(Object.fromEntries(ids.map(p=>[p,key==='final'?{goals:null,result:''}:null])));changed();await save();}
 if(action==='remove-extra'){await flush();const index=Number(b.dataset.index);doDestructive('Undo: Remove extra game '+(index+1),()=>{state[key].extras.splice(index,1);});await save();}
 if(action==='clear-extras'){await flush();doDestructive('Undo: Clear all extra games',()=>{state[key].extras=[];});await save();}
 if(action==='undo'){await performUndo();return;}
 if(action==='clear-r1-game'){await flush();const g=round1Game;doDestructive('Undo: Clear Like Never Before Game '+(g+1),()=>{for(const p of ids)state.round1.players[p].goals[g]=null;});await save();}
 if(action==='clear-r2-game'){await flush();const g=round2Game;doDestructive('Undo: Clear What Do You Want? Game '+(g+1),()=>{for(const p of view.round2.rows.map(r=>r.id))state.round2.players[p].goals[g]=null;});await save();}
 if(action==='clear-game'){await flush();const g=finalGame;doDestructive('Undo: Clear You Wanted to Win, Right? Game '+(g+1),()=>{for(const p of view.final.schedule[g].A.concat(view.final.schedule[g].B)){state.final.players[p].goals[g]=null;state.final.players[p].results[g]='';}});await save();}
 if(action==='clear-round'){await flush();doDestructive('Undo: '+clearRoundLabel[key],()=>resetStage(key));await save();}
 if(action==='clear-names'){await flush();doDestructive('Undo: Clear player names',()=>{for(const p of ids)state.names[p]='';});await save();}
 if(action==='clear-scoring'){await flush();doDestructive('Undo: Clear scoring',()=>{state.settings.win_points=1;state.settings.goal_points=1.5;state.settings.multiplier=2;});await save();}
 if(action==='reset-all'&&confirm('Clear the tournament? You can undo this, but downloading a backup first is safest.')){await flush();doDestructive('Undo: Clear tournament',()=>{countdownDraft=null;state={version:4,wheel:{text:'',remove_winner:false},names:Object.fromEntries(ids.map(p=>[p,''])),settings:{win_points:1,goal_points:1.5,multiplier:2,prizes:[18,8,4],start_at:'',disaster_started_at:''}};for(const k of ['round1','round2','final'])state[k]={roster:[],extras:[],...(k==='round2'?{draw:{order:[],revealed:0,completed:0,mode:'random'}}:k==='round1'?{lineups:[]}:{}),players:Object.fromEntries(ids.map(p=>[p,k==='final'?{goals:Array(8).fill(null),results:Array(8).fill('')}:k==='round2'?{goals:Array(8).fill(null)}:{goals:Array(5).fill(null)}]))};resetWheelResult();});await save();}
 }catch(err){error(err.message);}});
$('#close-screen').onclick=()=>closeScreen().catch(e=>error(e.message));
$('#screen-dialog').addEventListener('cancel',e=>{e.preventDefault();closeScreen().catch(err=>error(err.message));});
$('#result-dialog').addEventListener('cancel',e=>{e.preventDefault();closeResult();});
$('#home-link').onclick=e=>{e.preventDefault();if($('#screen-dialog').open)closeScreen().catch(err=>error(err.message));};
$('#retry-save').onclick=()=>save();
// FEAT-003: Skip button and click-anywhere both route through the single endCutscene path.
$('#cutscene-skip').onclick=e=>{e.stopPropagation();endCutscene();};
$('#cutscene').onclick=()=>endCutscene();
$('#cutscene').addEventListener('cancel',e=>{e.preventDefault();endCutscene();});
$('#undo-action').onclick=()=>performUndo().catch(e=>error(e.message));
$('#backup').onclick=async()=>{try{await flush();window.location='/api/backup';}catch(e){error(e.message);}};
$('#restore').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(spinning||sitoutBusy)throw new Error('Wait for the current draw to finish.');const parsed=JSON.parse(await file.text());if(!confirm('Replace the current tournament with this backup?'))return;await flush();const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state:parsed,revision,restore:true})});const data=await res.json();if(!res.ok)throw new Error(data.error);state=data.state;view=data.view;revision=data.revision;undoSnapshot=null;countdownDraft=null;round1Game=0;round2Game=Math.min(view.round2.draw.completed,7);finalGame=0;resetWheelResult();error('');render();renderResult();$('#save-status').textContent='Backup restored and saved';}catch(err){error(err.message);}finally{e.target.value='';}};
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
function updateCountdown(){
 if(state)window.CityWorld?.setSettings(state.settings);
 const target=state?.settings?.start_at, box=$('#countdown');
 if(!box)return;
 if(!target){if($('#schedule-label'))$('#schedule-label').textContent='SET START TIME';const card=$('.doomsday-clock');if(card)card.dataset.phase='unset';['days','hours','minutes','seconds'].forEach(k=>{const e=$('#countdown-'+k);if(e)e.textContent='--';});$('#countdown-phase').textContent='AWAITING START TIME';$('#doomsday-status').textContent='Set a start time. Let the countdown begin.';if(box.setAttribute)box.setAttribute('aria-label','Tournament start time is not set');return;}
 const ms=Math.max(0,new Date(target).getTime()-Date.now()), total=Math.ceil(ms/1000);
 const d=Math.floor(total/86400),h=Math.floor(total%86400/3600),m=Math.floor(total%3600/60),sec=total%60;
 [['days',d],['hours',h],['minutes',m],['seconds',sec]].forEach(([k,v])=>{const e=$('#countdown-'+k);if(e)e.textContent=String(v).padStart(2,'0');});
 const started=ms<=0;$('#countdown-phase').textContent=started?'DOOMSDAY HAS ARRIVED':'COUNTDOWN TO TOURNAMENT';$('#doomsday-status').textContent=started?'TOURNAMENT STARTED — enter the rooms.':'Starts '+new Date(target).toLocaleString([], {dateStyle:'medium',timeStyle:'short'});if(box.setAttribute)box.setAttribute('aria-label',started?'Doomsday has arrived':'Tournament starts in '+d+' days '+h+' hours '+m+' minutes '+sec+' seconds');
 if($('#schedule-label'))$('#schedule-label').textContent='CHANGE START TIME';const card=$('.doomsday-clock');if(card)card.dataset.phase=started?'started':'waiting';
}
async function setStartTime(){
 await openScreen('settings');
 const field=$('#starts-at');field?.focus({preventScroll:true});field?.scrollIntoView({block:'center',behavior:reducedMotion()?'instant':'smooth'});
}
function clock(){$('#room-clock').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});updateCountdown();}clock();setInterval(clock,1000);
// FEAT-002: ambient background nukes/explosions on a 1-5s random cadence with a
// WORLD-LAYER-ONLY camera shake. Shared guard `cutsceneActive` lets the elimination
// cutscene (FEAT-003) suppress the shake while it runs. Everything is gated by the
// Pause-world toggle (document.body 'world-paused') and prefers-reduced-motion.
let cutsceneActive=false,blastTimer=null,blastShake=null;
const worldPaused=()=>document.body.classList.contains('world-paused');
const blastGated=()=>reducedMotion()||worldPaused();
function spawnBlast(){
 const layer=document.querySelector('#world-blasts');if(!layer)return;
 const el=document.createElement&&document.createElement('div');if(!el)return;
 const nuke=Math.random()<0.5;
 el.className='world-blast'+(nuke?' nuke':'');
 const dur=nuke?1300:900;
 el.style.left=(8+Math.random()*84)+'%';el.style.top=(32+Math.random()*55)+'%';
 el.style.setProperty('--blast-dur',dur+'ms');
 el.innerHTML='<div class="blast-core"></div><div class="blast-ring"></div>';
 layer.appendChild(el);
 const done=()=>{if(el.parentElement&&el.parentElement.removeChild)el.parentElement.removeChild(el);else if(el.remove)el.remove();};
 if(el.addEventListener)el.addEventListener('animationend',done,{once:true});
 // Fallback removal (and the sole path in the vm sandbox, where no real animations run)
 // so blast nodes never accumulate.
 setTimeout(done,dur+400);
 // Trigger the CSS pop on the next frame so the class change animates.
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>el.classList.add('pop'));else el.classList.add('pop');
 return el;
}
function shakeWorld(){
 if(cutsceneActive)return;
 const wrap=document.querySelector('#world-shake');if(!wrap||!wrap.animate)return;
 if(blastShake&&blastShake.cancel)try{blastShake.cancel();}catch{}
 blastShake=wrap.animate([
  {transform:'translate(0,0)'},{transform:'translate(-6px,3px) rotate(-.4deg)'},
  {transform:'translate(7px,-4px) rotate(.4deg)'},{transform:'translate(-5px,4px)'},
  {transform:'translate(4px,-3px)'},{transform:'translate(-2px,2px)'},{transform:'translate(0,0)'}
 ],{duration:500,easing:'cubic-bezier(.36,.07,.19,.97)'});
}
function blastTick(){
 if(blastGated()){stopWorldBlasts();return;}
 spawnBlast();
 if(!cutsceneActive)shakeWorld();
 const delay=1000+Math.floor(Math.random()*4000); // random 1000-5000ms
 blastTimer=setTimeout(blastTick,delay);
}
function startWorldBlasts(){
 if(window.CityWorld)return; // The 3D renderer owns effects, gated by countdown progress.
 if(blastGated())return;        // no-op under reduced motion or when world is paused
 if(blastTimer!==null)return;   // already running
 const delay=1000+Math.floor(Math.random()*4000);
 blastTimer=setTimeout(blastTick,delay);
}
function stopWorldBlasts(){
 if(blastTimer!==null){clearTimeout(blastTimer);blastTimer=null;}
 if(blastShake&&blastShake.cancel){try{blastShake.cancel();}catch{}blastShake=null;}
}
const worldClick=e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='world-toggle'){const paused=document.body.classList.toggle('world-paused');b.setAttribute('aria-pressed',String(paused));const span=b.querySelector&&b.querySelector('span');if(span)span.textContent=paused?'Resume world':'Pause world';if(b.firstChild)b.firstChild.textContent=paused?'▶ ':'Ⅱ ';window.CityWorld?.setPaused(paused);if(paused)stopWorldBlasts();else if(!reducedMotion())startWorldBlasts();}if(b.dataset.action==='edit-start')setStartTime();};

// FEAT-003: cartoon furnace elimination cutscene. Plays BEFORE the end-of-round
// fullscreen standings, once per settled round when its final match is submitted.
// The eliminated players for a stage come straight from the engine view (no server
// change): round1/round2 -> rows with status 'CUT'; final -> rows with rank>3 (the
// non-podium finishers; the top-3 podium are NOT thrown).
function eliminatedNames(key){
 const v=view&&view[key];if(!v||!v.rows)return [];
 const rows=key==='final'
  ?[...v.rows].filter(r=>r.rank>3).sort((a,b)=>(a.rank||99)-(b.rank||99))
  :[...v.rows].filter(r=>r.status==='CUT').sort((a,b)=>(a.rank||99)-(b.rank||99));
 return rows.map(r=>r.name);
}
// Five-second tower strike. The scan is cosmetic; only engine-cut players are targeted.
let cutsceneTimers=[],cutsceneKeyHandler=null,cutsceneResolve=null;
let portalTowerNames=[],portalTowersMarked=new Set();
function cutsceneRoster(names){
 const roster=Object.values(state?.names||{}).filter(n=>n&&n.trim());
 return [...new Set([...roster,...names])];
}
function buildCutscene(names){
 const towers=cutsceneRoster(names).map((name,i)=>{
  const x=45+i*(810/Math.max(1,cutsceneRoster(names).length-1));
  return '<g class="strike-tower" data-name="'+esc(name)+'" transform="translate('+x+',0)">'+
   '<path class="tower-body" d="M-22 290V145L0 125L22 145V290Z" fill="#183440" stroke="#67b4c9" stroke-width="2"/>'+
   '<path class="tower-windows" d="M-12 160H12M-12 182H12M-12 204H12M-12 226H12M-12 248H12" stroke="#8be4ef" stroke-width="4"/>'+
   '<path class="tower-rubble" d="M-29 292l13-22 10 12 15-21 24 31Z" fill="#36242c" stroke="#ff986b"/>'+
   '<text x="0" y="323" text-anchor="middle" fill="#c2e5ed" font-size="11" font-family="monospace">'+esc(name)+'</text></g>';
 }).join('');
 $('#cutscene-stage').innerHTML='<div class="cinematic-plate" aria-hidden="true"></div><div class="cinematic-target"></div><svg class="tower-strike-svg" viewBox="0 0 900 400" aria-hidden="true">'+
  '<defs><radialGradient id="strike-fire"><stop stop-color="#fff8bc"/><stop offset=".4" stop-color="#ff9b38"/><stop offset="1" stop-color="#ff3a2700"/></radialGradient></defs>'+
  '<path d="M0 293H900" stroke="#568e9d"/>'+towers+
  '<g class="strike-reticle"><rect x="-34" y="115" width="68" height="185" rx="3" fill="none" stroke="#ff697a" stroke-width="3"/><path d="M-45 207H45M0 97V315" stroke="#ff697a" stroke-dasharray="5 10"/></g>'+
  '<g class="strike-missile"><path d="M-8-20H8V15L0 30L-8 15Z" fill="#d5e9ed" stroke="#fa785d"/><path d="M-6-20L0-65L6-20" fill="#ffb95d"/></g>'+
  '<g class="strike-blast"><circle class="strike-fireball" cy="220" r="105" fill="url(#strike-fire)"/><ellipse class="strike-shockwave" cy="290" rx="180" ry="25" fill="none" stroke="#ffb862" stroke-width="5"/><path class="strike-mushroom" d="M-18 285L-12 190C-110 220-120 110-55 115C-40 50 45 50 60 115C130 105 105 220 12 190L18 285Z" fill="url(#strike-fire)"/></g></svg>';
 $('#cutscene-caption').innerHTML='<strong>SCANNING TOWERS</strong>';
}
function strikePhase(phase,name,x){
 const overlay=$('#cutscene');
 overlay.classList.remove('phase-scan','phase-lock','phase-inbound','phase-impact','phase-off');
 overlay.classList.add('phase-'+phase);
 const stage=$('#cutscene-stage');
 stage.style.setProperty('--strike-x',x+'px');
 const towers=stage.querySelectorAll?Array.from(stage.querySelectorAll('.strike-tower')):[];
 towers.forEach(t=>{t.classList.toggle('selected',t.dataset.name===name);if((phase==='impact'||phase==='off')&&t.dataset.name===name)t.classList.add('destroyed');});
 const nameplate=stage.querySelector?stage.querySelector('.cinematic-target'):null;
 if(nameplate)nameplate.textContent=name;
 const caption=$('#cutscene-caption');
 caption.innerHTML='<strong>'+({scan:'SCANNING',lock:'LOCKED',inbound:'LOCKED',impact:'IMPACT',off:'LOCKED OFF'}[phase])+'</strong> — '+esc(name);
}
function runTowerStrike(names,i=0){
 if(!cutsceneActive)return;
 if(i>=names.length){endCutscene();return;}
 // Rebuild each beat to restart missile, blast and shake animations for every target.
 const roster=cutsceneRoster(names),target=names[i],targetIndex=roster.indexOf(target);
 buildCutscene(names);
 const xFor=n=>45+n*(810/Math.max(1,roster.length-1));
 const schedule=(fn,delay)=>cutsceneTimers.push(setTimeout(()=>{if(cutsceneActive)fn();},delay));
 if(reducedMotion()){
  strikePhase('off',target,xFor(targetIndex));
 }else{
  for(let step=0;step<8;step++){
   const scanIndex=Math.floor(Math.random()*roster.length);
   if(step===0)strikePhase('scan',roster[scanIndex],xFor(scanIndex));
   else schedule(()=>strikePhase('scan',roster[scanIndex],xFor(scanIndex)),step*125);
  }
  schedule(()=>strikePhase('lock',target,xFor(targetIndex)),1000);
  schedule(()=>strikePhase('inbound',target,xFor(targetIndex)),1600);
  schedule(()=>{strikePhase('impact',target,xFor(targetIndex));try{globalThis.navigator?.vibrate?.([160,50,240,60,320]);}catch{}},2300);
  schedule(()=>strikePhase('off',target,xFor(targetIndex)),4000);
 }
 schedule(()=>runTowerStrike(names,i+1),5000);
}
// Five-second portal abduction, rebuilt independently for each eliminated player.
function buildPortalScene(name){
 $('#cutscene-stage').innerHTML=`<svg class="portal-scene" viewBox="0 0 900 420" aria-hidden="true">
 <defs><radialGradient id="portal-haze"><stop stop-color="#47316b"/><stop offset="1" stop-color="#05070d"/></radialGradient><radialGradient id="portal-void"><stop stop-color="#000"/><stop offset=".78" stop-color="#030208"/><stop offset="1" stop-color="#9c65cd"/></radialGradient><linearGradient id="hand-shade" x2="0" y2="1"><stop stop-color="#15131f"/><stop offset=".55" stop-color="#514253"/><stop offset="1" stop-color="#0c0a11"/></linearGradient><filter id="portal-glow"><feGaussianBlur stdDeviation="9"/></filter></defs>
 <rect width="900" height="420" fill="url(#portal-haze)"/>
 <path d="M0 330L450 265L900 330V420H0Z" fill="#090a12"/>
 <g stroke="#59506d" opacity=".18"><path d="M450 270L50 420M450 270L260 420M450 270L640 420M450 270L850 420M0 360H900M0 397H900"/></g>
 <ellipse class="portal-ground" cx="370" cy="339" rx="130" ry="24" fill="#9061be" opacity=".2" filter="url(#portal-glow)"/>
 <g class="dark-portal"><ellipse cx="355" cy="226" rx="79" ry="119" fill="#9658c7" opacity=".55" filter="url(#portal-glow)"/><ellipse cx="355" cy="226" rx="70" ry="111" fill="url(#portal-void)" stroke="#a97ce0" stroke-width="2"/>
 <ellipse class="portal-rim" cx="355" cy="226" rx="75" ry="116" fill="none" stroke="#dac2ff" stroke-width="2" stroke-dasharray="38 23 9 32"/>
 <path d="M324 199L340 204M372 204L388 199" stroke="#cab2f0" stroke-width="3" opacity=".55"/></g>
 <ellipse class="walker-shadow" cx="520" cy="340" rx="40" ry="8" fill="#000" opacity=".7"/>
 <g class="portal-walker"><g class="walker-bob" fill="#030407" stroke="#665b74" stroke-width=".7">
 <g class="walker-leg rear-leg"><path d="M-10-7L-16 34L-7 64L10 65L10 59L2 56L-2 31L5-4Z"/></g>
 <g class="walker-arm rear-arm"><path d="M-9-95Q-15-98-19-87L-27-68Q-29-63-25-56L-14-38Q-9-34-6-41L-14-65L0-86Q5-92-9-95Z"/></g>
 <path d="M-13-108Q0-119 14-105Q19-87 17-64Q11-35 11-6Q0 0-13-6Q-14-31-18-58Q-24-88-13-108Z"/>
 <path d="M-6-119L-6-105L9-105L10-121Z"/>
 <path d="M-13-137Q-15-158 3-158Q20-156 17-138L22-132L17-128Q18-119 7-118L-7-121Z"/>
 <g class="walker-leg front-leg"><path d="M2-6L9 31L3 58L3 65L25 65L26 60L13 57L21 31L17-6Z"/></g>
 <g class="walker-arm front-arm"><path d="M12-98Q18-99 21-88L28-68Q29-63 26-57L17-38Q12-34 9-40L16-65L5-88Q2-96 12-98Z"/></g>
 </g></g>
 <g class="portal-hand"><path d="M313 257Q365 223 418 209L443 204L465 193Q472 190 475 196L461 211L492 198Q501 196 503 203L477 220L509 214Q516 214 515 222L483 235L507 237Q515 240 508 246L471 252Q455 269 433 263L399 270L321 297Z" fill="url(#hand-shade)" stroke="#9e879f" stroke-width="1.6"/>
 <path d="M335 272L414 237M350 282L427 249M438 218L454 227M452 242L466 230M463 249L473 241" fill="none" stroke="#c3a3c4" stroke-width="2" opacity=".45"/>
 <path d="M465 193L475 196L461 211M492 198L503 203L477 220M509 214L515 222L483 235" fill="#c8b6cf" opacity=".7"/></g>
 <g class="portal-dust" fill="#b5a0d5">${Array.from({length:14},(_,i)=>`<circle cx="${300+i*17}" cy="${180+(i*37)%145}" r="${1+i%3}" style="--dust-delay:${i*-.17}s"/>`).join('')}</g>
 <g class="portal-tower-aftermath"><rect width="900" height="420" fill="#050910"/><path d="M0 325L120 296L200 325L280 279L360 325L530 300L650 325L730 285L900 325V420H0Z" fill="#0e1721"/><ellipse cx="450" cy="344" rx="125" ry="14" fill="#131b24"/><g class="portal-falling-tower"><path d="M410 340V118H490V340Z" fill="#192530" stroke="#52606c" stroke-width="2"/><path d="M425 136H475M425 160H475M425 184H475M425 208H475M425 232H475M425 256H475M425 280H475M425 304H475" stroke="#99ffe0" stroke-width="5" class="portal-tower-lights"/><path d="M450 101L461 115L450 129L439 115Z" fill="#99ffe0" class="portal-tower-lights"/></g><g class="portal-tower-rubble" fill="#25303a"><path d="M365 344L393 316L425 345ZM426 345L449 321L481 345ZM482 345L513 321L550 345Z"/></g></g>
 <rect class="portal-vignette" width="900" height="420" fill="none" stroke="#000" stroke-width="45" opacity=".3"/>
 </svg><div class="portal-player-name">${esc(name)}</div>`;
}
function markPortalTower(name){
 if(portalTowersMarked.has(name))return;
 const player=Object.entries(state.names).find(([,n])=>n===name);
 if(!player)return;
 portalTowersMarked.add(name);window.CityWorld?.eliminateTower?.(player[0]);
}
function portalPhase(phase,name){
 const overlay=$('#cutscene');overlay.classList.remove('portal-walk','portal-open','portal-grab','portal-drag','portal-gone');overlay.classList.add('portal-'+phase);
 const labels={walk:'THE WALK',open:'SOMETHING IS BEHIND YOU',grab:'REACHING FOR YOU',drag:'CLAIMED',gone:'ELIMINATED · TOWER OFFLINE'};
 $('#cutscene-caption').innerHTML='<strong>'+labels[phase]+'</strong><br>'+esc(name);
 if(phase==='gone')markPortalTower(name);
}
function runPortalSequence(names,i=0){
 if(!cutsceneActive)return;if(i>=names.length){endCutscene();return;}
 const name=names[i];buildPortalScene(name);portalPhase(reducedMotion()?'gone':'walk',name);
 const schedule=(fn,delay)=>cutsceneTimers.push(setTimeout(()=>{if(cutsceneActive)fn();},delay));
 if(!reducedMotion()){
  schedule(()=>portalPhase('open',name),900);
  schedule(()=>portalPhase('grab',name),2000);
  schedule(()=>portalPhase('drag',name),2700);
  schedule(()=>portalPhase('gone',name),4100);
 }
 schedule(()=>runPortalSequence(names,i+1),5000);
}
// ONE dismiss path for Skip / click / Esc / natural completion. Clears timers, hides the
// overlay, releases the shake guard, and resolves the gate so the standings can show.
function endCutscene(){
 for(const name of portalTowerNames)markPortalTower(name);portalTowerNames=[];
 cutsceneTimers.forEach(t=>clearTimeout(t));cutsceneTimers=[];
 if(cutsceneKeyHandler&&document.removeEventListener)document.removeEventListener('keydown',cutsceneKeyHandler,true);
 cutsceneKeyHandler=null;
 const overlay=$('#cutscene');
 if(overlay){if(overlay.open)overlay.close();overlay.hidden=true;if(overlay.setAttribute)overlay.setAttribute('aria-hidden','true');overlay.classList.remove('open','phase-scan','phase-lock','phase-inbound','phase-impact','phase-off','portal-mode','portal-walk','portal-open','portal-grab','portal-drag','portal-gone');}
 try{globalThis.navigator?.vibrate?.(0);}catch{}
 cutsceneActive=false;
 window.CityWorld?.setSuspended(false);
 startWorldBlasts();
 const r=cutsceneResolve;cutsceneResolve=null;if(r)r();
}
// Play the cutscene for `names`; resolves when it ends (naturally or via skip). If there
// is nothing to show, resolves immediately so standings appear directly.
function playCutscene(names,roundLabel='',stage=''){
 return new Promise(resolve=>{
  if(cutsceneActive||!names||!names.length){resolve();return;}
  const overlay=$('#cutscene');if(!overlay){resolve();return;}
  cutsceneResolve=resolve;cutsceneActive=true;window.CityWorld?.setSuspended(true);
  // Suppress the ambient world shake/blasts while the cutscene runs (FEAT-002 guard
  // + hard stop so nothing vibrates behind the overlay).
  stopWorldBlasts();
  const portal=stage==='round1'||stage==='round2';
  portalTowerNames=portal?[...names]:[];portalTowersMarked=new Set();
  overlay.classList.toggle('portal-mode',portal);
  $('#cutscene .eyebrow').textContent=portal?'THE VOID IS WAITING':'STRIKE AUTHORIZATION';
  $('#cutscene-label').textContent=(roundLabel?roundLabel+' — ':'')+(portal?'The portal claims its cut':'Nuclear elimination');
  overlay.hidden=false;if(overlay.setAttribute)overlay.setAttribute('aria-hidden','false');overlay.classList.add('open');
  // Native top layer keeps the cutscene above both scoring and tie-result dialogs.
  overlay.showModal();
  if(overlay.focus)overlay.focus({preventScroll:true});
  // Capture Esc so skipping does not also close the scoring/results window underneath.
  cutsceneKeyHandler=e=>{if(e.key==='Escape'||e.key==='Esc'){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();endCutscene();}};
  if(document.addEventListener)document.addEventListener('keydown',cutsceneKeyHandler,true);
  if(portal)runPortalSequence(names);else runTowerStrike(names);
 });
}

fetch('/api/state').then(r=>r.json()).then(data=>{({state,view,revision,token}=data);round2Game=Math.min(view.round2.draw.completed,7);render();$('#save-status').textContent='All changes saved';startWorldBlasts();}).catch(e=>error('Cannot reach the Python app. '+e.message));

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!cutsceneActive&&!roomTransition&&!$('#screen-dialog').open&&!$('#result-dialog').open){window.CityWorld?.home();}});
