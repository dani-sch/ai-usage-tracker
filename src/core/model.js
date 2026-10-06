export const PROVIDERS = {
  codex: { name: 'ChatGPT / Codex', short: 'CX', color: '#8bafff', mode: 'Browser sign-in', description: 'Live Codex quota windows through the official Codex CLI. ChatGPT chat limits are separate. Optional local Codex logs provide recorded tokens.' },
  copilot: { name: 'GitHub Copilot', short: 'GH', color: '#bd9bfa', mode: 'Billing API', description: 'Personal billing usage with a fine-grained GitHub token: Plan (read). Organization-paid seats are not included. The billing API does not expose a remaining allowance or token counts.' },
  claude: { name: 'Claude', short: 'CL', color: '#e7ab82', mode: 'Local Claude Code logs', description: 'Link Claude Code on this computer to track local tokens and estimated working time. Claude chat usage, subscription limits, and reset times are not synced.' },
  'openai-api': { name: 'OpenAI API', short: 'OA', color: '#79d5b2', mode: 'Organization usage API', description: 'An OpenAI organization admin key provides reported completion tokens. API usage is separate from ChatGPT subscriptions. Organization scope; avoid adding overlapping organizations.' },
  'anthropic-api': { name: 'Anthropic API', short: 'AN', color: '#e9c384', mode: 'Organization usage API', description: 'An Anthropic Console admin key provides reported message tokens. This is API organization usage, separate from Claude subscriptions.' },
  other: { name: 'Other subscription', short: 'AI', color: '#9caebf', mode: 'Focus time only', description: 'Track working time for any subscription. Usage and reset telemetry are unavailable.' }
};
export function dayUTC(value = Date.now()) { return new Date(value).toISOString().slice(0, 10); }
export function dayLocal(value = Date.now()) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function lastDays(now = Date.now(), count = 30) {
  const date = new Date(now); date.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => dayUTC(date.getTime() - (count - 1 - i) * 86400000));
}
export function timeTotals(segments, ids, now = Date.now()) {
  const today = dayLocal(now), month = today.slice(0, 7), byAccount = {};
  let todayMs = 0, monthMs = 0;
  for (const s of segments) {
    if (!ids.includes(s.accountId)) continue;
    byAccount[s.accountId] ??= { todayMs: 0, monthMs: 0 };
    if (s.day === today) { todayMs += s.ms; byAccount[s.accountId].todayMs += s.ms; }
    if (s.day.startsWith(month)) { monthMs += s.ms; byAccount[s.accountId].monthMs += s.ms; }
  }
  return { todayMs, monthMs, byAccount };
}
export function liveSegments(segments, active, now = Date.now()) {
  if (!active || now < active.checkpoint || now-active.checkpoint>60000) return segments;
  return [...segments,...splitInterval(active.accountId,active.checkpoint,now)];
}
export function mergeIntervals(intervals) {
  const sorted=intervals.filter(r=>Array.isArray(r)&&r.length===2&&r.every(Number.isFinite)&&r[1]>r[0]).map(r=>[...r]).sort((a,b)=>a[0]-b[0]);
  const result=[];
  for(const [start,end] of sorted) { const last=result.at(-1);if(last&&start<=last[1])last[1]=Math.max(last[1],end);else result.push([start,end]); }
  return result;
}
export function estimatedTime(accounts, now = Date.now()) {
  const reporting=accounts.filter(a=>Array.isArray(a.tokens?.activity?.intervals));
  const intervals=mergeIntervals(reporting.flatMap(a=>a.tokens.activity.intervals));
  const segments=intervals.flatMap(([start,end])=>splitInterval('activity',start,Math.min(end,now)));
  return { ...timeTotals(segments,['activity'],now), reporting:reporting.length, segments };
}
export function splitInterval(accountId, from, to) {
  const segments = [];
  while (from < to) {
    const midnight = new Date(from); midnight.setHours(24, 0, 0, 0);
    const end = Math.min(to, midnight.getTime());
    segments.push({ accountId, day: dayLocal(from), ms: end - from }); from = end;
  }
  return segments;
}
export function tokenSeries(accounts, now = Date.now()) {
  return lastDays(now).map(day => {
    const known = accounts.filter(a => Number.isSafeInteger(a.tokens?.days?.[day]));
    return { day, total: known.length ? known.reduce((n,a) => n + a.tokens.days[day], 0) : null, reporting: known.length, accounts: accounts.length };
  });
}
export function activitySeries(accounts, metric = 'tokens', segments = [], now = Date.now()) {
  if (metric === 'tokens') return tokenSeries(accounts, now);
  if (metric === 'active') {
    const activity=estimatedTime(accounts,now), local=new Date(now);
    return lastDays(Date.UTC(local.getFullYear(),local.getMonth(),local.getDate())).map(day=>({day,total:activity.reporting?activity.segments.filter(s=>s.day===day).reduce((n,s)=>n+s.ms/60000,0):null,reporting:activity.reporting,accounts:accounts.length}));
  }
  const ids = new Set(accounts.map(a=>a.id));
  const eligible = accounts.filter(a=>a.provider === 'copilot' && (metric === 'requests' ? a.billingMode === 'premium_request' : a.billingMode !== 'premium_request'));
  const unit = metric === 'requests' ? 'requests' : 'ai-credits';
  const local = new Date(now);
  const dates = lastDays(metric === 'focus' ? Date.UTC(local.getFullYear(),local.getMonth(),local.getDate()) : now);
  return dates.map(day=> {
    if (metric === 'focus') return { day, total: segments.filter(s=>ids.has(s.accountId) && s.day===day).reduce((n,s)=>n+s.ms/60000,0), reporting: accounts.length, accounts: accounts.length };
    const known = eligible.filter(a=>a.usageHistory?.unit === unit && Number.isFinite(a.usageHistory.days?.[day]) && a.usageHistory.days[day]>=0);
    return { day, total: known.length ? known.reduce((n,a)=>n+a.usageHistory.days[day],0) : null, reporting: known.length, accounts: eligible.length };
  });
}
export function validateAccount(input) {
  if (!input || !Object.hasOwn(PROVIDERS, input.provider)) throw new Error('Choose a supported provider.');
  const label = String(input.label ?? '').trim();
  if (!label || label.length > 80) throw new Error('Use an account name of 1–80 characters.');
  const subscription = String(input.subscription ?? '').trim().slice(0, 80);
  const billingMode = input.billingMode === 'premium_request' ? 'premium_request' : 'ai_credit';
  const allowance = input.monthlyCredits;
  const monthlyCredits = allowance == null || String(allowance).trim() === '' ? null : Number(allowance);
  if (input.provider === 'copilot' && monthlyCredits !== null && (!Number.isFinite(monthlyCredits) || monthlyCredits <= 0 || monthlyCredits > 1e9)) throw new Error('Enter a monthly credit allowance greater than 0, or leave it blank to use the plan default.');
  return { provider: input.provider, label, subscription, billingMode, ...(input.provider === 'copilot' ? { monthlyCredits } : {}) };
}
// Published individual plan allowances checked October 6, 2026. Flex allotments can change.
// Keep these as estimates with an editable override; they are not API-reported entitlements.
export function copilotAllowance(account) {
  if (account.provider !== 'copilot' || account.billingMode === 'premium_request') return null;
  if (Number.isFinite(account.monthlyCredits) && account.monthlyCredits > 0) return account.monthlyCredits;
  const plan = String(account.subscription || '').trim().toLowerCase().replace(/^(github\s+)?copilot\s+/, '');
  return new Map([['pro', 1500], ['pro+', 7000], ['max', 20000]]).get(plan) ?? null;
}
export function copilotBalance(account, now = Date.now()) {
  const allowance = copilotAllowance(account), usage = account.usage;
  if (!allowance || usage?.unit !== 'ai-credits' || !Number.isFinite(usage.value) || usage.value < 0 || usage.period !== dayUTC(now).slice(0, 7)) return null;
  const remaining = Math.max(0, allowance - usage.value), date = new Date(now);
  return { allowance, remaining, used: usage.value, remainingPercent: remaining / allowance * 100, resetsAt: Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1), overage: Math.max(0, usage.value - allowance) };
}
export function finiteCount(n) { return Number.isSafeInteger(n) && n >= 0; }
