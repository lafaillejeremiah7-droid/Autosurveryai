'use strict';
let state,view,revision,token,tab='settings',timer,dirty=false,saving=false,editVersion=0,saveFailed=false;
let lineupBusy=false;
let finalGame=0,round2Game=0,round1Game=0,lastMonitor=null,saveTask=null;
let resultStage=null,resultMatch=null,resultFinal=false;
const ids=Array.from({length:10},(_,i)=>`p${i+1}`);
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v===null||v===undefined?'—':Number(v).toLocaleString(undefined,{maximumFractionDigits:3});
const playedLabel=(n,regulation)=>n>regulation?`${regulation} + ${n-regulation} EXTRA`:`${n}/${regulation}`;
const money=v=>v===null||v===undefined?'Unassigned':Number(v).toLocaleString('en-US',{style:'currency',currency:'USD'});
const tabs=[['settings','Players & rules'],['round1','Know Thy Nature'],['round2','Adapt or Wither'],['final','The Last Bloom'],['overview','Leaderboard']];
const roman=['I','II','III','IV','V'];
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Royal garden audio: birds, shear snaps, compost impacts and floral fanfares. No recordings.
window.BrawlAudio=(()=>{
 let ctx=null,muted=false,active=new Set(),lastRoar=0,lastArrived=false,birdsOn=false,lastChirp=0,nextChirpGap=0;
 function unlock(){try{const C=window.AudioContext||window.webkitAudioContext;if(!ctx&&C)ctx=new C();ctx?.resume();}catch{}}
 document.addEventListener('pointerdown',unlock);document.addEventListener('keydown',unlock);
 const silent=()=>muted||!ctx||ctx.state!=='running'||document.hidden;
 const track=n=>{active.add(n);n.onended=()=>active.delete(n);return n;};
 // Every start time is on the audio clock (currentTime+delay), so stop() also cancels pending notes.
 function tone(freq,duration,volume,type='sine',end=freq,delay=0){if(silent())return null;const t0=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t0);o.frequency.exponentialRampToValueAtTime(Math.max(1,end),t0+duration);g.gain.setValueAtTime(volume,t0);g.gain.exponentialRampToValueAtTime(.001,t0+duration);o.connect(g);g.connect(ctx.destination);o.start(t0);o.stop(t0+duration);return track(o);}
 function noise(duration,volume,frequency,delay=0){if(silent())return null;const t0=ctx.currentTime+delay,b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=b.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/data.length,2);const source=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();source.buffer=b;f.type='lowpass';f.frequency.value=frequency;g.gain.value=volume;source.connect(f);f.connect(g);g.connect(ctx.destination);source.start(t0);return track(source);}
 // Cornu-style brass: two slightly detuned sawtooths through a soft lowpass.
 function brass(freq,dur,vol,delay=0){
  if(silent())return null;
  const t0=ctx.currentTime+delay,f=ctx.createBiquadFilter(),g=ctx.createGain();
  f.type='lowpass';f.frequency.value=2200;
  g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(vol,t0+.02);g.gain.setValueAtTime(vol,t0+dur);g.gain.linearRampToValueAtTime(0,t0+dur+.12);
  f.connect(g);g.connect(ctx.destination);
  let first=null;
  for(const cents of [0,4]){const o=ctx.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(freq*Math.pow(2,cents/1200),t0);o.connect(f);o.start(t0);o.stop(t0+dur+.12);track(o);first=first||o;}
  return first;
 }
 // Crowd voice: shaped noise through a wide bandpass.
 function crowd(dur,vol,center,delay=0){
  if(silent())return null;
  const t0=ctx.currentTime+delay,len=Math.max(1,Math.ceil(ctx.sampleRate*dur)),b=ctx.createBuffer(1,len,ctx.sampleRate),data=b.getChannelData(0);
  for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*Math.pow(Math.sin(Math.PI*i/len),.7);
  const source=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
  source.buffer=b;f.type='bandpass';f.frequency.value=center;f.Q.value=.7;g.gain.value=vol;
  source.connect(f);f.connect(g);g.connect(ctx.destination);source.start(t0);
  return track(source);
 }
 function stop(){for(const n of active)try{n.stop();}catch{}active.clear();birdsOn=false;}
 function roar(big=false){return noise(big?2.4:1.4,big?.10:.055,600);} // Wind rising through the hedges
 function cheer(big=false){const a=roar(big);if(!a)return null;const notes=big?[392,494,587,784,1047]:[392,494,587];notes.forEach((hz,i)=>tone(hz,.5,.035,'sine',hz*.97,i*.15));return a;}
 function boo(){if(silent())return null;for(let i=0;i<3;i++)tone(260-i*45,.6,.045,'triangle',132-i*22,i*.12);return noise(.65,.06,420);}
 function horn(){const a=brass(196,1.1,.06);brass(293.66,1.1,.05);return a;}
 function fanfare(){const notes=[392,523.25,659.25,783.99];let first=null;notes.forEach((hz,i)=>{const n=tone(hz,.85,.06,'sine',hz*.99,i*.19);first=first||n;});return first;}
 function hook(){return tone(900,.6,.05,'sine',300);}
 function shears(){noise(.18,.30,3600);tone(980,.12,.12,'square',220);tone(140,.24,.11,'triangle',45,.07);}
 function compost(){noise(.55,.24,230);tone(63,.55,.17,'sine',32);}
 function slam(){const a=noise(.35,.2,300);tone(60,.4,.15,'sine',40);return a;}
 function victory(){const a=fanfare();cheer(true);return a;}
 // Rising wind and soft chimes build toward the Garden Opens countdown.
 // The cadence advances even while muted so unmuting never releases a backlog.
 function ambience(progress,arrived){
  const n=Number(progress);progress=Number.isFinite(n)?Math.min(1,Math.max(0,n)):0;arrived=!!arrived;
  const allowed=!muted&&ctx?.state==='running'&&!document.hidden;
  if(!arrived)lastArrived=false;
  const now=Date.now();
  if(arrived&&!lastArrived){lastArrived=true;lastRoar=now;if(allowed){fanfare();roar(true);}return 'begin';}
  if(progress>=.65&&now-lastRoar>(arrived?4500:10000-6000*progress)){lastRoar=now;const big=progress>.9;if(allowed)roar(big);return big?'big':'roar';}
  if(progress>=.3&&progress<.65&&now-lastRoar>7000){lastRoar=now;if(allowed)noise(1.8,.035,440);return 'murmur';}
  return null;
 }
 // A single morning birdsong phrase: a few quick, high, frequency-swept blips.
 function chirp(){if(muted||!ctx||ctx.state!=='running'||document.hidden)return;const base=1850+Math.random()*1500,blips=2+Math.floor(Math.random()*3);for(let i=0;i<blips;i++){const f=base*(.78+Math.random()*.5);tone(f,.06+Math.random()*.05,.03,'sine',f*(1.25+Math.random()*.5));}}
 return {unlock,stop,roar,cheer,boo,horn,fanfare,hook,slam,shears,compost,victory,ambience,
 // Gentle birdsong through the morning garden. The world tick passes
 // on=true only during the low-progress morning; chirps obey mute and document.hidden
 // and stop when the countdown intensifies or the player mutes them.
 ambientBirds(on){if(!on){birdsOn=false;return;}if(muted||document.hidden||!ctx||ctx.state!=='running')return;const now=Date.now();if(!birdsOn){birdsOn=true;lastChirp=now;nextChirpGap=0;}if(now-lastChirp>=nextChirpGap){chirp();lastChirp=now;nextChirpGap=1400+Math.random()*2600;}},
 toggle(){muted=!muted;if(muted)stop();else unlock();const b=$('#sound-toggle');if(b){b.textContent=muted?'Garden sound off':'Garden sound on';b.setAttribute('aria-pressed',String(!muted));}return !muted;},getStatus(){return {muted,unlocked:ctx?.state==='running'};}};
})();
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
// When either side reaches the three-goal match limit, the game is over.
// Remaining blank player scores on BOTH sides become zero, never overwriting
// an entered number. This applies to all three rounds, not extra games.
function zeroUnscoredPlayersAfterMatchEnd(key,g){
 const teams=gameTeams(key,g);
 if(!teams?.A?.length||!teams?.B?.length)return [];
 const totals=teamGoals(key,g,teams);
 if(totals.A!==3&&totals.B!==3)return [];
 const filled=[];
 for(const p of [...teams.A,...teams.B]){
  if(state[key].players[p].goals[g]!==null)continue;
  state[key].players[p].goals[g]=0;
  filled.push(`${key}.players.${p}.goals.${g}`);
 }
 // Update every visible score input immediately, including Round 1's
 // duplicate player-score inputs in its standings table.
 if(filled.length){
  const paths=new Set(filled);
  for(const el of document.querySelectorAll('input[data-path]')){
   if(paths.has(el.dataset.path))el.value='0';
  }
 }
 return filled;
}
function enterGoal(path,n){
 const rule=goalRule(path),old=value(path);
 if(rule&&n!==null&&n>rule.max&&!(old!==null&&old>rule.max&&n<=old)){error(rule.message);return false;}
 setValue(path,n);
 const match=path.match(/^(round1|round2|final)\.players\.p\d+\.goals\.(\d+)$/);
 if(match)zeroUnscoredPlayersAfterMatchEnd(match[1],Number(match[2]));
 return true;
}
function refreshGoalControls(){
 for(const el of document.querySelectorAll('input[data-path]')){const rule=goalRule(el.dataset.path);if(rule)el.max=Math.max(rule.max,value(el.dataset.path)||0);}
 for(const b of document.querySelectorAll('button[data-step]')){const rule=goalRule(b.dataset.target);if(!rule)continue;const key=b.dataset.target.split('.')[0],n=value(b.dataset.target)||0;b.disabled=!!view[key].stale||lineupBusy||(Number(b.dataset.step)>0?n>=rule.max:n<=0);}
 for(const el of document.querySelectorAll('[data-score-stage]')){const totals=teamGoals(el.dataset.scoreStage,Number(el.dataset.scoreGame));el.textContent=`Team A ${totals.A} : ${totals.B} Team B`;}
}
function matchScoreboard(key,g){const totals=teamGoals(key,g);return `<div class="notice match-score"><strong data-score-stage="${key}" data-score-game="${g}">Team A ${totals.A} : ${totals.B} Team B</strong><span>First to 3 ends the match: remaining blank player goals become 0 automatically.</span></div>`;}
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
const clearRoundBlurb={round1:'Clears Know Thy Nature and every later round (Adapt or Wither and The Last Bloom). Earlier rounds do not exist for Know Thy Nature, so nothing before it is touched.',round2:'Clears Adapt or Wither and The Last Bloom. Know Thy Nature and its results are kept.',final:'Clears The Last Bloom only. Know Thy Nature and Adapt or Wither are kept.'};
function clearRoundPanel(key){return panel('Clear this round','<p class="hint">'+clearRoundBlurb[key]+' You can Undo this straight afterwards.</p><button class="danger" data-action="clear-round" data-stage="'+key+'">'+clearRoundCopy[key]+'</button>');}
function roomLock(key){
 if(key==='round1')return view.names_ok?'':'Enter ten unique player names in Players & rules.';
 if(key==='round2')return !view.names_ok?'Enter ten unique player names first.':view.round1.complete?'':'Finish Know Thy Nature and resolve its cut ties.';
 if(key==='final')return !view.names_ok?'Enter ten unique player names first.':!view.round1.complete?'Finish Know Thy Nature and resolve its cut ties.':view.round2.complete?'':'Finish Adapt or Wither and resolve its cut ties.';
 return '';
}
function lockAttrs(key){const reason=roomLock(key);return reason?' disabled aria-disabled="true" title="'+esc(reason)+'"':'';}
function gateStages(){
 const setup={key:'settings',label:'Players & rules',status:view.names_ok?'complete':'current',detail:view.names_ok?'Roster ready · rules editable':'Enter ten unique names'};
 return [setup,...[['round1','Know Thy Nature'],['round2','Adapt or Wither'],['final','The Last Bloom']].map(([key,label])=>{
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
  ['settings',roman[0],'Players & rules',registered+' / 10 PLAYERS READY'],
  ['round1',roman[1],'Know Thy Nature',view.round1.games.filter(g=>g.ready).length+' / 5 MATCHES'],
  ['round2',roman[2],'Adapt or Wither',view.round2.games.filter(g=>g.ready).length+' / 5 MATCHES'],
  ['final',roman[3],'The Last Bloom',view.final.games.filter(g=>g.ready).length+' / 8 MATCHES'],
  ['overview',roman[4],'Leaderboard',money(view.awarded)+' AWARDED']
 ];
 const stages=gateStages(),stageMap=Object.fromEntries(stages.map(s=>[s.key,s]));
 const route=$('#gate-route');
 if(route)route.innerHTML=stages.map((s,i)=>'<button data-open="'+s.key+'" class="route-stop '+s.status+'" '+lockAttrs(s.key)+' '+(s.status==='current'?'aria-current="step"':'')+'><small>'+roman[i]+' / '+s.status.toUpperCase()+'</small><strong>'+s.label+'</strong><span>'+esc(s.detail)+'</span></button>').join('');
 window.CityWorld?.setTournament?.(stages);
 $('#monitors').innerHTML=rooms.map(([key,no,label,sub])=>'<button class="city-room '+(stageMap[key]?.status||'')+'" data-open="'+key+'" '+lockAttrs(key)+' aria-label="Enter '+label+' pavilion"><span class="room-entry">'+(roomLock(key)?'LOCKED':'ENTER PAVILION ↗')+'</span><span class="room-label"><small>PAVILION '+no+' / '+(stageMap[key]?.status.toUpperCase()||'OPEN')+'</small><strong>'+label+'</strong><span>'+esc(roomLock(key)||sub)+'</span></span></button>').join('');
 window.BrawlMonuments?.render(view);
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
 else if(next==='round1'){msg=tieIn('round1')?'Resolve the Know Thy Nature tie (add extra games) before Adapt or Wither.':(view.round1.issues[0]||'Score the five Know Thy Nature games, then submit.');label='Open Know Thy Nature';}
 else if(next==='round2'){msg=view.round2.issues[0]||'Play five 4v4 games with changing teams; reshuffle before entering scores for a game.';label='Open Adapt or Wither';}
 else{msg=view.final.issues[0]||'Survive eight final matches. Only the last bloom wins $40.';label='Open The Last Bloom';}
 return `<div class="notice next-step"><div><div class="eyebrow">WHAT TO DO NEXT</div><strong>${esc(msg)}</strong></div><button class="accent" data-tab="${target}">${label} ↗</button></div>`;
}
function overview(){
 const final=view.final, finished=final.complete; const next=!view.names_ok?'settings':!view.round1.complete?'round1':!view.round2.complete?'round2':'final';
 const done=[view.round1,view.round2,final].filter(r=>r.complete).length;
 let html=title('PAVILION V / LIVE FEED','Leaderboard','Run every round, track every player, and settle the podium.',finished?'TOURNAMENT COMPLETE':'TOURNAMENT IN PROGRESS');
 html+=nextStepBanner(next,finished);
 html+=`<div class="cards">${card('REGISTERED PLAYERS',Object.values(state.names).filter(v=>v.trim()).length,'10 tournament places')}${card('CHAMPION PRIZE',money(view.pool),'Only 1st place wins')}${card('ROUNDS COMPLETE',`${done} / 3`,'Two cutting rounds + final')}${card('WINNER PAID',money(view.awarded),'No payout while first place is tied')}</div>`;
 html+=`<div class="round-path">${[['round1','01 · Know Thy Nature','Understand your roots · 10 → 8'],['round2','02 · Adapt or Wither','Survive through change · 8 → 6'],['final','03 · The Last Bloom','Only one flower survives · 6 → 1']].map(([k,t,d])=>`<button data-tab="${k}" ${lockAttrs(k)} class="${next===k?'accent':''}">${t}<small>${view[k].complete?'Complete':d}</small></button>`).join('')}</div>`;
 html+='<section id="screen-podium" aria-label="Live final podium"></section>';
 const rowmap=key=>Object.fromEntries(view[key].rows.map(r=>[r.id,r]));const a=rowmap('round1'),b=rowmap('round2'),c=rowmap('final');
 html+=panel('Every player',table(['PLAYER','KNOW THY NATURE','ADAPT OR WITHER','FINAL RANK','TOTAL POINTS','PRIZE'],ids.map(p=>`<tr><td>${esc(state.names[p]||'Player '+(ids.indexOf(p)+1))}</td><td>${badge(a[p]?.status||'PENDING')}</td><td>${b[p]?badge(b[p].status):'—'}</td><td class="calc">${fmt(c[p]?.rank)}</td><td class="calc">${fmt(c[p]?.total)}</td><td class="calc">${c[p]?money(c[p].prize):'—'}</td></tr>`)),`<button data-action="csv">Export CSV</button>`);
 if(final.rows.length)html+=panel('Final standings',table(['RANK','PLAYER','WIN POINTS','GOAL POINTS','TOTAL','PRIZE','STATUS'],final.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${fmt(r.win_points)}</td><td class="calc">${fmt(r.goal_points)}</td><td class="calc">${fmt(r.total)}</td><td class="calc">${money(r.prize)}</td><td>${badge(r.status)}</td></tr>`)));
 return html;
}
function playerSettings(){return title('PAVILION I / CONFIGURATION','Players & rules','Enter ten unique names. Scoring settings and prizes update throughout the tournament.')+`<div class="settings-grid">${panel('The roster',`<div class="name-grid">${ids.map((p,i)=>`<label><small>PLAYER ${String(i+1).padStart(2,'0')}</small>${inp('names.'+p,'Player '+(i+1)+' name','text')}</label>`).join('')}</div><p class="hint">Clearing the names blanks all ten slots only. Scoring, prizes, and every round score stay as they are. You can Undo this straight afterwards.</p><button class="danger" data-action="clear-names">Clear player names</button>`)}<div>${panel('Final scoring',[['win_points','Points per win'],['goal_points','Points per goal'],['multiplier','Games 1–2 multiplier']].map(([k,label])=>`<div class="field"><label>${label}</label>${inp('settings.'+k,label)}</div>`).join('')+'<div class="hint">The multiplier applies to win points and goal points in games 1 and 2 only.</div><p class="hint">Clearing scoring resets win points to 1, goal points to 1.5, and the games 1-2 multiplier to 2. Names, prizes, and round scores are untouched. You can Undo this straight afterwards.</p><button class="danger" data-action="clear-scoring">Clear scoring</button>')}${panel('Winner-take-all prize','<div class="notice"><strong>$40 · FIRST PLACE ONLY</strong><p>One champion earns the entire $40. All other players receive $0. If first place is tied, resolve it with extra games before the prize is awarded.</p></div>')}</div></div>`+notice(view.names_ok?[]:['Names must be filled in and unique before anyone advances.'])+panel('Start over','<p>Download a backup first if you want to keep this tournament.</p><button class="danger" data-action="reset-all">Clear tournament</button>');}

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
 return '<section class="panel settings-countdown"><div class="panel-head"><h2>Games countdown</h2></div><form id="countdown-form"><label for="starts-at">Tournament starts · '+esc(zone)+'<input id="starts-at" data-path="settings.start_at" type="datetime-local" required min="1970-01-01T00:00" max="9999-12-31T23:59" step="60" value="'+esc(current)+'" aria-describedby="start-help"></label><button type="submit" class="accent">Save countdown</button><button type="button" class="danger" data-action="clear-start" '+(!state.settings.start_at?'disabled':'')+'>Clear countdown</button></form><p id="start-help">A changed start time empties the stands. Spectators arrive throughout the countdown and the crowd reaches full bloodlust at zero. Refreshing keeps the crowd. Pause arena stops motion, not the timer.</p></section>';
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
 let html='<p class="hint">Enter extra-game scores only for tied players. Their totals and averages include these games, but places stay tied until everyone in the group has a score (and W/L in The Last Bloom). If a tie remains, add another game for that remaining group. Already settled places stay fixed. Remove deletes one extra game; Clear all removes every extra game in this round. Either action can be undone.</p>';
 stage.extras.forEach((_,i)=>{html+=`<div class="extra-head"><h3>Extra game ${i+1}</h3><button class="danger" data-action="remove-extra" data-stage="${key}" data-index="${i}">Remove</button></div><div class="extra-grid">${v.rows.map(r=>`<label>${esc(r.name)}<span class="game-pair">${key==='final'?inp(`${key}.extras.${i}.${r.id}.goals`,`${r.name} extra ${i+1} goals`)+select(`${key}.extras.${i}.${r.id}.result`,['W','L'],`${r.name} extra ${i+1} result`):inp(`${key}.extras.${i}.${r.id}`,`${r.name} extra ${i+1} goals`)}</span></label>`).join('')}</div>`;});
 const actions=`<button data-action="extra" data-stage="${key}" ${v.stale||!v.ready?'disabled':''}>+ Add extra game</button>${stage.extras.length?`<button class="danger" data-action="clear-extras" data-stage="${key}">Clear all extra games</button>`:''}`;
 return panel('Extra games',html,actions);
}
// Per-match submit + popup/fullscreen. Submitting a non-final match shows cumulative
// round standings THROUGH that match (computed client-side); submitting the last match
// shows the fullscreen total round ranking with ADVANCE/CUT/TIE and the add-extra flow.
const stageMeta={round1:{count:5,label:'Know Thy Nature'},round2:{count:5,label:'Adapt or Wither'},final:{count:8,label:'The Last Bloom'}};
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
 // Know Thy Nature has no sit-out schedule; every player plays every game. Derive an
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
// The accent 'Submit Match N of X' panel for Know Thy Nature and The Last Bloom (mirrors Adapt or Wither's
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
 // there are players to eliminate, play the verdict cutscene BEFORE the standings.
 // An unresolved tie (v.complete false) falls through to the normal extra-game fullscreen.
 if(resultFinal&&v.complete){
  const names=eliminatedNames(key);
  if(names.length)await playCutscene(names,meta.label,key);
 }
 showResultDialog();
}
function showResultDialog(){
 const dialog=$('#result-dialog');
 dialog.classList.toggle('fullscreen',resultFinal);
 if(!dialog.open)dialog.showModal();
 renderResult();
 if(!reducedMotion())dialog.animate([{opacity:0,transform:'scale(.97)'},{opacity:1,transform:'scale(1)'}],{duration:resultFinal?360:220,easing:'cubic-bezier(.2,.7,.2,1)'});
 const first=$('#result-content').querySelector('.result-close');first?.focus({preventScroll:true});
}
// The full round ranking for a settled stage, shown after a cutscene that a save
// (not a Submit click) started.
function showRoundStandings(key){
 resultStage=key;resultMatch=stageMeta[key].count-1;resultFinal=true;
 showResultDialog();
}
function closeResult(){
 const dialog=$('#result-dialog');resultStage=null;resultFinal=false;dialog.classList.remove('fullscreen');dialog.close();
 renderSaveControls();
}
function round(key){
 if(key==='round2')return round2Page();
 const v=view.round1;
 let html=title('ROUND 01 · THE ROOTS','Know Thy Nature','The first principle: growth begins with understanding your own roots. Confront your weaknesses, study your mistakes, and change your play. Across five 5v5 games, only eight of ten take root.','10 → 8 PLAYERS')+notice(v.issues);
 html+=`<div class="games">${v.games.map(g=>`<div class="game ${g.ready?'ready':''}"><b>Game ${g.game}</b>A: ${g.counts.A}/5 · B: ${g.counts.B}/5</div>`).join('')}</div>`;
 round1Game=Math.min(round1Game,4);
 html+=matchScoreboard('round1',round1Game);
 const g=round1Game,match=v.games[g].teams,rowmap=Object.fromEntries(v.rows.map(r=>[r.id,r]));
 html+=`<div class="match-tabs" aria-label="Know Thy Nature match selector">${v.games.map((m,i)=>`<button data-r1-game="${i}" aria-pressed="${i===round1Game}" class="${i===round1Game?'active':''} ${m.ready?'ready':''}">G${i+1}</button>`).join('')}</div>`;
 const scored=v.games[g].counts.A+v.games[g].counts.B>0;
 const rerollOff=lineupBusy||scored;
 const rerollWhy=scored?'This game already has scores. Clear them before reshuffling.':lineupBusy?'Wait for the current draw to finish.':'';
 html+=`<div class="match-topline"><div><h2>Game ${g+1} <span class="stage-title-number">/ 5</span></h2><p>Fresh random teams for this game. Enter each player’s goals, including 0 for a game played with no goals.</p>${rerollOff&&rerollWhy?`<p class="hint reason">${esc(rerollWhy)}</p>`:''}</div><div class="match-topline-actions"><button class="danger" data-action="r1-reroll" data-match="${g}" ${rerollOff?`disabled title="${esc(rerollWhy)}" aria-disabled="true"`:''}>Reshuffle teams</button><button class="danger clear-score" data-action="clear-r1-game">Clear this game</button></div></div><div class="teams-grid">`;
 for(const team of ['A','B'])html+=`<section class="team-score team-${team.toLowerCase()}"><div class="team-head"><div><small>GAME ${g+1} / RANDOM SPLIT</small><h2>Team ${team}</h2></div></div>${match[team].map(p=>`<div class="player-score"><div class="player-name">${esc(rowmap[p].name)}<small>${fmt(rowmap[p].average)} GOALS / MATCH · ${playedLabel(rowmap[p].played,5)} PLAYED</small></div>${counter(`round1.players.${p}.goals.${g}`,`${rowmap[p].name} game ${g+1}`,v.stale)}</div>`).join('')}</section>`;
 html+='</div><p class="hint">Teams are reshuffled per game and share a 3-goal allowance. Individual totals decide advancement. Reshuffling is locked once a game has any score. All ten players play every game.</p>';
 html+=matchSubmit('round1',round1Game);
 html+=panel('Player scores',table(['PLAYER',...Array.from({length:5},(_,i)=>`G${i+1} GOALS`),'TOTAL','PLAYED','AVG / MATCH','RANK','DECISION'],v.rows.map(r=>`<tr><td>${esc(r.name)}</td>${Array.from({length:5},(_,i)=>`<td>${inp(`round1.players.${r.id}.goals.${i}`,`${r.name} game ${i+1} goals`)}</td>`).join('')}<td class="calc">${r.goals}</td><td class="calc">${r.played}</td><td class="calc">${r.average.toFixed(3)}</td><td class="calc">${fmt(r.rank)}</td><td>${badge(r.status)}</td></tr>`)),`<small>Top 8 of 10 advance</small>`);
 return html+extras('round1')+clearRoundPanel('round1');
}
function round2Page(){
 const v=view.round2;round2Game=Math.min(round2Game,Math.max(0,v.draw.revealed-1));const g=round2Game;
 let html=title('ROUND 02 · NATURAL SELECTION','Adapt or Wither','Nature rewards those who change with their environment. Abandon familiar habits, adapt to unfamiliar teammates, and survive five shifting 4v4 games. Only six of eight remain.','8 → 6 PLAYERS')+notice(v.issues);
 if(v.stale)return html+notice(['The survivor list changed. Clear this round and the final to generate new 4v4 matchups.'])+clearRoundPanel('round2');
 if(!v.rows.length)return html+panel('Waiting for survivors','<div class="empty">Finish Know Thy Nature. The eight survivors enter five varied 4v4 matches.</div>')+clearRoundPanel('round2');
 if(!v.draw.order.length)return html+panel('Draw 4v4 matchups','<p>Create five different 4v4 team assignments. No player sits out, and you can reshuffle the next game before recording any goals.</p><button class="accent" data-action="r2-start" '+(lineupBusy?'disabled':'')+'>Generate balanced 4v4 games ↗</button>')+clearRoundPanel('round2');
 html+='<div class="score-help">FIVE 4v4 GAMES · CHANGING TEAMS · ALL EIGHT PLAY EVERY GAME · INDIVIDUAL GOALS DECIDE ADVANCEMENT</div>';
 html+=`<div class="match-tabs" aria-label="Round 2 match selector">${v.games.map((m,i)=>{const off=i>=v.draw.revealed||lineupBusy;const why=i>=v.draw.revealed?`Finish Game ${v.draw.completed+1} first.`:'Wait for the current save.';return `<button data-r2-game="${i}" ${off?`disabled title="${esc(why)}" aria-disabled="true"`:''} aria-pressed="${i===g}" class="${i===g?'active':''} ${m.ready?'ready':''}">G${i+1}</button>`;}).join('')}</div>`;
 const match=v.schedule[g],rowmap=Object.fromEntries(v.rows.map(r=>[r.id,r]));
 html+=matchScoreboard('round2',g);
 const scored=Object.values(state.round2.players).some(p=>p.goals[g]!==null);
 const canReshuffle=!v.stale&&!lineupBusy&&g===v.draw.completed&&!scored;
 const reshuffleWhy=g<v.draw.completed?'This match is already complete.':g!==v.draw.completed?'Finish the previous match first.':scored?'This game has scores. Clear them before reshuffling.':'';
 html+=`<div class="match-topline"><div><h2>Game ${g+1} <span class="stage-title-number">/ 5</span></h2><p>Balanced 4v4 teams may change every game. Enter all eight scores, including 0 for no goals.</p>${!canReshuffle&&reshuffleWhy?`<p class="hint reason">${esc(reshuffleWhy)}</p>`:''}</div><div class="match-topline-actions"><button class="accent" data-action="r2-reroll" data-match="${g}" ${canReshuffle?'':`disabled title="${esc(reshuffleWhy)}" aria-disabled="true"`}>Reshuffle teams</button><button class="danger clear-score" data-action="clear-r2-game" ${v.stale||lineupBusy?'disabled':''}>Clear this game</button></div></div>`;
 html+='<div class="teams-grid">';
 for(const t of ['A','B'])html+=`<section class="team-score team-${t.toLowerCase()}"><div class="team-head"><div><small>GAME ${g+1} / BALANCED 4v4</small><h2>Team ${t}</h2></div></div>${match[t].map(p=>`<div class="player-score"><div class="player-name">${esc(state.names[p])}<small>${fmt(rowmap[p].average)} GOALS / MATCH · ${playedLabel(rowmap[p].played,5)} PLAYED</small></div>${counter(`round2.players.${p}.goals.${g}`,`${state.names[p]} game ${g+1}`,v.stale||lineupBusy)}</div>`).join('')}</section>`;
 html+='</div><p class="hint">Players rotate between the two 4v4 teams across games; you can reshuffle an unscored upcoming game. All eight players compete in all five matches. Each team may score at most 3 per match; team wins do not affect individual advancement.</p>';
 const doneOff=lineupBusy||v.stale||g!==v.draw.completed||!v.games[g].ready;
 const why=g<v.draw.completed?'This match is already done.':g>v.draw.completed?`Finish Match ${v.draw.completed+1} first.`:'Enter all eight scores, including zeros.';
 html+=`<div class="panel match-completion"><div><h2>${v.draw.completed===5?'All 5 matches marked done':`Match ${g+1} of 5`}</h2><p>${v.draw.completed===5?'Resolve any cut ties to unlock the final.':'Save eight scores to unlock the next game.'}</p></div><button class="accent" data-action="r2-done" data-match="${g+1}" ${doneOff?`disabled title="${esc(why)}"`:''}>${g===4?'Match 5 of 5 done — finish round':`Match ${g+1} of 5 done — next game`}</button></div>`;
 html+=panel('Overall standings',table(['RANK','PLAYER','TOTAL GOALS','PLAYED','AVG / MATCH','DECISION'],v.rows.map(r=>`<tr><td class="calc">${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${r.goals}</td><td class="calc">${playedLabel(r.played,5)}</td><td class="calc">${r.average.toFixed(3)}</td><td>${badge(r.status)}</td></tr>`)));
 html+=`<details><summary>View all five 4v4 matchups</summary><p class="hint">Matchups change to reduce repeated teammates, are stored in the tournament, and remain the same after refreshing.</p>${table(['GAME','TEAM A','TEAM B'],v.schedule.map(m=>`<tr><td>${m.game}</td><td>${m.A.map(p=>esc(state.names[p])).join(' · ')}</td><td>${m.B.map(p=>esc(state.names[p])).join(' · ')}</td></tr>`))}</details>`;
 return html+extras('round2')+clearRoundPanel('round2');
}

function counter(path,label,disabled=false){const n=value(path)||0,rule=goalRule(path);return `<div class="counter"><button data-step="-1" data-target="${path}" aria-label="Subtract one goal for ${esc(label)}" ${disabled||n<=0?'disabled':''}>−</button>${inp(path,label+' goals','number',disabled)}<button data-step="1" data-target="${path}" aria-label="Add one goal for ${esc(label)}" ${disabled||(rule&&n>=rule.max)?'disabled':''}>+</button></div>`;}
function finalPage(){const v=view.final,g=finalGame;
 let html=title('ROUND 03 · THE WILL TO LIVE','The Last Bloom','Six reach the final garden, but only one can bloom. Stay composed, act decisively, and endure eight 3v3 matches. First place alone receives $40; the other five receive $0.',`GAMES 1 & 2 ×${fmt(state.settings.multiplier)}`)+notice(v.issues);
 html+='<section id="screen-podium" aria-label="Live final podium"></section>';
 if(v.stale)html+=notice(['This roster changed since The Last Bloom was scored. Clearing The Last Bloom re-syncs it to the current finalists.']);
 if(!v.rows.length)return html+panel('Waiting for finalists','<div class="empty">Finish Adapt or Wither and resolve cut ties. Your six finalists will appear automatically.</div>')+clearRoundPanel('final');
 html+=`<div class="score-help">GOAL = ${fmt(state.settings.goal_points)} PTS / WIN = ${fmt(state.settings.win_points)} PTS · Games 1–2 ×${fmt(state.settings.multiplier)} · Games 3–8 ×1</div>`;
 html+=`<div class="match-tabs" aria-label="Final match selector">${v.games.map((m,i)=>`<button data-game="${i}" aria-pressed="${i===g}" class="${i===g?'active':''} ${m.ready?'ready':''}">G${i+1}${i<2?' ×'+fmt(state.settings.multiplier):''}</button>`).join('')}</div>`;
 const schedule=v.schedule[g],rowmap=Object.fromEntries(v.rows.map(r=>[r.id,r]));
 html+=matchScoreboard('final',g);
 const fClearOff=v.stale||lineupBusy,fClearWhy=v.stale?'Clear The Last Bloom first — the roster changed since these scores.':'Wait for the current draw to finish.';
 html+=`<div class="match-topline"><div><h2>Game ${g+1} <span class="stage-title-number">/ 8</span></h2><p>Enter each player’s goals, then mark the winning team.</p>${fClearOff?`<p class="hint reason">${esc(fClearWhy)}</p>`:''}</div><button class="danger clear-score" data-action="clear-game" ${fClearOff?`disabled title="${esc(fClearWhy)}" aria-disabled="true"`:''}>Clear this game</button></div><div class="teams-grid">`;
 for(const team of ['A','B']){
  const won=schedule[team].every(p=>state.final.players[p].results[g]==='W'),lost=schedule[team].every(p=>state.final.players[p].results[g]==='L');
  html+=`<section class="team-score team-${team.toLowerCase()}"><div class="team-head"><div><small>GAME ${g+1}</small><h2>Team ${team}</h2></div><button data-winner="${team}" aria-pressed="${won}" class="${won?'accent':''}" ${v.stale?`disabled title="${esc(v.issues[0]||'Clear The Last Bloom first — the roster changed since these scores.')}" aria-disabled="true"`:''}>${won?'✓ WIN RECORDED':lost?'LOSS RECORDED':'Mark win +1'}</button></div>${schedule[team].map(p=>`<div class="player-score"><div class="player-name">${esc(state.names[p])}<small>${fmt(rowmap[p].game_points[g])} POINTS THIS GAME</small></div>${counter(`final.players.${p}.goals.${g}`,`${state.names[p]} game ${g+1}`,v.stale||lineupBusy)}</div>`).join('')}</section>`;
 }
 html+='</div><p class="hint">Marking the winner adds one win to each teammate and records a loss for each opponent. Enter 0 for a played game with no goals. Win and goal points calculate as you enter either value. Played counts complete goal/result pairs; prizes wait for all eight games.</p>';
 html+=panel('Live standings',table(['RANK','PLAYER','GOALS','WINS','PLAYED','WIN PTS','GOAL PTS','TOTAL PTS','PRIZE','STATUS'],v.rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}</td><td class="calc">${r.goals}</td><td class="calc">${r.wins}</td><td class="calc">${r.played}</td><td class="calc">${fmt(r.win_points)}</td><td class="calc">${fmt(r.goal_points)}</td><td class="calc"><b>${fmt(r.total)}</b></td><td class="calc">${money(r.prize)}</td><td>${badge(r.status)}</td></tr>`)));
 html+=matchSubmit('final',g);
 html+=`<details><summary>View all eight team rotations</summary><p class="hint">Eight different team splits are played. Everyone plays eight matches, with changing teammates and opponents. Slots and match order stay fixed. Games 1 and 2 carry double weight at the default multiplier.</p>${table(['GAME','TEAM A','TEAM B','STATUS'],v.schedule.map(m=>`<tr><td>${m.game}${m.game<=2?' ×'+fmt(state.settings.multiplier):''}</td><td>${m.A.map(p=>esc(state.names[p])).join(' · ')}</td><td>${m.B.map(p=>esc(state.names[p])).join(' · ')}</td><td>${v.games[m.game-1].ready?'✓ COMPLETE':'PENDING'}</td></tr>`))}</details>`;
 html+=`<details><summary>View points per game</summary>${table(['PLAYER',...v.schedule.map(m=>`G${m.game}`)],v.rows.map(r=>`<tr><td>${esc(r.name)}</td>${r.game_points.map(p=>`<td class="calc">${fmt(p)}</td>`).join('')}</tr>`))}</details>`;
 return html+extras('final')+clearRoundPanel('final');
}
async function rerollRound1Game(game){
 if(lineupBusy)return;
 lineupBusy=true;
 // Snapshot the pre-reroll state so Undo can restore the prior split. The server
 // echo overwrites state below, so capture before the PUT and keep the snapshot.
 const snap={state:clone(state),label:'Undo: Reshuffle Know Thy Nature Game '+(game+1)};
 try{
  await flush();
  const res=await fetch('/api/round1-lineup',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({action:'reroll',game:game+1,revision})});
  const data=await res.json();if(!res.ok)throw new Error(data.error);
  ({state,view,revision}=data);undoSnapshot=snap;$('#save-status').textContent='Teams reshuffled';error('');
 }catch(err){error(err.message);}finally{lineupBusy=false;render();}
}
async function progressRound2(action,game){
 if(lineupBusy)return false;
 const snap=action==='reroll'?{state:clone(state),label:'Undo: Reshuffle Adapt or Wither Game '+game}:null;
 lineupBusy=true;
 try{
  await flush();
  const res=await fetch('/api/round2-draw',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({action,game,revision})});
  const data=await res.json();if(!res.ok)throw new Error(data.error);
  ({state,view,revision}=data);round2Game=action==='reroll'?game-1:Math.min(view.round2.draw.completed,4);
  if(snap)undoSnapshot=snap;
  tab='round2';$('#save-status').textContent=action==='start'?'Five matchups generated':action==='reroll'?'Teams reshuffled':'Match completed';error('');
  return true;
 }finally{lineupBusy=false;render();}
}

