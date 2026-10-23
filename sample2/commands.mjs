import {deleteQuestion, planFor, saveAnswers, saveTitle, titleFor, toggleTitle,
  saveSchedule, toggleSchedule, shiftDate, uid, saveMessage} from './model.mjs?v=f59d64e0da08';

export class CommandError extends Error {
  constructor(code, message, status=422) { super(message); this.code=code; this.status=status; }
}
export function reject(message, code='invalid_command', status=422) {
  throw new CommandError(code,message,status);
}
export function object(value) {
  if(!value || typeof value!=='object' || Array.isArray(value) ||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value))) reject('객체 형식이 필요해요.');
  return value;
}
function fields(value, required, optional=[]) {
  object(value);
  if(required.some(k=>!Object.hasOwn(value,k)) || Object.keys(value).some(k=>![...required,...optional].includes(k)))
    reject('요청의 필드를 확인해 주세요.');
}
function text(value,max=80,empty=false) {
  if(typeof value!=='string' || (!empty&&!value.trim()) || value.trim().length>max) reject(`입력은 ${max}자 이내로 적어주세요.`);
  return value.trim();
}
function boolean(value) { if(typeof value!=='boolean') reject('체크 상태를 확인해 주세요.'); return value; }
function date(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||shiftDate(value,0)!==value) reject('날짜를 확인해 주세요.');
  return value;
}
function found(list,id) {
  text(id,128);
  const item=list.find(x=>x.id===id&&!x.deleted);
  if(!item) reject('대상을 찾을 수 없어요.','not_found',404);
  return item;
}
function move(list,id,direction) {
  if(![-1,1].includes(direction)) reject('이동 방향을 확인해 주세요.');
  const i=list.findIndex(x=>x.id===id),j=i+direction;
  if(j>=0&&j<list.length) [list[i],list[j]]=[list[j],list[i]];
}
export function validateRequest(request) {
  fields(request,['requestId','expectedRevision','type','payload']);
  text(request.requestId,128);
  if(!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<0) reject('수정 번호를 확인해 주세요.');
  text(request.type,80);object(request.payload);
}

