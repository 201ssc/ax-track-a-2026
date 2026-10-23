import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,planFor,saveAnswers,report,shiftDate,today,isRecorded,deleteQuestion,hasAnswer,saveMessage,messageFor,toggleMessage,upgradeState,upgradePlanning,titleFor,saveTitle,toggleTitle,saveSchedule,toggleSchedule} from '../model.mjs';
test('X is a completed answer; an unanswered item stays empty',()=>{const s=initialState(),d=today();const next=saveAnswers(s,d,planFor(s,d),{floss:'X'});assert.equal(hasAnswer(next.days[d].answers.floss),true);assert.equal(hasAnswer(next.days[d].answers.water),false);assert.equal(Object.keys(s.days).length,0);});
test('partial submission preserves previously saved answers',()=>{const d=today(),s=initialState();const a=saveAnswers(s,d,planFor(s,d),{floss:'X'});const b=saveAnswers(a,d,planFor(a,d),{water:'O'});assert.deepEqual(b.days[d].answers,{floss:'X',water:'O'});});
test('archiving keeps saved responses and historical wording',()=>{const d=shiftDate(today(),-1),s=initialState();const a=saveAnswers(s,d,planFor(s,d),{floss:'X'});a.questions.find(q=>q.id==='floss').active=false;a.questions.find(q=>q.id==='floss').title='changed';assert.equal(planFor(a,d).find(q=>q.id==='floss').title,'치실 사용');assert.equal(isRecorded(a,'floss'),true);});
test('today retains answered question type when definitions change',()=>{const d=today(),s=initialState(),a=saveAnswers(s,d,planFor(s,d),{floss:'O'});a.questions.find(q=>q.id==='floss').type='text';assert.equal(planFor(a,d).find(q=>q.id==='floss').type,'ox');});
test('report distinguishes X from missing and does not score empty days as zero',()=>{const d=today(),p=shiftDate(d,-1),s=initialState();const a=saveAnswers(s,p,planFor(s,p),{floss:'X',score:'4'});const b=saveAnswers(a,d,planFor(a,d),{floss:'O'});const r=report(b,d,7);assert.equal(r.average,4);assert.equal(r.recordedDays,2);assert.equal(r.answered,3);assert.deepEqual(r.habits.find(h=>h.id==='floss'),{id:'floss',title:'치실 사용',yes:1,no:1,missing:0});assert.equal(r.habits.find(h=>h.id==='water').missing,2);});
test('future dates, empty submissions, invalid values are rejected',()=>{const d=today(),s=initialState();assert.throws(()=>saveAnswers(s,shiftDate(d,1),planFor(s,d),{floss:'O'}));assert.throws(()=>saveAnswers(s,d,planFor(s,d),{}));assert.throws(()=>saveAnswers(s,d,planFor(s,d),{score:'9'}));assert.throws(()=>saveAnswers(s,d,planFor(s,d),{worktype:'<other>'}));});

test('tomorrow sentences appear only on the next date; checking does not change routine totals',()=>{
 const source=shiftDate(today(),-1),s=initialState();s.questions.find(q=>q.id==='tomorrow').purpose='tomorrow';
 const legacyPlan=planFor(s,source).map(q=>q.id==='tomorrow'?{...q,purpose:'tomorrow'}:q);
 const a=saveAnswers(s,source,legacyPlan,{tomorrow:'미팅 자료 준비하기\n행복한 하루 보내기'});
 assert.equal(messageFor(a,today()).items.length,2);
 assert.equal(messageFor(a,source).items.length,0);
 const before=report(a,today(),7);
 const b=toggleMessage(a,today(),messageFor(a,today()).items[1].id);
 assert.equal(messageFor(b,today()).items[1].checked,true);
 assert.deepEqual(report(b,today(),7),before);
 assert.equal(messageFor(a,today()).items[1].checked,false);
});
test('edits preserve checks only for unchanged sentences; duplicate and overlong lines fail',()=>{
 const d=shiftDate(today(),-1),a=saveMessage(initialState(),d,'먼저 인사하기\n자료 준비');
 const b=toggleMessage(a,today(),messageFor(a,today()).items[0].id);
 const c=saveMessage(b,d,'먼저 인사하기\n행복한 하루 보내기');
 assert.equal(messageFor(c,today()).items[0].checked,true);
 assert.equal(messageFor(c,today()).items[1].checked,false);
 assert.equal(messageFor(c,today()).items[0].id,messageFor(b,today()).items[0].id);
 assert.throws(()=>saveMessage(c,d,'중복\n중복'));
 assert.throws(()=>saveMessage(c,d,'가'.repeat(201)));
 assert.equal(messageFor(saveMessage(c,d,''),today()).items.length,0);
});
test('upgrade preserves old diary answers, custom fields, and does not turn reflections into tasks',()=>{
 const s=initialState();delete s.features;delete s.messages;
 s.questions=s.questions.filter(q=>q.id!=='tomorrow');
 s.questions.push({id:'note',groupId:'reflection',title:'하루 한 줄',type:'text',description:'',active:true,options:[]});
 const d=shiftDate(today(),-1),a=saveAnswers(s,d,planFor(s,d),{note:'오늘도 수고했다.'});
 const b=upgradeState(a);
 assert.deepEqual(b.days,a.days);
 assert.equal(b.questions.find(q=>q.id==='note').active,false);
 assert.equal(b.questions.filter(q=>q.purpose==='tomorrow'||q.purpose==='dayTitle').length,1);
 assert.deepEqual(messageFor(b,today()).items,[]);
 assert.deepEqual(upgradeState(b),b);
 assert.equal(a.questions.find(q=>q.id==='note').active,true);
 a.questions.find(q=>q.id==='note').title='나만의 회고';
 assert.equal(upgradeState(a).questions.find(q=>q.id==='note').active,true);
});

