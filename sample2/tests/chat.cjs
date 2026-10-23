const {startTestServer,settled}=require('./server-fixture.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 let fixture=await startTestServer(undefined);
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(fixture.base+'/sample2/?demo=1#chat');
 await page.locator('#chat-form').waitFor();
 const read=()=>fixture.read().then(JSON.stringify);
 const initial=await read();
 const send=async text=>{await page.locator('#chat-input').fill(text);await page.getByRole('button',{name:'보내기',exact:true}).click();await settled(page);};
 const confirm=async()=>page.locator('[data-action=chat-confirm]').last().click();await settled(page);
 const lastAnswer=()=>page.locator('.chat-message.assistant .chat-bubble').last().innerText();
 // Queries use current records and do not write even the demo store.
 await send('이번 주 점수 어때?');assert.match(await lastAnswer(),/평균은|저장된 점수가 없/);assert.equal(await read(),initial);
 await send('어디가 잘 안 되고 있어?');assert.match(await lastAnswer(),/실천|아직 없/);assert.equal(await read(),initial);
 await send('취미 목차 추가해줘');assert.equal(await read(),initial);await confirm();
 let state=JSON.parse(await read());assert.ok(state.groups.some(g=>g.name==='취미'));
 await send('취미에 그림 그리기 항목 추가해줘');await confirm();
 state=JSON.parse(await read());assert.ok(state.questions.some(q=>q.title==='그림 그리기'));
 await page.locator('[data-nav=manage]').click();await settled(page);assert.match(await page.locator('main').innerText(),/그림 그리기/);
 await page.locator('[data-nav=chat]').click();await settled(page);assert.equal(await page.locator('[data-action=chat-confirm]').count(),0);
 // Cancellation keeps saved data identical.
 const beforeCancel=await read();await send('비타민 챙기기 항목 빼줘');await page.locator('[data-action=chat-cancel]').last().click();await settled(page);assert.equal(await read(),beforeCancel);
 await send('비타민 챙기기 항목 빼줘');const oldDays=JSON.parse(await read()).days;await confirm();state=JSON.parse(await read());assert.equal(state.questions.find(q=>q.id==='vitamin').deleted,true);assert.deepEqual(state.days,oldDays);
 await send('이번 달 27일 독서 모임');await confirm();state=JSON.parse(await read());let item=state.schedules.find(s=>s.text==='독서 모임');assert.ok(item.date.endsWith('-27'));
 await send('독서 모임을 30일로 변경해줘');await confirm();state=JSON.parse(await read());assert.ok(state.schedules.find(s=>s.text==='독서 모임').date.endsWith('-30'));
 await send('이번 달 남은 할 일은?');assert.match(await lastAnswer(),/독서 모임/);
 // Duplicate names require an explicit selection and then confirmation.
 await send('이번 달 28일 독서 모임');await confirm();const beforeChoose=await read();
 await send('독서 모임을 29일로 변경해줘');assert.equal(await page.locator('.chat-choices button:not(:disabled)').count(),2);assert.equal(await read(),beforeChoose);
 await page.locator('.chat-choices button:not(:disabled)').last().click();await settled(page);assert.equal(await read(),beforeChoose);await confirm();
 await send('가끔은 자유롭게 이야기하고 싶어');assert.match(await lastAnswer(),/정해진 표현/);
 // Escaping applies to user input, previews, and saved names.
 await send('<img src=x onerror=alert(1)> 목차 추가해줘');assert.equal(await page.locator('.chat-thread img').count(),0);await page.locator('[data-action=chat-cancel]').last().click();await settled(page);
 await page.locator('[data-nav=report]').click();await settled(page);await page.getByRole('button',{name:'최근 30일',exact:true}).click();await settled(page);
 const titles=await page.locator('.journal-entry h3').allTextContents();assert.ok(titles.length>0);assert.ok(titles.every(title=>title.includes('회고')));assert.ok(!titles.some(title=>/제목|집중한 일/.test(title)));
 await page.locator('[data-nav=chat]').click();await settled(page);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});
 await send('이번 달 29일 발표 연습');await page.screenshot({path:'/tmp/habit-sample2-chat-mobile.png',fullPage:true});
 const beforeFailure=await read();await page.route('**/api/proposals/*/confirm',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'storage_error',message:'저장하지 못했어요. 다시 시도해 주세요.'})}));await confirm();assert.equal(await read(),beforeFailure);assert.match(await page.locator('.chat-proposal .form-error').last().innerText(),/저장하지 못/);assert.equal(await page.locator('.chat-proposal').last().getByText('✓ 반영했어요.',{exact:true}).count(),0);
 assert.deepEqual(errors,[]);
 await browser.close();await fixture.close();console.log('PASS: scripted chat queries, confirmed writes, cancellation, archive/history, schedule add/move/lookup, ambiguity, navigation sync, escaping, reflection-only report, mobile, storage failure.');
})().catch(e=>{console.error(e);process.exit(1)});
