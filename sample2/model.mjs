export const STORAGE_KEY = 'habit-diary-sample2:v1';
export function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function shiftDate(value, amount) { const d = new Date(`${value}T12:00:00`); d.setDate(d.getDate()+amount); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function uid() { return crypto.randomUUID(); }
export function initialState() {
 const groups = [{id:'life',name:'생활 루틴',icon:'☀'},{id:'body',name:'운동·건강',icon:'♧'},{id:'work',name:'업무·공부',icon:'▤'},{id:'reflection',name:'오늘의 회고',icon:'☾'}];
 const questions = [
 ['water','life','물 충분히 마시기','ox','오늘 필요한 만큼 물을 마셨나요?'],
 ['skin','life','선크림 바르기','ox','외출 전 선크림을 발랐나요?'],
 ['floss','life','치실 사용','ox','치실을 사용했나요?'],
 ['bed','life','이불 정리','ox','일어난 뒤 이불을 정리했나요?'],
 ['stretch','body','스트레칭','ox','가볍게 몸을 풀어주었나요?'],
 ['exercise','body','운동','ox','오늘 계획한 운동을 했나요?'],
 ['vitamin','body','비타민 챙기기','ox','비타민을 챙겼나요?'],
 ['reading','work','독서·필사','ox','읽거나 적는 시간을 가졌나요?'],
 ['worktype','work','오늘 집중한 일','choice','가장 많은 시간을 쓴 활동을 골라주세요.',['업무','공부','개인 프로젝트','휴식','기타']],
 ['worknote','work','업무·공부 회고','text','무엇을 했고, 어떤 점이 기억에 남나요?'],
 ['score','reflection','오늘의 점수','score','내가 느끼는 오늘은 몇 점인가요?'],
 ['tomorrow','reflection','내일의 제목','text','내일을 어떤 하루로 보내고 싶은지 한 줄로 정해보세요. 다음 날 홈 상단의 제목이 됩니다.']
 ].map(([id,groupId,title,type,description,options=[]])=>({id,groupId,title,type,description,options,active:true}));
 questions.find(q=>q.id==='tomorrow').purpose='dayTitle';
 questions.find(q=>q.id==='worknote').purpose='reflection';
 return {version:1,groups,questions,days:{},messages:{},dayTitles:{},schedules:[],features:{tomorrowMessages:1,datedPlanning:1}};
}
export function hasAnswer(value) { return value !== undefined && value !== null && String(value).trim() !== ''; }
export function validAnswer(q,value) {
 if(!hasAnswer(value)) return false;
 if(q.type==='ox') return value==='O'||value==='X';
 if(q.type==='score') return Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=5;
 if(q.type==='choice') return q.options.includes(value);
 return q.type==='text'&&typeof value==='string'&&value.trim().length<=4000;
}
function snapshot(state,q) { return {...structuredClone(q), groupName:state.groups.find(g=>g.id===q.groupId)?.name||'기타',groupIcon:state.groups.find(g=>g.id===q.groupId)?.icon||'○'}; }
export function planFor(state,date,now=today()) {
 const day=state.days[date];
 if(day&&date!==now) return normalizeTitlePlan(day.plan);
 const deleted=new Set(state.questions.filter(q=>q.deleted).map(q=>q.id));
 const plan=state.questions.filter(q=>q.active&&!q.deleted).map(q=>snapshot(state,q));
 if(day) {
  // Already answered items keep their original response type and wording.
  day.plan.forEach(q=>{if(!deleted.has(q.id)&&hasAnswer(day.answers[q.id])) {const i=plan.findIndex(x=>x.id===q.id); if(i<0)plan.push(q);else plan[i]=q;}});
 }
 return normalizeTitlePlan(plan);
}

function normalizeTitlePlan(plan) {
 const result=structuredClone(plan);
 const legacy=q=>q.id==='note'&&q.groupId==='reflection'&&q.type==='text'&&['하루 한 줄','하루한줄'].includes(q.title);
 const current=result.some(q=>q.purpose==='dayTitle'||q.purpose==='tomorrow');
 result.forEach(q=>{
  if(legacy(q)&&current){q.title='이전 회고';q.purpose='reflection';return;}
  if(legacy(q)||q.purpose==='tomorrow'||q.purpose==='dayTitle'){
   q.purpose='dayTitle';
   if(['하루 한 줄','하루한줄','내일의 나에게','내일의 제목'].includes(q.title))q.title='내일의 제목';
   q.description='내일을 어떤 하루로 보내고 싶은지 한 줄로 정해보세요. 다음 날 홈 상단의 제목이 됩니다.';
  }
 });
 return result;
}

export function groupPlan(plan) {
 const result=[];
 plan.forEach(q=>{let g=result.find(x=>x.id===q.groupId);if(!g){g={id:q.groupId,name:q.groupName,icon:q.groupIcon,questions:[]};result.push(g);}g.questions.push(q);});
 return result;
}
export function saveAnswers(state,date,plan,values,now=today()) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>now)throw Error('오늘 또는 지난 날짜를 선택해 주세요.');
 let next=structuredClone(state); const previous=next.days[date];
 const answers={...(previous?.answers||{})}; let count=0;
 for(const q of plan) {if(Object.hasOwn(values,q.id)&&hasAnswer(values[q.id])) {if(!validAnswer(q,values[q.id]))throw Error('입력 내용을 확인해 주세요.'); answers[q.id]=String(values[q.id]).trim();if(q.purpose==='tomorrow')next=saveMessage(next,date,answers[q.id],now);if(q.purpose==='dayTitle')setTitleEntry(next,shiftDate(date,1),answers[q.id]);count++;}}
 if(!count)throw Error('항목을 하나 이상 작성해 주세요.');
 const storedPlan=structuredClone(plan);
 // A removed routine stays in the dated archive even after another partial save.
 previous?.plan.forEach(q=>{if(hasAnswer(answers[q.id])&&!storedPlan.some(item=>item.id===q.id))storedPlan.push(structuredClone(q));});
 next.days[date]={plan:storedPlan,answers,updatedAt:new Date().toISOString()};return next;
}
export function isRecorded(state,id) {return Object.values(state.days).some(d=>hasAnswer(d.answers[id]));}
export function deleteQuestion(state,id) {
 const next=structuredClone(state),question=next.questions.find(q=>q.id===id&&!q.deleted);
 if(!question)throw Error('항목을 찾을 수 없어요.');
 // Retain a marker so today's answered snapshot cannot re-add a deleted routine.
 // Dated plans and answers remain untouched for history and reports.
 if(isRecorded(next,id)){question.active=false;question.deleted=true;}
 else next.questions=next.questions.filter(q=>q.id!==id);
 return next;
}
export function report(state,end,length) {
 const dates=Array.from({length},(_,i)=>shiftDate(end,i-length+1));
 const rows=dates.map(date=>{const day=state.days[date];const plan=day?.plan||[];const answered=plan.filter(q=>hasAnswer(day.answers[q.id]));return {date,day,plan,answered};});
 const scores=rows.flatMap(r=>r.answered.filter(q=>q.type==='score').map(q=>({date:r.date,title:q.title,value:Number(r.day.answers[q.id])})));
 const habits=new Map();
 rows.forEach(r=>r.plan.filter(q=>q.type==='ox').forEach(q=>{const item=habits.get(q.id)||{id:q.id,title:q.title,yes:0,no:0,missing:0};const value=r.day.answers[q.id];if(value==='O')item.yes++;else if(value==='X')item.no++;else item.missing++;habits.set(q.id,item);}));
 return {rows,scores,habits:[...habits.values()],recordedDays:rows.filter(r=>r.answered.length).length,answered:rows.reduce((s,r)=>s+r.answered.length,0),average:scores.length?scores.reduce((s,r)=>s+r.value,0)/scores.length:null};
}
export function validateState(s) {
 if(!s||s.version!==1||!Array.isArray(s.groups)||!Array.isArray(s.questions)||!s.days||typeof s.days!=='object')throw Error('저장된 데이터 형식을 확인할 수 없습니다.');
 if(s.groups.some(g=>typeof g.id!=='string'||typeof g.name!=='string')||s.questions.some(q=>typeof q.id!=='string'||typeof q.title!=='string'||!['ox','choice','text','score'].includes(q.type)||!Array.isArray(q.options)))throw Error('저장된 항목 형식에 문제가 있습니다.');
 if(Object.values(s.days).some(d=>!Array.isArray(d.plan)||!d.answers||typeof d.answers!=='object'))throw Error('저장된 기록 형식에 문제가 있습니다.');
 return s;
}

