import { dayUTC, lastDays, finiteCount } from '../core/model.js';
import { jsonRequest, TelemetryError } from '../core/http.js';

function checked(n) { if (!finiteCount(n)) throw new TelemetryError('Provider token report has an unsupported format.'); return n; }
export function codexQuotas(result) {
  const buckets = result.rateLimitsByLimitId && Object.keys(result.rateLimitsByLimitId).length ? result.rateLimitsByLimitId : { codex: result.rateLimits };
  if (!buckets || !Object.values(buckets).some(Boolean)) throw new TelemetryError('Codex did not return quota telemetry.');
  const quotas = [];
  for (const [key, b] of Object.entries(buckets)) {
    for (const window of ['primary', 'secondary']) {
      const w = b?.[window];
      if (!w || typeof w.usedPercent !== 'number' || !Number.isFinite(w.usedPercent)) continue;
      quotas.push({ name: `${b.limitName || key} · ${w.windowDurationMins ? duration(w.windowDurationMins) : window}`, remainingPercent: Math.max(0, Math.min(100, 100 - w.usedPercent)), resetsAt: Number.isFinite(w.resetsAt) ? w.resetsAt * 1000 : null });
    }
  }
  return quotas;
}
function duration(minutes) { if (minutes % 1440 === 0) return `${minutes / 1440} day`; if (minutes % 60 === 0) return `${minutes / 60} hour`; return `${minutes} min`; }

export async function githubUsage(account, key, options = {}) {
  const headers = { Authorization: `Bearer ${key}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10', 'User-Agent': 'AI-Usage-Tracker' };
  const user = await jsonRequest('https://api.github.com/user', headers, options);
  if (typeof user.login !== 'string' || !/^[\w-]+$/.test(user.login)) throw new TelemetryError('GitHub did not return an account identity.');
  const now = new Date(options.now ?? Date.now());
  const mode = account.billingMode === 'premium_request' ? 'premium_request' : 'ai_credit';
  const url = `https://api.github.com/users/${encodeURIComponent(user.login)}/settings/billing/${mode}/usage?year=${now.getUTCFullYear()}&month=${now.getUTCMonth()+1}`;
  const report = await jsonRequest(url, headers, options);
  if (!Array.isArray(report.usageItems)) throw new TelemetryError('GitHub returned an unsupported billing report.');
  const unit = mode === 'ai_credit' ? 'ai-credits' : 'requests';
  const relevant = report.usageItems.filter(r => r.product?.toLowerCase().includes('copilot'));
  if (relevant.some(r => r.unitType !== unit || !Number.isFinite(r.grossQuantity) || r.grossQuantity < 0)) throw new TelemetryError('GitHub billing units changed. Usage was not converted.');
  return { identity: user.login, quotas: [], usage: { value: relevant.reduce((n,r) => n+r.grossQuantity,0), unit, period: `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}` }, source: 'GitHub personal billing API', note: 'Monthly used amount only. Remaining allowance, reset time and tokens are not reported by this endpoint. Organization-paid seats are excluded.' };
}

export async function apiTokens(provider, key, options = {}) {
  const now = options.now ?? Date.now(), days = Object.fromEntries(lastDays(now).map(d => [d, 0]));
  const start = Date.parse(Object.keys(days)[0]), end = now;
  const anthropic = provider === 'anthropic-api';
  const headers = anthropic ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${key}` };
  const base = anthropic ? 'https://api.anthropic.com/v1/organizations/usage_report/messages' : 'https://api.openai.com/v1/organization/usage/completions';
  let page, pages = 0;
  const seen = new Set();
  do {
    const url = new URL(base);
    if (anthropic) { url.searchParams.set('starting_at', new Date(start).toISOString()); url.searchParams.set('ending_at', new Date(end).toISOString()); }
    else { url.searchParams.set('start_time', String(Math.floor(start/1000))); url.searchParams.set('end_time', String(Math.floor(end/1000))); }
    url.searchParams.set('bucket_width','1d'); url.searchParams.set('limit','31');
    if (page) url.searchParams.set('page', page);
    const report = await jsonRequest(url.toString(), headers, options);
    if (!Array.isArray(report.data)) throw new TelemetryError('Provider returned an unsupported token report.');
    for (const bucket of report.data) {
      const time = anthropic ? Date.parse(bucket.starting_at) : bucket.start_time * 1000;
      if (!Number.isFinite(time) || !Array.isArray(bucket.results)) throw new TelemetryError('Provider returned an unsupported time bucket.');
      const day = dayUTC(time);
      if (!Object.hasOwn(days, day)) continue;
      for (const r of bucket.results) {
        // OpenAI input_tokens includes cached input. Anthropic categories are disjoint.
        const total = anthropic ? checked(r.uncached_input_tokens) + checked(r.output_tokens) + checked(r.cache_read_input_tokens ?? 0) + checked(r.cache_creation?.ephemeral_1h_input_tokens ?? 0) + checked(r.cache_creation?.ephemeral_5m_input_tokens ?? 0) : checked(r.input_tokens) + checked(r.output_tokens);
        days[day] = checked(days[day] + total);
      }
    }
    page = report.has_more ? report.next_page : null;
    if (report.has_more && (typeof page !== 'string' || !page || seen.has(page))) throw new TelemetryError('Provider pagination was incomplete. Previous data was preserved.');
    seen.add(page);
    if (++pages > 100) throw new TelemetryError('Provider pagination exceeded the safety limit.');
  } while (page);
  return { days, source: anthropic ? 'Anthropic organization messages API' : 'OpenAI organization completions API', scope: 'Organization-wide API usage • UTC days', fetchedAt: now };
}
