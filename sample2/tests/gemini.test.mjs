import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {geminiSettings} from '../server/config.mjs';
import {createGeminiInterpreter} from '../server/gemini.mjs';
import {routineContext,proposeRoutine} from '../server/routine-intent.mjs';
import {chat} from '../server/chat-service.mjs';
import {DiaryStore} from '../server/store.mjs';
import {initialState} from '../model.mjs';
import {CommandError} from '../commands.mjs';

const settings={apiKey:'fake-secret-for-test',model:'gemini-3.5-flash-lite',timeoutSeconds:10};
const add={intent:'add',groupName:'생활 루틴',routineName:'명상'};
const response=value=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]})});
async function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'diary-gemini-')),store=new DiaryStore(join(dir,'db.sqlite'),{create:true});
  store.initialize(initialState);await store.prepareProposals();
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});return store;
}
test('Gemini configuration is explicit and rejects incomplete settings without echoing secrets',()=>{
  assert.equal(geminiSettings({}),null);
  assert.throws(()=>geminiSettings({AGENT_MODEL:'gemini/test'}),/GEMINI_API_KEY/);
  assert.throws(()=>geminiSettings({GEMINI_API_KEY:'private',AGENT_MODEL:'other/model'}),error=>!error.message.includes('private'));
  for(const timeout of ['0','31','NaN'])assert.throws(()=>geminiSettings({GEMINI_API_KEY:'private',AGENT_MODEL:'gemini/test',AGENT_TIMEOUT_SECONDS:timeout}));
  assert.deepEqual(geminiSettings({GEMINI_API_KEY:'key',AGENT_MODEL:'gemini/test'}),{apiKey:'key',model:'test',timeoutSeconds:10});
});
test('one structured REST request uses header authentication and sends names only',async()=>{
  let sent,count=0;
  const interpret=createGeminiInterpreter(settings,{fetchImpl:async(url,options)=>{count++;sent={url,options};return response(add);}});
  const state=initialState();state.days['2026-10-23']={answers:{worknote:'private diary not to send'},plan:[]};
  assert.deepEqual(await interpret('생활에 명상 하나 추가',routineContext(state)),add);
  assert.equal(count,1);assert.equal(sent.url.includes(settings.apiKey),false);
  assert.equal(sent.options.headers['x-goog-api-key'],settings.apiKey);
  assert.equal(sent.options.body.includes('private diary not to send'),false);
  const body=JSON.parse(sent.options.body);
  assert.equal(body.generationConfig.responseMimeType,'application/json');assert.equal(body.generationConfig.responseJsonSchema.additionalProperties,false);
  assert.equal(body.tools,undefined);assert.equal(body.generationConfig.maxOutputTokens,1024);
});
test('provider failures, malformed outputs and blocked/truncated answers do not become writes or expose raw errors',async()=>{
  for(const [status,code] of [[401,'model_auth_error'],[403,'model_auth_error'],[404,'model_not_found'],[429,'model_rate_limited'],[500,'model_unavailable']]) {
    let calls=0;
    const interpret=createGeminiInterpreter(settings,{fetchImpl:async()=>{calls++;return {ok:false,status,json:async()=>({error:{message:settings.apiKey}})};}});
    await assert.rejects(interpret('명상 추가',{}),e=>e.code===code&&!e.message.includes(settings.apiKey));assert.equal(calls,1);
  }
  for(const value of [{...add,command:'confirm'},null,{intent:'delete',routineName:'명상'}, {...add,routineName:3}]) {
    const interpret=createGeminiInterpreter(settings,{fetchImpl:async()=>response(value)});
    await assert.rejects(interpret('명상 추가',{}),e=>e.code==='model_invalid_output');
  }
  const truncated=createGeminiInterpreter(settings,{fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS'}]})})});
  await assert.rejects(truncated('명상 추가',{}),e=>e.code==='model_invalid_output');
  const timeout=createGeminiInterpreter(settings,{fetchImpl:async()=>{const e=new Error(settings.apiKey);e.name='TimeoutError';throw e;}});
  await assert.rejects(timeout('명상 추가',{}),e=>e.code==='model_timeout'&&!e.message.includes(settings.apiKey));
});
test('AI add shares domain validation, confirms only once, and missing groups require selection',async t=>{
  const store=await fixture(t),before=store.read();
  const result=await chat(store,'생활 루틴에 명상 항목 추가해줘',async()=>add);
  assert.equal(result.source,'gemini');assert.deepEqual(store.read(),before);
  const applied=store.decide(result.proposalId,'confirm');assert.equal(applied.status,'applied');
  assert.deepEqual(store.decide(result.proposalId,'confirm'),applied);assert.equal(store.read().state.questions.filter(q=>q.title==='명상').length,1);
  const duplicate=proposeRoutine(store,store.read(),add);assert.equal(duplicate.kind,'answer');
  const unspecified=proposeRoutine(store,store.read(),{...add,groupName:null,routineName:'산책'});
  assert.equal(unspecified.kind,'choices');assert.equal(unspecified.choices.length,4);
});
test('qualified routine requests reach Gemini even when legacy name resolution fails',async t=>{
  const store=await fixture(t);
  store.execute({requestId:'seed-meditation',expectedRevision:0,type:'routine.create',payload:{groupId:'life',title:'명상'}});
  for(const [text,intent] of [
    ['생활 루틴에 명상 항목 제거해줘',{intent:'delete',groupName:'생활 루틴',routineName:'명상'}],
    ['없는 항목 항목 삭제해줘',{intent:'delete',groupName:null,routineName:'없는 항목'}],
    ['생활 쪽에 산책 항목 추가해줘',{intent:'add',groupName:'생활 루틴',routineName:'산책'}],
  ]) {
    let calls=0;const before=store.read();
    const result=await chat(store,text,async()=>{calls++;return intent;});
    assert.equal(calls,1,text);assert.equal(result.source,'gemini');assert.deepEqual(store.read(),before);
    if(intent.intent==='delete'&&intent.routineName==='명상') {
      assert.equal(result.kind,'proposal');
      const preview=result.preview.join(' ');assert.match(preview,/생활 루틴.*명상/);assert.match(preview,/항목 삭제/);
    }
  }
});
test('AI deletion of ambiguous names requires choosing a candidate and keeps archived answers',async t=>{
  const store=await fixture(t);
  const execute=(type,payload)=>store.execute({requestId:crypto.randomUUID(),expectedRevision:store.read().revision,type,payload});
  execute('routine.create',{groupId:'life',title:'명상'});execute('routine.create',{groupId:'body',title:'명상'});
  const id=store.read().state.questions.find(q=>q.title==='명상').id;
  execute('answers.save',{date:store.read().today,values:{[id]:'O'}});
  const days=store.read().state.days;
  const result=await chat(store,'명상은 목록에서 없애줘',async()=>({intent:'delete',routineName:'명상',groupName:null}));
  assert.equal(result.kind,'choices');store.decide(result.choices[0].result.proposalId,'confirm');
  assert.equal(store.read().state.questions.find(q=>q.id===id).deleted,true);assert.deepEqual(store.read().state.days,days);
});
test('unsupported/ambiguous/nonexistent requests never mutate diary; legacy read queries bypass Gemini',async t=>{
  const store=await fixture(t),before=store.read();
  for(const intent of [{intent:'clarify',groupName:null,routineName:null},{intent:'unsupported',groupName:null,routineName:null},{intent:'delete',groupName:null,routineName:'not a routine'}])assert.equal(proposeRoutine(store,before,intent).kind,'answer');
  const read=await chat(store,'이번 주 점수 어때?',async()=>{throw Error('must not call provider');});
  assert.equal(read.source,'scripted');assert.deepEqual(store.read(),before);
});
test('editing during awaited interpretation invalidates its proposal; provider failure does not fall back to scripted write',async t=>{
  const store=await fixture(t);
  await assert.rejects(chat(store,'생활 루틴에 명상 항목 추가해줘',async()=>{
    store.execute({requestId:'other',expectedRevision:0,type:'group.create',payload:{name:'다른 수정'}});return add;
  }),e=>e.code==='revision_conflict');
  const before=store.read();
  await assert.rejects(chat(store,'생활 루틴에 명상 항목 추가해줘',async()=>{throw new CommandError('model_timeout','timeout',504);}),e=>e.code==='model_timeout');
  assert.deepEqual(store.read(),before);
});
