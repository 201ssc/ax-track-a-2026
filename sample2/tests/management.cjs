const {startTestServer,settled}=require('./server-fixture.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 let fixture=await startTestServer(undefined);
 const {createDemoState}=await import('../demo.mjs');
 const {today,shiftDate,report}=await import('../model.mjs');
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(state=>{if(!localStorage.getItem('habit-diary-sample2:prototype:v1')){
  localStorage.setItem('habit-diary-sample2:prototype:v1',JSON.stringify(state));
  localStorage.setItem('habit-diary-sample2:v1','original-personal');
  localStorage.setItem('habit-diary-sample2:demo:v1','original-demo');
 }},createDemoState());
 const read=()=>fixture.read();
 const row=name=>page.locator('.manage-row').filter({has:page.getByRole('heading',{name,exact:true})});
 const open=async name=>page.getByLabel(`${name} 항목 메뉴`,{exact:true}).click();await settled(page);
 await page.goto(fixture.base+'/sample2/#manage');await page.locator('.manage-row').first().waitFor();
 const original=await read(),summary=report(original,today(),7);
 assert.ok((await page.locator('.manage-row').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height))).every(h=>h<=52));
 await open('치실 사용');assert.equal(await row('치실 사용').getByRole('button',{name:'삭제',exact:true}).isVisible(),true);
 await page.keyboard.press('Escape');assert.equal(await row('치실 사용').locator('details').evaluate(el=>el.open),false);
 assert.equal(await page.getByLabel('치실 사용 항목 메뉴',{exact:true}).evaluate(el=>el===document.activeElement),true);
 await open('치실 사용');await page.getByRole('heading',{name:'항목 관리',exact:true}).click();await settled(page);assert.equal(await row('치실 사용').locator('details').evaluate(el=>el.open),false);
 await open('치실 사용');page.once('dialog',dialog=>dialog.dismiss());await row('치실 사용').getByRole('button',{name:'삭제',exact:true}).click();await settled(page);assert.deepEqual(await read(),original);
 await open('치실 사용');page.once('dialog',dialog=>dialog.accept());await row('치실 사용').getByRole('button',{name:'삭제',exact:true}).click();await settled(page);
 assert.equal(await row('치실 사용').count(),0);let updated=await read();assert.equal(updated.questions.find(q=>q.id==='floss').deleted,true);assert.deepEqual(updated.days,original.days);assert.deepEqual(report(updated,today(),7),summary);
 await page.reload();await page.locator('.manage-row').first().waitFor();assert.equal(await row('치실 사용').count(),0);
 await page.locator('[data-nav=today]').click();await settled(page);await page.locator('[data-action=expand][data-id=life]').click();await settled(page);assert.equal(await page.locator('[data-action=question][data-id=floss]').count(),0);
 await page.locator('#selected-date').fill(shiftDate(today(),-1));await page.locator('[data-action=expand][data-id=life]').click();await settled(page);assert.equal(await page.locator('[data-action=question][data-id=floss]').count(),1);
 await page.locator('[data-nav=report]').click();await settled(page);await page.locator('.habit-result').first().waitFor();assert.equal(await page.locator('.habit-result').filter({hasText:'치실 사용'}).count(),1);
 await page.locator('[data-nav=manage]').click();await settled(page);await open('비타민 챙기기');await row('비타민 챙기기').getByRole('button',{name:'사용 중지',exact:true}).click();await settled(page);assert.equal((await read()).questions.find(q=>q.id==='vitamin').active,false);
 await open('비타민 챙기기');await row('비타민 챙기기').getByRole('button',{name:'다시 사용',exact:true}).click();await settled(page);assert.equal((await read()).questions.find(q=>q.id==='vitamin').active,true);
 await row('물 충분히 마시기').getByRole('button',{name:'물 충분히 마시기',exact:true}).click();await settled(page);await page.locator('[name=title]').fill('매일 물 마시기');await page.getByRole('button',{name:'변경 저장 ✓',exact:true}).click();await settled(page);assert.equal(await row('매일 물 마시기').count(),1);
 await open('매일 물 마시기');await row('매일 물 마시기').getByRole('button',{name:'아래로 이동',exact:true}).click();await settled(page);assert.equal((await read()).questions.filter(q=>q.groupId==='life'&&!q.deleted)[0].id,'skin');
 await page.getByRole('button',{name:'＋ 항목 추가',exact:true}).click();await settled(page);await page.locator('[name=title]').fill('새로운 빈 루틴');await page.getByRole('button',{name:'항목 추가 ✓',exact:true}).click();await settled(page);
 await open('새로운 빈 루틴');page.once('dialog',dialog=>dialog.accept());await row('새로운 빈 루틴').getByRole('button',{name:'삭제',exact:true}).click();await settled(page);assert.equal((await read()).questions.some(q=>q.title==='새로운 빈 루틴'),false);
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await open('내일의 제목');await page.waitForFunction(()=>{const menu=document.querySelector('.action-menu[open]');return menu&&menu.querySelector('.action-menu-panel').getBoundingClientRect().bottom<=document.querySelector('.bottom-nav').getBoundingClientRect().top;});
  const bounds=await row('내일의 제목').locator('.action-menu-panel').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);await page.keyboard.press('Escape');
 }
 assert.deepEqual((await read()).days,original.days);
 assert.equal(await page.evaluate(()=>localStorage.getItem('habit-diary-sample2:v1')),'original-personal');assert.equal(await page.evaluate(()=>localStorage.getItem('habit-diary-sample2:demo:v1')),'original-demo');
 assert.deepEqual(errors,[]);await browser.close();await fixture.close();
 console.log('PASS: compact rows; menus/keyboard/outside close; deletion cancellation, history/report preservation and reload; edit/pause/reorder/add/delete; menu fit at 320/390/1440px; original stores untouched.');
})().catch(e=>{console.error(e);process.exit(1)});
