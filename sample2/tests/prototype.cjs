const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {startTestServer,settled}=require('./server-fixture.cjs');
(async()=>{
 const fixture=await startTestServer();
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'America/Los_Angeles'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('habit-diary-sample2:v1','original-personal');localStorage.setItem('habit-diary-sample2:prototype:v1','original-test');});
  await page.goto(fixture.base+'/sample2/');await page.locator('.routine-count').waitFor();
  const snapshot=fixture.store.read();
  assert.equal(await page.locator('#selected-date').inputValue(),snapshot.today);
  assert.equal(await page.locator('.routine-count').innerText(),'7/12');assert.ok(Object.keys(snapshot.state.days).length>=10);
  assert.equal(await page.getByRole('checkbox',{name:'먼저 인사하는 하루',exact:true}).count(),1);
  await page.getByRole('button',{name:'오늘의 제목 수정',exact:true}).click();
  await page.locator('[name=message]').fill('직접 바꾼 제목');await page.getByRole('button',{name:'제목 저장'}).click();await settled(page);
  await page.getByRole('checkbox',{name:'직접 바꾼 제목',exact:true}).check();await settled(page);
  const before=await fixture.read();
  const second=await browser.newPage();await second.goto(fixture.base+'/sample2/?demo=1');await second.locator('.routine-count').waitFor();
  assert.equal(await second.getByRole('checkbox',{name:'직접 바꾼 제목',exact:true}).isChecked(),true);
  assert.equal(new URL(second.url()).searchParams.has('demo'),false);
  await fixture.restart();await page.reload();await page.locator('.routine-count').waitFor();
  assert.equal(await page.getByRole('checkbox',{name:'직접 바꾼 제목',exact:true}).isChecked(),true);
  assert.deepEqual(await fixture.read(),before);
  assert.equal(await page.evaluate(()=>localStorage.getItem('habit-diary-sample2:v1')),'original-personal');
  assert.equal(await page.evaluate(()=>localStorage.getItem('habit-diary-sample2:prototype:v1')),'original-test');
  assert.deepEqual(errors,[]);
  console.log('PASS: examples seeded once, shared DB across browser contexts, Seoul date, linked title, restart persistence, legacy browser data untouched.');
 } finally {await browser.close();await fixture.close();}
})().catch(e=>{console.error(e);process.exit(1)});
