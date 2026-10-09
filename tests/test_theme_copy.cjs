// Royal Garden theme, payout and visible copy regression checks.
// Run: node tests/test_theme_copy.cjs
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const index=read('static/index.html'),app=read('static/app.js');
const city=read('static/city.js'),style=read('static/style.css');
const cityStyle=read('static/city.css'),monuments=read('static/monuments.js');
const stages=['Know Thy Nature','Adapt or Wither','The Last Bloom'];
assert(index.includes('<title>The Royal Garden - Brawl Hockey</title>'),'page title');
assert(index.includes('THE GARDEN OPENS'),'opening countdown');
for(const name of stages){
 assert(index.includes(name),'home missing '+name);
 assert(app.includes(name),'game navigation missing '+name);
}
for(const old of ['Face Your Weakness','Abandon Your Comfort','Prove Your Resolve','COLISEUM DIVISION']){
 assert(!index.includes(old)&&!app.includes(old),'obsolete displayed label: '+old);
}
assert(index.includes('ONE $30 CHAMPION'),'single champion on home screen');
assert(app.includes('Winner-take-all prize'),'settings show fixed prize');
assert(!app.includes("inp('settings.prizes."),'payouts must not be editable');
assert(app.includes("prizes:[30,0,0]"),'reset-all keeps $30/0/0');
assert(monuments.includes('const slots=[1].map(place=>'),'only one trophy pedestal');
assert(monuments.includes('$30'),'only $30 champion');
for(const geometry of ["part('maze-hedges'","part('rose-beds'","part('pavilions'","part('fountains'","part('royal-palace'","part('rose-arches'"]){
 assert(city.includes(geometry),'missing 3D scenery: '+geometry);
}
assert(cityStyle.includes('#walkway-view{')&&cityStyle.includes('position:fixed;inset:0'),'full viewport garden');
assert(style.includes('.garden-verdict'),'garden verdict artwork');
for(const token of ['gv-shears','gv-compost','gv-pruning-count','gv-snip','gv-pruned','gv-fling']){
 assert(style.includes(token),'missing pruning visual: '+token);
}
assert(app.includes("stage==='final'?p.rank!==1:p.status==='CUT'"),'five losing finalists are pruned by the current cut-list function');
assert(app.includes('runReducedFinalPruning(cuts)'),'reduced-motion finalists also get individual scenes');
assert(!app.includes('hookSvg='),'removed obsolete hook artwork');
assert(!style.includes('.av-emperor'),'removed obsolete emperor styles');
assert(!style.includes('.fc-judgment'),'removed abandoned lineup animation');
const braces=text=>(text.match(/{/g)||[]).length-(text.match(/}/g)||[]).length;
assert.equal(braces(style),0,'style.css braces');
assert.equal(braces(cityStyle),0,'city.css braces');
console.log('PASS: Royal Garden copy, nature rounds, $30 champion, viewport, scene, lean styles.');