// All state changes are computed from the trusted stored state, never a client snapshot.
export function applyCommand(state,type,payload,{today}) {
  const next=structuredClone(state),p=payload;
  object(p);date(today);
  const routine=id=>found(next.questions,id),group=id=>found(next.groups,id);
  switch(type) {
    case 'routine.create': case 'routine.update': {
      const edit=type==='routine.update';
      fields(p,edit?['id','groupId','title','type']:['groupId','title'],edit?['description','options']:['type','description','options']);
      const old=edit?routine(p.id):null;
      group(p.groupId);const title=text(p.title),format=p.type??'ox';
      if(!['ox','choice','text','score'].includes(format)) reject('응답 형식을 확인해 주세요.');
      if(next.questions.some(q=>!q.deleted&&q.id!==old?.id&&q.groupId===p.groupId&&q.title===title)) reject('해당 목차에 같은 이름의 항목이 이미 있어요.');
      let options=[];
      if(p.options!==undefined&&!Array.isArray(p.options)) reject('선택지를 확인해 주세요.');
      if(format==='choice') {
        options=(p.options||[]).map(v=>text(v));
        if(options.length<2||options.length>20||new Set(options).size!==options.length) reject('중복 없이 2~20개 선택지를 입력해 주세요.');
      } else if(p.options?.length) reject('선택형 항목에만 선택지를 넣을 수 있어요.');
      const q={...(old||{}),id:old?.id||uid(),groupId:p.groupId,title,type:format,
        description:text(p.description??old?.description??'',4000,true),options,active:old?.active??true};
      if(edit) next.questions[next.questions.findIndex(x=>x.id===q.id)]=q;
      else { const i=next.questions.findLastIndex(x=>x.groupId===q.groupId);next.questions.splice(i<0?next.questions.length:i+1,0,q); }
      return {state:next,result:{id:q.id}};
    }
    case 'routine.delete':
      fields(p,['id']);routine(p.id);return {state:deleteQuestion(next,p.id),result:{id:p.id}};
    case 'routine.set-active':
      fields(p,['id','active']);routine(p.id).active=boolean(p.active);break;
    case 'routine.move': {
      fields(p,['id','direction']);const q=routine(p.id);
      const list=next.questions.filter(x=>!x.deleted&&x.groupId===q.groupId);
      move(list,p.id,p.direction);let i=0;
      next.questions=next.questions.map(x=>!x.deleted&&x.groupId===q.groupId?list[i++]:x);break;
    }
    case 'group.create': case 'group.update': {
      fields(p,type==='group.update'?['id','name']:['name']);const name=text(p.name);
      if(type==='group.update') group(p.id).name=name;
      else { const g={id:uid(),name,icon:'○'};next.groups.push(g);return {state:next,result:{id:g.id}}; }
      break;
    }
    case 'group.pause':
      fields(p,['id']);group(p.id);
      if(!next.questions.some(q=>!q.deleted&&q.groupId===p.id))next.groups=next.groups.filter(g=>g.id!==p.id);
      else next.questions.filter(q=>!q.deleted&&q.groupId===p.id).forEach(q=>q.active=false);break;
    case 'group.delete':
      fields(p,['id']);group(p.id);
      if(next.questions.some(q=>!q.deleted&&q.groupId===p.id)) reject('항목이 없는 목차만 삭제할 수 있어요.');
      next.groups=next.groups.filter(g=>g.id!==p.id);break;
    case 'group.move': fields(p,['id','direction']);group(p.id);move(next.groups,p.id,p.direction);break;
    case 'answers.save': {
      fields(p,['date','values']);date(p.date);object(p.values);
      const plan=planFor(next,p.date,today);
      for(const [id,value] of Object.entries(p.values)) {
        if(!plan.some(q=>q.id===id)||typeof value!=='string'||!value.trim()) reject('답변 대상과 내용을 확인해 주세요.');
      }
      return {state:saveAnswers(next,p.date,plan,p.values,today),result:{date:p.date}};
    }
    case 'answers.remove': {
      fields(p,['date','id']);date(p.date);
      if(p.date>today) reject('오늘 또는 지난 날짜를 선택해 주세요.');
      const day=next.days[p.date],q=day&&found(day.plan,p.id);
      if(!day||!Object.hasOwn(day.answers,p.id)) reject('답변을 찾을 수 없어요.','not_found',404);
      delete day.answers[p.id];
      if(q.purpose==='tomorrow')return {state:saveMessage(next,p.date,'',today),result:{date:p.date}};
      if(q.purpose==='dayTitle') return {state:saveTitle(next,shiftDate(p.date,1),'',today),result:{date:p.date}};
      day.updatedAt=new Date().toISOString();break;
    }
    case 'title.set': fields(p,['date','text']);date(p.date);text(p.text,80,true);
      return {state:saveTitle(next,p.date,p.text,today),result:{date:p.date}};
    case 'title.set-checked': {
      fields(p,['date','checked']);date(p.date);boolean(p.checked);
      if(p.date>today||!titleFor(next,p.date).text) reject('해당 날짜의 제목을 먼저 확인해 주세요.');
      return {state:titleFor(next,p.date).checked===p.checked?next:toggleTitle(next,p.date,today),result:{date:p.date}};
    }
    case 'schedule.save':
      fields(p,['date','text'],['id']);date(p.date);text(p.text,200);if(p.id!==undefined)found(next.schedules,p.id);
      {const result=saveSchedule(next,p);return {state:result,result:{id:p.id||result.schedules.at(-1).id}};}
    case 'schedule.delete': fields(p,['id']);found(next.schedules,p.id);next.schedules=next.schedules.filter(s=>s.id!==p.id);break;
    case 'schedule.set-checked': {
      fields(p,['id','checked']);const item=found(next.schedules,p.id);boolean(p.checked);
      if(item.date>today) reject('해당 날짜가 되면 체크할 수 있어요.');
      return {state:item.checked===p.checked?next:toggleSchedule(next,p.id,today),result:{id:p.id}};
    }
    default: reject('지원하지 않는 변경이에요.','unknown_command');
  }
  return {state:next,result:{id:p.id}};
}
