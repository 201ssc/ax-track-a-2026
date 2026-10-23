import {upgradePlanning,validateState} from './model.mjs?v=f59d64e0da08';
import {createDemoState,refreshExampleTitles} from './demo.mjs?v=f59d64e0da08';

export const PROTOTYPE_STORAGE_KEY='habit-diary-sample2:prototype:v1';

// One working diary. Legacy stores remain untouched as the original copies.
export function createPrototype({personal=null,demo=null,seed=createDemoState()}={}) {
 if(personal)validateState(personal);if(demo)validateState(demo);
 const primary=personal||demo||seed;
 const next=upgradePlanning(primary);
 // Existing dated answers win over generated examples; personal wins a legacy conflict.
 next.days={...structuredClone(seed.days),...structuredClone(demo?.days||{}),...structuredClone(personal?.days||{})};
 next.dayTitles={...structuredClone(seed.dayTitles),...structuredClone(demo?.dayTitles||{}),...structuredClone(personal?.dayTitles||{})};
 const schedules=[];
 for(const source of [primary,demo,seed])for(const item of source?.schedules||[]){
  if(!schedules.some(previous=>previous.id===item.id||(previous.date===item.date&&previous.text===item.text)))schedules.push(structuredClone(item));
 }
 next.schedules=schedules;next.source='prototype';next.exampleDates=Object.keys(seed.days).filter(date=>!personal?.days?.[date]&&!demo?.days?.[date]);
 return refreshExampleTitles(next);
}
