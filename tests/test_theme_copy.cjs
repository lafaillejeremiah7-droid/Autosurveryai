// Coliseum theme guard: user-visible copy, renamed selectors and the warm palette.
// No browser or third-party packages needed. Run: node tests/test_theme_copy.cjs
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const BANNED=/doom|nuke|nuclear|apocalyp|missile|furnace|portal|bomb|blast|explosion|scream|strike|shelter|survival|destruction|rubble|mushroom|fireball|abduct|rebirth|world ends/i;
const CITY=/\bcity\b/i;

// Visible text of an HTML fragment: tag-stripped text plus aria-label, title, alt and content values.
const decode=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
function visible(html){
 const attrs=[...html.matchAll(/\s(?:aria-label|title|alt|content)\s*=\s*("([^"]*)"|'([^']*)')/gi)].map(m=>m[2]??m[3]);
 const text=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<!--[\s\S]*?-->/g,' ').replace(/<[^>]*>/g,' ');
 return decode([text,...attrs].join('\n'));
}
const failures=[];
function check(label,html){
 const text=visible(String(html??''));
 assert(text.trim().length>0||label.startsWith('optional'),label+' rendered no text');
 for(const line of text.split('\n')){
  if(BANNED.test(line)||CITY.test(line))failures.push(label+': '+line.trim().slice(0,160));
 }
}

// index.html
const indexHtml=read('static/index.html');
check('index.html',indexHtml);
assert.equal((indexHtml.match(/<title>([^<]*)<\/title>/)||[])[1],'Coliseum - Brawl Hockey','page title');
assert(indexHtml.includes('COLISEUM DIVISION'),'brand subtitle');

// Rendered screens through the test_ui harness pattern.
const payload=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c',
 "import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture;from engine import evaluate;s=fixture();print(json.dumps({'state':s,'view':evaluate(s)}))"],{cwd:root,encoding:'utf8'}));