export function upgradeState(state) {
 const next=structuredClone(state);
 if(next.features?.tomorrowMessages)return next;
 const old=next.questions.find(q=>q.id==='note');
 if(old?.title==='하루 한 줄'&&old.type==='text')old.active=false;
 if(!next.questions.some(q=>q.purpose==='tomorrow'||q.purpose==='dayTitle')) {
  const template=initialState();
  if(!next.groups.some(g=>g.id==='reflection'))next.groups.push(template.groups.find(g=>g.id==='reflection'));
  const question=template.questions.find(q=>q.id==='tomorrow');
  if(next.questions.some(q=>q.id===question.id))question.id=uid();
  next.questions.push(question);
 }
 next.messages=next.messages||{};
 next.features={...next.features,tomorrowMessages:1};
 return next;
}

export function saveMessage(state,sourceDate,text,now=today()) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)||sourceDate>now)throw Error('오늘 또는 지난 날짜에 작성해 주세요.');
 const lines=String(text).split('\n').map(s=>s.trim()).filter(Boolean);
 if(lines.length>20||lines.some(s=>s.length>200))throw Error('문장은 20개까지, 한 줄은 200자까지 적어주세요.');
 if(new Set(lines).size!==lines.length)throw Error('같은 문장이 중복되어 있어요. 한 번씩만 적어주세요.');
 const next=structuredClone(state);next.messages=next.messages||{};
 const previous=next.messages[sourceDate]?.items||[];
 next.messages[sourceDate]={sourceDate,targetDate:shiftDate(sourceDate,1),items:lines.map(text=>{
  const old=previous.find(item=>item.text===text);
  return old?{...old}:{id:uid(),text,checked:false};
 })};
 return next;
}
export function messageFor(state,targetDate) {
 const sourceDate=shiftDate(targetDate,-1);
 return state.messages?.[sourceDate]||{sourceDate,targetDate,items:[]};
}
export function toggleMessage(state,targetDate,id) {
 if(targetDate>today())throw Error('아직 오지 않은 날의 문장은 체크할 수 없어요.');
 const next=structuredClone(state);
 const sourceDate=shiftDate(targetDate,-1);
 const item=next.messages?.[sourceDate]?.items.find(item=>item.id===id);
 if(!item)throw Error('문장을 찾을 수 없어요.');
 item.checked=!item.checked;
 return next;
}