function render(){
 if(!state)return;renderRoom();renderUndo();renderSaveControls();
 if(!$('#screen-dialog').open)return;
 if(roomLock(tab))tab=!view.names_ok?'settings':!view.round1.complete?'round1':'round2';
 const focus=captureInputFocus('#content');
 const scrollTop=$('#screen-scroll').scrollTop,scrolls=[...document.querySelectorAll('#content .scroll')].map(e=>e.scrollLeft);
 const openDetails=[...document.querySelectorAll('#content details')].map(d=>d.open);
 $('#nav').innerHTML=tabs.map(([k,label],i)=>`<button data-tab="${k}" ${lockAttrs(k)} class="${tab===k?'active':''}" aria-current="${tab===k?'page':'false'}"><b>${roman[i]}</b>${label}<span>${view[k]?.complete?'✓':''}</span></button>`).join('');
 $('#breadcrumb').textContent=`BH / PAVILION ${roman[tabs.findIndex(t=>t[0]===tab)]} / ${tabs.find(t=>t[0]===tab)[1].toUpperCase()}`;
 $('#content').innerHTML=((state.legacy_round2_rotation||state.legacy_round2)?'<div class="notice">Your old Round 2 and final are archived in the downloadable backup. Adapt or Wither uses five 4v4 games with reshuffled teams. Any prior incompatible round scores are archived. Know Thy Nature, names, and settings are preserved.</div>':state.legacy_final?'<div class="notice">Your old five-game final is archived in the downloadable backup.</div>':'')+(tab==='overview'?overview():tab==='settings'?settings():tab==='final'?finalPage():round(tab));
 window.BrawlMonuments?.renderScreen(view);
 [...document.querySelectorAll('#content .scroll')].forEach((e,i)=>e.scrollLeft=scrolls[i]||0);
 [...document.querySelectorAll('#content details')].forEach((e,i)=>e.open=openDetails[i]||false);
 $('#screen-scroll').scrollTop=scrollTop;
 
 restoreInputFocus('#content',focus);
}
async function openScreen(key){
 if(!state||lineupBusy||roomTransition||cutsceneActive)return;
 roomTransition=true;
 try{
  await flush();
  const locked=roomLock(key);if(locked){error(locked);return;}
  tab=key;
  const dialog=$('#screen-dialog'),already=dialog.open;
  lastMonitor=key;
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
 if(lineupBusy){error('Wait for the current operation to finish.');return;}
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
 const undo=$('#undo-action');if(undo)undo.disabled=lineupBusy;
}
function error(message){$('#error').hidden=!message;$('#error').textContent=message||'';
 // Native dialogs are in the top layer: put errors inside the TOPMOST open one.
 const parent=$('#result-dialog').open?$('#result-dialog'):$('#screen-dialog').open?$('.screen-shell'):document.body;if($('#error').parentElement!==parent)parent.appendChild($('#error'));
}
// View before the first save whose response has not yet been applied (see save()).
let settleBaseView=null;
// The earliest stage that a save moved from ready-but-tied to settled, or null.
// Requiring prev.ready keeps the last regulation score from playing early; that
// path plays on Submit / Match done instead.
function settledByEdit(prev,next){
 if(!prev||!next)return null;
 return ['round1','round2','final'].find(k=>prev[k]?.ready&&!prev[k].complete&&next[k]?.complete&&!next[k].stale)||null;
}
function changed(){dirty=true;saveFailed=false;editVersion++;$('#save-status').textContent='Unsaved changes…';clearTimeout(timer);timer=setTimeout(save,250);}
async function save(){
 clearTimeout(timer);if(saving)return saveTask;if(!dirty)return;
 saving=true;dirty=false;const seq=editVersion;$('#save-status').textContent='Saving…';
 saveTask=(async()=>{
  settleBaseView??=view;
  try{const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state,revision})});const data=await res.json();if(!res.ok)throw new Error(data.error);
   // Extra games (from the round screen or the result fullscreen) may settle a round
   // after its last scheduled match. Detect the ready-but-tied -> complete transition
   // against the view from before the first unapplied save, so a superseded save defers
   // the check instead of losing it.
   let settled=null;
   if(seq===editVersion){settled=settledByEdit(settleBaseView,data.view);settleBaseView=null;}
   saveFailed=false;revision=data.revision;view=data.view;
   if(seq===editVersion){state=data.state;render();renderResult();}error('');$('#save-status').textContent=dirty?'Unsaved changes…':'All changes saved';$('#retry-save').hidden=true;
   const names=settled&&!cutsceneActive?eliminatedNames(settled):[];
   if(names.length)playCutscene(names,stageMeta[settled].label,settled).then(()=>{if(view[settled]?.complete&&!($('#result-dialog').open&&resultFinal&&resultStage===settled))showRoundStandings(settled);});
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
 if(!undoSnapshot||lineupBusy)return;
 // Keep the snapshot until the restore has actually persisted. If flush() or the PUT
 // throws, leave undoSnapshot in place and re-render the Undo button so the user can
 // retry instead of losing the restored state.
 const snap=undoSnapshot,prior=snap.state;
 // Undo may restore saved lineups that differs from the server's current draw
 // (e.g. undoing a Clear that blanked the draw). The normal save path rejects an edited
 // draw, so persist through the restore flag like a backup restore does.
 try{
  await flush();
  const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state:prior,revision,restore:true})});
  const data=await res.json();if(!res.ok)throw new Error(data.error);
  undoSnapshot=null;
  state=data.state;view=data.view;revision=data.revision;countdownDraft=null;error('');render();renderResult();$('#save-status').textContent='Undo applied';
 }catch(err){undoSnapshot=snap;renderUndo();throw err;}
}
const resetCascade=key=>key==='round1'?['round1','round2','final']:key==='round2'?['round2','final']:['final'];
// Human-readable labels for the per-round clear-round controls and their cascade.
const clearRoundLabel={round1:'Clear Know Thy Nature',round2:'Clear Adapt or Wither',final:'Clear The Last Bloom'};
const clearRoundCopy={round1:'Clear Know Thy Nature (also clears Adapt or Wither &amp; The Last Bloom)',round2:'Clear Adapt or Wither (also clears The Last Bloom)',final:'Clear The Last Bloom'};
function resetStage(key){for(const k of resetCascade(key)){state[k].extras=[];state[k].roster=[];if(k==='round2')state[k].draw={order:[],lineups:[],revealed:0,completed:0,mode:'random'};if(k==='round1')state[k].lineups=[];for(const d of Object.values(state[k].players)){d.goals=Array(k==='final'?8:5).fill(null);if(k==='final')d.results=Array(8).fill('');}}}
function markWinner(team,game=finalGame){const match=view.final.schedule[game];if(!match||view.final.stale)return;for(const t of ['A','B'])for(const p of match[t])state.final.players[p].results[game]=t===team?'W':'L';}
document.addEventListener('input',e=>{const el=e.target;if(el.id==='starts-at'){countdownDraft=el.value;return;}if(!el.dataset.path||el.tagName==='SELECT')return;const next=el.type==='number'?(el.value===''?null:Number(el.value)):el.value,rule=goalRule(el.dataset.path);if(rule&&next!==null&&Number.isFinite(next)&&next>=0&&Number.isInteger(next)){if(!enterGoal(el.dataset.path,next)){el.value=value(el.dataset.path)??'';return;}}else{if(!el.checkValidity()){error(el.validationMessage);return;}setValue(el.dataset.path,next);const match=el.dataset.path.match(/^(round1|round2|final)\.players\.p\d+\.goals\.(\d+)$/);if(match)zeroUnscoredPlayersAfterMatchEnd(match[1],Number(match[2]));}refreshGoalControls();changed();});
document.addEventListener('change',e=>{const el=e.target;if(el.tagName==='SELECT'&&el.dataset.path){setValue(el.dataset.path,el.value);changed();}if(el.dataset.check){setValue(el.dataset.check,el.checked);changed();}});
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.disabled)return;try{if(b.id==='sound-toggle'){window.BrawlAudio.toggle();return;}if(b.dataset.action==='edit-start'){await setStartTime();return;}worldClick(e);
 if(b.dataset.open){await openScreen(b.dataset.open);return;}
 if(b.dataset.tab){await openScreen(b.dataset.tab);return;}
 if(b.dataset.r2Game!==undefined){if(lineupBusy||Number(b.dataset.r2Game)>=view.round2.draw.revealed)return;await flush();round2Game=Number(b.dataset.r2Game);render();return;}
 if(b.dataset.r1Game!==undefined){await flush();round1Game=Number(b.dataset.r1Game);render();return;}
 if(b.dataset.game!==undefined){await flush();finalGame=Number(b.dataset.game);render();return;}
 if(b.dataset.step){const current=value(b.dataset.target);if(!enterGoal(b.dataset.target,Math.max(0,(current??0)+Number(b.dataset.step))))return;refreshGoalControls();changed();await save();return;}
 if(b.dataset.winner){markWinner(b.dataset.winner);changed();await save();return;}
 const action=b.dataset.action,key=b.dataset.stage;
 if(['street-home','visit-podium'].includes(action)){if(roomTransition||cutsceneActive)return;await flush();roomTransition=true;try{$('#walkway-view')?.scrollIntoView?.({block:'center',behavior:'instant'});if(action==='street-home')await window.CityWorld?.home();else await window.CityWorld?.visit('podium');}finally{roomTransition=false;}return;}
 if(action==='clear-start'){await flush();doDestructive('Undo: Clear countdown',()=>{state.settings.start_at='';state.settings.disaster_started_at='';countdownDraft=null;});await save();return;}
 if(action==='r1-reroll'){await rerollRound1Game(Number(b.dataset.match));return;}
 if(action==='r2-start'){await progressRound2('start');return;}
  if(action==='r2-reroll'){await progressRound2('reroll',Number(b.dataset.match)+1);return;}
 if(action==='r2-done'){const match=Number(b.dataset.match),completed=await progressRound2('done',match);if(completed)await openMatchResult('round2',match-1);return;}
 if(action==='submit-match'){await flush();await openMatchResult(key,Number(b.dataset.match));return;}
 if(action==='close-result'){closeResult();return;}
 
 
 if(action==='csv'){await flush();window.location='/api/standings.csv';}
 if(action==='extra'){state[key].extras.push(Object.fromEntries(ids.map(p=>[p,key==='final'?{goals:null,result:''}:null])));changed();await save();}
 if(action==='remove-extra'){await flush();const index=Number(b.dataset.index);doDestructive('Undo: Remove extra game '+(index+1),()=>{state[key].extras.splice(index,1);});await save();}
 if(action==='clear-extras'){await flush();doDestructive('Undo: Clear all extra games',()=>{state[key].extras=[];});await save();}
 if(action==='undo'){await performUndo();return;}
 if(action==='clear-r1-game'){await flush();const g=round1Game;doDestructive('Undo: Clear Know Thy Nature Game '+(g+1),()=>{for(const p of ids)state.round1.players[p].goals[g]=null;});await save();}
 if(action==='clear-r2-game'){await flush();const g=round2Game;doDestructive('Undo: Clear Adapt or Wither Game '+(g+1),()=>{for(const p of view.round2.rows.map(r=>r.id))state.round2.players[p].goals[g]=null;});await save();}
 if(action==='clear-game'){await flush();const g=finalGame;doDestructive('Undo: Clear The Last Bloom Game '+(g+1),()=>{for(const p of view.final.schedule[g].A.concat(view.final.schedule[g].B)){state.final.players[p].goals[g]=null;state.final.players[p].results[g]='';}});await save();}
 if(action==='clear-round'){await flush();doDestructive('Undo: '+clearRoundLabel[key],()=>resetStage(key));await save();}
 if(action==='clear-names'){await flush();doDestructive('Undo: Clear player names',()=>{for(const p of ids)state.names[p]='';});await save();}
 if(action==='clear-scoring'){await flush();doDestructive('Undo: Clear scoring',()=>{state.settings.win_points=1;state.settings.goal_points=1.5;state.settings.multiplier=2;});await save();}
 if(action==='reset-all'&&confirm('Clear the tournament? You can undo this, but downloading a backup first is safest.')){await flush();doDestructive('Undo: Clear tournament',()=>{countdownDraft=null;state={version:6,wheel:{text:'',remove_winner:false},names:Object.fromEntries(ids.map(p=>[p,''])),settings:{win_points:1,goal_points:1.5,multiplier:2,prizes:[18,8,4],start_at:'',disaster_started_at:''}};for(const k of ['round1','round2','final'])state[k]={roster:[],extras:[],...(k==='round2'?{draw:{order:[],lineups:[],revealed:0,completed:0,mode:'random'}}:k==='round1'?{lineups:[]}:{}),players:Object.fromEntries(ids.map(p=>[p,k==='final'?{goals:Array(8).fill(null),results:Array(8).fill('')}:{goals:Array(5).fill(null)}]))};});await save();}
 }catch(err){error(err.message);}});
