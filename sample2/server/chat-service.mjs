import {respondChat} from '../chat.mjs';
import {routineContext,proposeRoutine} from './routine-intent.mjs';

// The scripted interpreter can later be replaced; it cannot confirm or write records.
export async function chat(store,text,interpret=null) {
  const current=store.read();
  const convert=result=>{
    if(result.kind==='choices')return {...result,choices:result.choices.map(c=>({label:c.label,result:convert(c.result)}))};
    if(result.kind!=='proposal')return result;
    const a=result.action;
    let command;
    switch(a.type) {
      case 'question-add':command={type:'routine.create',payload:{groupId:a.groupId,title:a.title}};break;
      case 'question-remove':command={type:'routine.delete',payload:{id:a.id}};break;
      case 'group-add':command={type:'group.create',payload:{name:a.name}};break;
      case 'group-remove':command={type:'group.pause',payload:{id:a.id}};break;
      case 'schedule-add':command={type:'schedule.save',payload:{date:a.date,text:a.text}};break;
      case 'schedule-move':command={type:'schedule.save',payload:{id:a.id,date:a.date,text:current.state.schedules.find(s=>s.id===a.id).text}};break;
      case 'schedule-remove':command={type:'schedule.delete',payload:{id:a.id}};break;
      default:throw Error('지원하지 않는 제안입니다.');
    }
    return {kind:'proposal',text:result.text,...store.propose(command,result.preview,current.revision)};
  };
  const scripted=respondChat(current.state,text,current.today);
  // Route by requested feature, including not-found/validation answers from the legacy parser.
  if(interpret&&(scripted.unsupported||scripted.routineRequest)) {
    const intent=await interpret(text,routineContext(current.state));
    return proposeRoutine(store,current,intent);
  }
  return {...convert(scripted),source:'scripted'};
}
