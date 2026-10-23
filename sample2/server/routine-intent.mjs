import {validateInterpretation} from './gemini.mjs';

export function routineContext(state) {
  return {groups:state.groups.map(g=>({name:g.name})),routines:state.questions.filter(q=>!q.deleted).map(q=>({name:q.title,group:state.groups.find(g=>g.id===q.groupId)?.name||''}))};
}
export function proposeRoutine(store,current,raw) {
  const intent=validateInterpretation(raw),answer=text=>({kind:'answer',text,source:'gemini'});
  if(intent.intent==='unsupported')return answer('AI는 우선 루틴 항목의 추가·삭제를 도와드려요. 일정·목차·기록 조회는 요청 예시를 이용해 주세요.');
  if(intent.intent==='clarify'||!intent.routineName)return answer('어떤 루틴 항목을 추가하거나 삭제할지 이름과 원하는 작업을 한 가지씩 알려주세요. 이전 대화의 “그것”을 추측해서 바꾸지 않아요.');
  const {state,revision}=current;
  let groups=state.groups;
  if(intent.groupName)groups=groups.filter(g=>g.name===intent.groupName);
  if(!groups.length)return answer('해당 목차를 찾지 못했어요. 화면의 목차 이름을 확인해 주세요.');
  const make=(command,preview)=>({kind:'proposal',source:'gemini',text:'이 변경을 반영할까요? 확인하기 전에는 기록을 바꾸지 않아요.',...store.propose(command,preview,revision)});
  const choices=(values,build,label)=>values.length===1?build(values[0]):({kind:'choices',source:'gemini',text:'변경할 대상을 선택해 주세요.',choices:values.map(value=>({label:label(value),result:build(value)}))});
  if(intent.intent==='add') {
    const available=groups.filter(g=>!state.questions.some(q=>!q.deleted&&q.groupId===g.id&&q.title===intent.routineName));
    if(!available.length)return answer('해당 목차에 같은 이름의 항목이 이미 있어요. 항목 관리에서 확인해 주세요.');
    // Do not silently choose a different group merely because one group has a duplicate.
    if(!intent.groupName&&available.length!==groups.length)return answer('같은 이름의 항목이 있어요. 추가할 목차 이름도 알려주세요.');
    return choices(available,g=>make({type:'routine.create',payload:{groupId:g.id,title:intent.routineName}},[`${g.name} → ${intent.routineName}`,'답변 방식 · O/X']),g=>`${g.name} → ${intent.routineName}`);
  }
  const matches=state.questions.filter(q=>!q.deleted&&q.title===intent.routineName&&(!intent.groupName||groups.some(g=>g.id===q.groupId)));
  if(!matches.length)return answer('그 이름의 항목을 찾지 못했어요. 화면의 항목 이름을 그대로 알려주세요.');
  return choices(matches,q=>make({type:'routine.delete',payload:{id:q.id}},[`${state.groups.find(g=>g.id===q.groupId)?.name||'목차'} → ${q.title}`,'항목 삭제 · 과거 기록 보존']),q=>`${state.groups.find(g=>g.id===q.groupId)?.name||'목차'} · ${q.title}`);
}
