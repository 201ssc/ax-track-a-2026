import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawn} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {DiaryStore} from '../server/store.mjs';
import {clock} from '../server/clock.mjs';
import {report,titleFor,planFor} from '../model.mjs';

const NOW=()=>clock(new Date('2026-10-23T12:00:00Z'));
function setup(t) {
  const dir=mkdtempSync(join(tmpdir(),'habit-diary-core-')),path=join(dir,'diary.sqlite');
  const store=new DiaryStore(path,{create:true,now:NOW});store.initialize();
  t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
  let seq=0;
  const command=(type,payload)=>store.execute({requestId:`request-${++seq}`,expectedRevision:store.read().revision,type,payload});
  return {dir,path,store,command};
}
const errorCode=code=>error=>error.code===code;
const cli=fileURLToPath(new URL('../server/cli.mjs',import.meta.url));
function child(path,request) {
  return new Promise((resolve,reject)=>{
    const p=spawn(process.execPath,[cli,'command',path]);let stdout='',stderr='';
    p.stdout.on('data',b=>stdout+=b);p.stderr.on('data',b=>stderr+=b);p.on('error',reject);
    p.on('close',code=>resolve({code,result:JSON.parse(code?stderr:stdout)}));
    p.stdin.end(JSON.stringify(request));
  });
}

test('real file persists across processes; init never reseeds new data',t=>{
  const {path,store,command}=setup(t);
  const {result}=command('routine.create',{groupId:'life',title:'명상'});
  const value=JSON.parse(execFileSync(process.execPath,[cli,'read',path],{encoding:'utf8'}));
  assert.equal(value.state.questions.find(q=>q.id===result.id).title,'명상');
  const reopened=new DiaryStore(path,{create:true,now:()=>clock(new Date('2026-11-01T00:00:00Z'))});
  try {assert.deepEqual(reopened.initialize().state,store.read().state);assert.equal(reopened.read().revision,1);}
  finally {reopened.close();}
});

test('lost reply retries use persisted receipt before revision check; changed body conflicts',t=>{
  const {store,path,command}=setup(t);
  const request={requestId:'lost-reply',expectedRevision:0,type:'routine.create',payload:{groupId:'life',title:'명상'}};
  const reply=store.execute(request);
  command('routine.create',{groupId:'life',title:'산책'});
  const other=new DiaryStore(path,{now:NOW});
  try {
    assert.deepEqual(other.execute({...request,payload:{title:'명상',groupId:'life'}}),reply);
    assert.throws(()=>other.execute({...request,payload:{groupId:'life',title:'다른 요청'}}),errorCode('request_id_reused'));
    assert.equal(other.read().state.questions.filter(q=>q.title==='명상').length,1);
    assert.equal(other.read().revision,2);
  } finally {other.close();}
});

test('competing processes cannot overwrite the same revision',async t=>{
  const {path,store}=setup(t);
  const replies=await Promise.all(['a','b'].map(id=>child(path,{requestId:id,expectedRevision:0,type:'routine.create',payload:{groupId:'life',title:id}})));
  assert.deepEqual(replies.map(r=>r.code).sort(),[0,1]);
  assert.equal(replies.find(r=>r.code).result.code,'revision_conflict');
  assert.equal(store.read().revision,1);
});

test('DB failure after state update rolls back both state and receipt; same request can retry',t=>{
  const {path,store}=setup(t),sql=new DatabaseSync(path),before=store.read();
  const request={requestId:'retry',expectedRevision:0,type:'title.set',payload:{date:'2026-10-23',text:'차분한 하루'}};
  try {
    sql.exec("CREATE TRIGGER fail_receipt BEFORE INSERT ON command_receipts BEGIN SELECT RAISE(ABORT,'injected disk-write failure'); END");
    assert.throws(()=>store.execute(request),/injected/);
    assert.deepEqual(store.read(),before);
    assert.equal(sql.prepare('SELECT count(*) AS n FROM command_receipts').get().n,0);
    sql.exec('DROP TRIGGER fail_receipt');store.execute(request);
    const saved=store.read().state;
    assert.equal(titleFor(saved,'2026-10-23').text,'차분한 하루');
    assert.equal(saved.days['2026-10-22'].answers.tomorrow,'차분한 하루');
  } finally {sql.close();}
});

