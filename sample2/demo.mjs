import {initialState, planFor, saveAnswers, shiftDate, today, hasAnswer, saveSchedule} from './model.mjs?v=f59d64e0da08';

// Fictional responses used to initialize the single prototype diary.
export const DEMO_STORAGE_KEY = 'habit-diary-sample2:demo:v1';
const exampleDays = [
    {score:'3', activity:'업무', work:'밀린 메일을 정리하고 이번 주 할 일을 나눴다.', note:'시작이 느렸지만 하나씩 정리하니 마음이 가벼워졌다.', tomorrow:'차분하게 시작하는 하루'},
    {score:'4', activity:'공부', work:'강의를 듣고 중요한 내용을 내 말로 다시 적었다.', note:'자기 전 휴대폰을 내려두고 책을 조금 읽었다.', tomorrow:'배운 것을 한 번 더 써보는 하루'},
    null, // No entry at all: distinct from an X response.
    {score:'2', activity:'업무', work:'회의가 길어져 계획한 작업을 마치지 못했다.', note:'운동은 쉬었다. 내일은 짧게라도 산책하고 싶다.', tomorrow:'잠깐이라도 밖을 걷는 하루'},
    {score:'4', activity:'개인 프로젝트', work:'작게 만들 화면을 그려보고 필요한 기능을 정리했다.', note:'막연했던 생각이 조금 구체적이 되었다.', tomorrow:'작은 일 하나를 끝내는 하루'},
    {score:'5', activity:'휴식', work:'급한 일만 확인하고 오후에는 충분히 쉬었다.', note:'가볍게 걷고 맛있는 저녁을 먹었다. 여유가 좋았다.', tomorrow:'내 속도로 이어가는 하루'},
    {score:'3', activity:'공부', work:'어제 읽은 내용을 복습했다. 집중은 짧게 두 번 나눠 했다.', note:'많이 하기보다 다시 이어간 것에 만족한다.', tomorrow:'다시 시작해도 괜찮은 하루', partial:true},
    {score:'4', activity:'업무', work:'미뤘던 작업 하나를 끝내고 다음 할 일을 적어두었다.', note:'아침에 몸을 풀었더니 하루를 시작하기 편했다.', tomorrow:'말하기 전에 한 번 더 듣는 하루'},
    null,
    {score:'3', activity:'개인 프로젝트', work:'화면을 직접 눌러보며 불편한 부분 세 가지를 적었다.', note:'오늘은 결과보다 발견한 것을 기억하고 싶다.', tomorrow:'하나에 차분히 집중하는 하루'},
    {score:'4', activity:'공부', work:'모르는 부분을 찾아보고 예제를 하나 따라 해봤다.', note:'짧은 독서 시간을 지켰다. 내일도 이어가고 싶다.', tomorrow:'읽은 것을 내 말로 남기는 하루'},
    {score:'2', activity:'업무', work:'작업을 시작했지만 예상보다 오래 걸렸다.', note:'늦게 끝나 루틴 몇 가지는 쉬었다.', tomorrow:'가볍게 시작하는 하루', partial:true},
    {score:'5', activity:'휴식', work:'한 주를 정리하고 다음 주에 할 일만 간단히 적었다.', note:'충분히 쉬고 일찍 하루를 마무리했다.', tomorrow:'먼저 인사하는 하루'},
    {activity:'공부', tomorrow:'작은 일부터 시작하는 하루', partial:true},
  ];
export function createDemoState(end = today()) {
  let state = initialState();
  exampleDays.forEach((entry, index) => {
    if (!entry) return;
    const date = shiftDate(end, index - 13);
    const values = {};
    const ox = state.questions.filter(q => q.type === 'ox');
    ox.forEach((q, j) => { values[q.id] = (index + j * 2) % 5 === 0 ? 'X' : 'O'; });
    values.worktype = entry.activity;
    values.tomorrow = entry.tomorrow;
    if (entry.score) values.score = entry.score;
    if (entry.work) values.worknote = entry.work;
    if (entry.note) values.worknote += '\n' + entry.note;
    if (entry.partial && index !== 13) {
      delete values.vitamin;
      delete values.reading;
      if (index === 6) delete values.worknote;
    }
    if (index === 13) {
      // Home preview: one completed category, others still available to answer.
      delete values.exercise;
      delete values.vitamin;
      delete values.reading;
    }
    state = saveAnswers(state, date, planFor(state, date, end), values, end);
    state.days[date].updatedAt = `${date}T21:40:00+09:00`;
  });
  state=saveSchedule(state,{date:end,text:'미팅 자료 준비하기'});
  state=saveSchedule(state,{date:end,text:'지원서 제출하기'});
  state.schedules[1].checked=true;
  state=saveSchedule(state,{date:shiftDate(end,5),text:'프로젝트 발표 자료 최종 확인'});
  state.features.exampleTitles=1;
  return {...state, source:'demo', demoEnd:end};
}

// Refresh only recognizable, unchanged examples in an already saved diary.
// A one-time marker prevents a later intentional deletion from being filled again.
export function refreshExampleTitles(state) {
  if(state.features?.exampleTitles||!['demo','prototype'].includes(state.source))return state;
  const next=structuredClone(state);
  // Early unified diaries lost demoEnd when an empty personal store was primary.
  // Recover its anchor only when multiple original example texts agree on it.
  const anchors=new Map();
  for(const [date,day] of Object.entries(state.days))exampleDays.forEach((entry,i)=>{
    if(!entry?.note)return;
    const fullReflection=day.answers.worknote===`${entry.work}\n${entry.note}`;
    const oldExample=day.answers.note===entry.note&&day.answers.score===entry.score&&day.answers.worktype===entry.activity;
    if(fullReflection||oldExample){const anchor=shiftDate(date,13-i);anchors.set(anchor,(anchors.get(anchor)||0)+1);}
  });
  const inferred=[...anchors].sort((a,b)=>b[1]-a[1])[0];
  const end=state.demoEnd||(inferred?.[1]>=2?inferred[0]:null);
  for(const [date,day] of Object.entries(next.days)){
    const index=end?exampleDays.findIndex((_,i)=>shiftDate(end,i-13)===date):-1;
    const isExample=index>=0||(state.exampleDates||[]).includes(date);
    if(!isExample)continue;
    const entry=index>=0?exampleDays[index]:exampleDays.find(e=>e?.note&&(day.answers.note===e.note||day.answers.worknote===`${e.work}\n${e.note}`));
    if(!entry)continue;
    const question=planFor(next,date).find(q=>q.purpose==='dayTitle');
    if(!question||day.plan.find(q=>q.id===question.id)?.purpose==='tomorrow')continue;
    const previous=day.answers[question.id];
    const untouchedBlank=!hasAnswer(previous)&&day.updatedAt===`${date}T21:40:00+09:00`;
    const unchangedLegacy=hasAnswer(previous)&&previous===entry.note;
    if(!unchangedLegacy&&!untouchedBlank)continue;
    const target=shiftDate(date,1),cached=next.dayTitles?.[target];
    // A separately edited top-card title is also personal input.
    if(cached?.text&&cached.text!==previous&&cached.text!==entry.tomorrow)continue;
    day.answers[question.id]=entry.tomorrow;
    next.dayTitles=next.dayTitles||{};
    next.dayTitles[target]={text:entry.tomorrow,checked:cached?.text===entry.tomorrow&&!!cached.checked};
  }
  next.features={...next.features,exampleTitles:1};
  return next;
}
