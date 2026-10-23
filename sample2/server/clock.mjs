export const TIME_ZONE='Asia/Seoul';
export function clock(instant=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
  const value=type=>parts.find(p=>p.type===type).value;
  return {today:`${value('year')}-${value('month')}-${value('day')}`,timeZone:TIME_ZONE,updatedAt:instant.toISOString()};
}
