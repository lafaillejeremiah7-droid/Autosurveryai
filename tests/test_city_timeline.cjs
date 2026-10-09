// Arena countdown model: Coliseum phase strings, thresholds and unchanged progress math (AC 7).
const assert=require('node:assert/strict');
const {sample}=require('../static/city-timeline.js');

// Unset and unscheduled windows rest the arena.
for(const settings of [undefined,{},{start_at:''},{start_at:'not a date'}]){
 const r=sample(settings,0);
 assert.equal(r.phase,'ARENA AT REST');assert.equal(r.progress,0);assert.equal(r.remaining,null);assert.equal(r.scheduled,false);
}
const future={start_at:'2030-01-01T00:01:00Z'};
let r=sample(future,Date.parse('2030-01-01T00:00:00Z'));
assert.equal(r.phase,'ARENA AT REST');assert.equal(r.progress,0);assert.equal(r.remaining,60000);assert.equal(r.scheduled,true);
r=sample({start_at:'2030-01-01T00:01:00Z',disaster_started_at:'2030-01-01T00:02:00Z'},Date.parse('2030-01-01T00:00:00Z'));
assert.equal(r.phase,'ARENA AT REST');assert.equal(r.progress,0);

// One-minute window: 1 s steps. Values pinned from the pre-theme implementation.
const short={disaster_started_at:'2030-01-01T00:00:00Z',start_at:'2030-01-01T00:01:00Z'},t0=Date.parse(short.disaster_started_at);
const table=[
 [-5000,0,65000,'MORNING CALM'],[0,0,60000,'MORNING CALM'],[999,0,59001,'MORNING CALM'],[1000,1/60,59000,'MORNING CALM'],
 [7300,7/60,52700,'MORNING CALM'],[7500,7/60,52500,'MORNING CALM'],[8000,8/60,52000,'CROWD GATHERING'],
 [17999,17/60,42001,'CROWD GATHERING'],[18000,.3,42000,'STANDS FILLING'],[33000,.55,27000,'CROWD RESTLESS'],
 [47999,47/60,12001,'CROWD RESTLESS'],[48000,.8,12000,'CROWD FRENZY'],[59999,59/60,1,'CROWD FRENZY'],
 [60000,1,0,'THE GAMES BEGIN'],[90000,1,0,'THE GAMES BEGIN']];
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

// Threshold edges map to the Coliseum phases (.12 / .3 / .55 / .8).
const hundred={disaster_started_at:'2030-01-01T00:00:00Z',start_at:'2030-01-01T00:04:00Z'},h0=Date.parse(hundred.disaster_started_at);
const at=p=>sample(hundred,h0+p*240000);
assert.equal(at(.1).phase,'MORNING CALM');assert.equal(at(.125).phase,'CROWD GATHERING');
assert.equal(at(.29).phase,'CROWD GATHERING');assert.equal(at(.3).phase,'STANDS FILLING');
assert.equal(at(.5).phase,'STANDS FILLING');assert.equal(at(.55).phase,'CROWD RESTLESS');
assert.equal(at(.79).phase,'CROWD RESTLESS');assert.equal(at(.8).phase,'CROWD FRENZY');assert.equal(at(1).phase,'THE GAMES BEGIN');

const phases=new Set([...table.map(t=>t[3]),'ARENA AT REST']);
assert.deepEqual([...phases].sort(),['ARENA AT REST','CROWD FRENZY','CROWD GATHERING','CROWD RESTLESS','MORNING CALM','STANDS FILLING','THE GAMES BEGIN']);
console.log('City timeline passed: Coliseum phases, thresholds .12/.3/.55/.8, rest/arrival states and unchanged progress values.');
