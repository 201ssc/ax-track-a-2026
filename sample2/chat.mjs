import {today,shiftDate,uid,report,isRecorded,saveSchedule,deleteQuestion} from './model.mjs?v=f59d64e0da08';

// Scripted stand-in: supported phrases only. No model, network, or hidden writes.
export const CHAT_EXAMPLES=[
 '취미 목차 추가해줘','생활 루틴에 명상 항목 추가해줘','비타민 챙기기 항목 빼줘',
 '이번 달 27일 독서 모임','이번 달 남은 할 일은?','미팅 자료 준비하기를 30일로 변경해줘',
 '이번 주 점수 어때?','어디가 잘 안 되고 있어?',
];
const say=text=>({kind:'answer',text});
const routineResult=result=>({...result,routineRequest:true});
const clean=text=>text.replace(/[“”‘’"']/g,'').trim();
const stripParticle=text=>text.trim().replace(/\s*이거$/,'').replace(/[을를]$/,'').trim();
const signature=value=>JSON.stringify(value);
const snapshot=value=>structuredClone(value);
function proposal(text,action,preview){return {kind:'proposal',text,action,preview};}
function choose(text,values,make,label){if(!values.length)return say('일치하는 이름을 찾지 못했어요. 화면에 있는 이름을 그대로 적어주세요.');if(values.length===1)return make(values[0]);return {kind:'choices',text,choices:values.map(item=>({label:label?label(item):item.date?`${item.date} · ${item.text}`:item.title||item.name,result:make(item)}))};}
function named(items,name,field){const exact=items.filter(item=>item[field]===name);if(exact.length)return exact;const trimmed=stripParticle(name);return items.filter(item=>item[field]===trimmed);}
function knownGroup(state,name){const aliases={'건강':'운동·건강','업무':'업무·공부','공부':'업무·공부','생활':'생활 루틴'};return named(state.groups,name,'name').length?named(state.groups,name,'name'):state.groups.filter(g=>g.name===aliases[name]);}
function resolveDate(raw,reference){
 const normalized=raw.replace(/\s/g,'');
 if(normalized==='오늘')return reference;if(normalized==='내일')return shiftDate(reference,1);if(normalized==='모레')return shiftDate(reference,2);
 let year=Number(reference.slice(0,4)),month=Number(reference.slice(5,7)),day;
 let m=normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(m){year=+m[1];month=+m[2];day=+m[3];}
 else if((m=normalized.match(/^(\d{1,2})월(\d{1,2})일$/))){month=+m[1];day=+m[2];}
 else if((m=normalized.match(/^(이번달|다음달)?(\d{1,2})일$/))){day=+m[2];if(m[1]==='다음달'){month++;if(month>12){month=1;year++;}}}
 else throw Error('날짜를 “이번 달 27일” 또는 “2026-10-27”처럼 적어주세요.');
 const value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
 if(month<1||month>12||day<1||day>31||shiftDate(value,0)!==value)throw Error('해당 날짜는 없어요. 날짜를 다시 확인해 주세요.');
 return value;
}
const DATE='(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}월\\s*\\d{1,2}일|(?:이번\\s*달|다음\\s*달)?\\s*\\d{1,2}일|오늘|내일|모레)';
function week(reference){const day=new Date(`${reference}T12:00:00`).getDay();const length=(day+6)%7+1;return {start:shiftDate(reference,1-length),length};}
function scoreAnswer(state,reference){
 const w=week(reference),r=report(state,reference,w.length);
 if(!r.scores.length)return say(`${w.start}~${reference}에는 저장된 점수가 없어요. 미기록을 0점으로 계산하지 않았어요.`);
 const lines=r.scores.map(s=>`${s.date} · ${s.title}: ${s.value}점`);
 return say(`${w.start}~${reference}\n이번 주 평균은 ${r.average.toFixed(1)} / 5점이에요.\n점수 응답 ${r.scores.length}개, 기록한 날짜 ${new Set(r.scores.map(s=>s.date)).size}일 기준이에요.\n\n${lines.join('\n')}\n\n미기록 날짜는 평균에서 제외했어요.`);
}
function habitAnswer(state,reference){
 const w=week(reference),r=report(state,reference,w.length),answered=r.habits.filter(h=>h.yes+h.no>0);
 if(!answered.length)return say('이번 주에는 O/X로 응답한 루틴이 아직 없어요. 미기록만으로 어떤 루틴이 어려운지 판단하지 않아요.');
 const weak=answered.filter(h=>h.no>0).sort((a,b)=>b.no/(b.yes+b.no)-a.no/(a.yes+a.no));
 const selected=(weak.length?weak:answered).slice(0,3);
 return say(`${w.start}~${reference}\n${weak.length?'응답한 루틴 중 미실천 비중이 높은 항목이에요.':'응답한 루틴에는 미실천 기록이 없어요.'}\n\n${selected.map(h=>`${h.title}: 실천 ${h.yes}회 · 미실천 ${h.no}회 · 미기록 ${h.missing}회`).join('\n')}\n\n저장된 날짜의 항목 구성을 기준으로 세었어요. 미기록은 미실천으로 바꾸지 않았고, 이유는 추측하지 않아요.`);
}
export function respondChat(state,utterance,reference=today()){
 const text=clean(utterance);if(!text)return say('질문이나 요청을 적어주세요.');
 try{
  if(/(?:이번\s*주|이번주).*점수|점수.*(?:이번\s*주)/.test(text))return scoreAnswer(state,reference);
  if(/어디가.*(?:안|어려)|잘\s*안\s*되|루틴.*(?:어때|실천|현황)/.test(text))return habitAnswer(state,reference);
  if(/이번\s*달.*(?:남은|남아|할\s*일|할일|일정)/.test(text)&&/(?:뭐|무엇|알려|보여|있어|\?)/.test(text)){
   const items=(state.schedules||[]).filter(s=>s.date>=reference&&s.date.slice(0,7)===reference.slice(0,7)&&!s.checked).sort((a,b)=>a.date.localeCompare(b.date));
   return say(`${reference} 기준 이번 달 남은 일정 ${items.length}개${items.length?'\n\n'+items.map(s=>`${s.date} · ${s.text}`).join('\n'):'예요.'}\n\n완료한 일정과 오늘 이전 날짜의 일정은 제외했어요.`);
  }
  let m=text.match(/^(.+?)\s*목차(?:를|을)?\s*(?:추가해\s*줘|추가해\s*주세요|만들어\s*줘|추가)$/);
  if(m){const name=m[1].trim();if(name.length>40)return say('목차 이름은 40자까지 적어주세요.');if(state.groups.some(g=>g.name===name))return say('같은 이름의 목차가 이미 있어요. 항목 관리에서 확인해 주세요.');return proposal('새 목차를 추가할까요?',{type:'group-add',name},[`목차 · ${name}`]);}
  m=text.match(/^(.+?)\s*목차(?:를|을)?\s*(?:삭제해\s*줘|제거해\s*줘|빼\s*줘|삭제)$/);
  if(m)return choose('어떤 목차인가요?',knownGroup(state,m[1].trim()),g=>proposal('이 목차의 사용을 중지할까요? 과거 답변은 남아요.',{type:'group-remove',id:g.id,expected:signature(g),questionIds:state.questions.filter(q=>q.groupId===g.id&&!q.deleted).map(q=>({id:q.id,expected:signature(q)}))},[g.name,'이 목차의 항목을 사용 중지합니다. 기록이 없는 빈 목차는 삭제합니다.']));
  m=text.match(/^(.+?)(?:\s*목차)?에\s+(.+?)\s*항목(?:을|를)?\s*(?:추가해\s*줘|추가해\s*주세요|추가)$/);
  if(m){const name=m[2].trim();if(name.length>80)return routineResult(say('항목 이름은 80자까지 적어주세요.'));return routineResult(choose('어느 목차에 추가할까요?',knownGroup(state,m[1].trim()),g=>proposal('O/X로 기록하는 항목을 추가할까요? 다른 답변 방식은 항목 관리에서 바꿀 수 있어요.',{type:'question-add',groupId:g.id,groupExpected:signature(g),title:name},[`${g.name} → ${name}`,'답변 방식 · O/X'])));}
  m=text.match(/^(.+?)\s*항목(?:을|를)?\s*(?:빼\s*줘|삭제해\s*줘|제거해\s*줘|삭제)$/);
  if(m)return routineResult(choose('어떤 항목인가요?',named(state.questions.filter(q=>!q.deleted),m[1].trim(),'title'),q=>proposal('이 항목을 삭제할까요? 과거 답변은 남아요.',{type:'question-remove',id:q.id,expected:signature(q)},[q.title,'항목 삭제 · 과거 기록 보존']),q=>`${state.groups.find(g=>g.id===q.groupId)?.name||'목차'} · ${q.title}`));
  m=text.match(new RegExp(`^(.+?)\\s+(${DATE})(?:로|으로)\\s*(?:변경해\\s*줘|변경해\\s*주세요|옮겨\\s*줘|변경)$`));
  if(m){const target=resolveDate(m[2].trim(),reference);return choose('날짜를 바꿀 일정을 선택해 주세요.',named(state.schedules||[],m[1].trim(),'text'),s=>proposal('일정 날짜를 변경할까요?',{type:'schedule-move',id:s.id,expected:signature(s),date:target},[s.text,`${s.date} → ${target}`]));}
  m=text.match(/^(.+?)\s*일정(?:을|를)?\s*(?:삭제해\s*줘|빼\s*줘|삭제)$/);
  if(m)return choose('삭제할 일정을 선택해 주세요.',named(state.schedules||[],m[1].trim(),'text'),s=>proposal('이 일정을 삭제할까요?',{type:'schedule-remove',id:s.id,expected:signature(s)},[s.date,s.text]));
  m=text.match(new RegExp(`^(${DATE})(?:에|날)?\\s*(.+)$`));
  if(m){const target=resolveDate(m[1].trim(),reference),name=m[2].replace(/\s*(?:일정(?:을|로)?\s*)?(?:추가해\s*줘|추가해\s*주세요|등록해\s*줘|등록해\s*주세요)$/,'').trim();if(!name||name.length>200)return say('일정 내용을 1~200자로 적어주세요.');return proposal('이 날짜에 일정을 추가할까요?',{type:'schedule-add',date:target,text:name},[target,name]);}
  return {...say('목데이터 채팅이라 정해진 표현만 이해해요. 아래 예시를 눌러보거나 같은 형식으로 이름·날짜를 바꿔주세요.\n\n예: “생활 루틴에 명상 항목 추가해줘”, “이번 달 27일 독서 모임”, “이번 주 점수 어때?”'),unsupported:true};
 }catch(e){return say(e.message);}
}
export function applyChatAction(state,action){
 const next=structuredClone(state);
 const unchanged=(value,expected)=>{if(!value||signature(value)!==expected)throw Error('대상이 바뀌었어요. 최신 상태에서 다시 요청해 주세요.');return value;};
 switch(action.type){
  case 'group-add':if(next.groups.some(g=>g.name===action.name))throw Error('같은 이름의 목차가 이미 있어요.');next.groups.push({id:uid(),name:action.name,icon:'○'});break;
  case 'group-remove':{
   unchanged(next.groups.find(g=>g.id===action.id),action.expected);
   const qs=next.questions.filter(q=>q.groupId===action.id&&!q.deleted);if(qs.length!==action.questionIds.length)throw Error('목차의 항목이 바뀌었어요. 다시 요청해 주세요.');
   action.questionIds.forEach(item=>unchanged(qs.find(q=>q.id===item.id),item.expected));
   if(!qs.length)next.groups=next.groups.filter(g=>g.id!==action.id);else qs.forEach(q=>q.active=false);break;
  }
  case 'question-add':{
   unchanged(next.groups.find(g=>g.id===action.groupId),action.groupExpected);
   if(next.questions.some(q=>!q.deleted&&q.groupId===action.groupId&&q.title===action.title))throw Error('해당 목차에 같은 이름의 항목이 이미 있어요.');
   const q={id:uid(),groupId:action.groupId,title:action.title,type:'ox',description:'',options:[],active:true};
   const last=next.questions.findLastIndex(q=>q.groupId===action.groupId);if(last<0)next.questions.push(q);else next.questions.splice(last+1,0,q);break;
  }
  case 'question-remove':{const q=unchanged(next.questions.find(q=>q.id===action.id),action.expected);return deleteQuestion(next,q.id);}
  case 'schedule-add':if((next.schedules||[]).some(s=>s.date===action.date&&s.text===action.text))throw Error('같은 날짜에 같은 일정이 이미 있어요.');return saveSchedule(next,{date:action.date,text:action.text});
  case 'schedule-move':{const item=unchanged(next.schedules?.find(s=>s.id===action.id),action.expected);return saveSchedule(next,{id:item.id,date:action.date,text:item.text});}
  case 'schedule-remove':unchanged(next.schedules?.find(s=>s.id===action.id),action.expected);next.schedules=next.schedules.filter(s=>s.id!==action.id);break;
  default:throw Error('지원하지 않는 변경이에요.');
 }
 return next;
}
