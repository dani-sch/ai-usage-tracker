import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { validateAccount, PROVIDERS } from './model.js';
import { githubUsage, apiTokens, codexQuotas } from '../providers/api.js';
import { readLogs } from '../providers/logs.js';
import { CodexClient, findCodex } from '../providers/codex.js';

export class Tracker extends EventEmitter {
  constructor(store, vault, directory, adapters = {}) {
    super(); this.store = store; this.vault = vault; this.directory = directory;
    this.adapters = { githubUsage, apiTokens, readLogs, ...adapters };
    this.clients = new Map(); this.inflight = new Map(); this.login = null; this.closed = false;
  }
  changed() { this.emit('changed'); }
  state() {
    return { ...this.store.data, providers: PROVIDERS, active: this.store.active, secureStorage: this.vault.available(), accounts: this.store.data.accounts.map(a => ({ ...a, connected: a.provider === 'codex' ? !!a.signedIn : this.vault.has(a.id), refreshing: this.inflight.has(a.id), loginPending: this.login?.id === a.id })) };
  }
  add(input) {
    if (this.store.data.accounts.length >= 30) throw new Error('Up to 30 accounts are supported.');
    const account = { ...validateAccount(input), id: randomUUID(), createdAt: Date.now(), quotas: [], tokens: null, lastSuccess: null, nextPoll: 0, status: 'setup', note: null, error: null };
    this.store.data.accounts.push(account); this.store.save(); this.changed(); return account.id;
  }
  async edit(id, input) { await this.inflight.get(id); const a = this.store.account(id); const updated = validateAccount({ ...a, ...input, provider: a.provider }); Object.assign(a, updated); this.store.save(); this.changed(); }
  async connectKey(id, secret) {
    await this.inflight.get(id); const a = this.store.account(id);
    if (!['copilot','openai-api','anthropic-api'].includes(a.provider)) throw new Error('This provider does not accept API credentials.');
    this.vault.set(id,secret); a.retryAt = 0; a.lastAttempt = 0; a.identity = null; a.quotas = []; a.usage = null; a.tokens = null;
    this.store.save(); await this.refresh(id);
  }
  client(id) {
    let client = this.clients.get(id);
    if (!client || client.closed) {
      client = new CodexClient(findCodex(this.store.data.settings.codexPath), path.join(this.directory,'profiles',id));
      client.on('notification', msg => {
        if (this.closed) return;
        if (msg.method === 'account/login/completed' && this.login?.id === id) {
          clearTimeout(this.login.timer); this.login = null;
          const a = this.store.data.accounts.find(x=>x.id === id); if (!a) return;
          a.signedIn = !!msg.params?.success; a.lastAttempt = 0;
          a.error = a.signedIn ? null : 'Sign-in did not complete. Try connecting again.';
          this.store.save(); this.changed();
          if (a.signedIn) void this.refresh(id);
        }
        if (msg.method === 'account/rateLimits/updated') {
          const a = this.store.data.accounts.find(x=>x.id === id);
          if (a && Date.now() - (a.lastAttempt || 0) > 10000) void this.refresh(id);
        }
      });
      this.clients.set(id,client);
    }
    return client;
  }
  async beginLogin(id) {
    const a = this.store.account(id); if (a.provider !== 'codex') throw new Error('Browser sign-in is available for Codex.');
    await this.cancelLogin();
    const client = this.client(id);
    const response = await client.call('account/login/start', { type: 'chatgpt' });
    if (typeof response.authUrl !== 'string' || !response.loginId) throw new Error('Codex did not provide a sign-in URL.');
    this.login = { id, loginId: response.loginId, timer: setTimeout(() => void this.cancelLogin().catch(()=>{}), 5*60000) }; this.changed();
    return response.authUrl;
  }
  async cancelLogin() {
    if (!this.login) return;
    const login = this.login; this.login = null; clearTimeout(login.timer);
    try { await this.clients.get(login.id)?.call('account/login/cancel', { loginId: login.loginId }); }
    finally { this.changed(); }
  }
  async setLogPath(id, directory) {
    await this.inflight.get(id); const a = this.store.account(id);
    if (!['codex','claude'].includes(a.provider)) throw new Error('This provider does not support local logs.');
    const canonical = await fs.promises.realpath(directory);
    const normalized = p => process.platform === 'win32' ? p.toLowerCase() : p;
    const c = normalized(canonical);
    if (this.store.data.accounts.some(x => x.id !== id && x.logPath && (normalized(x.logPath) === c || normalized(x.logPath).startsWith(c+path.sep) || c.startsWith(normalized(x.logPath)+path.sep)))) throw new Error('That folder overlaps a source already assigned to another account. Use separate account folders to avoid double counting.');
    a.logPath = canonical; a.tokens = null; a.lastAttempt = 0; a.retryAt = 0; this.store.save(); await this.refresh(id);
  }
  async clearLogs(id) { await this.inflight.get(id); const a = this.store.account(id); a.logPath = null; a.tokens = null; this.store.save(); this.changed(); }
  async disconnect(id) {
    await this.inflight.get(id); const a = this.store.account(id);
    if (this.login?.id === id) await this.cancelLogin();
    if (a.provider === 'codex' && a.signedIn) { await this.client(id).call('account/logout'); this.clients.get(id)?.close(); this.clients.delete(id); }
    this.vault.remove(id); a.signedIn = false; a.identity = null; a.quotas = []; a.usage = null; a.status = 'setup'; a.error = null; a.lastSuccess = null; a.lastAttempt = 0;
    if (!a.logPath) a.tokens = null;
    this.store.save(); this.changed();
  }
  async remove(id) {
    await this.disconnect(id);
    this.clients.get(id)?.close(); this.clients.delete(id);
    if (this.store.active?.accountId === id) this.store.stop('Account removed');
    this.store.data.accounts = this.store.data.accounts.filter(a=>a.id !== id);
    this.store.data.segments = this.store.data.segments.filter(s=>s.accountId !== id);
    this.store.save(); this.changed();
    // UUID comes from the persisted account lookup above; only app-owned profile data is removed.
    const root = path.resolve(this.directory,'profiles'); const target = path.resolve(root,id);
    if (path.dirname(target) === root) await fs.promises.rm(target, { recursive: true, force: true });
  }
  async refresh(id) {
    if (this.inflight.has(id)) return this.inflight.get(id);
    const a = this.store.account(id), now = Date.now();
    if (now < (a.retryAt || 0) || now - (a.lastAttempt || 0) < 10000) return;
    a.lastAttempt = now;
    const work = this.performRefresh(a).finally(()=> { this.inflight.delete(id); if (!this.closed) { this.store.save(); this.changed(); } });
    this.inflight.set(id,work); this.changed(); return work;
  }
  async performRefresh(a) {
    const failures = []; let success = false;
    try {
      if (a.provider === 'codex') {
        if (a.signedIn) {
          const client = this.client(a.id), auth = await client.call('account/read', { refreshToken: false });
          if (auth.account?.type !== 'chatgpt') throw new Error('Sign in to your ChatGPT subscription to read Codex quotas.');
          const report = await client.call('account/rateLimits/read');
          a.quotas = codexQuotas(report); a.identity = auth.account.email || 'ChatGPT account'; a.plan = auth.account.planType;
          a.source = 'Official Codex app server'; a.note = 'Codex limits only. ChatGPT chat limits are separate.'; success = true;
        } else a.note = 'Connect with ChatGPT to see Codex quotas. Local logs can be linked separately.';
      } else if (a.provider === 'copilot' && this.vault.has(a.id)) { Object.assign(a, await this.adapters.githubUsage(a,this.vault.get(a.id))); success = true; }
      else if (['openai-api','anthropic-api'].includes(a.provider) && this.vault.has(a.id)) { a.tokens = await this.adapters.apiTokens(a.provider,this.vault.get(a.id)); a.note = 'API organization tokens; subscription quota and reset telemetry are unavailable.'; success = true; }
      else a.note = PROVIDERS[a.provider].description;
    } catch (e) { failures.push(e.message); if (e.retryAfter) a.retryAt = Date.now() + e.retryAfter*1000; }
    if (a.logPath) {
      try { a.tokens = await this.adapters.readLogs(a.logPath,a.provider); success = true; }
      catch (e) { failures.push(e.message); }
    }
    a.error = failures.join(' '); a.status = failures.length ? 'error' : success ? 'ready' : 'setup';
    if (success && !failures.length) { a.lastSuccess = Date.now(); a.retryAt = 0; }
    a.nextPoll = Date.now() + this.store.data.settings.pollSeconds*1000;
  }
  async refreshAll(dueOnly = false) {
    const queue = this.store.data.accounts.filter(a=>!dueOnly || Date.now() >= (a.nextPoll || 0)).map(a=>a.id);
    await Promise.all(Array.from({ length: Math.min(3,queue.length) }, async()=>{ while(queue.length && !this.closed) { const id = queue.shift(); try { await this.refresh(id); } catch {} } }));
  }
  settings(input) {
    if (![60,300,900,3600].includes(input.pollSeconds) || typeof input.closeToTray !== 'boolean') throw new Error('Choose valid refresh and tray settings.');
    Object.assign(this.store.data.settings,{ pollSeconds: input.pollSeconds, closeToTray: input.closeToTray });
    for (const a of this.store.data.accounts) a.nextPoll = 0;
    this.store.save(); this.changed();
  }
  close() { this.closed = true; if (this.login) clearTimeout(this.login.timer); for (const c of this.clients.values()) c.close(); this.clients.clear(); }
}
