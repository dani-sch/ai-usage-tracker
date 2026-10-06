export class TelemetryError extends Error {
  constructor(message, retryAfter = 0) { super(message); this.retryAfter = retryAfter; }
}
export async function jsonRequest(url, headers, { fetcher = fetch, signal } = {}) {
  let response;
  try { response = await fetcher(url, { headers, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000), redirect: 'error' }); }
  catch { throw new TelemetryError('Provider could not be reached. Check your connection and retry.'); }
  if (!response.ok) {
    if ([401, 403].includes(response.status)) throw new TelemetryError('Connection needs attention. Reconnect and check the required account permissions.');
    if (response.status === 429) {
      const raw = response.headers.get('retry-after');
      const seconds = Number(raw) || Math.max(0, (Date.parse(raw) - Date.now()) / 1000) || 300;
      throw new TelemetryError('Provider rate limited this account. Refresh will resume after the cooldown.', Math.max(60, Math.min(seconds, 86400)));
    }
    throw new TelemetryError(`Provider returned HTTP ${response.status}. No usage values were changed.`);
  }
  const raw = await response.text();
  if (raw.length > 20_000_000) throw new TelemetryError('Provider response exceeded the safety limit.');
  try { return JSON.parse(raw); } catch { throw new TelemetryError('Provider returned an unreadable report.'); }
}
