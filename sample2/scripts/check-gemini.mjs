// Opt-in live check. Uses the configured key and a temporary diary only; never runs in npm test.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadEnvironment,geminiSettings} from '../server/config.mjs';
import {createGeminiInterpreter} from '../server/gemini.mjs';
import {DiaryStore} from '../server/store.mjs';
import {createDiaryServer} from '../server/http.mjs';
import {initialState,report} from '../model.mjs';

let store,server,dir;
try {
  loadEnvironment();const settings=geminiSettings();if(!settings)throw Error('Gemini 설정이 필요합니다.');
  dir=mkdtempSync(join(tmpdir(),'diary-live-gemini-'));store=new DiaryStore(join(dir,'db.sqlite'),{create:true});
  store.initialize(initialState);await store.prepareProposals();
  server=createDiaryServer(store,{interpret:createGeminiInterpreter(settings)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=async(path,body)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok){const e=new Error(data.message);e.code=data.code;throw e;}return data;};
  const before=store.read();
  const added=await post('/api/chat',{text:'생활 루틴에 "연동 확인 명상"을 새 습관으로 넣어 줄래?'});
  assert.equal(added.kind,'proposal');assert.equal(added.source,'gemini');assert.deepEqual(store.read().state,before.state);
  const confirmed=await post(`/api/proposals/${added.proposalId}/confirm`,{});
  assert.equal(confirmed.status,'applied');
  assert.deepEqual(await post(`/api/proposals/${added.proposalId}/confirm`,{}),confirmed);
  const q=store.read().state.questions.find(q=>q.title==='연동 확인 명상');assert.ok(q);
  await post('/api/commands',{requestId:'live-answer',expectedRevision:store.read().revision,type:'answers.save',payload:{date:store.read().today,values:{[q.id]:'O'}}});
  const recorded=store.read();
  const ambiguous=await post('/api/chat',{text:'그거 지워줘'});assert.equal(ambiguous.kind,'answer');assert.equal(ambiguous.source,'gemini');assert.deepEqual(store.read().state,recorded.state);
  const removed=await post('/api/chat',{text:'"연동 확인 명상"은 이제 루틴 목록에서 빼 줘. 지난 기록은 남겨줘.'});
  assert.equal(removed.kind,'proposal');assert.equal(removed.source,'gemini');
  assert.equal((await post(`/api/proposals/${removed.proposalId}/confirm`,{})).status,'applied');
  assert.equal(store.read().state.questions.find(x=>x.id===q.id).deleted,true);
  assert.deepEqual(store.read().state.days,recorded.state.days);
  assert.deepEqual(report(store.read().state,recorded.today,7),report(recorded.state,recorded.today,7));
  const after=store.read();
  const missing=await post('/api/chat',{text:'존재하지 않는 "유령 루틴 Z999"를 없애 줘'});assert.equal(missing.kind,'answer');assert.deepEqual(store.read().state,after.state);
  console.log('PASS: 4 real Gemini requests; natural add/delete, ambiguous/unknown requests, confirmation/retry, archived answers and report preserved. Temporary DB only.');
} catch(error) {console.error(JSON.stringify({code:error.code||'live_check_failed',message:error.code?error.message:'실제 Gemini 검사 중 기대한 결과와 다른 응답이 있었습니다.'}));process.exitCode=1;}
finally {if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}store?.close();if(dir)rmSync(dir,{recursive:true,force:true});}
