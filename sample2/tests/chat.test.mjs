import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,today,planFor,saveAnswers,saveSchedule,reflectionEntries,deleteQuestion} from '../model.mjs';
import {respondChat,applyChatAction} from '../chat.mjs';

test('group and item proposals never mutate state before confirmation',()=>{
 const s=initialState(),copy=structuredClone(s);
 const proposal=respondChat(s,'취미 목차 추가해줘');assert.equal(proposal.kind,'proposal');assert.deepEqual(s,copy);
 const a=applyChatAction(s,proposal.action);assert.ok(a.groups.some(g=>g.name==='취미'));
 const item=respondChat(a,'취미에 그림 그리기 항목 추가해줘');assert.equal(item.kind,'proposal');
 const b=applyChatAction(a,item.action);assert.ok(b.questions.some(q=>q.title==='그림 그리기'&&q.active));
 assert.throws(()=>applyChatAction(b,item.action));
});
test('removing a recorded item deletes its current definition and retains past answers',()=>{
 const d=today(),s=initialState(),a=saveAnswers(s,d,planFor(s,d),{vitamin:'X'});
 const p=respondChat(a,'비타민 챙기기 항목 빼줘');assert.equal(p.kind,'proposal');
 const b=applyChatAction(a,p.action);assert.equal(b.questions.find(q=>q.id==='vitamin').active,false);assert.deepEqual(b.days,a.days);
 const group=respondChat(a,'운동·건강 목차 삭제해줘');const c=applyChatAction(a,group.action);assert.ok(c.questions.filter(q=>q.groupId==='body').every(q=>!q.active));assert.deepEqual(c.days,a.days);
});
test('calendar phrases resolve concrete dates and move the named event only',()=>{
 const s=initialState(),p=respondChat(s,'이번달 27일 미팅 자료 준비하기','2026-10-22');assert.deepEqual(p.preview,['2026-10-27','미팅 자료 준비하기']);
 const a=applyChatAction(s,p.action),move=respondChat(a,'미팅 자료 준비하기 이거 30일로 변경해줘','2026-10-22');assert.equal(move.kind,'proposal');
 const b=applyChatAction(a,move.action);assert.equal(b.schedules[0].date,'2026-10-30');assert.equal(a.schedules[0].date,'2026-10-27');
 assert.equal(respondChat(s,'이번 달 30일 회의','2026-02-20').kind,'answer');assert.match(respondChat(s,'이번 달 30일 회의','2026-02-20').text,/날짜는 없/);
});
test('remaining monthly tasks exclude completed, overdue, and other months',()=>{
 let s=initialState();for(const [date,text] of [['2026-10-21','지난 일'],['2026-10-27','남은 일'],['2026-11-01','다음 달'],['2026-10-28','끝난 일']])s=saveSchedule(s,{date,text});s.schedules[3].checked=true;
 const copy=structuredClone(s),r=respondChat(s,'이번달에 남은 할일은 뭐가 있어?','2026-10-22');assert.match(r.text,/2026-10-27 · 남은 일/);assert.doesNotMatch(r.text,/지난 일|끝난 일|2026-11-01/);assert.deepEqual(s,copy);
});
test('duplicate schedule names require choosing one, then confirmation',()=>{
 let s=saveSchedule(initialState(),{date:'2026-10-27',text:'자료 준비'});s=saveSchedule(s,{date:'2026-10-28',text:'자료 준비'});
 const r=respondChat(s,'자료 준비를 30일로 변경해줘','2026-10-22');assert.equal(r.kind,'choices');assert.equal(r.choices.length,2);assert.match(r.choices[0].label,/2026-10-27/);
 const next=applyChatAction(s,r.choices[1].result.action);assert.equal(next.schedules[0].date,'2026-10-27');assert.equal(next.schedules[1].date,'2026-10-30');
});
test('stale proposals fail instead of overwriting subsequent edits',()=>{
 const s=saveSchedule(initialState(),{date:'2026-10-27',text:'자료 준비'}),p=respondChat(s,'자료 준비를 30일로 변경해줘','2026-10-22');
 const a=saveSchedule(s,{id:s.schedules[0].id,date:'2026-10-29',text:'자료 준비'});assert.throws(()=>applyChatAction(a,p.action),/바뀌었/);assert.equal(a.schedules[0].date,'2026-10-29');
});
test('weekly queries calculate actual recorded scores and distinguish missing from X',()=>{
 const d=today(),s=initialState(),a=saveAnswers(s,d,planFor(s,d),{score:'4',floss:'X'});
 assert.match(respondChat(a,'이번주 점수 어때?').text,/4\.0 \/ 5점/);
 assert.match(respondChat(a,'어디가 잘 안 되고 있어?').text,/치실 사용: 실천 0회 · 미실천 1회 · 미기록 0회/);
 assert.match(respondChat(s,'이번 주 점수 어때?').text,/저장된 점수가 없/);
 assert.equal(respondChat(s,'아무렇게나 자유 대화해줘').kind,'answer');assert.match(respondChat(s,'아무렇게나 자유 대화해줘').text,/정해진 표현/);
});
test('thoughts report includes reflection text only, excluding choices and next-day titles',()=>{
 const s=initialState(),d=today(),a=saveAnswers(s,d,planFor(s,d),{worknote:'오늘의 회고',worktype:'공부',tomorrow:'내일의 제목'});
 const notes=reflectionEntries(a,d,7);assert.equal(notes.length,1);assert.equal(notes[0].value,'오늘의 회고');
});
test('deleted routines are excluded from chat targets and stale proposals cannot restore them',()=>{
 const s=initialState(),d=today(),a=saveAnswers(s,d,planFor(s,d),{floss:'O'});
 const old=respondChat(a,'치실 사용 항목 빼줘'),next=deleteQuestion(a,'floss');
 assert.equal(respondChat(next,'치실 사용 항목 빼줘').kind,'answer');assert.throws(()=>applyChatAction(next,old.action),/바뀌었/);
 const add=respondChat(next,'생활 루틴에 치실 사용 항목 추가해줘'),again=applyChatAction(next,add.action);
 assert.equal(again.questions.filter(q=>q.title==='치실 사용'&&!q.deleted).length,1);assert.deepEqual(again.days,a.days);
});
