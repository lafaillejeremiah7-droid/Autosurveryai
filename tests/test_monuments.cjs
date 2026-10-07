const assert=require('node:assert/strict');
const {model}=require('../static/monuments.js');
const {execFileSync}=require('node:child_process');
const payload=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',"import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import evaluate;s=fixture();print(json.dumps({'state':s,'view':evaluate(s)}))"],{cwd:require('node:path').resolve(__dirname,'..'),encoding:'utf8'}));
const {state,view}=payload;
let m=model(view,state);
assert.equal(m.towers.filter(p=>p.cut).length,4);assert.equal(m.complete,true);
assert.equal(m.slots.filter(s=>s.person).length,3);assert(m.slots.every(s=>s.prize!==null));
view.final.complete=false;m=model(view,state);assert(m.slots.every(s=>s.prize===null));
// A tied group occupies every position it spans; no arbitrary tie ordering wins a platform.
view.final.rows=[{id:'p1',name:'One',rank:1,total:9,status:'PENDING'},{id:'p2',name:'Two',rank:1,total:9,status:'PENDING'},{id:'p3',name:'Three',rank:3,total:5,status:'PENDING'}];
m=model(view,state);assert.deepEqual(m.slots.find(s=>s.place===1).names,['One','Two']);assert.deepEqual(m.slots.find(s=>s.place===2).names,['One','Two']);assert.equal(m.slots.find(s=>s.place===3).person,'p3');
view.final.rows=[{id:'p1',name:'One',rank:1,total:9,status:'PENDING'},{id:'p2',name:'Two',rank:2,total:5,status:'TIE - EXTRA GAMES NEEDED'},{id:'p3',name:'Three',rank:2,total:5,status:'TIE - EXTRA GAMES NEEDED'},{id:'p4',name:'Four',rank:2,total:5,status:'TIE - EXTRA GAMES NEEDED'}];
m=model(view,state);assert.equal(m.slots.find(s=>s.place===3).names.length,3);assert.equal(m.slots.find(s=>s.place===2).person,null);
view.final.stale=true;m=model(view,state);assert(m.slots.every(s=>s.names.length===0));assert.equal(m.complete,false);
view.round2.complete=false;m=model(view,state);assert.equal(m.towers.filter(p=>p.cut).length,2);assert(m.slots.every(s=>s.person===null));
view.round1.complete=false;m=model(view,state);assert.equal(m.towers.filter(p=>p.cut).length,0);
state.names.p1='<script>name</script>';assert.equal(model(view,state).towers.find(p=>p.id==='p1').name,state.names.p1);
console.log('Monuments passed: settled cuts, four collapsed towers, provisional prizes, first/second/third-place ties, stale finalists, and score rollback.');