$('#close-screen').onclick=()=>closeScreen().catch(e=>error(e.message));
$('#screen-dialog').addEventListener('cancel',e=>{e.preventDefault();closeScreen().catch(err=>error(err.message));});
$('#result-dialog').addEventListener('cancel',e=>{e.preventDefault();closeResult();});
$('#home-link').onclick=e=>{e.preventDefault();if($('#screen-dialog').open)closeScreen().catch(err=>error(err.message));};
$('#retry-save').onclick=()=>save();
// Ceremony HUD Skip, cutscene Skip and click-anywhere all route through the single endCutscene path.
if($('#ceremony-skip'))$('#ceremony-skip').onclick=()=>endCutscene();
$('#cutscene-skip').onclick=e=>{e.stopPropagation();endCutscene();};
$('#cutscene').onclick=()=>endCutscene();
$('#cutscene').addEventListener('cancel',e=>{e.preventDefault();endCutscene();});
$('#undo-action').onclick=()=>performUndo().catch(e=>error(e.message));
$('#backup').onclick=async()=>{try{await flush();window.location='/api/backup';}catch(e){error(e.message);}};
$('#restore').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(lineupBusy)throw new Error('Wait for the current operation to finish.');const parsed=JSON.parse(await file.text());if(!confirm('Replace the current tournament with this backup?'))return;await flush();const res=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':token},body:JSON.stringify({state:parsed,revision,restore:true})});const data=await res.json();if(!res.ok)throw new Error(data.error);state=data.state;view=data.view;revision=data.revision;undoSnapshot=null;countdownDraft=null;round1Game=0;round2Game=Math.min(view.round2.draw.completed,4);finalGame=0;error('');render();renderResult();$('#save-status').textContent='Backup restored and saved';}catch(err){error(err.message);}finally{e.target.value='';}};
window.addEventListener('beforeunload',e=>{if(dirty||saving){e.preventDefault();e.returnValue='';}});
function updateCountdown(){
 if(state)window.CityWorld?.setSettings(state.settings);
 const target=state?.settings?.start_at, box=$('#countdown');
 if(!box)return;
 if(!target){if($('#schedule-label'))$('#schedule-label').textContent='SET START TIME';const card=$('.games-clock');if(card)card.dataset.phase='unset';['days','hours','minutes','seconds'].forEach(k=>{const e=$('#countdown-'+k);if(e)e.textContent='--';});$('#countdown-phase').textContent='AWAITING START TIME';$('#games-status').textContent='Set a start time. The garden will open.';if(box.setAttribute)box.setAttribute('aria-label','Tournament start time is not set');return;}
 const ms=Math.max(0,new Date(target).getTime()-Date.now()), total=Math.ceil(ms/1000);
 const d=Math.floor(total/86400),h=Math.floor(total%86400/3600),m=Math.floor(total%3600/60),sec=total%60;
 [['days',d],['hours',h],['minutes',m],['seconds',sec]].forEach(([k,v])=>{const e=$('#countdown-'+k);if(e)e.textContent=String(v).padStart(2,'0');});
 const started=ms<=0;$('#countdown-phase').textContent=started?'THE GARDEN IS OPEN':'THE GARDEN OPENS IN';$('#games-status').textContent=started?'THE GARDEN IS OPEN. Enter the pavilions.':'Garden opens '+new Date(target).toLocaleString([], {dateStyle:'medium',timeStyle:'short'});if(box.setAttribute)box.setAttribute('aria-label',started?'The garden is open':'Tournament starts in '+d+' days '+h+' hours '+m+' minutes '+sec+' seconds');
 if($('#schedule-label'))$('#schedule-label').textContent='CHANGE START TIME';const card=$('.games-clock');if(card)card.dataset.phase=started?'started':'waiting';
}
async function setStartTime(){
 await openScreen('settings');
 const field=$('#starts-at');field?.focus({preventScroll:true});field?.scrollIntoView({block:'center',behavior:reducedMotion()?'instant':'smooth'});
}
function clock(){$('#room-clock').textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});updateCountdown();}clock();setInterval(clock,1000);
// Shared guard: true while the elimination cutscene owns the screen.
let cutsceneActive=false;
const worldClick=e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='world-toggle'){const paused=document.body.classList.toggle('world-paused');b.setAttribute('aria-pressed',String(paused));const span=b.querySelector&&b.querySelector('span');if(span)span.textContent=paused?'Resume garden':'Pause garden';if(b.firstChild)b.firstChild.textContent=paused?'▶ ':'Ⅱ ';window.CityWorld?.setPaused(paused);}};

