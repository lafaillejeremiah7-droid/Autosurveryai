/* Shared browser/Node countdown model for the arena crowd. Absolute timestamps survive refreshes and sleep. */
(function(root){
 'use strict';
 function sample(settings,now){
  now=now===undefined?Date.now():now;
  const end=Date.parse(settings&&settings.start_at),start=Date.parse(settings&&settings.disaster_started_at);
  if(!Number.isFinite(end))return {progress:0,interval:1000,remaining:null,phase:'ARENA AT REST',scheduled:false};
  const remaining=Math.max(0,end-now),duration=end-start;
  if(remaining===0)return {progress:1,interval:1000,remaining:0,phase:'THE GAMES BEGIN',scheduled:true};
  if(!Number.isFinite(start)||duration<=0)return {progress:0,interval:1000,remaining,phase:'ARENA AT REST',scheduled:true};
  // About 240 small steps for short timers; never wait more than 30 seconds.
  const interval=Math.max(1000,Math.min(30000,duration/240));
  const elapsed=Math.max(0,now-start);
  const progress=Math.max(0,Math.min(1,Math.floor(elapsed/interval)*interval/duration));
  const phase=progress<.12?'MORNING CALM':progress<.3?'CROWD GATHERING':progress<.55?'STANDS FILLING':progress<.8?'CROWD RESTLESS':'CROWD FRENZY';
  return {progress,interval,remaining,phase,scheduled:true};
 }
 const api={sample};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.CityTimeline=api;
})(typeof window==='undefined'?globalThis:window);