test('one-line title belongs to the next day and checks remain independent of routine totals',()=>{
 const d=shiftDate(today(),-1),s=initialState(),a=saveAnswers(s,d,planFor(s,d),{tomorrow:'먼저 인사하는 하루'});
 assert.equal(a.dayTitles[today()].text,'먼저 인사하는 하루');
 const b=toggleTitle(a,today());assert.equal(b.dayTitles[today()].checked,true);assert.deepEqual(report(b,today(),7),report(a,today(),7));
 assert.throws(()=>saveTitle(a,today(),'한 줄\n두 줄'));
 assert.equal(saveTitle(b,today(),'새로운 제목').dayTitles[today()].checked,false);
});
test('dated schedules can be planned for future dates and never affect diary counts',()=>{
 const s=initialState(),future=shiftDate(today(),5),a=saveSchedule(s,{date:future,text:'자료 준비'}),id=a.schedules[0].id;
 assert.throws(()=>toggleSchedule(a,id));
 const b=saveSchedule(a,{id,date:today(),text:'자료 준비'}),c=toggleSchedule(b,id);
 assert.equal(c.schedules[0].checked,true);assert.deepEqual(report(c,today(),7),report(s,today(),7));
 assert.equal(saveSchedule(c,{id,date:future,text:'자료 준비'}).schedules[0].checked,false);
 assert.throws(()=>saveSchedule(s,{date:'2026-02-30',text:'invalid'}));
});
test('dated planning upgrade retains old multi-line notes without guessing a title or a schedule',()=>{
 const s=initialState();delete s.features.datedPlanning;s.questions.find(q=>q.id==='tomorrow').purpose='tomorrow';
 const a=saveMessage(s,shiftDate(today(),-1),'미팅 준비\n행복한 하루 보내기'),b=upgradePlanning(a);
 assert.deepEqual(b.messages,a.messages);assert.deepEqual(b.days,a.days);assert.deepEqual(b.dayTitles,{});assert.deepEqual(b.schedules,[]);
 assert.equal(b.questions.find(q=>q.id==='tomorrow').purpose,'dayTitle');assert.deepEqual(upgradePlanning(b),b);
 const source=shiftDate(today(),-1),oldPlan=planFor(s,source).map(q=>q.id==='tomorrow'?{...q,purpose:'tomorrow'}:q);
 const old=saveAnswers(s,source,oldPlan,{tomorrow:'미팅 준비\n행복한 하루 보내기'});
 assert.equal(titleFor(upgradePlanning(old),today()).text,'');
});

test('old and current dates display the same next-day title without rewriting the saved source',()=>{
 const s=initialState();delete s.features;
 s.questions=s.questions.filter(q=>q.id!=='tomorrow');s.questions.push({id:'note',groupId:'reflection',title:'하루 한 줄',type:'text',description:'',options:[],active:true});
 const past=shiftDate(today(),-1),rawPlan=s.questions.map(q=>({...q,groupName:s.groups.find(g=>g.id===q.groupId).name}));
 const a=saveAnswers(s,past,rawPlan,{note:'남겨둔 원문'}),b=upgradePlanning(a),before=structuredClone(b.days);
 const old=planFor(b,past).find(q=>q.id==='note'),current=planFor(b,today()).find(q=>q.purpose==='dayTitle');
 assert.equal(old.title,'내일의 제목');assert.equal(old.purpose,'dayTitle');assert.equal(current.title,old.title);assert.deepEqual(b.days,before);
 assert.equal(titleFor(b,today()).text,'남겨둔 원문');assert.deepEqual(b.days,before);
 const c=saveAnswers(b,past,planFor(b,past),{note:'내일은 가볍게 시작하기'});assert.equal(c.dayTitles[today()].text,'내일은 가볍게 시작하기');assert.equal(a.days[past].answers.note,'남겨둔 원문');
});

