const {startTestServer,settled}=require('./server-fixture.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 let fixture=await startTestServer((await import('../model.mjs')).initialState);
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul'}),errors=[];
 const {initialState}=await import('../model.mjs');
 await page.addInitScript(state=>{if(!localStorage.getItem('habit-diary-sample2:prototype:v1'))localStorage.setItem('habit-diary-sample2:prototype:v1',JSON.stringify(state));},initialState());
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(fixture.base+'/sample2/');await page.locator('.priority-card').waitFor();
 const date=await page.locator('#selected-date').inputValue();
 const count=await page.locator('.routine-count').innerText();
 await page.getByRole('button',{name:'오늘의 제목 수정',exact:true}).click();await settled(page);
 await page.locator('[name=message]').fill('먼저 인사하는 하루');
 await page.getByRole('button',{name:'제목 저장'}).click();await settled(page);
 assert.equal(await page.locator('.priority-card h2').count(),0);
 assert.equal(await page.locator('.routine-count').innerText(),count);
 await page.getByRole('checkbox',{name:'먼저 인사하는 하루',exact:true}).check();await settled(page);
 assert.equal(await page.locator('.routine-count').innerText(),count);
 await page.reload();assert.equal(await page.getByRole('checkbox',{name:'먼저 인사하는 하루',exact:true}).isChecked(),true);
 // Dated tasks are created from the top card and may target arbitrary future days.
 await page.locator('[data-action=expand][data-id=work]').click();await settled(page);
 await page.locator('.message-card-footer').getByRole('button',{name:'＋ 일정 추가'}).click();await settled(page);
 await page.locator('[name=scheduleText]').fill('미팅 자료 준비하기');
 await page.getByRole('button',{name:'일정 저장'}).click();await settled(page);
 assert.equal(await page.getByRole('checkbox',{name:'미팅 자료 준비하기',exact:true}).count(),1);
 await page.getByRole('checkbox',{name:'미팅 자료 준비하기',exact:true}).check();await settled(page);
 assert.equal(await page.locator('.routine-count').innerText(),count);
 await page.locator('.message-card-footer').getByRole('button',{name:'＋ 일정 추가'}).click();await settled(page);
 await page.locator('[name=scheduleDate]').fill('2099-10-28');await page.locator('[name=scheduleText]').fill('미래의 발표 준비');
 await page.getByRole('button',{name:'일정 저장'}).click();await settled(page);
 assert.equal(await page.getByRole('checkbox',{name:'미래의 발표 준비',exact:true}).count(),0);
 assert.equal(await page.locator('.work-schedule-entry').count(),0);
 // Rescheduling determines which day's home displays the task.
 await page.getByRole('button',{name:'달력 보기',exact:true}).click();await settled(page);
 await page.locator('#selected-date').fill('2099-10-28');
 await page.getByRole('button',{name:'미래의 발표 준비 수정',exact:true}).click();await settled(page);
 await page.locator('[name=scheduleDate]').fill(date);await page.getByRole('button',{name:'일정 저장'}).click();await settled(page);
 await page.locator('#selected-date').fill(date);
 assert.equal(await page.getByRole('checkbox',{name:'미래의 발표 준비',exact:true}).count(),1);
 await page.getByRole('button',{name:'기록 보기',exact:true}).click();await settled(page);
 // Tomorrow's title is a single text field and doesn't replace today's title.
 await page.locator('[data-action=expand][data-id=reflection]').click();await settled(page);
 await page.locator('[data-action=question][data-id=tomorrow]').click();await settled(page);
 assert.equal(await page.locator('textarea[data-answer=tomorrow]').count(),0);
 await page.locator('[data-answer=tomorrow]').fill('행복한 하루 보내기');await page.getByRole('button',{name:'기록 저장'}).click();await settled(page);
 assert.equal(await page.getByRole('checkbox',{name:'먼저 인사하는 하루',exact:true}).count(),1);
 assert.equal(await page.getByRole('checkbox',{name:'행복한 하루 보내기',exact:true}).count(),0);
 const personal=await fixture.read().then(JSON.stringify);
 const parsed=JSON.parse(personal);assert.equal(parsed.days[date].answers.tomorrow,'행복한 하루 보내기');
 assert.equal(parsed.schedules.find(item=>item.text==='미팅 자료 준비하기').checked,true);
 await page.reload();assert.equal(await page.getByRole('checkbox',{name:'미팅 자료 준비하기',exact:true}).isChecked(),true);
 await page.locator('[data-action=date-prev]').click();await settled(page);assert.equal(await page.locator('.schedule-home-row').count(),0);
 await page.locator('[data-action=date-today]').click();await settled(page);
 // The old demo link and the plain URL now open the same diary.
 await page.goto(fixture.base+'/sample2/?demo=1');await page.locator('.priority-card').waitFor();
 assert.equal(await fixture.read().then(JSON.stringify),personal);
 assert.equal(new URL(page.url()).searchParams.has('demo'),false);
 // Use a deliberate fresh fixture for the calendar/phone scenarios in this isolated test browser.
 await fixture.close();fixture=await startTestServer();await page.goto(fixture.base+'/sample2/');
 await page.locator('.title-item').waitFor();assert.equal(await page.locator('.schedule-home-row').count(),2);
 await page.getByRole('checkbox',{name:'먼저 인사하는 하루',exact:true}).check();await settled(page);
 assert.equal(await page.locator('.routine-count').innerText(),'7/12');
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/habit-sample2-title-schedule-mobile.png',fullPage:true});
 // Schedule history is available from the calendar toggle, not inside work/study.
 await page.locator('[data-action=expand][data-id=work]').click();await settled(page);
 assert.equal(await page.locator('.work-schedule-row').count(),0);
 assert.equal(await page.locator('.work-schedule-entry').count(),0);
 await page.getByRole('button',{name:'달력 보기',exact:true}).click();await settled(page);
 assert.equal(await page.locator('.calendar-day').count(),42);
 assert.equal(await page.locator('.calendar-event').count(),2);
 const futureDate=new Date(date+'T12:00:00Z');futureDate.setUTCDate(futureDate.getUTCDate()+5);const future=futureDate.toISOString().slice(0,10);
 const futureButton=page.locator(`[data-action="calendar-day"][data-date="${future}"]`);
 assert.equal(await futureButton.locator('.has-events').count(),1);
 await futureButton.click();await settled(page);assert.equal(await page.locator('.calendar-event').count(),1);
 await page.getByRole('button',{name:'＋ 일정 추가',exact:true}).click();await settled(page);
 assert.equal(await page.locator('[name=scheduleDate]').inputValue(),future);
 await page.locator('[name=scheduleText]').fill('달력에서 추가한 일정');await page.getByRole('button',{name:'일정 저장'}).click();await settled(page);
 assert.equal(await page.locator('.calendar-event').count(),2);
 for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/habit-sample2-calendar-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'기록 보기',exact:true}).click();await settled(page);
 assert.equal(await page.locator('#selected-date').inputValue(),future);
 assert.equal(await page.locator('.schedule-home-row').count(),2);
 assert.equal(await page.getByRole('checkbox',{name:'달력에서 추가한 일정',exact:true}).isDisabled(),true);
 await page.locator('[data-action=date-today]').click();await settled(page);
 assert.equal(await page.locator('#selected-date').inputValue(),date);
 assert.equal(await page.locator('.schedule-home-row').count(),2);
 assert.deepEqual(errors,[]);console.log('PASS: no top headings, single-line title checkbox, date-specific schedules, future/reschedule, persistence, routine independence, demo isolation, calendar toggle/grid/date dots/day lists/future add, 320/390/1440px.');
 await browser.close();await fixture.close();
})().catch(e=>{console.error(e);process.exit(1)});