// Elimination cutscene: the gardener's shears and compost heap. Plays BEFORE the end-of-round
// fullscreen standings, once per settled round when its final match is submitted.
// Cut players are decided by the engine. In the winner-take-all final,
// the sole first-place champion survives; all five other finalists are pruned.
function eliminatedNames(key){
 const v=view&&view[key];if(!v||!v.rows)return [];
 const byRank=(a,b)=>(a.rank||99)-(b.rank||99);
 const rows=key==='final'
  ?[...v.rows].filter(r=>r.rank!==1).sort(byRank)
  :[...v.rows].filter(r=>r.status==='CUT').sort(byRank);
 return rows.map(r=>r.name);
}
// Five seconds per eliminated player. Only engine-cut players are judged.
let cutsceneTimers=[],cutsceneKeyHandler=null,cutsceneResolve=null;
let ceremonyLabel="",ceremonyStage="",cutsceneRunId=0,cutsceneReturnResult=false;
const titled=(label,suffix)=>(label?label+': ':'')+suffix;
const schedule=(fn,ms)=>cutsceneTimers.push(setTimeout(()=>{if(cutsceneActive)fn();},ms));
const verdictPhases=['enter','judge','down','hook','drag','gone','summary'];
const verdictCaptions={enter:'THE GARDENER CALLS YOUR NAME',judge:'THE SHEARS RISE',down:'SNIP!',hook:'FLUNG INTO THE COMPOST',drag:'COMPOST IMPACT',gone:'PRUNED'};
const verdictSounds={judge:a=>a.horn(),down:a=>a.shears(),hook:a=>a.hook(),drag:a=>a.compost(),gone:a=>a.slam()};
function verdictBackdrop(){
 return '<div class="gv-sky"></div><div class="gv-palace"></div><div class="gv-hedge gv-hedge-left"></div><div class="gv-hedge gv-hedge-right"></div>'
  +'<div class="gv-path"></div><div class="gv-rose-arch"></div><div class="gv-compost"><b>COMPOST HEAP</b><i></i><i></i><i></i></div>'
  +'<div class="gv-gardener"><svg viewBox="0 0 130 190" aria-hidden="true"><path class="gv-hat" d="M14 45L62 7L110 45Z M0 47H125V57H0Z"/><circle cx="63" cy="66" r="21"/><path class="gv-coat" d="M37 91L87 91L108 145L20 145Z"/><path class="gv-body" d="M43 144L36 189M83 144L91 189M38 103L17 134M87 103L112 131"/></svg></div>'
  +'<svg class="gv-shears" viewBox="0 0 190 170" aria-hidden="true"><path class="gv-blade gv-blade-a" d="M84 102L22 4L95 80Z"/><path class="gv-blade gv-blade-b" d="M84 102L164 13L95 80Z"/><circle class="gv-pivot" cx="84" cy="102" r="8"/><circle class="gv-handle" cx="52" cy="139" r="19"/><circle class="gv-handle" cx="120" cy="140" r="19"/><path class="gv-handle-bar" d="M84 102L52 125M84 102L120 126"/></svg>'
  +'<div class="gv-snip">SNIP!</div><div class="gv-pruned">PRUNED</div>';
}
const hookSvg=(cls='',style='')=>'<svg class="av-hook'+cls+'"'+(style?' style="'+style+'"':'')+' viewBox="0 0 400 80" aria-hidden="true"><path d="M0 50H340"/><path d="M340 50C384 50 388 6 356 6C334 6 330 26 344 32"/></svg>';
const stickman=name=>'<div class="av-player"><svg class="av-stickman" viewBox="0 0 60 120" aria-hidden="true"><circle class="av-head" cx="30" cy="14" r="10"/><line class="av-body" x1="30" y1="24" x2="30" y2="70"/><line class="av-arm av-arm-l" x1="30" y1="36" x2="12" y2="56"/><line class="av-arm av-arm-r" x1="30" y1="36" x2="48" y2="56"/><line class="av-leg av-leg-l" x1="30" y1="70" x2="16" y2="112"/><line class="av-leg av-leg-r" x1="30" y1="70" x2="44" y2="112"/></svg><span class="av-name">'+esc(name)+'</span></div>';
const laurelSvg=cls=>'<svg class="'+cls+'" viewBox="0 0 120 80" aria-hidden="true"><path d="M60 74C30 70 14 48 18 14M60 74C90 70 106 48 102 14"/>'+[[20,56,-50],[16,40,-20],[20,24,10],[100,56,50],[104,40,20],[100,24,-10]].map(([x,y,r])=>'<ellipse cx="'+x+'" cy="'+y+'" rx="9" ry="4.5" transform="rotate('+r+' '+x+' '+y+')"/>').join('')+'</svg>';
// One verdict beat, rebuilt per player so every CSS animation restarts.
function buildVerdictScene(name){
 $('#cutscene-stage').innerHTML='<div class="arena-verdict garden-verdict">'+verdictBackdrop()+stickman(name)+'</div>';
}
function setVerdictClass(phase){
 const overlay=$('#cutscene');
 overlay.classList.remove(...verdictPhases.map(p=>'verdict-'+p));
 if(phase)overlay.classList.add('verdict-'+phase);
}
function verdictPhase(phase,name){
 setVerdictClass(phase);
 $('#cutscene-caption').innerHTML='<strong>'+verdictCaptions[phase]+'</strong><br>'+esc(name);
 const audio=window.BrawlAudio;if(audio&&verdictSounds[phase])verdictSounds[phase](audio);
}
function runVerdictSequence(names,i=0){
 if(!cutsceneActive)return;if(i>=names.length){startGateCeremony();return;}
 const name=names[i];buildVerdictScene(name);verdictPhase('enter',name);
 schedule(()=>verdictPhase('judge',name),900);
 schedule(()=>verdictPhase('down',name),1900);
 schedule(()=>verdictPhase('hook',name),2200);
 schedule(()=>verdictPhase('drag',name),3400);
 schedule(()=>verdictPhase('gone',name),4300);
 schedule(()=>runVerdictSequence(names,i+1),5000);
}
// Reduced motion: a static garden summary of pruned players.
function buildVerdictSummary(names){
 if(!cutsceneActive)return;
 $('#cutscene-stage').innerHTML='<div class="arena-verdict garden-verdict gv-summary">'+verdictBackdrop()+'<div class="av-lineup">'+names.map(stickman).join('')+'</div></div>';
 setVerdictClass('summary');
 $('#cutscene-caption').innerHTML='<strong>PRUNED</strong><br>'+names.map(esc).join(' · ');
 window.BrawlAudio?.shears();
 schedule(startGateCeremony,3000);
}
async function startGateCeremony(){
 const run=cutsceneRunId,overlay=$('#cutscene');
 if(window.CityWorld?.crownGate){
  cutsceneReturnResult=$('#result-dialog').open;
  if(cutsceneReturnResult)$('#result-dialog').close();
  if($('#screen-dialog').open)$('#screen-dialog').close();
  document.body.classList.remove('inside-room');
  if(overlay.open)overlay.close();overlay.hidden=true;
  window.CityWorld.setSuspended(false);roomTransition=true;if($('#ceremony-hud'))$('#ceremony-hud').hidden=false;
  try{await window.CityWorld.crownGate(ceremonyStage,ceremonyLabel,()=>{window.BrawlAudio?.fanfare();});}
  finally{roomTransition=false;if(cutsceneActive&&run===cutsceneRunId){if(ceremonyStage==='final')revealFinalWinners(run);else endCutscene();}}
  return;
 }
 setVerdictClass('');overlay.classList.remove('verdict-mode','final-mode','fc-intro','fc-judge','fc-hook');overlay.classList.add('crown-mode');
 $('#cutscene .eyebrow').textContent='ROUND COMPLETE';$('#cutscene-label').textContent=titled(ceremonyLabel,'The pavilion blooms');
 runCrownFallback(ceremonyLabel);
}
// Used when the 3D garden is unavailable: a floral card represents the pavilion ceremony.
function runCrownFallback(label){
 if(!cutsceneActive)return;
 label=String(label||'');
 $('#cutscene-stage').innerHTML='<div class="crown-card">'+laurelSvg('crown-laurel')+'<strong class="crown-label">PAVILION OPEN · '+esc(label)+'</strong></div>';
 $('#cutscene-caption').innerHTML='<strong>THE ROSES BLOOM</strong><br>'+esc(label);
 window.BrawlAudio?.fanfare();
 schedule(endCutscene,reducedMotion()?1500:2500);
}