test('saved previous-day answers override stale title copies immediately and keep unrelated records untouched',()=>{
 const d=today(),past=shiftDate(d,-1),s=initialState();
 const a=saveAnswers(s,past,planFor(s,past),{tomorrow:'전날 정한 제목',score:'4'});
 a.dayTitles[d]={text:'다른 예시 제목',checked:true};
 const before=structuredClone(a);
 assert.deepEqual(titleFor(a,d),{text:'전날 정한 제목',checked:false});assert.deepEqual(a,before);
 const b=toggleTitle(a,d);assert.deepEqual(titleFor(b,d),{text:'전날 정한 제목',checked:true});assert.deepEqual(b.days,a.days);
 const c=saveAnswers(b,past,planFor(b,past),{score:'5'});
 assert.deepEqual(titleFor(c,d),{text:'전날 정한 제목',checked:true});
 const changed=saveAnswers(c,past,planFor(c,past),{tomorrow:'바뀐 제목'});
 assert.deepEqual(titleFor(changed,d),{text:'바뀐 제목',checked:false});
 assert.equal(titleFor(changed,past).text,'');assert.equal(titleFor(changed,shiftDate(d,1)).text,'');
});

test('editing or clearing the home title updates the previous-day answer, including an initially empty day',()=>{
 const d=today(),past=shiftDate(d,-1),s=initialState();
 let a=saveTitle(s,d,'상단에서 정한 제목');
 assert.equal(a.days[past].answers.tomorrow,'상단에서 정한 제목');assert.deepEqual(s.days,{});
 a=saveAnswers(a,past,planFor(a,past),{score:'3'});
 const b=saveTitle(a,d,'수정한 제목');assert.equal(b.days[past].answers.tomorrow,'수정한 제목');assert.equal(b.days[past].answers.score,'3');
 const c=saveTitle(b,d,'');assert.equal(c.days[past].answers.tomorrow,undefined);assert.equal(c.days[past].answers.score,'3');assert.equal(titleFor(c,d).text,'');
 assert.equal(titleFor(JSON.parse(JSON.stringify(c)),d).text,'');
});
test('deleting a recorded routine removes it from current and future plans while preserving history and reports',()=>{
 const d=today(),past=shiftDate(d,-1),s=initialState();
 let a=saveAnswers(s,past,planFor(s,past),{floss:'O'});a=saveAnswers(a,d,planFor(a,d),{floss:'X'});
 const before=structuredClone(a),summary=report(a,d,7),next=deleteQuestion(a,'floss');
 assert.deepEqual(a,before);assert.deepEqual(next.days,a.days);assert.deepEqual(report(next,d,7),summary);
 assert.equal(next.questions.find(q=>q.id==='floss').deleted,true);
 assert.equal(planFor(next,d).some(q=>q.id==='floss'),false);assert.equal(planFor(next,shiftDate(d,1)).some(q=>q.id==='floss'),false);
 assert.equal(planFor(next,past).some(q=>q.id==='floss'),true);
 assert.equal(planFor(JSON.parse(JSON.stringify(next)),d).some(q=>q.id==='floss'),false);
 const later=saveAnswers(next,d,planFor(next,d),{water:'O'});
 assert.equal(later.days[d].answers.floss,'X');assert.equal(later.days[d].plan.some(q=>q.id==='floss'),true);
 assert.deepEqual(report(later,d,7).habits.find(q=>q.id==='floss'),summary.habits.find(q=>q.id==='floss'));
 assert.equal(planFor(later,d,shiftDate(d,1)).some(q=>q.id==='floss'),true);
});
test('deleting a never-answered routine removes its definition and leaves other routines unchanged',()=>{
 const s=initialState(),next=deleteQuestion(s,'floss');
 assert.equal(next.questions.some(q=>q.id==='floss'),false);assert.equal(s.questions.some(q=>q.id==='floss'),true);
 assert.deepEqual(next.questions,s.questions.filter(q=>q.id!=='floss'));assert.throws(()=>deleteQuestion(next,'floss'));
});
test('a removed next-day title question does not break editing a previously recorded home title',()=>{
 const d=today(),s=initialState(),a=saveAnswers(s,d,planFor(s,d),{tomorrow:'첫 제목'});
 const next=saveTitle(deleteQuestion(a,'tomorrow'),shiftDate(d,1),'수정한 제목');
 assert.equal(titleFor(next,shiftDate(d,1)).text,'수정한 제목');assert.equal(next.days[d].answers.tomorrow,'수정한 제목');assert.equal(planFor(next,d).some(q=>q.id==='tomorrow'),false);
});