export function upgradePlanning(state) {
 const next=upgradeState(state);
 // Normalize earlier labels without changing saved answers or custom names.
 next.questions.forEach(q=>{if(q.purpose==='dayTitle'&&['하루 한 줄','하루한줄','내일의 나에게'].includes(q.title)){
  q.title='내일의 제목';
  q.description='내일을 어떤 하루로 보내고 싶은지 한 줄로 정해보세요. 다음 날 홈 상단의 제목이 됩니다.';
 }});
 if(next.features?.datedPlanning)return next;
 next.questions.forEach(q=>{if(q.purpose==='tomorrow'){
  q.purpose='dayTitle';
  if(q.title==='내일의 나에게')q.title='내일의 제목';
  q.description='내일을 어떤 하루로 보내고 싶은지 한 줄로 정해보세요. 다음 날 홈 상단의 제목이 됩니다.';
 }});
 next.dayTitles=next.dayTitles||{};next.schedules=next.schedules||[];
 next.features={...next.features,datedPlanning:1};return next;
}
function checkCalendarDate(date) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(new Date(`${date}T12:00:00`).getTime())||shiftDate(date,0)!==date)throw Error('날짜를 선택해 주세요.');
}
// The previous day's answer is the title's source. Older versions also kept
// independent copies in dayTitles; use those only when no source answer exists.
export function titleFor(state,targetDate) {
 const day=state.days[shiftDate(targetDate,-1)];
 const question=day&&normalizeTitlePlan(day.plan).find(q=>q.purpose==='dayTitle'&&day.plan.find(raw=>raw.id===q.id)?.purpose!=='tomorrow');
 const answer=question&&day.answers[question.id];
 const saved=state.dayTitles?.[targetDate];
 const text=hasAnswer(answer)?String(answer).trim():saved?.text||'';
 return {text,checked:!!text&&saved?.text===text&&!!saved.checked};
}
function setTitleEntry(state,targetDate,text) {
 text=String(text).trim();
 if(text.length>80||/[\r\n]/.test(text))throw Error('하루의 제목은 80자 이내 한 줄로 적어주세요.');
 const previous=titleFor(state,targetDate);
 state.dayTitles=state.dayTitles||{};
 state.dayTitles[targetDate]={text,checked:previous.text===text?previous.checked:false};
}
export function saveTitle(state,targetDate,text,now=today()) {
 checkCalendarDate(targetDate);
 const next=structuredClone(state);setTitleEntry(next,targetDate,text);
 const source=shiftDate(targetDate,-1),previous=next.days[source];
 const plan=planFor(next,source,now),question=plan.find(q=>q.purpose==='dayTitle')||(previous&&normalizeTitlePlan(previous.plan).find(q=>q.purpose==='dayTitle'));
 text=next.dayTitles[targetDate].text;
 if(source<=now&&question&&(previous||text)){
  const answers={...(previous?.answers||{})};
  if(text)answers[question.id]=text;else delete answers[question.id];
  next.days[source]={plan:previous?structuredClone(previous.plan):plan,answers,updatedAt:new Date().toISOString()};
 }
 return next;
}
export function toggleTitle(state,targetDate,now=today()) {
 if(targetDate>now)throw Error('해당 날짜가 되면 체크할 수 있어요.');
 const item=titleFor(state,targetDate);
 if(!item.text)throw Error('제목을 먼저 적어주세요.');
 const next=structuredClone(state);next.dayTitles=next.dayTitles||{};
 next.dayTitles[targetDate]={...item,checked:!item.checked};return next;
}
export function saveSchedule(state,entry) {
 checkCalendarDate(entry.date);const text=String(entry.text).trim();
 if(!text||text.length>200)throw Error('일정 내용을 1~200자로 입력해 주세요.');
 const next=structuredClone(state);next.schedules=next.schedules||[];
 const old=next.schedules.find(item=>item.id===entry.id);
 if(entry.id&&!old)throw Error('일정을 찾을 수 없어요.');
 const item={id:old?.id||uid(),date:entry.date,text,checked:old?.date===entry.date?old.checked:false};
 if(old)next.schedules[next.schedules.findIndex(x=>x.id===old.id)]=item;else next.schedules.push(item);
 return next;
}
export function toggleSchedule(state,id,now=today()) {
 const next=structuredClone(state),item=next.schedules?.find(item=>item.id===id);
 if(!item)throw Error('일정을 찾을 수 없어요.');
 if(item.date>now)throw Error('해당 날짜가 되면 체크할 수 있어요.');
 item.checked=!item.checked;return next;
}

export function reflectionEntries(state,end,length) {
 return report(state,end,length).rows.slice().reverse().flatMap(row=>row.answered
  .filter(q=>q.type==='text'&&!['dayTitle','tomorrow'].includes(q.purpose)&&(q.purpose==='reflection'||/회고/.test(q.title)))
  .map(q=>({date:row.date,q,value:row.day.answers[q.id]})));
}
