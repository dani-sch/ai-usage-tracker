export const PROVIDERS = {
  codex: { name: 'ChatGPT / Codex', short: 'CX', color: '#8bafff', mode: 'Browser sign-in', description: 'Live Codex quota windows through the official Codex CLI. ChatGPT chat limits are separate. Optional local Codex logs provide recorded tokens.' },
  copilot: { name: 'GitHub Copilot', short: 'GH', color: '#bd9bfa', mode: 'Billing API', description: 'Personal billing usage with a fine-grained GitHub token: Plan (read). Organization-paid seats are not included. The billing API does not expose a remaining allowance or token counts.' },
  claude: { name: 'Claude', short: 'CL', color: '#e7ab82', mode: 'Local Claude Code logs', description: 'Select a Claude Code projects folder to read reported tokens. Personal subscription quotas and reset times have no supported public API in this app. No Claude credentials are needed.' },
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
export function validateAccount(input) {
  if (!input || !Object.hasOwn(PROVIDERS, input.provider)) throw new Error('Choose a supported provider.');
  const label = String(input.label ?? '').trim();
  if (!label || label.length > 80) throw new Error('Use an account name of 1–80 characters.');
  const subscription = String(input.subscription ?? '').trim().slice(0, 80);
  const billingMode = input.billingMode === 'premium_request' ? 'premium_request' : 'ai_credit';
  return { provider: input.provider, label, subscription, billingMode };
}
export function finiteCount(n) { return Number.isSafeInteger(n) && n >= 0; }
