// Garden opening countdown model: Royal Garden phase strings, thresholds and unchanged progress math (AC 7).
const assert=require('node:assert/strict');
const {sample}=require('../static/city-timeline.js');

// Unset and unscheduled windows rest the arena.
for(const settings of [undefined,{},{start_at:''},{start_at:'not a date'}]){
 const r=sample(settings,0);
 assert.equal(r.phase,'GARDEN WAITING');assert.equal(r.progress,0);assert.equal(r.remaining,null);assert.equal(r.scheduled,false);
}
const future={start_at:'2030-01-01T00:01:00Z'};
let r=sample(future,Date.parse('2030-01-01T00:00:00Z'));
assert.equal(r.phase,'GARDEN WAITING');assert.equal(r.progress,0);assert.equal(r.remaining,60000);assert.equal(r.scheduled,true);
r=sample({start_at:'2030-01-01T00:01:00Z',disaster_started_at:'2030-01-01T00:02:00Z'},Date.parse('2030-01-01T00:00:00Z'));
assert.equal(r.phase,'GARDEN WAITING');assert.equal(r.progress,0);

// One-minute window: 1 s steps. Values pinned from the pre-theme implementation.
const short={disaster_started_at:'2030-01-01T00:00:00Z',start_at:'2030-01-01T00:01:00Z'},t0=Date.parse(short.disaster_started_at);
const table=[
 [-5000,0,65000,'ROSEBUDS WAITING'],[0,0,60000,'ROSEBUDS WAITING'],[999,0,59001,'ROSEBUDS WAITING'],[1000,1/60,59000,'ROSEBUDS WAITING'],
 [7300,7/60,52700,'ROSEBUDS WAITING'],[7500,7/60,52500,'ROSEBUDS WAITING'],[8000,8/60,52000,'GARDEN AWAKENING'],
 [17999,17/60,42001,'GARDEN AWAKENING'],[18000,.3,42000,'GARDEN STIRRING'],[33000,.55,27000,'GARDEN OPENING SOON'],
 [47999,47/60,12001,'GARDEN OPENING SOON'],[48000,.8,12000,'THE GARDEN OPENS'],[59999,59/60,1,'THE GARDEN OPENS'],
 [60000,1,0,'THE GARDEN IS OPEN'],[90000,1,0,'THE GARDEN IS OPEN']];
for(const [ms,progress,remaining,phase] of table){
 const s=sample(short,t0+ms);
 assert.ok(Math.abs(s.progress-progress)<1e-12,ms+': progress '+s.progress+' != '+progress);
 assert.equal(s.remaining,remaining,ms+': remaining');assert.equal(s.interval,1000);assert.equal(s.phase,phase,ms+': phase');
}

// Four-hour window: interval capped at 30 s, progress identical to before.
const long={disaster_started_at:'2030-01-01T00:00:00Z',start_at:'2030-01-01T04:00:00Z'},l0=Date.parse(long.disaster_started_at);
const longTable=[[0,0],[12000,0],[360000,.025],[708000,0.04791666666666667],[732000,.05],[1440000,.1],[2868000,0.19791666666666666],
 [2880000,.2],[7200000,.5],[12000000,0.8333333333333334],[14388000,0.9979166666666667]];
for(const [ms,progress] of longTable){
 const s=sample(long,l0+ms);assert.equal(s.interval,30000);assert.ok(Math.abs(s.progress-progress)<1e-12,ms+': '+s.progress);
}

// Threshold edges map to the Royal Garden phases (.12 / .3 / .55 / .8).
const hundred={disaster_started_at:'2030-01-01T00:00:00Z',start_at:'2030-01-01T00:04:00Z'},h0=Date.parse(hundred.disaster_started_at);
const at=p=>sample(hundred,h0+p*240000);
assert.equal(at(.1).phase,'ROSEBUDS WAITING');assert.equal(at(.125).phase,'GARDEN AWAKENING');
assert.equal(at(.29).phase,'GARDEN AWAKENING');assert.equal(at(.3).phase,'GARDEN STIRRING');
assert.equal(at(.5).phase,'GARDEN STIRRING');assert.equal(at(.55).phase,'GARDEN OPENING SOON');
assert.equal(at(.79).phase,'GARDEN OPENING SOON');assert.equal(at(.8).phase,'THE GARDEN OPENS');assert.equal(at(1).phase,'THE GARDEN IS OPEN');

const phases=new Set([...table.map(t=>t[3]),'GARDEN WAITING']);
assert.deepEqual([...phases].sort(),['GARDEN WAITING','THE GARDEN OPENS','GARDEN AWAKENING','GARDEN OPENING SOON','ROSEBUDS WAITING','GARDEN STIRRING','THE GARDEN IS OPEN'].sort());
console.log('City timeline passed: Royal Garden phases, thresholds .12/.3/.55/.8, rest/arrival states and unchanged progress values.');