// Final verdict: the gardener prunes the three non-podium finalists; the winners reach the podium.
let finalWinners=null;
function finalRoster(cuts){
 const rows=Array.isArray(view?.final?.rows)?view.final.rows:[];
 const winners=[{rank:1,name:rows.find(x=>x.rank===1)?.name||'CHAMPION'}];
 return {winners,lineup:cuts.map(name=>({rank:0,name})).concat(winners)};
}
function finalTitle(a,b){$('#cutscene-caption').innerHTML='<strong>'+a+'</strong><br>'+esc(b);}
function startFinalSequence(cuts){
 if(!cutsceneActive)return;
 finalWinners=finalRoster(cuts).winners;
 // Five finalists are pruned. Only the first-place player survives to
 // claim the entire $40, with no runner-up payout.
 if(reducedMotion())buildVerdictSummary(cuts);
 else runVerdictSequence(cuts);
}
function revealFinalWinners(run){
 if(!cutsceneActive||run!==cutsceneRunId)return;
 const overlay=$('#cutscene');
 overlay.classList.remove('crown-mode','fc-intro','fc-judge','fc-hook');overlay.classList.add('final-mode','fc-winners');
 const name=rank=>finalWinners?.find(x=>x.rank===rank)?.name||'-';
 const block=(rank,cls)=>'<div class="fc-medal '+cls+'">'+laurelSvg('fc-laurel')+'<span class="fc-winner-name">'+esc(name(rank))+'</span><div class="fc-plinth">'+rank+'</div></div>';
 const petals=Array.from({length:25},(_,i)=>'<span class="fc-petal" style="--x:'+((i*41)%98+1)+'%;--y:'+((i*61)%87+5)+'%;--delay:'+(-(i%8)*.29)+'s"></span>').join('');
 $('#cutscene-stage').innerHTML='<div class="fc-victory"><div class="fc-victory-title">THE LAST BLOOM · $40 CHAMPION</div><div class="fc-podium">'+block(1,'gold')+'</div>'+petals+'</div>';
 $('#cutscene .eyebrow').textContent='TOURNAMENT COMPLETE';
 $('#cutscene-label').textContent='The Last Bloom';
 finalTitle('SOLE CHAMPION · $40',name(1));
 overlay.hidden=false;overlay.setAttribute('aria-hidden','false');if(!overlay.open)overlay.showModal();
 window.BrawlAudio?.victory();
 cutsceneTimers.push(setTimeout(()=>{if(cutsceneActive&&run===cutsceneRunId)endCutscene()},reducedMotion()?3000:6400));
}

