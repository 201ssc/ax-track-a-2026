const {startTestServer,settled}=require('./server-fixture.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 let fixture=await startTestServer(undefined);
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 const ready=async page=>{await page.waitForFunction(()=>document.body.dataset.appReady==='true');assert.ok((await page.locator('main').textContent()).trim().length>100);};
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(fixture.base+'/sample2/');await ready(page);
 for(const tab of ['chat','report','manage','today']){await page.locator(`[data-nav=${tab}]`).click();await settled(page);assert.ok((await page.locator('main').textContent()).trim().length>50);}
 await page.getByRole('button',{name:'달력 보기',exact:true}).click();await settled(page);assert.equal(await page.locator('.calendar-day').count(),42);assert.deepEqual(errors,[]);
 // A restricted embedded browser must still render the diary when optional URL cleanup fails.
 const restricted=await browser.newPage();await restricted.addInitScript(()=>{history.replaceState=()=>{throw new DOMException('History blocked','SecurityError');};});await restricted.goto(fixture.base+'/sample2/?demo=1#chat');await ready(restricted);await restricted.locator('#chat-form').waitFor();
 // Simulate old cached modules. New assets must all use a consistent versioned URL.
 const cached=await browser.newPage();const versions=[];
 await cached.route('**/sample2/**',route=>{const url=new URL(route.request().url());if(/\.(?:js|mjs)$/.test(url.pathname)){if(!url.searchParams.has('v'))return route.fulfill({contentType:'text/javascript',body:'throw new Error("Obsolete module was reused");'});versions.push(url.searchParams.get('v'));}return route.continue();});
 await cached.goto(fixture.base+'/sample2/');await ready(cached);assert.ok(versions.length>=4);assert.equal(new Set(versions).size,1);
 await cached.screenshot({path:'/tmp/habit-startup-fixed.png',fullPage:true});
 // A failed import must produce a retry UI, not an empty page or deletion of stored records.
 const failed=await browser.newPage();await failed.addInitScript(()=>localStorage.setItem('habit-diary-sample2:prototype:v1','preserve-this-original'));
 await failed.route('**/api.mjs*',route=>route.abort());await failed.goto(fixture.base+'/sample2/');await failed.getByRole('heading',{name:'화면을 불러오지 못했어요.',exact:true}).waitFor();assert.equal(await failed.getByRole('button',{name:'다시 불러오기'}).count(),1);assert.equal(await failed.evaluate(()=>localStorage.getItem('habit-diary-sample2:prototype:v1')),'preserve-this-original');
 await browser.close();await fixture.close();console.log('PASS: normal startup/views/calendar, restricted History API, stale-module protection, one asset version, visible import failure/retry, stored data preserved.');
})().catch(e=>{console.error(e);process.exit(1)});
