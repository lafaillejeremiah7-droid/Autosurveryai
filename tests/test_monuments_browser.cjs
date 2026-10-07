const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn,execFileSync}=require('node:child_process');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'brawl-monuments-'));
const fixtures=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'tests');from test_tournament import fixture,cut_tie_state;from engine import new_state;s=fixture();a=fixture();a['round2']=new_state()['round2'];a['final']=new_state()['final'];b=fixture();b['final']=new_state()['final'];print(json.dumps({'first':a,'second':b,'final':s,'tie':cut_tie_state('round1')}))"],{cwd:root,encoding:'utf8'}));
const server=spawn('python3',['app.py','--port','0','--no-browser','--data',path.join(tmp,'state.json')],{cwd:root});let browser;
(async()=>{
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout')),15000);server.stdout.on('data',b=>{const m=b.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(m){clearTimeout(timer);resolve(m[0]);}});});
 browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:JSON.parse(process.env.CHROMIUM_ARGS||'[]')});
 const page=await browser.newPage({viewport:{width:1440,height:980}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.waitForFunction(()=>window.BrawlMonuments&&document.querySelectorAll('.player-tower').length===10);
 const restore=async fixture=>{await page.evaluate(async fixture=>{const d=await(await fetch('/api/state')).json();const r=await fetch('/api/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Session-Token':d.token},body:JSON.stringify({state:fixture,revision:d.revision,restore:true})});if(!r.ok)throw Error(await r.text());const data=await r.json();({state,view,revision}=data);render();},fixture);};
 await restore(fixtures.tie);assert.equal(await page.locator('.player-tower[data-cut=true]').count(),0);
 await page.locator('#player-towers').scrollIntoViewIfNeeded();
 await restore(fixtures.first);assert.equal(await page.locator('.player-tower[data-cut=true]').count(),2);
 await restore(fixtures.second);assert.equal(await page.locator('.player-tower[data-cut=true]').count(),4);
 assert.equal(await page.locator('#city-podium').getAttribute('data-settled'),'false');
 assert.equal(await page.locator('#city-podium .podium-tie').count(),3,'all six zero-point finalists share tied positions');
 await page.locator('#city-podium').scrollIntoViewIfNeeded();await restore(fixtures.final);
 assert.equal(await page.locator('#city-podium').getAttribute('data-settled'),'true');
 assert.equal(await page.locator('#city-podium .podium-tie').count(),0);
 assert((await page.locator('#city-podium').innerText()).includes('$18'));
 await page.waitForTimeout(2700);
 if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'final-city.png'),fullPage:true});}
 await page.evaluate(()=>openScreen('final'));assert.equal(await page.locator('#screen-podium [data-podium-player]').count(),3);
 // Updating ranks moves existing labels rather than treating tied rows as ordered winners.
 await page.evaluate(()=>{view.final.complete=false;view.final.rows[0].rank=2;view.final.rows[1].rank=1;render();});
 assert((await page.locator('#screen-podium').innerText()).includes('PRIZE PENDING'));
 if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'live-podium.png')});
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!roomTransition);
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});
 await restore(fixtures.final);await page.locator('#city-podium').scrollIntoViewIfNeeded();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(process.env.SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'mobile-final.png'),fullPage:true});
 await restore(fixtures.tie);assert.equal(await page.locator('.player-tower[data-cut=true]').count(),0);assert.equal(await page.locator('#city-podium').getAttribute('data-settled'),'false');
 await page.reload();await page.waitForFunction(()=>!!view);assert.equal(await page.locator('.player-tower[data-cut=true]').count(),0);
 assert.deepEqual(errors,[]);
 console.log('Monument browser passed: unresolved ties, two/four eliminations, live tied podium, settled prizes, rank updates, rollback, reload, and mobile layout.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill();});
