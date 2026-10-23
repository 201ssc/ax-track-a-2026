import {shiftDate,uid,hasAnswer,planFor,groupPlan,isRecorded,report,titleFor,reflectionEntries} from './model.mjs?v=f59d64e0da08';
import {CHAT_EXAMPLES} from './chat.mjs?v=f59d64e0da08';
import {DiaryApi} from './api.mjs?v=f59d64e0da08';
const api=new DiaryApi();
await api.load();
const today=()=>api.snapshot.today;
const canonicalUrl=new URL(location.href);
if(canonicalUrl.searchParams.has('demo')){
 canonicalUrl.searchParams.delete('demo');
 // Address cleanup is optional; embedded browsers may reject History changes.
 try{history.replaceState(null,'',canonicalUrl.pathname+canonicalUrl.search+canonicalUrl.hash);}catch{}
}
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function icon(name){
 const paths={
  'chevron-left':'<path d="m14 6-6 6 6 6"/>',
  'chevron-right':'<path d="m10 6 6 6-6 6"/>',
  'chevron-down':'<path d="m6 9 6 6 6-6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  more:'<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  list:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 8h1m3 0h6M7 12h1m3 0h6M7 16h1m3 0h6"/>',
  pen:'<path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  activity:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/><path d="M3 12h5l2-4 4 8 2-4h5"/>',
  book:'<path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15"/>',
  moon:'<path d="M20.6 13A9 9 0 0 1 11 3.4 9 9 0 1 0 20.6 13Z"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
 };
 return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.grid}</svg>`;
}
function groupIcon(group){const names={'☀':'sun','♧':'activity','▤':'book','☾':'moon','○':'grid'};return names[group.icon]?icon(names[group.icon]):esc(group.icon||'○');}
let chatMessages=[],chatDraft='';
const typeNames={ox:'O / X',choice:'선택지',text:'글쓰기',score:'점수 (1~5)'};
let state,date=today(),view='today',expanded=new Set(),period=7,session=null,returnFocus=null,calendarOpen=false,calendarDay=date,calendarMonth=date.slice(0,7);
state=api.snapshot.state;
let saving=false;
function lockForm(form){const controls=[...(form?.querySelectorAll('input,textarea,select,button')||[])].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);return ()=>controls.forEach(([el,disabled])=>el.disabled=disabled);}
function showAlert(message){$('#storage-alert').hidden=false;$('#storage-alert').textContent=message;}
async function commit(type,payload){
 if(saving)return false;
 saving=true;document.body.dataset.saving='true';const unlock=lockForm($('#dialog'));
 try {await api.command(type,payload);state=api.snapshot.state;$('#storage-alert').hidden=true;return true;}
 catch(e){state=api.snapshot.state;showAlert(e.message);const error=$('#form-error');if(error)error.textContent=e.message;return false;}
 finally{unlock();saving=false;delete document.body.dataset.saving;}
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3200);}
function pretty(d,year=false){return new Intl.DateTimeFormat('ko-KR',{...(year?{year:'numeric'}:{}),month:'long',day:'numeric',weekday:'long'}).format(new Date(`${d}T12:00:00`));}
function short(d){return `${Number(d.slice(5,7))}.${Number(d.slice(8,10))}`;}
function answers(){return state.days[date]?.answers||{};}
function dateControl(){
 const inCalendar=calendarOpen&&view==='today',value=inCalendar?calendarDay:date;
 return `<div class="date-picker"><button class="icon-button" data-action="date-prev" aria-label="이전 날짜">${icon('chevron-left')}</button><input id="selected-date" type="date" aria-label="${inCalendar?'일정 날짜':'날짜 선택'}" value="${value}" required><button class="icon-button" data-action="date-next" aria-label="다음 날짜">${icon('chevron-right')}</button>${view==='today'?`<button class="icon-button calendar-toggle ${calendarOpen?'active':''}" data-action="calendar-toggle" aria-label="${calendarOpen?'기록 보기':'달력 보기'}" aria-pressed="${calendarOpen}" title="${calendarOpen?'기록 보기':'달력 보기'}">${icon(calendarOpen?'list':'calendar')}</button>`:''}${value!==today()?'<button class="text-button" data-action="date-today">오늘</button>':''}</div>`;
}
function calendarShift(amount){const d=new Date(`${calendarMonth}-01T12:00:00`);d.setMonth(d.getMonth()+amount);calendarMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function renderCalendar(){
 const start=`${calendarMonth}-01`,offset=new Date(`${start}T12:00:00`).getDay(),gridStart=shiftDate(start,-offset);
 const items=(state.schedules||[]).filter(item=>item.date===calendarDay);
 return `<section class="calendar-panel"><div class="calendar-month"><button class="icon-button" data-action="calendar-month-prev" aria-label="이전 달">${icon('chevron-left')}</button><h2>${Number(calendarMonth.slice(0,4))}년 ${Number(calendarMonth.slice(5))}월</h2><button class="icon-button" data-action="calendar-month-next" aria-label="다음 달">${icon('chevron-right')}</button></div>
 <div class="calendar-weekdays" aria-hidden="true">${['일','월','화','수','목','금','토'].map(day=>`<span>${day}</span>`).join('')}</div>
 <div class="calendar-grid" aria-label="일정 날짜 선택">${Array.from({length:42},(_,i)=>{const day=shiftDate(gridStart,i),count=(state.schedules||[]).filter(item=>item.date===day).length;return `<button class="calendar-day ${day.slice(0,7)!==calendarMonth?'outside':''} ${day===calendarDay?'selected':''} ${day===today()?'is-today':''}" data-action="calendar-day" data-date="${day}" aria-label="${day}${count?', 일정 '+count+'개':''}" aria-pressed="${day===calendarDay}"><span>${Number(day.slice(8))}</span><i class="${count?'has-events':''}" aria-hidden="true"></i></button>`;}).join('')}</div></section>
 <section class="calendar-events"><div class="calendar-events-head"><h3>${pretty(calendarDay)}</h3><button class="text-button" data-action="add-schedule" data-date="${calendarDay}">＋ 일정 추가</button></div>${items.length?items.map(item=>`<div class="calendar-event"><label class="calendar-event-label ${item.checked?'checked':''}"><input type="checkbox" data-action="toggle-schedule" data-id="${esc(item.id)}" ${item.checked?'checked':''} ${item.date>today()?'disabled':''}><span>${esc(item.text)}</span></label><button class="mini" data-action="edit-schedule" data-id="${esc(item.id)}" aria-label="${esc(item.text)} 수정">수정</button></div>`).join(''):'<p class="calendar-empty">등록한 일정이 없어요.</p>'}</section>`;
}

function heading(eyebrow,title,description,control=''){return `<div class="heading-row"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="subtitle">${description}</p></div>${control}</div>`;}
function render(){const key=location.hash.slice(1);view=['today','report','manage','chat'].includes(key)?key:'today';document.querySelectorAll('[data-nav]').forEach(a=>{a.classList.toggle('active',a.dataset.nav===view);if(a.dataset.nav===view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});$('#breadcrumb').textContent=`나의 다이어리 / ${{today:'오늘의 기록',report:'기록 리포트',chat:'채팅',manage:'항목 관리'}[view]}`;$('#main').innerHTML=view==='today'?renderToday():view==='report'?renderReport():view==='chat'?renderChat():renderManage();}
function renderToday(){if(calendarOpen)return heading('MY CALENDAR','일정 달력','',dateControl())+renderCalendar();const plan=planFor(state,date,today()),a=answers(),done=plan.filter(q=>hasAnswer(a[q.id])).length,remaining=plan.length-done,groups=groupPlan(plan);return heading('A LITTLE EVERY DAY',date>today()?'하루를 미리 준비해요.':date===today()?'오늘 하루는 어땠나요?':'그날의 하루를 돌아봐요.',`${pretty(date,true)}${date>today()?'':' · 작은 실천도, 쉬어간 순간도 기록해 보세요.'}`,dateControl())+`
${renderMessageCard()}
<section class="routine-summary" aria-label="루틴 기록 진행 상황"><div class="routine-summary-top"><span>루틴 기록 <strong class="routine-count">${done}<span>/${plan.length}</span></strong></span>${plan.length?`<button class="text-button" data-action="survey" ${date>today()?'disabled title="루틴 기록은 해당 날짜부터 할 수 있어요."':''}>${remaining?'전체 항목 기록하기':'전체 기록 돌아보기'} ›</button>`:'<a class="text-button" href="#manage">항목 추가하기 ›</a>'}</div><div class="progress"><span style="width:${plan.length?done/plan.length*100:0}%"></span></div></section>
<div class="section-title"><h2>나의 루틴 <small>${groups.length}개 목차</small></h2></div>
<div class="groups">${groups.map(g=>{const count=g.questions.filter(q=>hasAnswer(a[q.id])).length,complete=count===g.questions.length,open=expanded.has(g.id),visible=g.questions;return `<section class="group-card ${complete?'complete':''}"><button class="group-head" data-action="expand" data-id="${esc(g.id)}" aria-expanded="${open}" aria-controls="group-${esc(g.id)}"><span class="group-icon">${groupIcon(g)}</span><span class="group-info"><h3>${esc(g.name)}</h3><small>${complete?'모두 기록했어요':`${g.questions.length-count}개 항목이 기다리고 있어요`}</small></span><span class="group-count">${count}<small> / ${g.questions.length} 기록</small></span><span class="arrow">${icon(complete?'check':open?'chevron-down':'chevron-right')}</span></button><div class="group-progress"><div class="progress"><span style="width:${count/g.questions.length*100}%"></span></div></div>${open?`<div class="question-list" id="group-${esc(g.id)}">${visible.map(q=>questionRow(q,a)).join('')}</div><div class="group-actions"><button class="text-button" data-action="group-survey" data-id="${esc(g.id)}" ${date>today()?'disabled title="루틴 기록은 해당 날짜부터 할 수 있어요."':''}>${complete?'목차 기록 확인·수정':'이 목차 한 번에 기록'} →</button></div>`:''}</section>`;}).join('')}</div>
<div class="today-bottom"><div class="note-card"><h3>✓ 솔직한 기록이면 충분해요</h3><p>O는 실천, X는 미실천. 둘 다 기록 완료예요.<br>아직 적지 않을 항목은 선택하지 않고 남겨두세요.</p></div><div class="note-card alt"><h3>☾ 나만의 저녁 루틴</h3><p>기본 항목은 시작을 위한 예시예요.<br><a href="#manage" class="text-button">내 생활에 맞게 항목 바꾸기 →</a></p></div></div>`;}
function renderMessageCard(){
 const title=titleFor(state,date),schedules=(state.schedules||[]).filter(item=>item.date===date);
 return `<section class="message-card priority-card" aria-label="하루의 제목과 일정">
 <div class="priority-tools"><button class="message-edit" data-action="edit-message" data-source="${shiftDate(date,-1)}" aria-label="오늘의 제목 수정" title="오늘의 제목 수정">${icon('pen')}</button></div>
 ${title?.text?`<label class="message-item title-item ${title.checked?'checked':''}"><input type="checkbox" data-action="toggle-title" ${date>today()?'disabled':''} aria-label="${esc(title.text)}" ${title.checked?'checked':''}><span>${esc(title.text)}</span></label>`:''}
 ${schedules.length?`<ul class="message-list schedule-list">${schedules.map(schedule=>`<li class="schedule-home-row"><label class="message-item ${schedule.checked?'checked':''}"><input type="checkbox" data-action="toggle-schedule" data-id="${esc(schedule.id)}" ${schedule.date>today()?'disabled':''} ${schedule.checked?'checked':''}><span>${esc(schedule.text)}</span></label><button class="schedule-edit" data-action="edit-schedule" data-id="${esc(schedule.id)}" aria-label="${esc(schedule.text)} 수정">${icon('pen')}</button></li>`).join('')}</ul>`:''}
 <div class="message-card-footer"><button data-action="add-schedule">＋ 일정 추가</button></div></section>`;
}
function messageEditor(sourceDate){
 const target=shiftDate(sourceDate,1),value=titleFor(state,target).text,legacy=state.messages?.[sourceDate]?.items||[];
 openDialog(dialogShell(target===date?'하루의 제목':'내일의 제목',`<form id="message-editor" data-source="${sourceDate}"><p class="dialog-date">${target}에 표시</p><label class="field"><span>한 줄 제목</span><input name="message" maxlength="80" value="${esc(value)}" placeholder="먼저 인사하는 하루"></label>${legacy.length?`<details class="legacy-messages"><summary>이전에 남긴 문장</summary>${legacy.map(item=>`<p>${esc(item.text)}</p>`).join('')}</details>`:''}<p id="form-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" data-action="close-dialog">취소</button><button type="submit" class="primary">제목 저장 ✓</button></div></form>`));
}
async function submitMessageEditor(form){
 const source=form.dataset.source,text=String(new FormData(form).get('message')).trim();
 try{
  if(await commit('title.set',{date:shiftDate(source,1),text})){$('#dialog').close();render();toast('제목을 저장했어요.');}
 }catch(e){$('#form-error').textContent=e.message;}
}
function scheduleEditor(id,initialDate=date){
 const item=(state.schedules||[]).find(item=>item.id===id);
 openDialog(dialogShell(item?'일정 수정':'일정 추가',`<form id="schedule-editor" data-id="${esc(id||'')}"><label class="field"><span>날짜</span><input type="date" name="scheduleDate" value="${item?.date||initialDate}" required></label><label class="field"><span>할 일</span><input name="scheduleText" maxlength="200" value="${esc(item?.text||'')}" placeholder="미팅 자료 준비하기" required></label><p id="form-error" class="form-error" role="alert"></p><div class="dialog-actions">${item?`<button type="button" class="danger" data-action="delete-schedule" data-id="${esc(item.id)}">일정 삭제</button>`:'<button type="button" class="secondary" data-action="close-dialog">취소</button>'}<button type="submit" class="primary">일정 저장 ✓</button></div></form>`));
}
async function submitScheduleEditor(form){
 const fields=new FormData(form);
 try{if(await commit('schedule.save',{...(form.dataset.id?{id:form.dataset.id}:{}),date:String(fields.get('scheduleDate')),text:String(fields.get('scheduleText'))})){$('#dialog').close();render();toast('일정을 저장했어요.');}}
 catch(e){$('#form-error').textContent=e.message;}
}

function questionLabel(q){return q.purpose==='dayTitle'&&['하루 한 줄','하루한줄','내일의 나에게'].includes(q.title)?'내일의 제목':q.title;}
function questionDescription(q){return q.purpose==='dayTitle'?`${short(shiftDate(session?.date||date,1))} 홈 상단에 표시될 제목이에요. 내일을 어떤 하루로 보내고 싶은지 한 줄로 정해보세요.`:q.description;}
function questionRow(q,a){const done=hasAnswer(a[q.id]);return `<button class="question-row ${done?'done':''}" data-action="question" data-id="${esc(q.id)}" ${date>today()?'disabled title="루틴 기록은 해당 날짜부터 할 수 있어요."':''}><span class="circle">${done?'✓':''}</span><span class="title">${esc(questionLabel(q))}</span>${done?`<span class="answer-pill ${a[q.id]==='X'?'no':''}">${esc(q.type==='score'?`${a[q.id]}점`:a[q.id])}</span>`:'<span class="muted">기록 ›</span>'}</button>`;}
function renderReport(){const r=report(state,date,period),start=shiftDate(date,1-period),notes=reflectionEntries(state,date,period);return heading('LOOK BACK, GENTLY','기록이 보여주는 나의 하루',`실천한 루틴과 하루의 마음을 함께 돌아봐요.`,dateControl())+`<div class="report-range"><div class="segmented"><button data-action="period" data-value="7" class="${period===7?'active':''}">최근 7일</button><button data-action="period" data-value="30" class="${period===30?'active':''}">최근 30일</button></div><span class="muted">${start} — ${date}</span></div>
<div class="stats-grid"><div class="stat"><small>기록한 날</small><strong>${r.recordedDays}<span>/ ${period}일</span></strong><p>한 항목 이상 제출한 날짜</p></div><div class="stat"><small>완료한 응답</small><strong>${r.answered}<span>개</span></strong><p>O · X · 선택 · 글 · 점수</p></div><div class="stat"><small>하루 점수 평균</small><strong>${r.average===null?'—':r.average.toFixed(1)}<span>/ 5</span></strong><p>${r.scores.length?`${r.scores.length}개 점수 응답 기준`:'점수를 기록하면 나타나요'}</p></div></div>
<section class="panel"><h2>하루의 점수</h2><p class="subtitle">나 스스로 느낀 하루의 흐름이에요.</p><div class="report-chart" role="img" aria-label="${esc(r.scores.length?r.rows.map(row=>`${row.date}: ${r.scores.filter(s=>s.date===row.date).map(s=>s.value+'점').join(', ')||'미기록'}`).join('; '):'아직 기록된 점수가 없습니다')}">${r.rows.map(row=>{const vals=r.scores.filter(s=>s.date===row.date);const value=vals.length?vals.reduce((s,v)=>s+v.value,0)/vals.length:null;return `<div class="day-column ${value===null?'no-data':''}" title="${row.date}: ${value??'미기록'}"><span class="value">${value===null?'·':Number(value.toFixed(1))}</span><div class="bar-area"><div class="bar" style="height:${value?value/5*100:0}%"></div></div><span class="label">${short(row.date)}</span></div>`;}).join('')}</div><p class="report-note">미기록 날짜는 0점으로 계산하지 않아요.${r.scores.length?' 같은 날 점수 항목이 여러 개면 그래프에는 그날의 평균을 표시해요.':''}</p></section>
<div class="report-grid"><section class="panel"><h2>루틴 실천 돌아보기</h2><div class="legend"><span><i></i>실천</span><span><i class="no"></i>미실천</span><span><i class="missing"></i>미기록</span></div>${r.habits.length?r.habits.map(h=>{const total=h.yes+h.no+h.missing;return `<div class="habit-result"><div class="line"><span>${esc(h.title)}</span><span class="habit-counts" role="img" aria-label="실천 ${h.yes}회, 미실천 ${h.no}회, 미기록 ${h.missing}회"><span class="count-yes" aria-hidden="true">${h.yes}</span><span class="count-divider" aria-hidden="true">/</span><span class="count-no" aria-hidden="true">${h.no}</span><span class="count-divider" aria-hidden="true">/</span><span class="count-missing" aria-hidden="true">${h.missing}</span></span></div><div class="habit-track"><span class="yes" style="width:${h.yes/total*100}%"></span><span class="no" style="width:${h.no/total*100}%"></span><span class="missing" style="width:${h.missing/total*100}%"></span></div></div>`;}).join(''):'<p class="muted" style="margin-top:22px">루틴을 기록하면 실천 현황이 나타나요.</p>'}<p class="report-note">저장한 날짜의 문항 구성을 기준으로 집계해요. 기록 자체가 없는 날은 위 ‘기록한 날’에서 확인할 수 있어요.</p></section><section class="panel"><h2>남겨둔 생각들</h2>${notes.length?notes.map(n=>`<article class="journal-entry"><small>${pretty(n.date)}</small><h3>${esc(n.q.title)}</h3><p>${esc(n.value)}</p></article>`).join(''):'<p class="muted" style="margin-top:22px">회고를 작성하면 이곳에 모여요.</p>'}</section></div>
<section class="panel"><h2>날짜별 기록</h2>${r.recordedDays?r.rows.slice().reverse().filter(row=>row.answered.length).map(row=>`<div class="history-row"><span>${pretty(row.date)}</span><span class="muted">${row.answered.length} / ${row.plan.length} 기록</span><button class="text-button" data-action="open-date" data-date="${row.date}">보기·수정 →</button></div>`).join(''):'<p class="muted" style="margin-top:18px">아직 제출한 기록이 없어요. 오늘의 작은 기록부터 시작해 보세요.</p>'}</section>`;}
function renderChat(){
 return `<section class="chat-page"><div class="chat-heading"><h1>채팅</h1><span class="chat-mock-badge">${api.snapshot.chatMode==='gemini'?'Gemini':'목데이터'}</span></div><p class="chat-description">${api.snapshot.chatMode==='gemini'?'루틴 항목 추가·삭제를 자연스럽게 요청해 보세요. 변경은 확인 후에만 반영돼요.':'정해진 표현만 이해하는 예시 채팅이에요. 변경은 확인 후 다이어리에 반영됩니다.'}</p>
 <details class="chat-examples"><summary>요청 예시 보기</summary><div>${CHAT_EXAMPLES.map((text,i)=>`<button data-action="chat-example" data-index="${i}">${esc(text)}</button>`).join('')}</div></details>
 <div class="chat-thread" role="log" aria-label="대화 내용" aria-live="polite"><div class="chat-message assistant"><span class="chat-speaker">다이어리</span><div class="chat-bubble">목차와 항목, 일정을 관리하고 기록을 돌아볼 수 있어요. 예시를 선택하거나 같은 형식으로 적어보세요.</div></div>${chatMessages.map(renderChatMessage).join('')}</div>
 <form id="chat-form" class="chat-composer"><label for="chat-input" class="visually-hidden">채팅 메시지</label><textarea id="chat-input" rows="2" maxlength="600" placeholder="이번 달 27일 독서 모임" required>${esc(chatDraft)}</textarea><button class="primary" type="submit">보내기</button></form></section>`;
}
function renderChatMessage(message){
 if(message.role==='user')return `<div class="chat-message user"><div class="chat-bubble">${esc(message.text)}</div></div>`;
 const r=message.result;
 let content=`<div class="chat-bubble">${esc(r.text)}</div>`;
 if(r.kind==='proposal')content+=`<div class="chat-proposal"><div class="chat-proposal-lines">${r.preview.map(line=>`<p>${esc(line)}</p>`).join('')}</div>${message.status==='applied'?'<p class="chat-result">✓ 반영했어요.</p>':message.status==='cancelled'?'<p class="chat-result muted">취소했어요.</p>':message.status==='stale'?'<p class="chat-result muted">다시 요청해 주세요.</p>':`<div class="chat-proposal-actions"><button class="secondary" data-action="chat-cancel" data-id="${message.id}">취소</button><button class="primary" data-action="chat-confirm" data-id="${message.id}">확인하고 반영</button></div>`}${message.error?`<p class="form-error" role="alert">${esc(message.error)}</p>`:''}</div>`;
 if(r.kind==='choices')content+=`<div class="chat-choices">${r.choices.map((choice,i)=>`<button class="secondary" data-action="chat-choice" data-id="${message.id}" data-index="${i}" ${message.status?'disabled':''}>${esc(choice.label)}</button>`).join('')}</div>`;
 return `<div class="chat-message assistant"><span class="chat-speaker">다이어리 · ${r.source==='gemini'?'Gemini':'목데이터'}</span>${content}</div>`;
}
function chatScroll(){requestAnimationFrame(()=>{const log=$('.chat-thread');if(log)log.scrollTop=log.scrollHeight;});}
async function chatSend(text){
 text=text.trim();if(!text||saving)return;
 saving=true;document.body.dataset.saving='true';const unlock=lockForm($('#chat-form'));
 try {const result=await api.chat(text);$('#storage-alert').hidden=true;chatMessages.push({id:uid(),role:'user',text},{id:uid(),role:'assistant',result});chatDraft='';render();chatScroll();$('#chat-input')?.focus();}
 catch(e){showAlert(e.message);}finally{unlock();saving=false;delete document.body.dataset.saving;}
}
async function chatDecide(id,decision){
 const message=chatMessages.find(item=>item.id===id);
 if(!message||message.result?.kind!=='proposal'||message.status||saving)return;
 saving=true;document.body.dataset.saving='true';
 try {
  const result=await api.decide(message.result.proposalId,decision);
  state=api.snapshot.state;$('#storage-alert').hidden=true;message.status=result.status==='applied'?'applied':result.status==='cancelled'?'cancelled':'stale';
  message.error=result.status==='expired'?'시간이 지났어요. 다시 요청해 주세요.':'';
 }catch(e){message.error=e.message;if(e.status===409){message.status='stale';await api.load().then(()=>{state=api.snapshot.state;}).catch(()=>{});}}
 finally{saving=false;delete document.body.dataset.saving;render();chatScroll();}
}
function actionsMenu(label,content){return `<details class="action-menu"><summary aria-label="${esc(label)}">${icon('more')}</summary><div class="action-menu-panel">${content}</div></details>`;}
function renderManage(){
 return `<section class="manage-page">${heading('','항목 관리','',`<div class="manage-toolbar"><button class="secondary" data-action="add-group">목차 추가</button><button class="primary" data-action="add-question">＋ 항목 추가</button></div>`)}
 ${state.groups.map((g,gi)=>{
  const qs=state.questions.filter(q=>q.groupId===g.id&&!q.deleted);
  const groupMenu=actionsMenu(`${g.name} 목차 메뉴`,`<button data-action="edit-group" data-id="${esc(g.id)}">목차 수정</button><button data-action="move-group" data-id="${esc(g.id)}" data-direction="-1" ${gi===0?'disabled':''}>위로 이동</button><button data-action="move-group" data-id="${esc(g.id)}" data-direction="1" ${gi===state.groups.length-1?'disabled':''}>아래로 이동</button><hr><button class="danger-action" data-action="delete-group" data-id="${esc(g.id)}" ${qs.length?'disabled title="목차의 항목을 먼저 옮기거나 삭제해 주세요."':''}>목차 삭제</button>`);
  return `<section class="panel manage-panel"><div class="manage-group-head"><span class="group-icon">${groupIcon(g)}</span><h2>${esc(g.name)}</h2><span class="manage-total">${qs.length}</span>${groupMenu}</div>
  ${qs.map((q,i)=>`<div class="manage-row ${!q.active?'inactive':''}"><div class="manage-name"><h3><button class="manage-title" data-action="edit-question" data-id="${esc(q.id)}">${esc(q.title)}</button></h3></div><span class="manage-type">${!q.active?'중지':({ox:'O/X',choice:'선택',text:'글쓰기',score:'점수'})[q.type]}</span>${actionsMenu(`${q.title} 항목 메뉴`,`<button data-action="edit-question" data-id="${esc(q.id)}">수정</button><button data-action="toggle-question" data-id="${esc(q.id)}">${q.active?'사용 중지':'다시 사용'}</button><hr><button data-action="move-question" data-id="${esc(q.id)}" data-direction="-1" ${i===0?'disabled':''}>위로 이동</button><button data-action="move-question" data-id="${esc(q.id)}" data-direction="1" ${i===qs.length-1?'disabled':''}>아래로 이동</button><hr><button class="danger-action" data-action="delete-question" data-id="${esc(q.id)}">삭제</button>`)}</div>`).join('')||'<p class="manage-empty">아직 항목이 없어요.</p>'}
  <button class="text-button manage-add" data-action="add-question" data-group="${esc(g.id)}">＋ 이 목차에 항목 추가</button></section>`;
 }).join('')||'<div class="empty">목차를 먼저 추가해 주세요.</div>'}</section>`;
}
function openDialog(html){returnFocus=document.activeElement;$('#dialog').innerHTML=html;$('#dialog').showModal();}
function dialogShell(title,body,subtitle=''){return `<div class="dialog-head"><div><h2 id="dialog-title">${title}</h2>${subtitle?`<small>${subtitle}</small>`:''}</div><button class="icon-button" data-action="close-dialog" aria-label="닫기" style="margin-left:auto">${icon('close')}</button></div><div class="dialog-body">${body}</div>`;}
function closeDialog(){if(saving)return;if(session){capture();if(dirtySession()&&!confirm('제출하지 않은 답변이 있어요. 저장하지 않고 닫을까요?'))return;}$('#dialog').close();session=null;returnFocus?.focus();}
function dirtySession(){return session&&JSON.stringify(session.drafts)!==JSON.stringify(session.initial);}
function openSurvey(mode,id){if(date>today()){toast('루틴 기록은 해당 날짜부터 할 수 있어요.');return;}const plan=planFor(state,date,today()),a=answers();let items=mode==='one'?plan.filter(q=>q.id===id):mode==='group'?plan.filter(q=>q.groupId===id):plan;const review=items.every(q=>hasAnswer(a[q.id]));if(mode!=='one'&&!review)items=items.filter(q=>!hasAnswer(a[q.id]));if(!items.length){toast('기록할 항목이 없어요.');return;}const drafts=Object.fromEntries(items.filter(q=>hasAnswer(a[q.id])).map(q=>[q.id,a[q.id]]));session={plan,items,date,drafts,initial:structuredClone(drafts),scope:mode};returnFocus=document.activeElement;renderSurvey(true);}
function inputFor(q,value){if(q.purpose==='dayTitle')return `<label class="field"><span class="visually-hidden">내일의 제목</span><input data-answer="${esc(q.id)}" type="text" maxlength="80" value="${esc(value||'')}" placeholder="먼저 인사하는 하루"></label>`;if(q.type==='text')return `<label class="field"><span class="sr-label" style="font-size:11px;color:var(--muted)">답변</span><textarea data-answer="${esc(q.id)}" aria-label="${esc(q.title)} 답변" maxlength="4000" placeholder="${q.purpose==='tomorrow'?'먼저 인사하기&#10;행복한 하루 보내기&#10;한 줄에 하나씩 적어주세요.':'편하게 적어보세요. 짧은 한 문장도 좋아요.'}">${esc(value||'')}</textarea></label>`;
const values=q.type==='ox'?['O','X']:q.type==='score'?['1','2','3','4','5']:q.options;return `<div class="options ${q.type==='score'?'score-options':''}" role="group" aria-label="${esc(q.title)}">${values.map(v=>`<label class="option"><input type="radio" name="answer-${esc(q.id)}" data-answer="${esc(q.id)}" value="${esc(v)}" ${q.type==='ox'?`aria-label="${v==='O'?'O · 했어요':'X · 못 했어요'}"`:''} ${String(value)===v?'checked':''}><span>${esc(v)}</span></label>`).join('')}</div>${q.type==='score'?'<div class="score-captions"><span>1 · 아쉬운 하루</span><span>5 · 만족스러운 하루</span></div>':''}`;}
function renderSurvey(open=false){
 const s=session,scrollTop=$('#dialog').scrollTop;
 const title=s.scope==='one'?esc(questionLabel(s.items[0])):s.scope==='group'?`${esc(s.items[0].groupName)} 기록`:'전체 항목 기록';
 $('#dialog').innerHTML=dialogShell(title,`
 <p class="dialog-date">${pretty(s.date,true)} · 작성한 항목만 저장할 수 있어요.</p>
 <form id="survey-form">
 ${s.items.map((item,i)=>`<section class="question-block">
 <div class="question-number">${esc(item.groupName)} · ${i+1}</div>
 <h3>${esc(questionLabel(item))}</h3><p>${esc(questionDescription(item)||'선택하지 않은 항목은 미기록으로 남아요.')}</p>
 ${inputFor(item,s.drafts[item.id])}
 ${hasAnswer(answers()[item.id])?`<button class="clear-answer" type="button" data-action="remove-answer" data-id="${esc(item.id)}">저장한 이 답변 지우기</button>`:`<button class="clear-answer" type="button" data-action="clear-draft" data-id="${esc(item.id)}">선택·입력 취소</button>`}
 </section>`).join('')}
 <p id="form-error" class="form-error" role="alert"></p>
 <div class="dialog-actions"><button type="button" class="secondary" data-action="close-dialog">닫기</button><button class="primary" type="submit">${s.scope==='one'?'기록 저장':'작성한 항목 저장'} ✓</button></div>
 </form>`);
 if(open)$('#dialog').showModal();else $('#dialog').scrollTop=scrollTop;
}

function capture(){if(!session)return;$('#dialog').querySelectorAll('textarea[data-answer],input[type=text][data-answer]').forEach(el=>{if(el.value.trim())session.drafts[el.dataset.answer]=el.value;else delete session.drafts[el.dataset.answer];});$('#dialog').querySelectorAll('input[data-answer]:checked').forEach(el=>session.drafts[el.dataset.answer]=el.value);}
async function submitSurvey(){capture();try{if(!await commit('answers.save',{date:session.date,values:session.drafts}))return;const amount=Object.keys(session.drafts).length;const titleSaved=session.items.some(q=>q.purpose==='dayTitle'&&hasAnswer(session.drafts[q.id]));const target=shiftDate(session.date,1);session=null;$('#dialog').close();render();toast(titleSaved?`${amount}개 항목을 기록했어요. 제목은 ${short(target)} 홈에 표시돼요.`:`${amount}개 항목을 기록했어요.`);$('#main').focus();}catch(e){$('#form-error').textContent=e.message;}}
function optionRow(value,index){return `<div class="option-editor-row"><span class="option-index">${index+1}</span><input name="option" aria-label="선택지 ${index+1}" value="${esc(value)}" maxlength="80" placeholder="선택지 이름"><div class="option-row-actions"><button class="mini" type="button" data-action="move-option-up" aria-label="선택지 위로">↑</button><button class="mini" type="button" data-action="move-option-down" aria-label="선택지 아래로">↓</button><button class="mini" type="button" data-action="remove-option" aria-label="선택지 삭제">×</button></div></div>`;}
function renumberOptions(){const rows=[...$('#option-rows').children];rows.forEach((row,index)=>{row.querySelector('.option-index').textContent=index+1;row.querySelector('input').setAttribute('aria-label',`선택지 ${index+1}`);row.querySelector('[data-action="move-option-up"]').disabled=index===0;row.querySelector('[data-action="move-option-down"]').disabled=index===rows.length-1;row.querySelector('[data-action="remove-option"]').disabled=rows.length<=2;});$('#dialog [data-action="add-option"]').disabled=rows.length>=20;}
function questionEditor(id,groupId){if(!state.groups.length){groupEditor();return;}const q=state.questions.find(q=>q.id===id)||{title:'',description:'',type:'ox',groupId:groupId||state.groups[0].id,options:[]};openDialog(dialogShell(id?'항목 수정':'새로운 항목',`<form id="question-editor" data-id="${esc(id||'')}"><label class="field"><span>항목 이름</span><input name="title" value="${esc(q.title)}" placeholder="예: 자기 전 10분 독서" maxlength="80" required></label><div class="form-grid"><label class="field"><span>큰 목차</span><select name="groupId">${state.groups.map(g=>`<option value="${esc(g.id)}" ${g.id===q.groupId?'selected':''}>${esc(g.name)}</option>`).join('')}</select></label><label class="field"><span>답변 방식</span><select name="type" id="question-type">${Object.entries(q.purpose==='dayTitle'?{text:'한 줄 제목'}:typeNames).map(([value,label])=>`<option value="${value}" ${value===q.type?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="field" id="options-field" ${q.type!=='choice'?'hidden':''}><span>선택지</span><div id="option-rows">${(q.options.length?q.options:['A','B','C','D','기타']).map(optionRow).join('')}</div><button class="text-button" type="button" data-action="add-option">＋ 선택지 추가</button><p class="hint">보기를 직접 수정하고, 화살표로 순서를 바꿀 수 있어요. 중복 없이 2~20개, 각 80자까지 입력해 주세요.</p></div><label class="field"><span>설명 <span class="muted">· 선택</span></span><textarea name="description" maxlength="500" placeholder="기록할 때 보여줄 질문이나 안내를 적어주세요.">${esc(q.description)}</textarea></label>${id&&isRecorded(state,id)?'<p class="muted">이미 제출한 답변은 당시 문구와 응답 형식으로 유지돼요. 수정한 내용은 새 기록에 적용됩니다.</p>':''}<p id="form-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" data-action="close-dialog">취소</button><button type="submit" class="primary">${id?'변경 저장':'항목 추가'} ✓</button></div></form>`));renumberOptions();}
function groupEditor(id){const g=state.groups.find(g=>g.id===id);openDialog(dialogShell(id?'목차 수정':'새로운 목차',`<form id="group-editor" data-id="${esc(id||'')}"><label class="field"><span>목차 이름</span><input name="name" value="${esc(g?.name||'')}" placeholder="예: 아침을 여는 습관" maxlength="40" required></label><p class="muted">목차 안에 루틴과 회고 항목을 자유롭게 추가할 수 있어요.</p><p id="form-error" class="form-error" role="alert"></p><div class="dialog-actions"><button type="button" class="secondary" data-action="close-dialog">취소</button><button type="submit" class="primary">저장 ✓</button></div></form>`));}
async function moveItem(kind,id,direction){if(await commit(kind==='group'?'group.move':'routine.move',{id,direction}))render();}
document.addEventListener('click',async e=>{
 document.querySelectorAll('.action-menu[open]').forEach(menu=>{if(!menu.contains(e.target))menu.open=false;});
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
 const menu=b.closest('.action-menu');if(menu){menu.open=false;menu.querySelector('summary').focus();}
 if(saving){e.preventDefault();return;}
 const action=b.dataset.action,id=b.dataset.id;switch(action){
case 'chat-example':chatSend(CHAT_EXAMPLES[Number(b.dataset.index)]);break;
case 'chat-confirm':await chatDecide(id,'confirm');break;
case 'chat-cancel':await chatDecide(id,'cancel');break;
case 'chat-choice':{const message=chatMessages.find(item=>item.id===id);if(message&&!message.status){const choice=message.result.choices[Number(b.dataset.index)];if(choice){message.status='selected';chatMessages.push({id:uid(),role:'assistant',result:choice.result});render();chatScroll();}}break;}
case 'date-prev':if(calendarOpen&&view==='today'){calendarDay=shiftDate(calendarDay,-1);calendarMonth=calendarDay.slice(0,7);}else{date=shiftDate(date,-1);expanded.clear();}render();break;
case 'date-next':if(calendarOpen&&view==='today'){calendarDay=shiftDate(calendarDay,1);calendarMonth=calendarDay.slice(0,7);}else{date=shiftDate(date,1);expanded.clear();}render();break;
case 'date-today':date=today();calendarDay=date;calendarMonth=date.slice(0,7);expanded.clear();render();break;
case 'calendar-toggle':calendarOpen=!calendarOpen;if(calendarOpen){calendarDay=date;calendarMonth=date.slice(0,7);}else{date=calendarDay;expanded.clear();}render();break;
case 'calendar-day':calendarDay=b.dataset.date;calendarMonth=calendarDay.slice(0,7);render();break;
case 'calendar-month-prev':calendarShift(-1);render();break;
case 'calendar-month-next':calendarShift(1);render();break;
case 'expand':expanded.has(id)?expanded.delete(id):expanded.add(id);render();document.querySelector(`[aria-controls="group-${CSS.escape(id)}"]`)?.focus();break;
case 'edit-message':messageEditor(b.dataset.source);break;
case 'toggle-title':if(await commit('title.set-checked',{date,checked:b.checked}))render();else b.checked=!b.checked;break;
case 'add-schedule':scheduleEditor(undefined,b.dataset.date||date);break;
case 'edit-schedule':scheduleEditor(id);break;
case 'toggle-schedule':if(await commit('schedule.set-checked',{id,checked:b.checked}))render();else b.checked=!b.checked;break;
case 'delete-schedule':if(confirm('이 일정을 삭제할까요?')&&await commit('schedule.delete',{id})){$('#dialog').close();render();toast('일정을 삭제했어요.');}break;
case 'survey':openSurvey('all');break;
case 'group-survey':openSurvey('group',id);break;
case 'question':openSurvey('one',id);break;
case 'close-dialog':closeDialog();break;
case 'clear-draft':capture();delete session.drafts[id];renderSurvey();break;
case 'remove-answer':if(confirm('이 답변을 지우고 미기록 상태로 되돌릴까요?')&&await commit('answers.remove',{date:session.date,id})){delete session.drafts[id];delete session.initial[id];renderSurvey();render();toast('미기록으로 되돌렸어요.');}break;
case 'period':period=Number(b.dataset.value);render();break;
case 'open-date':date=b.dataset.date;expanded=new Set(groupPlan(planFor(state,date,today())).map(g=>g.id));location.hash='today';render();break;
case 'add-option':{const rows=$('#option-rows');if(rows.children.length<20){rows.insertAdjacentHTML('beforeend',optionRow('',rows.children.length));renumberOptions();rows.lastElementChild.querySelector('input').focus();}break;}
case 'remove-option':{const row=b.closest('.option-editor-row');if(row.parentElement.children.length>2){row.remove();renumberOptions();}break;}
case 'move-option-up':{const row=b.closest('.option-editor-row');if(row.previousElementSibling)row.parentElement.insertBefore(row,row.previousElementSibling);renumberOptions();break;}
case 'move-option-down':{const row=b.closest('.option-editor-row');if(row.nextElementSibling)row.parentElement.insertBefore(row.nextElementSibling,row);renumberOptions();break;}
case 'add-question':questionEditor(null,b.dataset.group);break;
case 'edit-question':questionEditor(id);break;
case 'add-group':groupEditor();break;
case 'edit-group':groupEditor(id);break;
case 'toggle-question':{const active=!state.questions.find(q=>q.id===id).active;if(await commit('routine.set-active',{id,active})){render();toast(active?'항목을 다시 사용해요.':'사용을 중지했어요. 지난 기록은 남아 있어요.');}break;}
case 'delete-question':{const q=state.questions.find(q=>q.id===id&&!q.deleted);if(q&&confirm(`‘${q.title}’ 항목을 삭제할까요?\n현재 루틴 목록에서 제거하고, 지난 기록은 유지해요.`)&&await commit('routine.delete',{id})){render();toast('항목을 삭제했어요. 지난 기록은 남아 있어요.');}break;}
case 'delete-group':if(await commit('group.delete',{id}))render();break;
case 'move-question':await moveItem('question',id,Number(b.dataset.direction));break;
case 'move-group':await moveItem('group',id,Number(b.dataset.direction));break;
}});
document.addEventListener('toggle',e=>{
 const menu=e.target;if(!menu.matches?.('.action-menu'))return;
 menu.classList.remove('opens-up');if(!menu.open)return;
 const panel=menu.querySelector('.action-menu-panel'),trigger=menu.querySelector('summary').getBoundingClientRect();
 const bottom=document.querySelector('.bottom-nav').getBoundingClientRect().top-8;
 if(panel.getBoundingClientRect().bottom>bottom&&trigger.top>panel.offsetHeight+8)menu.classList.add('opens-up');
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#dialog').open){const menu=document.querySelector('.action-menu[open]');if(menu){e.preventDefault();menu.open=false;menu.querySelector('summary').focus();}}});
document.addEventListener('change',e=>{if(e.target.id==='selected-date'){const value=e.target.value;if(value&&e.target.checkValidity()){if(calendarOpen&&view==='today'){calendarDay=value;calendarMonth=value.slice(0,7);}else{date=value;expanded.clear();}render();}else{e.target.value=calendarOpen&&view==='today'?calendarDay:date;toast('날짜를 선택해 주세요.');}}if(e.target.id==='question-type')$('#options-field').hidden=e.target.value!=='choice';});
document.addEventListener('submit',async e=>{
 if(!['chat-form','schedule-editor','message-editor','survey-form','question-editor','group-editor'].includes(e.target.id))return;
 e.preventDefault();if(saving)return;
 const form=e.target;
 if(form.id==='chat-form')return chatSend($('#chat-input').value);
 if(form.id==='schedule-editor')return submitScheduleEditor(form);
 if(form.id==='message-editor')return submitMessageEditor(form);
 if(form.id==='survey-form')return submitSurvey();
 const f=new FormData(form),id=form.dataset.id;
 if(form.id==='question-editor'){
  const payload={...(id?{id}:{}),groupId:String(f.get('groupId')),title:String(f.get('title')).trim(),type:String(f.get('type')),description:String(f.get('description')).trim(),options:f.get('type')==='choice'?f.getAll('option').map(x=>String(x).trim()).filter(Boolean):[]};
  if(await commit(id?'routine.update':'routine.create',payload)){$('#dialog').close();render();toast('항목을 저장했어요.');}
 } else if(await commit(id?'group.update':'group.create',{...(id?{id}:{}),name:String(f.get('name')).trim()})){$('#dialog').close();render();toast('목차를 저장했어요.');}
});
document.addEventListener('input',e=>{if(e.target.id==='chat-input')chatDraft=e.target.value;});
$('#dialog').addEventListener('cancel',e=>{e.preventDefault();closeDialog();});
window.addEventListener('hashchange',()=>{if($('#dialog').open){closeDialog();if($('#dialog').open){location.hash=view;return;}}render();window.scrollTo(0,0);});
window.addEventListener('beforeunload',e=>{if(saving||api.pending){e.preventDefault();e.returnValue='';}if(session){capture();if(dirtySession()){e.preventDefault();e.returnValue='';}}});
render();

async function refreshWhenIdle(){if(saving||api.pending||$('#dialog').open)return;try{const latest=await api.request('/api/diary');if(saving||api.pending||$('#dialog').open)return;api.snapshot=latest;state=latest.state;$('#storage-alert').hidden=true;render();}catch(e){showAlert(e.message);}}
window.addEventListener('focus',refreshWhenIdle);
setInterval(refreshWhenIdle,60000);
