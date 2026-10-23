import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,today,shiftDate,planFor,saveAnswers,titleFor} from '../model.mjs';
import {createDemoState,refreshExampleTitles} from '../demo.mjs';
import {createPrototype} from '../prototype.mjs';
test('new visitors receive example records without a mode choice',()=>{
 const s=createPrototype();assert.ok(Object.keys(s.days).length>=10);assert.ok(s.dayTitles[today()]?.text);assert.equal(s.source,'prototype');
});
test('legacy personal answers win a date conflict and both legacy inputs stay untouched',()=>{
 const d=today(),s=initialState(),personal=saveAnswers(s,d,planFor(s,d),{score:'2'}),demo=createDemoState();
 const personalBefore=structuredClone(personal),demoBefore=structuredClone(demo),merged=createPrototype({personal,demo});
 assert.equal(merged.days[d].answers.score,'2');assert.deepEqual(merged.days[d],personal.days[d]);assert.ok(Object.keys(merged.days).length>1);assert.deepEqual(personal,personalBefore);assert.deepEqual(demo,demoBefore);
});
test('a personal previous-day title wins over the generated example next-day title without re-saving',()=>{
 const s=initialState(),past=shiftDate(today(),-1);
 const personal=saveAnswers(s,past,planFor(s,past),{tomorrow:'직접 정한 제목'});
 delete personal.dayTitles[today()];
 const before=structuredClone(personal),merged=createPrototype({personal});
 assert.equal(titleFor(merged,today()).text,'직접 정한 제목');assert.deepEqual(personal,before);assert.deepEqual(merged.days[past],personal.days[past]);
});
test('example titles are short intentions and match the next-day home, while reflections stay in their field',()=>{
 const s=createDemoState(),d=today(),past=shiftDate(d,-1);
 for(const [date,day] of Object.entries(s.days)){
  assert.ok(day.answers.tomorrow.length<=80);assert.doesNotMatch(day.answers.tomorrow,/[\r\n]/);
  assert.equal(titleFor(s,shiftDate(date,1)).text,day.answers.tomorrow);
 }
 assert.equal(s.days[past].answers.tomorrow,'먼저 인사하는 하루');
 assert.match(s.days[past].answers.worknote,/충분히 쉬고 일찍 하루를 마무리했다/);
 assert.equal(s.days[d].answers.tomorrow,'작은 일부터 시작하는 하루');
});
test('saved legacy example text is refreshed once, preserving custom titles, other answers, checks, and deletions',()=>{
 const d=today(),past=shiftDate(d,-1),s=createDemoState();delete s.features.exampleTitles;
 const day=s.days[past],question=day.plan.find(q=>q.id==='tomorrow');
 question.id='note';question.title='하루 한 줄';delete question.purpose;
 delete day.answers.tomorrow;day.answers.note='충분히 쉬고 일찍 하루를 마무리했다.';
 s.dayTitles[d]={text:day.answers.note,checked:true};
 const other=shiftDate(d,-3);s.days[other].answers.tomorrow='내가 직접 정한 하루';
 s.dayTitles[shiftDate(other,1)]={text:'내가 직접 정한 하루',checked:true};
 delete s.days[d].answers.tomorrow;delete s.dayTitles[shiftDate(d,1)];
 const before=structuredClone(s),next=refreshExampleTitles(s);
 assert.equal(next.days[past].answers.note,'먼저 인사하는 하루');assert.deepEqual(titleFor(next,d),{text:'먼저 인사하는 하루',checked:false});
 assert.equal(next.days[past].answers.worknote,before.days[past].answers.worknote);
 assert.equal(next.days[past].answers.score,before.days[past].answers.score);
 assert.equal(next.days[d].answers.tomorrow,'작은 일부터 시작하는 하루');
 assert.deepEqual(titleFor(next,shiftDate(other,1)),{text:'내가 직접 정한 하루',checked:true});
 assert.deepEqual(s,before);assert.deepEqual(refreshExampleTitles(next),next);
 delete next.days[d].answers.tomorrow;next.dayTitles[shiftDate(d,1)]={text:'',checked:false};
 assert.equal(refreshExampleTitles(next).days[d].answers.tomorrow,undefined);
});
test('blank titles in edited or personal days are left blank',()=>{
 const d=today(),s=createDemoState();delete s.features.exampleTitles;
 delete s.days[d].answers.tomorrow;s.days[d].updatedAt='2026-10-23T11:22:33Z';
 const next=refreshExampleTitles(s);assert.equal(next.days[d].answers.tomorrow,undefined);
 const personal=initialState();assert.equal(refreshExampleTitles(personal),personal);
});
test('previously unified examples can refresh even when the original demo date metadata was lost',()=>{
 const d=today(),past=shiftDate(d,-1),old=createDemoState();delete old.features.exampleTitles;
 const day=old.days[past],q=day.plan.find(q=>q.id==='tomorrow');q.id='note';q.title='하루 한 줄';delete q.purpose;
 delete day.answers.tomorrow;day.answers.note='충분히 쉬고 일찍 하루를 마무리했다.';old.dayTitles[d]={text:day.answers.note,checked:false};
 // This is the old merger's output when an empty personal store was primary.
 const existing={...initialState(),source:'prototype',days:old.days,dayTitles:old.dayTitles,exampleDates:[]};
 const next=refreshExampleTitles(existing);
 assert.equal(next.days[past].answers.note,'먼저 인사하는 하루');assert.equal(titleFor(next,d).text,'먼저 인사하는 하루');assert.equal(existing.days[past].answers.note,'충분히 쉬고 일찍 하루를 마무리했다.');
});