test('delete removes routine while preserving reports and archives through subsequent partial save',t=>{
  const {store,command}=setup(t);
  command('answers.save',{date:'2026-10-23',values:{vitamin:'O'}});
  const before=store.read().state,r=report(before,'2026-10-23',7);
  command('routine.delete',{id:'vitamin'});
  const deleted=store.read().state;
  assert.deepEqual(deleted.days,before.days);assert.deepEqual(report(deleted,'2026-10-23',7),r);
  assert.equal(planFor(deleted,'2026-10-23','2026-10-23').some(q=>q.id==='vitamin'),false);
  command('answers.save',{date:'2026-10-23',values:{reading:'X'}});
  assert.equal(store.read().state.days['2026-10-23'].answers.vitamin,'O');
  const fresh=command('routine.create',{groupId:'body',title:'비타민 챙기기'}).result.id;
  assert.notEqual(fresh,'vitamin');assert.equal(store.read().state.days['2026-10-23'].answers[fresh],undefined);
});

test('strict inputs reject snapshots, invalid IDs, dates, answer types and duplicate names without saving',t=>{
  const {store,command}=setup(t),before=store.read();
  for(const [type,payload] of [
    ['replace-state',{state:{}}],['routine.create',{groupId:'missing',title:'명상'}],
    ['routine.create',{groupId:'life',title:'물 충분히 마시기'}],
    ['routine.create',{groupId:'life',title:' '.repeat(5)}],
    ['routine.create',{groupId:'life',title:'가'.repeat(81)}],
    ['routine.create',{groupId:'life',title:'선택',type:'choice',options:['a','a']}],
    ['answers.save',{date:'2026-02-30',values:{water:'O'}}],
    ['answers.save',{date:'2026-10-24',values:{water:'O'}}],
    ['answers.save',{date:'2026-10-23',values:{water:'bad'}}],
    ['answers.save',{date:'2026-10-23',values:{water:1}}],
    ['answers.save',{date:'2026-10-23',values:{unknown:'O'}}],
    ['answers.save',{date:'2026-10-23',values:{water:'O'},plan:[]}],
    ['routine.delete',{id:'missing'}],['group.delete',{id:'life'}],
  ])assert.throws(()=>command(type,payload),`${type} ${JSON.stringify(payload)}`);
  assert.deepEqual(store.read(),before);
});

test('routine editing, stopping and moving keep old wording and response formats',t=>{
  const {store,command}=setup(t);
  const oldPlan=store.read().state.days['2026-10-22'].plan;
  command('routine.update',{id:'water',groupId:'body',title:'물 기록',type:'choice',options:['충분','조금']});
  assert.deepEqual(store.read().state.days['2026-10-22'].plan,oldPlan);
  command('routine.set-active',{id:'water',active:false});
  assert.equal(store.read().state.questions.find(q=>q.id==='water').active,false);
  command('routine.set-active',{id:'water',active:true});
  command('routine.move',{id:'water',direction:1});
  command('answers.save',{date:'2026-10-23',values:{worknote:'추가 회고',score:'5'}});
  assert.equal(store.read().state.days['2026-10-23'].answers.score,'5');
});

test('empty groups can move, rename and delete; unrecorded routines are physically removed',t=>{
  const {store,command}=setup(t);
  const id=command('group.create',{name:'취미'}).result.id;
  command('group.update',{id,name:'즐거움'});command('group.move',{id,direction:-1});
  const q=command('routine.create',{groupId:id,title:'기타'}).result.id;
  assert.throws(()=>command('group.delete',{id}));command('routine.delete',{id:q});
  assert.equal(store.read().state.questions.some(x=>x.id===q),false);
  command('group.delete',{id});assert.equal(store.read().state.groups.some(g=>g.id===id),false);
});

