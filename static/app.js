'use strict';
let state,view,revision,token,tab='wheel',timer,dirty=false,saving=false,editVersion=0,saveFailed=false;
let wheelMode='free',sitoutBusy=false,sitoutAnimating=false;
let finalGame=0,round2Game=0,round1Game=0,wheelAngle=0,spinning=false,wheelLast=null,lastMonitor=null,saveTask=null;
let resultStage=null,resultMatch=null,resultFinal=false;
const ids=Array.from({length:10},(_,i)=>`p${i+1}`);
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v===null||v===undefined?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:3});
const playedLabel=(n,regulation)=>n>regulation?`${regulation} + ${n-regulation} EXTRA`:`${n}/${regulation}`;
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
// A visible, always-available 'Clear this round' .danger panel. The copy states the
// exact downstream cascade (round1 clears all three, round2 clears round2+final,
// final clears only final). Clearing routes through doDestructive so it is undoable.
const clearRoundBlurb={round1:'Clears To Live and every later round (To Die and Rebirth). Earlier rounds do not exist for To Live, so nothing before it is touched.',round2:'Clears To Die and Rebirth. To Live and its results are kept.',final:'Clears Rebirth only. To Live and To Die are kept.'};
function clearRoundPanel(key){return panel('Clear this round','<p class="hint">'+clearRoundBlurb[key]+' You can Undo this straight afterwards.</p><button class="danger" data-action="clear-round" data-stage="'+key+'">'+clearRoundCopy[key]+'</button>');}
function renderRoom(){
 const registered=Object.values(state.names).filter(x=>x.trim()).length;
 $('#room-stats').innerHTML=`<div><b>${registered}<small> / 10</small></b><small>REGISTERED</small></div><div><b>${money(view.pool)}</b><small>PRIZE POOL</small></div>`;
 const config=[
 ['wheel','01 / RANDOM SELECT','NAME<br>YOUR FATE.',`${wheelNames().length} ENTRIES / NO FIXED LIMIT`,'<div class="wheel-mini"></div>'],
 ['settings','02 / CONFIGURATION','THE<br>ROSTER.',`${registered} / 10 PLAYERS READY`,`<div class="mini-meter">${ids.map((p,i)=>`<i class="${i<registered?'':'off'}"></i>`).join('')}</div>`],
 ['round1','03 / ROUND ONE','TO<br>LIVE.',`${view.round1.games.filter(g=>g.ready).length} / 5 GAMES RECORDED`,'<div class="giant">01</div>'],
 ['round2','04 / ROUND TWO','TO<br>DIE.',`${view.round2.games.filter(g=>g.ready).length} / 8 GAMES RECORDED`,'<div class="giant">02</div>'],
 ['final','05 / THE FINAL','REBIRTH.',`${view.final.games.filter(g=>g.ready).length} / 10 GAMES RECORDED`,'<div class="giant">03</div>'],
 ['overview','06 / LIVE STANDINGS','THE<br>AFTERMATH.',`${money(view.awarded)} / PRIZES ASSIGNED`,'<div class="mini-podium"><span>2</span><span>1</span><span>3</span></div>']];
 $('#monitors').innerHTML=config.map(([k,no,name,sub,art])=>`<button class="monitor monitor-${k}" data-open="${k}" aria-label="Open ${tabs.find(t=>t[0]===k)[1]} monitor"><div class="monitor-face"><div class="screen-ticker"><span>BH / ${no}</span><span>● LIVE</span></div><div class="preview">${art}<h2>${name}</h2><p>${sub}</p></div><div class="screen-bottom"><span>${view[k]?.complete?'TRANSMISSION COMPLETE':'CLICK TO ENTER'}</span><span>↗</span></div></div><span class="bezel-label">BRAWL SYSTEMS / ${no.slice(0,2)}</span></button>`).join('');
}
// (a) A prominent, friendly 'what to do next' callout driven by the existing `next`
// computation and the current stage's first unmet issue, with a button that opens the
// relevant screen (reusing data-tab so the normal dispatcher handles it).
function nextStepBanner(next,finished){
 if(finished)return `<div class="notice next-step done"><div><div class="eyebrow">WHAT TO DO NEXT</div><strong>Tournament complete. Review the podium below.</strong></div></div>`;
 const tieIn=key=>view[key].rows.some(r=>r.status&&r.status.startsWith('TIE'));
 let msg,label,target=next;
 if(next==='settings'){msg='Start here: enter 10 unique player names.';label='Open Players & rules';}
 else if(next==='round1'){msg=tieIn('round1')?'Resolve the To Live tie (add extra games) before To Die.':(view.round1.issues[0]||'Score the five To Live games, then submit.');label='Open To Live';}
 else if(next==='round2'){msg=view.round2.issues[0]||'Draw sit-outs and play the eight To Die matches.';label='Open To Die';}
 else{msg=view.final.issues[0]||'Play the ten Rebirth games to decide the podium.';label='Open Rebirth';}
 return `<div class="notice next-step"><div><div class="eyebrow">WHAT TO DO NEXT</div><strong>${esc(msg)}</strong></div><button class="accent" data-tab="${target}">${label} ↗</button></div>`;
}
function overview(){
 const final=view.final, finished=final.complete; const next=!view.names_ok?'settings':!view.round1.complete?'round1':!view.round2.complete?'round2':'final';
 const done=[view.round1,view.round2,final].filter(r=>r.complete).length;
 let html=title('MONITOR 06 / LIVE FEED','Leaderboard','Run every round, track every player, and settle the podium.',finished?'TOURNAMENT COMPLETE':'TOURNAMENT IN PROGRESS');
 html+=nextStepBanner(next,finished);
 html+=`<div class="cards">${card('REGISTERED PLAYERS',Object.values(state.names).filter(v=>v.trim()).length,'10 tournament places')}${card('PRIZE POOL',money(view.pool),'Top 3 finishers')}${card('ROUNDS COMPLETE',`${done} / 3`,'Two cutting rounds + final')}${card('PRIZES ASSIGNED',money(view.awarded),'Tied prizes remain unassigned')}</div>`;
 html+=`<div class="round-path">${[['round1','01 · To Live','10 players → 8 survivors'],['round2','02 · To Die','8 players → 6 survivors'],['final','03 · Rebirth','6 players → 3 prize winners']].map(([k,t,d])=>`<button data-tab="${k}" class="${next===k?'accent':''}">${t}<small>${view[k].complete?'Complete':d}</small></button>`).join('')}</div>`;
 const podium=[1,2,3].map(rank=>{const row=final.rows.find(r=>r.rank===rank&&r.status==='FINAL');return `<div class="card"><label>${['1ST PLACE','2ND PLACE','3RD PLACE'][rank-1]}</label><strong>${row?esc(row.name):'Awaiting result'}</strong><div class="money">${money(state.settings.prizes[rank-1])}</div><small>${row?fmt(row.total)+' points':'Final standings decide this prize'}</small></div>`;}).join('');
 html+=panel('The podium',`<div class="podium">${podium}</div>`);
 const rowmap=key=>Object.fromEntries(view[key].rows.map(r=>[r.id,r]));const a=rowmap('round1'),b=rowmap('round2'),c=rowmap('final');
 html+=panel('Every player',table(['PLAYER','TO LIVE','TO DIE','FINAL RANK','TOTAL POINTS','PRIZE'],ids.map(p=>`<tr><td>${esc(state.names[p]||'Player '+(ids.indexOf(p)+1))}</td><td>${badge(a[p]?.status||'PENDING')}</td><td>${b[p]?badge(b[p].status):'—'}</td><td class="calc">${fmt(c[p]?.rank)}</td><td class="calc">${fmt(c[p]?.total)}</td><td class="calc">${c[p]?money(c[p].prize):'—'}</td></tr>`)),`<button data-action="csv">Export CSV</button>`);
 if(final.rows.length)html+=panel('Final standings',table(['RANK','PLAYER','WIN POINTS','GOAL POINTS','TOTAL','PRIZE','STATUS'],final.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${fmt(r.win_points)}</td><td class="calc">${fmt(r.goal_points)}</td><td class="calc">${fmt(r.total)}</td><td class="calc">${money(r.prize)}</td><td>${badge(r.status)}</td></tr>`)));
 return html;
}
function settings(){return title('MONITOR 02 / CONFIGURATION','Players & rules','Enter ten unique names. Scoring settings and prizes update throughout the tournament.')+`<div class="settings-grid">${panel('The roster',`<div class="name-grid">${ids.map((p,i)=>`<label><small>PLAYER ${String(i+1).padStart(2,'0')}</small>${inp('names.'+p,'Player '+(i+1)+' name','text')}</label>`).join('')}</div><p class="hint">Clearing the names blanks all ten slots only. Scoring, prizes, and every round score stay as they are. You can Undo this straight afterwards.</p><button class="danger" data-action="clear-names">Clear player names</button>`)}<div>${panel('Final scoring',[['win_points','Points per win'],['goal_points','Points per goal'],['multiplier','Games 1–2 multiplier']].map(([k,label])=>`<div class="field"><label>${label}</label>${inp('settings.'+k,label)}</div>`).join('')+'<div class="hint">The multiplier applies to win points and goal points in games 1 and 2 only.</div><p class="hint">Clearing scoring resets win points to 1, goal points to 1.5, and the games 1-2 multiplier to 2. Names, prizes, and round scores are untouched. You can Undo this straight afterwards.</p><button class="danger" data-action="clear-scoring">Clear scoring</button>')}${panel('Prize money',[0,1,2].map((i)=>`<div class="field"><label>${['1st','2nd','3rd'][i]} place ($)</label>${inp('settings.prizes.'+i,'Prize '+(i+1))}</div>`).join('')+`<div class="notice">Total prize pool: <b>${money(view.pool)}</b></div>`)}</div></div>`+notice(view.names_ok?[]:['Names must be filled in and unique before anyone advances.'])+panel('Start over','<p>Download a backup first if you want to keep this tournament.</p><button class="danger" data-action="reset-all">Clear tournament</button>');}
function extras(key){const stage=state[key],v=view[key];if(!v.rows.length)return '';
 let html='<p class="hint">Enter extra-game scores only for tied players. Their totals and averages include these games, but places stay tied until everyone in the group has a score (and W/L in Rebirth). If a tie remains, add another game for that remaining group. Already settled places stay fixed. Remove deletes one extra game; Clear all removes every extra game in this round. Either action can be undone.</p>';
 stage.extras.forEach((extra,i)=>{html+=`<div class="extra-head"><h3>Extra game ${i+1}</h3><button class="danger" data-action="remove-extra" data-stage="${key}" data-index="${i}">Remove</button></div><div class="extra-grid">${v.rows.map(r=>`<label>${esc(r.name)}<span class="game-pair">${key==='final'?inp(`${key}.extras.${i}.${r.id}.goals`,`${r.name} extra ${i+1} goals`)+select(`${key}.extras.${i}.${r.id}.result`,['W','L'],`${r.name} extra ${i+1} result`):inp(`${key}.extras.${i}.${r.id}`,`${r.name} extra ${i+1} goals`)}</span></label>`).join('')}</div>`;});
 const actions=`<button data-action="extra" data-stage="${key}" ${v.stale||!v.ready?'disabled':''}>+ Add extra game</button>${stage.extras.length?`<button class="danger" data-action="clear-extras" data-stage="${key}">Clear all extra games</button>`:''}`;
 return panel('Extra games',html,actions);
}
// Per-match submit + popup/fullscreen. Submitting a non-final match shows cumulative
// round standings THROUGH that match (computed client-side); submitting the last match
// shows the fullscreen total round ranking with ADVANCE/CUT/TIE and the add-extra flow.
const stageMeta={round1:{count:5,label:'To Live'},round2:{count:8,label:'To Die'},final:{count:10,label:'Rebirth'}};
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
 // To Live has no sit-out schedule; every player plays every game. Derive an
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
// The accent 'Submit Match N of X' panel for To Live and Rebirth (mirrors To Die's
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
 const v=view[key],meta=stageMeta[key];
 if(v.stale||!v.games[match]||!v.games[match].ready){error(v.stale?'Clear this round first — its player roster changed.':`Finish entering match ${match+1} scores and results first.`);return;}
 resultStage=key;resultMatch=match;resultFinal=(match===meta.count-1)&&v.games.every(g=>g.ready);
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
 let html=title('ROUND 01','To Live','Five games. Each game gets a fresh random 5v5 split (teams are cosmetic — ranking is by total goals). Top eight of ten advance.','10 → 8 PLAYERS')+notice(v.issues);
 html+=`<div class="games">${v.games.map(g=>`<div class="game ${g.ready?'ready':''}"><b>Game ${g.game}</b>A: ${g.counts.A}/5 · B: ${g.counts.B}/5</div>`).join('')}</div>`;
 round1Game=Math.min(round1Game,4);
 const g=round1Game,match=v.games[g].teams,rowmap=Object.fromEntries(v.rows.map(r=>[r.id,r]));
 html+=`<div class="match-tabs" aria-label="To Live match selector">${v.games.map((m,i)=>`<button data-r1-game="${i}" aria-pressed="${i===round1Game}" class="${i===round1Game?'active':''} ${m.ready?'ready':''}">G${i+1}</button>`).join('')}</div>`;
 const scored=v.games[g].counts.A+v.games[g].counts.B>0;
 const rerollOff=sitoutBusy||spinning||scored;
 const rerollWhy=scored?'This game already has scores. Clear them before reshuffling.':spinning?'Wait for the wheel to finish.':sitoutBusy?'Wait for the current draw to finish.':'';
 html+=`<div class="match-topline"><div><h2>Game ${g+1} <span class="stage-title-number">/ 5</span></h2><p>Fresh random teams for this game. Enter each player’s goals, including 0 for a game played with no goals.</p>${rerollOff&&rerollWhy?`<p class="hint reason">${esc(rerollWhy)}</p>`:''}</div><div class="match-topline-actions"><button class="danger" data-action="r1-reroll" data-match="${g}" ${rerollOff?`disabled title="${esc(rerollWhy)}" aria-disabled="true"`:''}>Reshuffle teams</button><button class="danger clear-score" data-action="clear-r1-game">Clear this game</button></div></div><div class="teams-grid">`;
 for(const team of ['A','B'])html+=`<section class="team-score team-${team.toLowerCase()}"><div class="team-head"><div><small>GAME ${g+1} / RANDOM SPLIT</small><h2>Team ${team}</h2></div></div>${match[team].map(p=>`<div class="player-score"><div class="player-name">${esc(rowmap[p].name)}<small>${fmt(rowmap[p].average)} GOALS / MATCH · ${playedLabel(rowmap[p].played,5)} PLAYED</small></div>${counter(`round1.players.${p}.goals.${g}`,`${rowmap[p].name} game ${g+1}`,v.stale)}</div>`).join('')}</section>`;
 html+='</div><p class="hint">Teams are reshuffled per game and do not affect scoring. Reshuffling is locked once a game has any score. All ten players play every game.</p>';
 html+=matchSubmit('round1',round1Game);
 html+=panel('Player scores',table(['PLAYER',...Array.from({length:5},(_,i)=>`G${i+1} GOALS`),'TOTAL','PLAYED','AVG / MATCH','RANK','DECISION'],v.rows.map(r=>`<tr><td>${esc(r.name)}</td>${Array.from({length:5},(_,i)=>`<td>${inp(`round1.players.${r.id}.goals.${i}`,`${r.name} game ${i+1} goals`)}</td>`).join('')}<td class="calc">${r.goals}</td><td class="calc">${r.played}</td><td class="calc">${r.average.toFixed(3)}</td><td class="calc">${fmt(r.rank)}</td><td>${badge(r.status)}</td></tr>`)),`<small>Top 8 of 10 advance</small>`);
 return html+extras('round1')+clearRoundPanel('round1');
}
function round2Page(){
 const v=view.round2;round2Game=Math.min(round2Game,Math.max(0,v.draw.revealed-1));const g=round2Game;
 let html=title('ROUND 02','To Die','Eight rotating 3v3 games. Everyone plays six and sits out two. The top six overall advance.','8 → 6 PLAYERS')+notice(v.issues);
 if(v.stale)return html+notice(['This roster changed since To Die was scored. Clearing To Die and Rebirth re-syncs them to the current survivors.'])+clearRoundPanel('round2');
 if(!v.rows.length)return html+panel('Waiting for survivors','<div class="empty">Finish To Live and resolve cut ties. The eight survivors will appear automatically.</div>')+clearRoundPanel('round2');
 if(!v.draw.order.length)return html+panel('Draw the first sit-outs',`<p>The dashboard randomly assigns the eight survivors to a balanced rotation. Everyone sits twice and plays six times.</p><button class="accent" data-action="r2-start" ${v.stale||sitoutBusy?'disabled':''}>Draw Match 1 sit-outs ↗</button>${v.stale||sitoutBusy?'<p class="hint">'+(v.stale?'Clear To Die first — the roster changed since this draw.':'Wait for the current draw to finish.')+'</p>':''}`)+clearRoundPanel('round2');
 html+=`<div class="score-help">AVERAGE = THIS ROUND’S GOALS / MATCHES PLAYED · Six matches each · Wins give no points</div>`;
 html+=`<div class="match-tabs" aria-label="Round 2 match selector">${v.games.map((m,i)=>{const off=i>=v.draw.revealed||sitoutBusy;const why=i>=v.draw.revealed?`Finish Match ${v.draw.completed+1} before opening Match ${i+1}.`:'Wait for the current draw to finish.';return `<button data-r2-game="${i}" ${off?`disabled title="${esc(why)}" aria-disabled="true"`:''} aria-pressed="${i===g}" class="${i===g?'active':''} ${m.ready?'ready':''}">G${i+1}</button>`;}).join('')}</div>`;
 const match=v.schedule[g],rowmap=Object.fromEntries(v.rows.map(r=>[r.id,r]));
 const r2ClearOff=v.stale||sitoutBusy,r2ClearWhy=v.stale?'Clear To Die first — the roster changed since this draw.':'Wait for the current draw to finish.';
 html+=`<div class="match-topline"><div><h2>Game ${g+1} <span class="stage-title-number">/ 8</span></h2><p>Use the scheduled teams. Enter six goal scores, including zeros.</p>${r2ClearOff?`<p class="hint reason">${esc(r2ClearWhy)}</p>`:''}</div><button class="danger clear-score" data-action="clear-r2-game" ${r2ClearOff?`disabled title="${esc(r2ClearWhy)}" aria-disabled="true"`:''}>Clear this game</button></div>`;
 html+=`<div class="notice"><b>SITTING OUT:</b> ${match.sit.map(p=>esc(state.names[p])).join(' · ')}. Their goal cells stay blank. <button data-action="r2-wheel" ${sitoutBusy?'disabled':''}>View sit-out wheel ↗</button></div><div class="teams-grid">`;
 for(const team of ['A','B'])html+=`<section class="team-score team-${team.toLowerCase()}"><div class="team-head"><div><small>GAME ${g+1} / ROTATING LINEUP</small><h2>Team ${team}</h2></div></div>${match[team].map(p=>`<div class="player-score"><div class="player-name">${esc(state.names[p])}<small>${fmt(rowmap[p].average)} GOALS / MATCH · ${playedLabel(rowmap[p].played,6)} PLAYED</small></div>${counter(`round2.players.${p}.goals.${g}`,`${state.names[p]} game ${g+1}`,v.stale||sitoutBusy)}</div>`).join('')}</section>`;
 html+='</div><p class="hint">A blank active-player score is still missing. A zero counts as played. Scheduled sit-outs never count as zero-goal matches. Round 1 scores do not carry over.</p>';
 const doneOff=sitoutBusy||v.stale||g!==v.draw.completed||!v.games[g].ready;
 const doneWhy=v.stale?'Clear To Die first — the roster changed since this draw.':sitoutBusy?'Wait for the current draw to finish.':g<v.draw.completed?`Match ${g+1} is already marked done. Open the latest match to continue.`:g>v.draw.completed?`Finish Match ${v.draw.completed+1} before opening this one.`:!v.games[g].ready?`Enter the six scheduled scores for Game ${g+1} first.`:'';
 html+=`<div class="panel match-completion"><div><h2>${v.draw.completed===8?'All 8 matches marked done':g<v.draw.completed?'This match is already marked done':`Match ${g+1} of 8`}</h2><p>${v.draw.completed===8?'Resolve any cut ties to open Rebirth.':'Enter the six scores, then draw the next pair of sit-outs.'}</p>${doneOff&&doneWhy?`<p class="hint reason">${esc(doneWhy)}</p>`:''}</div><button class="accent" data-action="r2-done" data-match="${g+1}" ${doneOff?`disabled title="${esc(doneWhy)}" aria-disabled="true"`:''}>${g===7?'Match 8 of 8 done — finish round':`Match ${g+1} of 8 done — draw next sit-outs`}</button></div>`;
 html+=panel('Overall standings',table(['RANK','PLAYER','TOTAL GOALS','PLAYED','SIT-OUTS DRAWN','AVG / MATCH','DECISION'],v.rows.map(r=>`<tr><td class="calc">${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${r.goals}</td><td class="calc">${playedLabel(r.played,6)}</td><td class="calc">${r.sit_outs}/2</td><td class="calc">${r.average.toFixed(3)}</td><td>${badge(r.status)}</td></tr>`)));
 html+=`<details><summary>View revealed rotations and sit-outs</summary><p class="hint">The saved draw guarantees six games and two sit-outs per person, with no consecutive sit-outs. Each player teams up with everyone once or twice and faces everyone two or three times. Refreshing keeps the same draw. ${v.draw.mode==='preserved'?'This round retains its existing schedule because scores were already entered.':''}</p>${table(['GAME','TEAM A','TEAM B','SIT OUT'],v.schedule.slice(0,v.draw.revealed).map(m=>`<tr><td>${m.game}</td><td>${m.A.map(p=>esc(state.names[p])).join(' · ')}</td><td>${m.B.map(p=>esc(state.names[p])).join(' · ')}</td><td>${m.sit.map(p=>esc(state.names[p])).join(' · ')}</td></tr>`))}</details>`;
 return html+extras('round2')+clearRoundPanel('round2');
}
function counter(path,label,disabled=false){return `<div class="counter"><button data-step="-1" data-target="${path}" aria-label="Subtract one goal for ${esc(label)}" ${disabled?'disabled':''}>−</button>${inp(path,label+' goals','number',disabled)}<button data-step="1" data-target="${path}" aria-label="Add one goal for ${esc(label)}" ${disabled?'disabled':''}>+</button></div>`;}
function finalPage(){const v=view.final,g=finalGame;
 let html=title('ROUND 03 / THE FINAL','Rebirth','Six finalists. Ten rotations. Every goal and win counts.',`GAMES 1 & 2 ×${fmt(state.settings.multiplier)}`)+notice(v.issues);
 if(v.stale)html+=notice(['This roster changed since Rebirth was scored. Clearing Rebirth re-syncs it to the current finalists.']);
 if(!v.rows.length)return html+panel('Waiting for finalists','<div class="empty">Finish To Die and resolve cut ties. Your six finalists will appear automatically.</div>')+clearRoundPanel('final');
 html+=`<div class="score-help">GOAL = ${fmt(state.settings.goal_points)} PTS / WIN = ${fmt(state.settings.win_points)} PTS · Games 1–2 ×${fmt(state.settings.multiplier)} · Games 3–10 ×1</div>`;
 html+=`<div class="match-tabs" aria-label="Final match selector">${v.games.map((m,i)=>`<button data-game="${i}" aria-pressed="${i===g}" class="${i===g?'active':''} ${m.ready?'ready':''}">G${i+1}${i<2?' ×'+fmt(state.settings.multiplier):''}</button>`).join('')}</div>`;
 const schedule=v.schedule[g],rowmap=Object.fromEntries(v.rows.map(r=>[r.id,r]));
 const fClearOff=v.stale||sitoutBusy,fClearWhy=v.stale?'Clear Rebirth first — the roster changed since these scores.':'Wait for the current draw to finish.';
 html+=`<div class="match-topline"><div><h2>Game ${g+1} <span class="stage-title-number">/ 10</span></h2><p>Enter each player’s goals, then mark the winning team.</p>${fClearOff?`<p class="hint reason">${esc(fClearWhy)}</p>`:''}</div><button class="danger clear-score" data-action="clear-game" ${fClearOff?`disabled title="${esc(fClearWhy)}" aria-disabled="true"`:''}>Clear this game</button></div><div class="teams-grid">`;
 for(const team of ['A','B']){
  const won=schedule[team].every(p=>state.final.players[p].results[g]==='W'),lost=schedule[team].every(p=>state.final.players[p].results[g]==='L');
  html+=`<section class="team-score team-${team.toLowerCase()}"><div class="team-head"><div><small>GAME ${g+1}</small><h2>Team ${team}</h2></div><button data-winner="${team}" aria-pressed="${won}" class="${won?'accent':''}" ${v.stale?`disabled title="${esc(v.issues[0]||'Clear Rebirth first — the roster changed since these scores.')}" aria-disabled="true"`:''}>${won?'✓ WIN RECORDED':lost?'LOSS RECORDED':'Mark win +1'}</button></div>${schedule[team].map(p=>`<div class="player-score"><div class="player-name">${esc(state.names[p])}<small>${fmt(rowmap[p].game_points[g])} POINTS THIS GAME</small></div>${counter(`final.players.${p}.goals.${g}`,`${state.names[p]} game ${g+1}`,v.stale||sitoutBusy)}</div>`).join('')}</section>`;
 }
 html+='</div><p class="hint">Marking the winner adds one win to each teammate and records a loss for each opponent. Enter 0 for a played game with no goals. Win and goal points calculate as you enter either value. Played counts complete goal/result pairs; prizes wait for all ten games.</p>';
 html+=panel('Live standings',table(['RANK','PLAYER','GOALS','WINS','PLAYED','WIN PTS','GOAL PTS','TOTAL PTS','PRIZE','STATUS'],v.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${r.goals}</td><td class="calc">${r.wins}</td><td class="calc">${r.played}</td><td class="calc">${fmt(r.win_points)}</td><td class="calc">${fmt(r.goal_points)}</td><td class="calc"><b>${fmt(r.total)}</b></td><td class="calc">${money(r.prize)}</td><td>${badge(r.status)}</td></tr>`)));
 html+=matchSubmit('final',g);
 html+=`<details><summary>View all ten team rotations</summary><p class="hint">Every pair are teammates four times and opponents six times. Slots and match order stay fixed. Double games still carry extra weight.</p>${table(['GAME','TEAM A','TEAM B','STATUS'],v.schedule.map(m=>`<tr><td>${m.game}${m.game<=2?' ×'+fmt(state.settings.multiplier):''}</td><td>${m.A.map(p=>esc(state.names[p])).join(' · ')}</td><td>${m.B.map(p=>esc(state.names[p])).join(' · ')}</td><td>${v.games[m.game-1].ready?'✓ COMPLETE':'PENDING'}</td></tr>`))}</details>`;
 html+=`<details><summary>View points per game</summary>${table(['PLAYER',...Array.from({length:10},(_,i)=>`G${i+1}`)],v.rows.map(r=>`<tr><td>${esc(r.name)}</td>${r.game_points.map(p=>`<td class="calc">${fmt(p)}</td>`).join('')}</tr>`))}</details>`;
 return html+extras('final')+clearRoundPanel('final');
}
function wheelPage(){if(wheelMode==='round2')return sitoutWheelPage();const names=wheelNames();
 return title('MONITOR 01 / RANDOM SELECT','Name your fate.','Add, change, or delete names below. Every line is one entry. This wheel has no fixed player limit.',`${names.length} ENTRIES`)+wheelModeTabs()+`<div class="wheel-layout"><section class="wheel-stage"><div class="wheel-wrap"><canvas id="wheel-canvas" width="880" height="880" aria-label="Name selection wheel"></canvas><button class="wheel-hub" data-action="spin" ${spinning||!names.length?`disabled${!names.length&&!spinning?' title="Add at least one name to spin." aria-disabled="true"':''}`:''}>${spinning?'…':'SPIN'}</button></div><div class="wheel-actions"><button class="accent" data-action="spin" ${spinning||!names.length?`disabled${!names.length&&!spinning?' title="Add at least one name to spin." aria-disabled="true"':''}`:''}>${spinning?'DRAWING…':'SPIN THE WHEEL ↗'}</button>${!names.length&&!spinning?'<p class="hint reason">Add at least one name to spin.</p>':''}</div><div id="wheel-result" class="wheel-result ${spinning?'is-spinning':''}" role="status" aria-live="polite"><small>${spinning?'THE WHEEL IS TURNING':wheelLast?'SELECTED ENTRY':'AWAITING YOUR DRAW'}</small><strong>${spinning?'WHO WILL IT BE?':wheelLast?esc(wheelLast.name):names.length?'Your next name awaits.':'Add names to begin.'}</strong>${wheelLast&&!spinning&&wheelLast.note?'<p class="hint">'+esc(wheelLast.note)+'</p>':''}${wheelLast&&!spinning?'<div class="toolbar"><button data-action="remove-winner" '+(wheelLast.removed?'disabled':'')+'>'+(wheelLast.removed?'Removed from wheel':'Remove this entry')+'</button><button data-action="roster-winner">Add to tournament roster</button></div>':''}</div><p class="draw-help">Spin to draw a random entry from the list. Remove the entry or add it to an empty tournament roster slot. To Live teams are split randomly per game on the To Live screen, so this wheel is a plain name draw.</p></section><section class="entry-editor"><div class="panel-head"><h2>The entry list</h2><span id="entry-count" class="count">${names.length} NAMES</span></div><label for="wheel-entries" class="hint">One name per line. Type or paste a list. Delete a line to remove an entry. Repeated names receive extra entries.</label><textarea id="wheel-entries" data-path="wheel.text" spellcheck="false" placeholder="Type a name, then press Enter…" ${spinning?'disabled':''}>${esc(state.wheel.text)}</textarea><div class="toolbar"><button data-action="wheel-roster" ${spinning?'disabled':''}>Use tournament names</button><button data-action="wheel-shuffle" ${spinning||names.length<2?'disabled':''}>Shuffle</button><button class="danger" data-action="wheel-clear" ${spinning||!names.length?'disabled':''}>Clear list</button></div><label class="field hint"><span>Remove each winner automatically</span><input type="checkbox" data-check="wheel.remove_winner" ${state.wheel.remove_winner?'checked':''} ${spinning?'disabled':''}></label><p class="hint">Names save automatically and are included in your tournament backup. Large lists remain selectable even when labels are too small to display.</p></section></div>`;
}
function wheelModeTabs(){return `<div class="toolbar wheel-modes"><button data-wheel-mode="free" class="${wheelMode==='free'?'accent':''}" ${spinning||sitoutBusy?'disabled':''}>Open name draw</button><button data-wheel-mode="round2" class="${wheelMode==='round2'?'accent':''}" ${spinning||sitoutBusy?'disabled':''}>To Die · sit-out draw</button></div>`;}
async function rerollRound1Game(game){
 if(sitoutBusy||spinning)return;
 sitoutBusy=true;
 // Snapshot the pre-reroll state so Undo can restore the prior split. The server
 // echo overwrites state below, so capture before the PUT and keep the snapshot.
 const snap={state:clone(state),label:'Undo: Reshuffle To Live Game '+(game+1)};
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
 let html=title('MONITOR 01 / TO DIE','Two sit out. Six play.','Automatic draws keep every player at exactly two sit-outs across eight matches.','BALANCED RANDOM DRAW')+wheelModeTabs();
 if(!view.round1.complete)return html+panel('Waiting for survivors','<p>Finish To Live and resolve cut ties. Only the eight survivors participate in this draw.</p>');
 if(v.stale)return html+notice(v.issues)+`<button data-tab="round2">Open To Die</button>`;
 if(!v.draw.order.length)return html+panel('Ready to draw','<p>Start once. The dashboard saves a randomized rotation and reveals two sit-outs for each match. The open name list does not change these eight players.</p><button class="accent" data-action="r2-start" '+(sitoutBusy?'disabled':'')+'>Draw Match 1 sit-outs ↗</button>');
 const pair=v.schedule[g].sit;
 html+=`<div class="wheel-layout"><section class="wheel-stage"><div class="wheel-wrap"><canvas id="wheel-canvas" width="880" height="880" aria-label="Round 2 sit-out wheel"></canvas><div class="wheel-hub sitout-hub">${sitoutAnimating?'DRAW':'SAVED'}</div></div><div class="wheel-result" role="status" aria-live="polite"><small>MATCH ${g+1} OF 8 / ${sitoutAnimating?'DRAWING TWO NAMES':'SITTING OUT'}</small><strong>${sitoutAnimating?'Who sits this match?':pair.map(p=>esc(state.names[p])).join('<br>')}</strong><button class="accent" data-action="r2-scores" ${sitoutBusy?'disabled':''}>Enter Match ${g+1} goals ↗</button></div><p class="draw-help">The wheel reveals a saved random rotation. The result stays the same if you refresh or reopen this screen.</p></section><section>${panel('Rest count',table(['PLAYER','SIT-OUTS DRAWN'],v.rows.map(r=>`<tr><td>${esc(r.name)}</td><td class="calc">${r.sit_outs} / 2</td></tr>`)))}<div class="notice">After entering all six goal scores, click <b>“Match ${g+1} of 8 done”</b> in To Die. The next pair appears here automatically. Nobody sits in consecutive matches.</div><p class="hint">${v.draw.mode==='preserved'?'Existing scores were detected, so this round keeps its original schedule. New rounds use a random draw.':'The app randomly assigns players to rotation slots once, then reveals the next pair after each completed match. This guarantees equal playing time.'}</p></section></div>`;
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
  wheelMode='round2';tab='wheel';spinning=true;sitoutAnimating=true;render();$('#screen-scroll').scrollTop=0;
  await animateSitoutPair();
  return true;
 }finally{spinning=false;sitoutAnimating=false;sitoutBusy=false;render();}
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
 if(spinning||sitoutBusy)return;spinning=true;
 try{
 await flush();const names=wheelNames();if(!names.length)return;
 const index=randomIndex(names.length);wheelLast=null;render();
 const step=2*Math.PI/names.length;
 const target=((-(index+.5)*step)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
 const start=wheelAngle,end=start+2*Math.PI*6+((target-start%(2*Math.PI)+2*Math.PI)%(2*Math.PI));
 const duration=reducedMotion()?0:4300;const started=performance.now();
 await new Promise(resolve=>{function frame(now){const t=duration?Math.min(1,(now-started)/duration):1;wheelAngle=start+(end-start)*(1-Math.pow(1-t,4));drawWheel(names,wheelAngle);if(t<1)requestAnimationFrame(frame);else resolve();}requestAnimationFrame(frame);});
 wheelAngle=target;wheelLast={name:names[index],index,removed:false,note:''};
 if(state.wheel.remove_winner){names.splice(index,1);state.wheel.text=names.join('\n');wheelLast.removed=true;changed();}
 }finally{spinning=false;render();}
}
function render(){
 if(!state)return;renderRoom();renderUndo();renderSaveControls();
 if(!$('#screen-dialog').open)return;
 const focus=captureInputFocus('#content');
 const scrollTop=$('#screen-scroll').scrollTop,scrolls=[...document.querySelectorAll('#content .scroll')].map(e=>e.scrollLeft);
 const openDetails=[...document.querySelectorAll('#content details')].map(d=>d.open);
 $('#nav').innerHTML=tabs.map(([k,label],i)=>`<button data-tab="${k}" class="${tab===k?'active':''}" aria-current="${tab===k?'page':'false'}"><b>0${i+1}</b>${label}<span>${view[k]?.complete?'✓':''}</span></button>`).join('');
 $('#breadcrumb').textContent=`BH / MONITOR 0${tabs.findIndex(t=>t[0]===tab)+1} / ${tabs.find(t=>t[0]===tab)[1].toUpperCase()}`;
 $('#content').innerHTML=(state.legacy_round2?'<div class="notice">Your old Round 2 and final are archived in the downloadable backup. To Die now uses eight rotating games, so those stages start fresh. To Live, names, the wheel, and settings are preserved.</div>':state.legacy_final?'<div class="notice">Your old five-game final is archived in the downloadable backup.</div>':'')+(tab==='overview'?overview():tab==='settings'?settings():tab==='final'?finalPage():tab==='wheel'?wheelPage():round(tab));
 [...document.querySelectorAll('#content .scroll')].forEach((e,i)=>e.scrollLeft=scrolls[i]||0);
 [...document.querySelectorAll('#content details')].forEach((e,i)=>e.open=openDetails[i]||false);
 $('#screen-scroll').scrollTop=scrollTop;
 if(tab==='wheel')drawWheel(wheelMode==='round2'?sitoutCandidates().map(p=>state.names[p]):wheelNames());
 restoreInputFocus('#content',focus);
}
async function openScreen(key,source){
 if(!state)return;if(spinning||sitoutBusy)return;await flush();tab=key;
 const dialog=$('#screen-dialog'),already=dialog.open;
 if(!already){lastMonitor=key;dialog.showModal();}render();$('#screen-scroll').scrollTop=0;
 if(!already&&source&&!reducedMotion()){
  const from=source.getBoundingClientRect(),to=dialog.getBoundingClientRect();
  dialog.animate([{transform:`translate(${from.left+from.width/2-to.left-to.width/2}px,${from.top+from.height/2-to.top-to.height/2}px) scale(${from.width/to.width},${from.height/to.height})`,opacity:.4},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:430,easing:'cubic-bezier(.2,.7,.2,1)'});
 }
 $('#close-screen').focus({preventScroll:true});
}
async function closeScreen(){
 if(spinning||sitoutBusy){error('Wait for the wheel to finish its draw.');return;}
 await flush();const dialog=$('#screen-dialog'),target=document.querySelector(`[data-open="${lastMonitor}"]`);
 if(target&&!reducedMotion()){
  const from=dialog.getBoundingClientRect(),to=target.getBoundingClientRect();
  await dialog.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${to.left+to.width/2-from.left-from.width/2}px,${to.top+to.height/2-from.top-from.height/2}px) scale(${to.width/from.width},${to.height/from.height})`,opacity:0}],{duration:280,easing:'ease-in'}).finished;
 }
 dialog.close();renderSaveControls();target?.focus({preventScroll:true});
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
  try{const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state,revision})});const data=await res.json();if(!res.ok)throw new Error(data.error);saveFailed=false;revision=data.revision;view=data.view;
   if(seq===editVersion){state=data.state;render();renderResult();}error('');$('#save-status').textContent=dirty?'Unsaved changes…':'All changes saved';$('#retry-save').hidden=true;
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
  state=data.state;view=data.view;revision=data.revision;resetWheelResult();error('');render();renderResult();$('#save-status').textContent='Undo applied';
 }catch(err){undoSnapshot=snap;renderUndo();throw err;}
}
const resetCascade=key=>key==='round1'?['round1','round2','final']:key==='round2'?['round2','final']:['final'];
// Human-readable labels for the per-round clear-round controls and their cascade.
const clearRoundLabel={round1:'Clear To Live',round2:'Clear To Die',final:'Clear Rebirth'};
const clearRoundCopy={round1:'Clear To Live (also clears To Die &amp; Rebirth)',round2:'Clear To Die (also clears Rebirth)',final:'Clear Rebirth'};
function resetStage(key){for(const k of resetCascade(key)){state[k].extras=[];state[k].roster=[];if(k==='round2')state[k].draw={order:[],revealed:0,completed:0,mode:'random'};if(k==='round1')state[k].lineups=[];for(const d of Object.values(state[k].players)){d.goals=Array(k==='final'?10:k==='round2'?8:5).fill(null);if(k==='final')d.results=Array(10).fill('');}}}
function markWinner(team,game=finalGame){const match=view.final.schedule[game];if(!match||view.final.stale)return;for(const t of ['A','B'])for(const p of match[t])state.final.players[p].results[game]=t===team?'W':'L';}
function resetWheelResult(){wheelLast=null;wheelAngle=0;}
document.addEventListener('input',e=>{const el=e.target;if(!el.dataset.path||el.tagName==='SELECT')return;if(!el.checkValidity()){error(el.validationMessage);return;}setValue(el.dataset.path,el.type==='number'?(el.value===''?null:Number(el.value)):el.value);if(el.dataset.path==='wheel.text')resetWheelResult();changed();});
document.addEventListener('change',e=>{const el=e.target;if(el.tagName==='SELECT'&&el.dataset.path){setValue(el.dataset.path,el.value);changed();}if(el.dataset.check){setValue(el.dataset.check,el.checked);changed();}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.disabled)return;try{
 if(b.dataset.open){await openScreen(b.dataset.open,b);return;}
 if(b.dataset.tab){await openScreen(b.dataset.tab);return;}
 if(b.dataset.wheelMode){if(spinning||sitoutBusy)return;await flush();wheelMode=b.dataset.wheelMode;render();return;}
 if(b.dataset.r2Game!==undefined){if(sitoutBusy||Number(b.dataset.r2Game)>=view.round2.draw.revealed)return;await flush();round2Game=Number(b.dataset.r2Game);render();return;}
 if(b.dataset.r1Game!==undefined){await flush();round1Game=Number(b.dataset.r1Game);render();return;}
 if(b.dataset.game!==undefined){await flush();finalGame=Number(b.dataset.game);render();return;}
 if(b.dataset.step){const current=value(b.dataset.target);setValue(b.dataset.target,Math.max(0,Math.min(100000,(current??0)+Number(b.dataset.step))));changed();await save();return;}
 if(b.dataset.winner){markWinner(b.dataset.winner);changed();await save();return;}
 const action=b.dataset.action,key=b.dataset.stage;
 if(action==='r1-reroll'){await rerollRound1Game(Number(b.dataset.match));return;}
 if(action==='r2-start'){await progressRound2('start');return;}
 if(action==='r2-done'){const match=Number(b.dataset.match),completed=await progressRound2('done',match);if(completed)await openMatchResult('round2',match-1);return;}
 if(action==='submit-match'){await flush();await openMatchResult(key,Number(b.dataset.match));return;}
 if(action==='close-result'){closeResult();return;}
 if(action==='r2-wheel'){wheelMode='round2';await openScreen('wheel');return;}
 if(action==='r2-scores'){await openScreen('round2');return;}
 if(action==='csv'){await flush();window.location='/api/standings.csv';}
 if(action==='extra'){state[key].extras.push(Object.fromEntries(ids.map(p=>[p,key==='final'?{goals:null,result:''}:null])));changed();await save();}
 if(action==='remove-extra'){await flush();const index=Number(b.dataset.index);doDestructive('Undo: Remove extra game '+(index+1),()=>{state[key].extras.splice(index,1);});await save();}
 if(action==='clear-extras'){await flush();doDestructive('Undo: Clear all extra games',()=>{state[key].extras=[];});await save();}
 if(action==='undo'){await performUndo();return;}
 if(action==='clear-r1-game'){await flush();const g=round1Game;doDestructive('Undo: Clear To Live Game '+(g+1),()=>{for(const p of ids)state.round1.players[p].goals[g]=null;});await save();}
 if(action==='clear-r2-game'){await flush();const g=round2Game;doDestructive('Undo: Clear To Die Game '+(g+1),()=>{for(const p of view.round2.rows.map(r=>r.id))state.round2.players[p].goals[g]=null;});await save();}
 if(action==='clear-game'){await flush();const g=finalGame;doDestructive('Undo: Clear Rebirth Game '+(g+1),()=>{for(const p of view.final.schedule[g].A.concat(view.final.schedule[g].B)){state.final.players[p].goals[g]=null;state.final.players[p].results[g]='';}});await save();}
 if(action==='clear-round'){await flush();doDestructive('Undo: '+clearRoundLabel[key],()=>resetStage(key));await save();}
 if(action==='clear-names'){await flush();doDestructive('Undo: Clear player names',()=>{for(const p of ids)state.names[p]='';});await save();}
 if(action==='clear-scoring'){await flush();doDestructive('Undo: Clear scoring',()=>{state.settings.win_points=1;state.settings.goal_points=1.5;state.settings.multiplier=2;});await save();}
 if(action==='reset-all'&&confirm('Clear the tournament and wheel? You can undo this, but downloading a backup first is safest.')){await flush();doDestructive('Undo: Clear tournament',()=>{state={version:4,wheel:{text:'',remove_winner:false},names:Object.fromEntries(ids.map(p=>[p,''])),settings:{win_points:1,goal_points:1.5,multiplier:2,prizes:[18,8,4]}};for(const k of ['round1','round2','final'])state[k]={roster:[],extras:[],...(k==='round2'?{draw:{order:[],revealed:0,completed:0,mode:'random'}}:k==='round1'?{lineups:[]}:{}),players:Object.fromEntries(ids.map(p=>[p,k==='final'?{goals:Array(10).fill(null),results:Array(10).fill('')}:k==='round2'?{goals:Array(8).fill(null)}:{goals:Array(5).fill(null)}]))};resetWheelResult();});await save();}
 if(action==='spin')await spinWheel();
 if(action==='wheel-clear'&&!spinning&&confirm('Remove every name from the wheel? Tournament players stay unchanged.')){state.wheel.text='';resetWheelResult();changed();await save();}
 if(action==='wheel-roster'&&!spinning){if(state.wheel.text.trim()&&!confirm('Replace the wheel list with the current tournament names?'))return;state.wheel.text=Object.values(state.names).filter(n=>n.trim()).join('\n');resetWheelResult();changed();await save();}
 if(action==='wheel-shuffle'&&!spinning){const names=wheelNames();for(let i=names.length-1;i>0;i--){const j=randomIndex(i+1);[names[i],names[j]]=[names[j],names[i]];}state.wheel.text=names.join('\n');resetWheelResult();changed();await save();}
 if(action==='remove-winner'&&wheelLast&&!wheelLast.removed){const names=wheelNames();names.splice(wheelLast.index,1);state.wheel.text=names.join('\n');wheelLast.removed=true;wheelAngle=0;changed();await save();}
 if(action==='roster-winner'&&wheelLast){const name=wheelLast.name;if(name.length>40)throw new Error('Tournament names must be 40 characters or fewer. Shorten this wheel entry first.');if(Object.values(state.names).some(n=>n.trim().toLowerCase()===name.toLowerCase()))throw new Error('That name is already on the tournament roster.');const p=ids.find(p=>!state.names[p].trim());if(!p)throw new Error('All ten tournament slots are filled. Change the roster in Players & rules.');state.names[p]=name;changed();await save();}
 }catch(err){error(err.message);}});
$('#close-screen').onclick=()=>closeScreen().catch(e=>error(e.message));
$('#screen-dialog').addEventListener('cancel',e=>{e.preventDefault();closeScreen().catch(err=>error(err.message));});
$('#result-dialog').addEventListener('cancel',e=>{e.preventDefault();closeResult();});
$('#home-link').onclick=e=>{e.preventDefault();if($('#screen-dialog').open)closeScreen().catch(err=>error(err.message));};
$('#retry-save').onclick=()=>save();
$('#undo-action').onclick=()=>performUndo().catch(e=>error(e.message));
$('#backup').onclick=async()=>{try{await flush();window.location='/api/backup';}catch(e){error(e.message);}};
$('#restore').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(spinning||sitoutBusy)throw new Error('Wait for the current draw to finish.');const parsed=JSON.parse(await file.text());if(!confirm('Replace the current tournament and wheel with this backup?'))return;await flush();const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state:parsed,revision,restore:true})});const data=await res.json();if(!res.ok)throw new Error(data.error);state=data.state;view=data.view;revision=data.revision;resetWheelResult();error('');render();$('#save-status').textContent='Backup restored and saved';}catch(err){error(err.message);}finally{e.target.value='';}};
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
function clock(){$('#room-clock').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});}clock();setInterval(clock,30000);
fetch('/api/state').then(r=>r.json()).then(data=>{({state,view,revision,token}=data);round2Game=Math.min(view.round2.draw.completed,7);render();$('#save-status').textContent='All changes saved';}).catch(e=>error('Cannot reach the Python app. '+e.message));
