import fs from 'node:fs';
import path from 'node:path';
import { splitInterval } from './model.js';

export function atomicJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.tmp';
  const fd = fs.openSync(temporary, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(data, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
}
export class Store {
  constructor(directory) {
    this.file = path.join(directory, 'state.json');
    this.data = { version: 1, accounts: [], segments: [], settings: { pollSeconds: 300, closeToTray: true }, lastPause: null };
    if (fs.existsSync(this.file)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (data.version !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.segments)) throw Error();
        this.data = { ...this.data, ...data, settings: { ...this.data.settings, ...data.settings } };
      } catch { throw new Error('Saved data could not be read. It has been preserved. Restore state.json from your backup before reopening.'); }
    }
    this.active = null; // Never count downtime or restore a timer after a crash.
  }
  save() { atomicJSON(this.file, this.data); }
  account(id) { const account = this.data.accounts.find(a => a.id === id); if (!account) throw new Error('Account not found.'); return account; }
  start(id, now = Date.now()) { this.account(id); this.stop('Switched account', now); this.active = { accountId: id, since: now, checkpoint: now }; this.data.lastPause = null; this.save(); }
  checkpoint(now = Date.now(), idleSeconds = 0) {
    if (!this.active) return;
    const from = this.active.checkpoint;
    // A delayed heartbeat indicates suspend or a blocked process; discard the gap.
    const end = now - from > 60000 || now < from ? from : idleSeconds >= 300 ? Math.max(from, now - idleSeconds * 1000) : now;
    for (const s of splitInterval(this.active.accountId, from, end)) {
      const existing = this.data.segments.find(x => x.accountId === s.accountId && x.day === s.day);
      if (existing) existing.ms += s.ms; else this.data.segments.push(s);
    }
    this.active.checkpoint = now;
    if (idleSeconds >= 300 || now - from > 60000 || now < from) { this.active = null; this.data.lastPause = 'Timer paused after inactivity or sleep. Start it when you return.'; }
    this.save();
  }
  stop(reason = 'Timer stopped', now = Date.now(), idleSeconds = 0) { this.checkpoint(now, idleSeconds); this.active = null; this.data.lastPause = reason; this.save(); }
}

export class Vault {
  constructor(directory, crypto) {
    this.file = path.join(directory, 'credentials.json'); this.crypto = crypto;
    try { this.values = JSON.parse(fs.readFileSync(this.file, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw new Error('Encrypted credentials could not be read; original file preserved.'); this.values = {}; }
  }
  available() { return this.crypto.isEncryptionAvailable() && this.crypto.getSelectedStorageBackend?.() !== 'basic_text'; }
  set(id, secret) {
    if (!this.available()) throw new Error('Secure OS credential storage is unavailable. Unlock your keychain and try again.');
    if (typeof secret !== 'string' || !secret.trim() || secret.length > 20000 || /[\r\n]/.test(secret)) throw new Error('Enter a valid credential in this app.');
    this.values[id] = this.crypto.encryptString(secret.trim()).toString('base64'); atomicJSON(this.file, this.values);
  }
  get(id) { if (!this.values[id]) throw new Error('Connect this account with a credential first.'); if (!this.available()) throw new Error('Unlock your OS credential store.'); return this.crypto.decryptString(Buffer.from(this.values[id], 'base64')); }
  remove(id) { delete this.values[id]; atomicJSON(this.file, this.values); }
  has(id) { return Boolean(this.values[id]); }
}