test('title answer deletion and future planning preserve linked data and independent checks',t=>{
  const {store,command}=setup(t);
  command('answers.save',{date:'2026-10-22',values:{tomorrow:'수정한 제목'}});
  command('title.set-checked',{date:'2026-10-23',checked:true});
  assert.equal(titleFor(store.read().state,'2026-10-23').checked,true);
  command('answers.remove',{date:'2026-10-22',id:'tomorrow'});
  assert.equal(titleFor(store.read().state,'2026-10-23').text,'');
  command('title.set',{date:'2026-10-25',text:'미래 계획'});
  assert.equal(store.read().state.days['2026-10-24'],undefined);
  assert.throws(()=>command('title.set-checked',{date:'2026-10-25',checked:true}));
  command('answers.remove',{date:'2026-10-22',id:'water'});
  assert.equal(store.read().state.days['2026-10-22'].answers.water,undefined);
});

test('schedule final checks are idempotent and date moves reset them',t=>{
  const {store,command}=setup(t);
  const id=command('schedule.save',{date:'2026-10-23',text:'산책'}).result.id;
  command('schedule.set-checked',{id,checked:true});command('schedule.set-checked',{id,checked:true});
  assert.equal(store.read().state.schedules.find(s=>s.id===id).checked,true);
  command('schedule.save',{id,date:'2026-10-24',text:'산책'});
  assert.equal(store.read().state.schedules.find(s=>s.id===id).checked,false);
  assert.throws(()=>command('schedule.set-checked',{id,checked:true}));
  command('schedule.delete',{id});assert.equal(store.read().state.schedules.some(s=>s.id===id),false);
});

test('Seoul clock decides dates across midnight even when process timezone differs',t=>{
  const {path}=setup(t);
  const script=`import {DiaryStore} from ${JSON.stringify(new URL('../server/store.mjs',import.meta.url).href)};import {clock} from ${JSON.stringify(new URL('../server/clock.mjs',import.meta.url).href)};
    const s=new DiaryStore(process.argv[1],{now:()=>clock(new Date('2026-10-23T15:01:00Z'))});
    s.execute({requestId:'timezone',expectedRevision:0,type:'answers.save',payload:{date:'2026-10-24',values:{water:'O'}}});
    console.log(JSON.stringify(s.read()));s.close();`;
  const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',script,path],{encoding:'utf8',env:{...process.env,TZ:'America/Los_Angeles'}}));
  assert.equal(clock(new Date('2026-10-23T14:59:00Z')).today,'2026-10-23');
  assert.equal(result.today,'2026-10-24');assert.equal(result.state.days['2026-10-24'].answers.water,'O');
});

test('backup restores state and receipts in another path without overwriting an existing file',async t=>{
  const {store,command,dir}=setup(t);
  const reply=command('routine.create',{groupId:'life',title:'명상'});
  const path=join(dir,'backup.sqlite');await store.backupTo(path);
  await assert.rejects(store.backupTo(path),/덮어쓰지/);
  const restored=new DiaryStore(path,{now:NOW});
  try {
    assert.deepEqual(restored.read(),store.read());
    assert.deepEqual(restored.execute({requestId:'request-1',expectedRevision:0,type:'routine.create',payload:{groupId:'life',title:'명상'}}),reply);
  }
  finally {restored.close();}
});

test('unknown schema and damaged stored JSON fail closed without seeding over data',t=>{
  const {store,path}=setup(t),sql=new DatabaseSync(path);
  try {
    sql.exec('PRAGMA user_version=99');const before=readFileSync(path);
    assert.throws(()=>new DiaryStore(path,{create:true}),/버전/);
    assert.deepEqual(readFileSync(path),before);
    sql.exec('PRAGMA user_version=1');
    sql.prepare('UPDATE diaries SET state_json=?').run('{"version":99}');
    assert.throws(()=>store.read());assert.throws(()=>store.initialize());
    assert.equal(sql.prepare('SELECT state_json FROM diaries').get().state_json,'{"version":99}');
  } finally {sql.close();}
});
