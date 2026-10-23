const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const {startTestServer,settled}=require('./server-fixture.cjs');
(async()=>{
 const {initialState}=await import('../model.mjs');
 const {CommandError}=await import('../commands.mjs');
 let calls=0;
 const interpret=async(text,context)=>{
  calls++;assert.equal(Object.hasOwn(context,'days'),false);
  if(text.includes('실패'))throw new CommandError('model_rate_limited','Gemini 사용 한도에 도달했어요.',429);
  if(text.includes('제거'))return {intent:'delete',groupName:'생활 루틴',routineName:'명상'};
  return text.includes('지워')?{intent:'clarify',groupName:null,routineName:null}:{intent:'add',groupName:'생활 루틴',routineName:'명상'};
 };
 const fixture=await startTestServer(initialState,{interpret});
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(fixture.base+'/sample2/#chat');await page.locator('#chat-form').waitFor();
  assert.equal(await page.locator('.chat-mock-badge').innerText(),'Gemini');
  const send=async text=>{await page.locator('#chat-input').fill(text);await page.getByRole('button',{name:'보내기',exact:true}).click();await settled(page);};
  await send('생활 쪽에 명상이라는 습관 하나 만들어 줄래?');
  assert.equal(fixture.store.read().revision,0);assert.match(await page.locator('.chat-message.assistant').last().innerText(),/Gemini/);
  await page.getByRole('button',{name:'확인하고 반영',exact:true}).click();await settled(page);
  assert.equal(fixture.store.read().state.questions.filter(q=>q.title==='명상').length,1);
  await send('생활 루틴에 명상 항목 추가해줘');
  assert.match(await page.locator('.chat-message.assistant').last().innerText(),/Gemini[\s\S]*이미 있어요/);
  await send('생활 루틴에 명상 항목 제거해줘');
  assert.match(await page.locator('.chat-message.assistant').last().innerText(),/Gemini/);
  assert.match(await page.locator('.chat-proposal').last().innerText(),/생활 루틴.*명상/);
  assert.equal(fixture.store.read().state.questions.filter(q=>q.title==='명상').length,1);
  await page.getByRole('button',{name:'취소',exact:true}).last().click();await settled(page);
  await send('그거 지워줘');assert.match(await page.locator('.chat-message.assistant').last().innerText(),/어떤 루틴/);
  const before=fixture.store.read().revision;
  await send('실패 테스트');assert.equal(await page.locator('#chat-input').inputValue(),'실패 테스트');
  assert.match(await page.locator('#storage-alert').innerText(),/한도/);assert.equal(fixture.store.read().revision,before);
  await page.locator('[data-nav=manage]').click();await page.getByRole('button',{name:'＋ 항목 추가',exact:true}).click();
  await page.locator('[name=title]').fill('AI 실패 중 수동 항목');await page.getByRole('button',{name:'항목 추가 ✓',exact:true}).click();await settled(page);
  assert.ok(fixture.store.read().state.questions.some(q=>q.title==='AI 실패 중 수동 항목'));
  assert.equal(calls,5);
  console.log('PASS: Gemini mode/source labels, natural request to stored proposal, explicit confirm, ambiguity response, provider failure preserves input, manual management works. Interpreter is a deterministic test double.');
 }finally{await browser.close();await fixture.close();}
})().catch(e=>{console.error(e);process.exit(1)});
