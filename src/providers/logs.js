import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { dayUTC, lastDays, finiteCount } from '../core/model.js';

async function* files(directory, budget, depth = 0) {
  if (depth > 15) throw new Error('Log folder nesting is too deep. Select a narrower folder.');
  for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
    if (++budget.entries > 50000) throw new Error('Log folder contains too many entries. Select a narrower folder.');
    if (entry.isSymbolicLink()) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(full, budget, depth + 1);
    else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      if (++budget.files > 10000) throw new Error('Log folder contains too many files. Select a narrower folder.');
      yield full;
    }
  }
}
export class TokenAccumulator {
  constructor(provider, now = Date.now()) { this.provider = provider; this.days = Object.fromEntries(lastDays(now).map(d=>[d,0])); this.events = new Map(); this.recognized = 0; this.invalid = 0; }
  add(event, file, session) {
    if (!event.timestamp || !Number.isFinite(Date.parse(event.timestamp))) return;
    const day = dayUTC(event.timestamp);
    if (this.provider === 'codex' && event.type === 'event_msg' && event.payload?.type === 'token_count') {
      const usage = event.payload.info?.total_token_usage;
      if (!usage) return; // Rate-limit-only records are not token records.
      const n = usage.total_tokens;
      if (!finiteCount(n)) { this.invalid++; return; }
      this.recognized++;
      const key = `${session || file}:${n}`;
      if (!this.events.has(key)) this.events.set(key, { session: session || file, total: n, timestamp: Date.parse(event.timestamp), day });
    }
    if (this.provider === 'claude' && event.type === 'assistant' && event.message?.usage) {
      const u = event.message.usage, values = [u.input_tokens, u.output_tokens, u.cache_read_input_tokens ?? 0, u.cache_creation_input_tokens ?? 0];
      if (!values.every(finiteCount)) { this.invalid++; return; }
      this.recognized++;
      // Streamed assistant records repeat the message id. Keep the most complete count.
      const key = `${event.requestId || ''}:${event.message.id || event.uuid || `${file}:${event.timestamp}`}`;
      const total = values.reduce((a,b)=>a+b,0), previous = this.events.get(key);
      if (!previous || total > previous.total) this.events.set(key, { day, total });
    }
    if (this.events.size > 1000000) throw new Error('Too many token events. Select a narrower log folder.');
  }
  result() {
    if (this.invalid) throw new Error('Some token records have an unsupported format. Previous data was preserved.');
    const previous = new Map();
    const events = [...this.events.values()];
    if (this.provider === 'codex') events.sort((a,b) => a.timestamp-b.timestamp || a.total-b.total);
    for (const event of events) {
      let count = event.total;
      if (this.provider === 'codex') {
        const last = previous.get(event.session) || 0;
        count = Math.max(0, event.total-last); previous.set(event.session, Math.max(last,event.total));
      }
      if (Object.hasOwn(this.days,event.day)) this.days[event.day] += count;
    }
    return this.days;
  }
}
export async function readLogs(directory, provider, now = Date.now()) {
  const tally = new TokenAccumulator(provider, now); const budget = { files: 0, entries: 0, bytes: 0 }; let malformed = 0;
  for await (const file of files(directory, budget)) {
    const stat = await fs.promises.stat(file); budget.bytes += stat.size;
    if (stat.size > 250_000_000 || budget.bytes > 1_000_000_000) throw new Error('Log source exceeds 1 GB or has a file over 250 MB. Select a narrower folder.');
    let session = file;
    const stream = fs.createReadStream(file, { encoding: 'utf8' });
    const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (line.length > 10_000_000) throw new Error('A log record exceeds the supported size.');
        if (!line.trim()) continue;
        let event; try { event = JSON.parse(line); } catch { malformed++; continue; }
        if (event.type === 'session_meta' && event.payload?.id) session = event.payload.id;
        tally.add(event,file,session);
      }
    } finally { lines.close(); stream.destroy(); }
  }
  if (!tally.recognized) throw new Error('No reported token records found. Select the correct logs folder; token usage remains unavailable.');
  const days = tally.result();
  return { days, source: provider === 'codex' ? 'Local Codex session logs' : 'Local Claude Code logs', scope: 'Selected folder only • UTC days • not account-wide', fetchedAt: now, warning: malformed ? `${malformed} incomplete or unreadable records skipped; totals may be partial.` : null };
}
