const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {startTestServer,settled}=require('./server-fixture.cjs');
(async()=>{
 const {initialState}=await import('../model.mjs');
 const fixture=await startTestServer(initialState);
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(fixture.base+'/sample2/');await page.locator('.routine-count').waitFor();
  await page.getByRole('button',{name:'전체 항목 기록하기'}).click();await page.locator('[name=answer-water][value=O]').check();
  let firstRequest;
  await page.route('**/api/commands',route=>{firstRequest=route.request().postDataJSON();return route.abort();});
  await page.getByRole('button',{name:'작성한 항목 저장 ✓'}).click();await settled(page);
  assert.equal(await page.locator('#dialog').evaluate(el=>el.open),true);assert.equal(await page.locator('[name=answer-water][value=O]').isChecked(),true);
  assert.match(await page.locator('#storage-alert').innerText(),/서버/);assert.equal(fixture.store.read().revision,0);
  await page.unroute('**/api/commands');let retry;
  page.on('request',r=>{if(r.url().endsWith('/api/commands'))retry=r.postDataJSON();});
  await page.getByRole('button',{name:'작성한 항목 저장 ✓'}).click();await settled(page);
  assert.deepEqual(retry,firstRequest);assert.equal(fixture.store.read().state.days[fixture.store.read().today].answers.water,'O');
  // Commit succeeds, but the browser loses the response. Retry must not create two groups.
  await page.locator('[data-nav=manage]').click();await page.getByRole('button',{name:'목차 추가',exact:true}).click();
  await page.locator('[name=name]').fill('응답 유실 확인');
  await page.route('**/api/commands',async route=>{await route.fetch();await route.abort();});
  await page.getByRole('button',{name:'저장 ✓',exact:true}).click();await settled(page);
  assert.equal(fixture.store.read().state.groups.filter(g=>g.name==='응답 유실 확인').length,1);
  assert.equal(await page.locator('[name=name]').inputValue(),'응답 유실 확인');
  await page.unroute('**/api/commands');
  await page.getByRole('button',{name:'저장 ✓',exact:true}).click();await settled(page);
  assert.equal(fixture.store.read().state.groups.filter(g=>g.name==='응답 유실 확인').length,1);
  // Both tabs start editing before either save. Preserve the second draft on conflict.
  const second=await browser.newPage();
  await page.locator('[data-nav=today]').click();await page.getByRole('button',{name:'오늘의 제목 수정',exact:true}).click();
  await page.locator('[name=message]').fill('첫 번째 탭');
  await second.goto(fixture.base+'/sample2/');await second.locator('.routine-count').waitFor();
  await second.getByRole('button',{name:'오늘의 제목 수정',exact:true}).click();await second.locator('[name=message]').fill('두 번째 탭의 초안');
  await page.getByRole('button',{name:'제목 저장'}).click();await settled(page);
  await second.getByRole('button',{name:'제목 저장'}).click();await settled(second);
  assert.match(await second.locator('#form-error').innerText(),/다른 수정/);assert.equal(await second.locator('[name=message]').inputValue(),'두 번째 탭의 초안');
  await second.getByRole('button',{name:'제목 저장'}).click();await settled(second);
  assert.equal(await second.getByRole('checkbox',{name:'두 번째 탭의 초안',exact:true}).count(),1);
  // Failed initial GET shows a retry screen, never a writable local fallback.
  const failed=await browser.newPage();await failed.route('**/api/diary',route=>route.abort());await failed.goto(fixture.base+'/sample2/');
  await failed.getByRole('heading',{name:'화면을 불러오지 못했어요.',exact:true}).waitFor();
  assert.equal(await failed.getByRole('button',{name:'다시 불러오기'}).count(),1);
  console.log('PASS: network failure preserves inputs, same-ID retry, committed response loss, no duplicate writes, two-tab conflicts, explicit re-confirmation, initial API failure without fallback.');
 } finally {await browser.close();await fixture.close();}
})().catch(e=>{console.error(e);process.exit(1)});
