import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {request} from 'node:http';
import {DiaryStore} from '../server/store.mjs';
import {createDiaryServer} from '../server/http.mjs';
import {clock} from '../server/clock.mjs';
import {initialState,report} from '../model.mjs';

async function setup(t,{seed=initialState}={}) {
  const dir=mkdtempSync(join(tmpdir(),'diary-http-')),path=join(dir,'diary.sqlite');
  let instant=new Date('2026-10-23T12:00:00Z');
  const store=new DiaryStore(path,{create:true,now:()=>clock(instant)});store.initialize(seed);
  const before=store.read();await store.prepareProposals();
  const server=createDiaryServer(store);await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));store.close();rmSync(dir,{recursive:true,force:true});});
  const get=async path=>(await fetch(base+path)).json();
  const post=async(path,input)=>{const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(input)});return {status:response.status,data:await response.json()};};
  let id=0;const command=(type,payload)=>post('/api/commands',{requestId:`http-${++id}`,expectedRevision:store.read().revision,type,payload});
  return {dir,path,base,store,before,get,post,command,advance:()=>{instant=new Date(instant.getTime()+86400001);}};
}

test('migration preserves v1 records and receipts with a restorable backup',async t=>{
  const {store,before,dir}=await setup(t);
  assert.deepEqual(store.read(),before);
  const name=readdirSync(dir).find(x=>x.includes('before-v2'));
  const backup=new DiaryStore(join(dir,name),{now:()=>clock(new Date('2026-10-23T12:00:00Z'))});
  try {assert.deepEqual(backup.read(),before);}finally{backup.close();}
});
test('HTTP serves only UI files, enforces host/origin/JSON and never exposes configuration',async t=>{
  const {base}=await setup(t);
  for(const path of ['/sample2/','/sample2/api.mjs','/sample2/app.js'])assert.equal((await fetch(base+path)).status,200);
  for(const path of ['/sample2/.env','/sample2/server/store.mjs','/sample2/docs/HANDOFF.md','/.git/config','/sample2/diary.sqlite'])assert.equal((await fetch(base+path)).status,404);
  const invalidHost=await new Promise((resolve,reject)=>{const req=request(base+'/api/diary',{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();});
  assert.equal(invalidHost,403);
  assert.equal((await fetch(base+'/api/commands',{method:'POST',headers:{Origin:'https://attacker.example','Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/commands',{method:'POST',body:'{}'})).status,415);
  assert.equal((await fetch(base+'/api/commands',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
});
test('HTTP command persisted; lost-reply retry and stale revision return correct results',async t=>{
  const {post,get}=await setup(t);
  const input={requestId:'lost',expectedRevision:0,type:'routine.create',payload:{groupId:'life',title:'명상'}};
  const first=await post('/api/commands',input);assert.equal(first.status,200);
  assert.deepEqual(await post('/api/commands',input),first);
  assert.equal((await get('/api/diary')).state.questions.filter(q=>q.title==='명상').length,1);
  assert.equal((await post('/api/commands',{...input,requestId:'stale'})).data.code,'revision_conflict');
  assert.equal((await post('/api/commands',{...input,payload:{...input.payload,title:'다른 이름'}})).data.code,'request_id_reused');
  assert.equal((await post('/api/commands',{...input,requestId:'bad',expectedRevision:1,state:{}})).status,422);
});
test('chat proposal never writes before confirm; delete preserves historical data and reports',async t=>{
  const {store,command,post,get}=await setup(t);
  await command('answers.save',{date:'2026-10-23',values:{vitamin:'O',score:'4'}});
  const before=store.read();const proposal=(await post('/api/chat',{text:'비타민 챙기기 항목 빼줘'})).data;
  assert.equal(proposal.kind,'proposal');assert.equal(proposal.action,undefined);assert.deepEqual(store.read(),before);
  const reply=await post(`/api/proposals/${proposal.proposalId}/confirm`,{});
  assert.equal(reply.data.status,'applied');assert.equal(store.read().state.questions.find(q=>q.id==='vitamin').deleted,true);
  assert.deepEqual(report(store.read().state,'2026-10-23',7),report(before.state,'2026-10-23',7));
  assert.deepEqual((await post(`/api/proposals/${proposal.proposalId}/confirm`,{})).data,reply.data);
  assert.equal((await post(`/api/proposals/${proposal.proposalId}/cancel`,{})).data.status,'applied');
  assert.equal((await get(`/api/proposals/${proposal.proposalId}`)).status,'applied');
});
test('proposal cancellation, expiry, stale edits and forged confirmation cannot apply records',async t=>{
  const {store,post,command,advance}=await setup(t);
  const propose=async title=>(await post('/api/chat',{text:`생활 루틴에 ${title} 항목 추가해줘`})).data.proposalId;
  const cancel=await propose('취소대상');await post(`/api/proposals/${cancel}/cancel`,{});
  assert.equal((await post(`/api/proposals/${cancel}/confirm`,{})).data.status,'cancelled');
  const stale=await propose('오래된제안');await command('group.create',{name:'새 목차'});
  assert.equal((await post(`/api/proposals/${stale}/confirm`,{})).data.code,'revision_conflict');
  const expired=await propose('만료제안');advance();
  assert.equal((await post(`/api/proposals/${expired}/confirm`,{})).data.status,'expired');
  assert.equal((await post(`/api/proposals/${expired}/confirm`,{type:'routine.create'})).status,422);
  assert.equal(store.read().state.questions.some(q=>['취소대상','오래된제안','만료제안'].includes(q.title)),false);
});
test('ambiguous names require choosing a stored proposal; schedules/groups remain scripted',async t=>{
  const {store,command,post}=await setup(t);
  await command('routine.create',{groupId:'life',title:'명상'});await command('routine.create',{groupId:'body',title:'명상'});
  const result=(await post('/api/chat',{text:'명상 항목 빼줘'})).data;
  assert.equal(result.kind,'choices');assert.equal(result.choices.length,2);
  await post(`/api/proposals/${result.choices[1].result.proposalId}/confirm`,{});
  assert.equal(store.read().state.questions.filter(q=>q.title==='명상').length,1);
  const group=(await post('/api/chat',{text:'취미 목차 추가해줘'})).data;
  await post(`/api/proposals/${group.proposalId}/confirm`,{});
  assert.ok(store.read().state.groups.some(g=>g.name==='취미'));
  const schedule=(await post('/api/chat',{text:'내일 독서 모임'})).data;
  await post(`/api/proposals/${schedule.proposalId}/confirm`,{});
  assert.equal(store.read().state.schedules.at(-1).date,'2026-10-24');
});
test('proposal and successful receipt persist across restart; confirm failure rolls back everything',async t=>{
  const {store,path,post}=await setup(t);
  const p=(await post('/api/chat',{text:'생활 루틴에 명상 항목 추가해줘'})).data;
  const sql=new DatabaseSync(path);
  try {
    sql.exec("CREATE TRIGGER fail_proposal BEFORE UPDATE ON proposals BEGIN SELECT RAISE(ABORT,'injected failure'); END");
    assert.equal((await post(`/api/proposals/${p.proposalId}/confirm`,{})).status,503);
    assert.equal(store.read().revision,0);assert.equal(store.proposal(p.proposalId).status,'pending');
    assert.equal(sql.prepare('SELECT count(*) AS n FROM command_receipts').get().n,0);
    sql.exec('DROP TRIGGER fail_proposal');
    const reopened=new DiaryStore(path);try {assert.equal(reopened.decide(p.proposalId,'confirm').status,'applied');}finally{reopened.close();}
    assert.equal((await post(`/api/proposals/${p.proposalId}/confirm`,{})).data.status,'applied');
    assert.equal(store.read().state.questions.filter(q=>q.title==='명상').length,1);
  }finally{sql.close();}
});