// ONE dismiss path for Skip / click / Esc / natural completion. Stops audio, cancels the
// gate ceremony, clears timers, hides the overlay and resolves so the standings can show.
const cutsceneClasses=['open','verdict-mode','verdict-enter','verdict-judge','verdict-down','verdict-hook','verdict-drag','verdict-gone','verdict-summary','final-mode','fc-intro','fc-judge','fc-hook','fc-winners','crown-mode'];
function endCutscene(){
 if($('#ceremony-hud'))$('#ceremony-hud').hidden=true;
 cutsceneRunId++;window.BrawlAudio?.stop();window.CityWorld?.cancelCeremony?.();
 cutsceneTimers.forEach(t=>clearTimeout(t));cutsceneTimers=[];
 if(cutsceneKeyHandler&&document.removeEventListener)document.removeEventListener('keydown',cutsceneKeyHandler,true);
 cutsceneKeyHandler=null;
 const overlay=$('#cutscene');
 if(overlay){if(overlay.open)overlay.close();overlay.hidden=true;if(overlay.setAttribute)overlay.setAttribute('aria-hidden','true');overlay.classList.remove(...cutsceneClasses);}
 cutsceneActive=false;
 window.CityWorld?.setSuspended(false);
 if(cutsceneReturnResult){cutsceneReturnResult=false;const dialog=$('#result-dialog');if(!dialog.open)dialog.showModal();renderResult();}
 const r=cutsceneResolve;cutsceneResolve=null;if(r)r();
}
// Play the cutscene for `names`; resolves when it ends (naturally or via skip). If there
// is nothing to show, resolves immediately so standings appear directly.
function playCutscene(names,roundLabel='',stage=''){
 return new Promise(resolve=>{
  if(cutsceneActive||!names||!names.length){resolve();return;}
  const overlay=$('#cutscene');if(!overlay){resolve();return;}
  cutsceneRunId++;cutsceneReturnResult=false;window.BrawlAudio?.unlock();cutsceneResolve=resolve;cutsceneActive=true;window.CityWorld?.setSuspended(true);
  const verdict=stage==='round1'||stage==='round2',label=String(roundLabel||'');
  ceremonyLabel=roundLabel||'Final';ceremonyStage=stage||'final';
  overlay.classList.toggle('verdict-mode',verdict);overlay.classList.toggle('final-mode',stage==='final');
  $('#cutscene .eyebrow').textContent=verdict?'THE GARDENER HAS SPOKEN':stage==='final'?"THE GARDENER'S VERDICT":'ROUND COMPLETE';
  $('#cutscene-label').textContent=verdict?titled(label,'PRUNED'):stage==='final'?titled(label,'The final pruning'):titled(String(ceremonyLabel),'The pavilion blooms');
  overlay.hidden=false;if(overlay.setAttribute)overlay.setAttribute('aria-hidden','false');overlay.classList.add('open');
  // Native top layer keeps the cutscene above both scoring and tie-result dialogs.
  overlay.showModal();
  if(overlay.focus)overlay.focus({preventScroll:true});
  // Capture Esc so skipping does not also close the scoring/results window underneath.
  cutsceneKeyHandler=e=>{if(e.key==='Escape'||e.key==='Esc'){if(e.preventDefault)e.preventDefault();if(e.stopPropagation)e.stopPropagation();endCutscene();}};
  if(document.addEventListener)document.addEventListener('keydown',cutsceneKeyHandler,true);
  if(verdict){if(reducedMotion())buildVerdictSummary(names);else runVerdictSequence(names);}else if(stage==='final')startFinalSequence(names);else startGateCeremony();
 });
}

fetch('/api/state').then(r=>r.json()).then(data=>{({state,view,revision,token}=data);round2Game=Math.min(view.round2.draw.completed,4);render();$('#save-status').textContent='All changes saved';}).catch(e=>error('Cannot reach the Python app. '+e.message));

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!cutsceneActive&&!roomTransition&&!$('#screen-dialog').open&&!$('#result-dialog').open){window.CityWorld?.home();}});
