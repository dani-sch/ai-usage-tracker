// Website telemetry is untrusted. Only documented-by-observation numeric windows survive.
export function usageWindows(kind, raw, now=Date.now()) {
  if(!raw||typeof raw!=='object')throw new Error('No Claude usage data was supplied.');
  const result=[];
  const add=(key,name,w,scale)=>{
    if(!w||typeof w.utilization!=='number'||!Number.isFinite(w.utilization)||w.utilization<0||w.utilization>100/scale)return;
    const value=w.resets_at;
    const reset=typeof value==='number'?(value<1e11?value*1000:value):typeof value==='string'?Date.parse(value):NaN;
    // Never invent a reset or a fresh allowance from an expired reading.
    if(!Number.isFinite(reset)||reset<=now||reset>now+40*86400000)return;
    result.push({key,name,remainingPercent:100-w.utilization*scale,resetsAt:reset});
  };
  if(kind==='usage'){
    add('five_hour','Claude · 5 hours',raw.five_hour,1);
    add('seven_day','Claude · weekly',raw.seven_day,1);
    add('seven_day_sonnet','Claude · Sonnet weekly',raw.seven_day_sonnet,1);
    add('seven_day_opus','Claude · Opus weekly',raw.seven_day_opus,1);
  }else if(kind==='message_limit'){
    add('five_hour','Claude · 5 hours',raw.windows?.['5h'],100);
    add('seven_day','Claude · weekly',raw.windows?.['7d'],100);
    if(!result.some(w=>w.key==='five_hour')&&raw.resolved?.limit)add('five_hour','Claude · 5 hours',{utilization:raw.resolved.limit.percent,resets_at:raw.resolved.limit.resets_at},1);
  }else throw new Error('Unsupported Claude reading.');
  return result;
}
export function cleanReport(report,now=Date.now()) {
  if(!report||typeof report.orgId!=='string'||! /^[a-f0-9-]{36}$/i.test(report.orgId))throw new Error('Missing Claude account identity.');
  return {orgId:report.orgId.toLowerCase(),quotas:usageWindows(report.kind,report.usage,now)};
}