const elements={};
const makeClassList=()=>{const set=new Set();return {toggle(c){if(set.has(c)){set.delete(c);return false;}set.add(c);return true;},remove(...c){c.forEach(x=>set.delete(x));},add(...c){c.forEach(x=>set.add(x));},contains(c){return set.has(c);}};};
const element=()=>({dataset:{},scrollTop:0,innerHTML:'',textContent:'',open:false,hidden:false,classList:makeClassList(),style:{setProperty(){}},addEventListener(){},removeEventListener(){},setAttribute(){},getAttribute(){return null;},querySelectorAll:()=>[],querySelector:()=>null,removeChild(){},remove(){},focus(){},appendChild(){},showModal(){this.open=true;},close(){this.open=false;},animate:()=>({cancel(){}})});
const document={querySelector:s=>elements[s]??=(element()),querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},body:element(),createElement:()=>element()};
const windowObj={addEventListener(){},matchMedia:()=>({matches:true})};
const context={document,window:windowObj,matchMedia:windowObj.matchMedia,fetch:()=>new Promise(()=>{}),setTimeout:()=>1,clearTimeout(){},setInterval(){},console,fixture:payload,confirm:()=>true};
vm.createContext(context);
vm.runInContext(read('static/monuments.js'),context);
vm.runInContext(read('static/app.js'),context);
vm.runInContext('state=fixture.state;view=fixture.view;',context);
const run=expr=>vm.runInContext(expr,context);
run('renderRoom()');
for(const id of ['#monitors','#gate-route','#room-stats','#city-podium'])check('renderRoom '+id,elements[id]?.innerHTML);
for(const expr of ['settings()','overview()',"round('round1')",'round2Page()','finalPage()'])check(expr,run(expr));
run('window.BrawlMonuments.renderScreen(view,state)');
check('podium',elements['#screen-podium'].innerHTML);
// The settled podium header only appears once the final is complete; check its literals too.
const literals=src=>[...src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)].map(m=>m[1]??m[2]??m[3]);
// Selector strings such as '#city-podium' are structural IDs (design A8), not copy.
check('monuments.js literals',literals(read('static/monuments.js')).filter(x=>!/^[#.\[]/.test(x)).join('\n'));

// Cutscene captions and stages, rendered explicitly because setTimeout never fires here.
const stageHtml=()=>elements['#cutscene-stage'].innerHTML,captionHtml=()=>elements['#cutscene-caption'].innerHTML;
run('cutsceneActive=true');
run("buildVerdictScene('X')");check('verdict stage',stageHtml());
for(const phase of ['enter','judge','down','hook','drag','gone']){run(`verdictPhase('${phase}','X')`);check('verdictPhase '+phase,captionHtml());}
run("buildVerdictSummary(['X'])");check('summary stage',stageHtml());check('summary caption',captionHtml());
run('cutsceneActive=true');run("runCrownFallback('X')");check('crown fallback stage',stageHtml());check('crown fallback caption',captionHtml());
run('cutsceneActive=true');run('revealFinalWinners(cutsceneRunId)');check('champions stage',stageHtml());check('champions caption',captionHtml());
check('champions eyebrow',elements['#cutscene .eyebrow'].textContent);
check('startFinalSequence literals',literals(run('startFinalSequence.toString()')).join('\n'));
run('cutsceneActive=true');run("startFinalSequence(['X','Y','Z'])");check('final stage',stageHtml());check('final caption',captionHtml());
assert.deepEqual(failures,[],'banned theme words in visible copy:\n'+failures.join('\n'));

// Renamed and grouped selectors survived the CSS sweep.
const cssFiles=['static/style.css','static/city.css'];
const selectors=new Set();
for(const f of cssFiles){
 const css=read(f).replace(/\/\*[\s\S]*?\*\//g,'');
 for(const m of css.matchAll(/([^{}]+)\{/g)){const pre=m[1].trim();if(!pre.startsWith('@'))pre.split(',').forEach(s=>selectors.add(s.trim().replace(/\s+/g,' ')));}
}
for(const s of ['.gate-ceremony #world','.games-clock','#ceremony-hud','.arena-hub-heading','.gate-route','.room-intro h1'])assert(selectors.has(s),'selector '+s+' present in static/*.css');

// Palette: no teal, cyan or navy literal (hue 150-230 with saturation >= .20).
function hsl(r,g,b){
 r/=255;g/=255;b/=255;const max=Math.max(r,g,b),min=Math.min(r,g,b),l=(max+min)/2,d=max-min;
 if(d===0)return [0,0,l];
 const s=l>.5?d/(2-max-min):d/(max+min);
 let h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;
 return [h*60,s,l];
}
function colors(text){
 const out=[];
 for(const m of text.matchAll(/#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-z_-])/gi)){
  let x=m[1];if(x.length<=4)x=[...x].map(c=>c+c).join('');
  out.push([m[0],parseInt(x.slice(0,2),16),parseInt(x.slice(2,4),16),parseInt(x.slice(4,6),16)]);
 }
 for(const m of text.matchAll(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)[^)]*\)/gi))out.push([m[0],+m[1],+m[2],+m[3]]);
 return out;
}
const offenders=[];
const scan=(label,text)=>{for(const [lit,r,g,b] of colors(text)){const [h,s]=hsl(r,g,b);if(h>=150&&h<=230&&s>=.2)offenders.push(label+': '+lit);}};
for(const f of cssFiles)scan(f,read(f));
scan('static/index.html',indexHtml);
scan('static/app.js',literals(read('static/app.js')).join('\n'));
assert.deepEqual(offenders,[],'teal/cyan/navy color literals:\n'+offenders.join('\n'));
// Sanity: the band check itself flags the old palette.
assert.equal(colors('#73efc6 #0b2030c9 rgba(10,27,37,.78)').filter(([,r,g,b])=>{const [h,s]=hsl(r,g,b);return h>=150&&h<=230&&s>=.2;}).length,3,'band check catches old palette');
console.log('theme copy, selectors and palette checks passed');
