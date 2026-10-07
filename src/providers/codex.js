import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';

export function findCodex(selected) {
  if (selected) { if (!fs.existsSync(selected)) throw new Error('Selected Codex executable no longer exists. Choose it again in Settings.'); return selected; }
  const names = process.platform === 'win32' ? ['codex.exe'] : ['codex'];
  const directories = [...(process.env.PATH || '').split(path.delimiter), '/opt/homebrew/bin', '/usr/local/bin', path.join(os.homedir(), '.local', 'bin')];
  for (const dir of directories) for (const name of names) { const f = path.join(dir, name); if (fs.existsSync(f)) return f; }
  // The npm package's Windows shim is .cmd. Resolve its native binary without a shell.
  const npmRoots = [path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai'), '/opt/homebrew/lib/node_modules/@openai', '/usr/local/lib/node_modules/@openai'];
  const triple = process.platform === 'win32' ? `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-pc-windows-msvc` : `${process.arch === 'arm64' ? 'aarch64' : 'x86_64'}-apple-darwin`;
  for (const root of npmRoots) for (const pkg of ['codex', `codex-${process.platform}-${process.arch}`]) {
    const f = path.join(root, pkg, 'vendor', triple, 'codex', names[0]); if (fs.existsSync(f)) return f;
  }
  throw new Error('Install the official Codex CLI, then choose its native executable in Settings.');
}

export class CodexClient extends EventEmitter {
  constructor(executable, home, { spawnProcess = spawn, timeoutMs = 30000 } = {}) {
    super(); this.pending = new Map(); this.sequence = 0; this.timeoutMs = timeoutMs;
    fs.mkdirSync(home, { recursive: true, mode: 0o700 });
    const env = { ...process.env, CODEX_HOME: home };
    for (const key of ['OPENAI_API_KEY','CODEX_API_KEY','OPENAI_BASE_URL','OPENAI_ORG_ID','OPENAI_PROJECT_ID']) delete env[key];
    this.process = spawnProcess(executable, ['app-server', '-c', 'cli_auth_credentials_store="keyring"'], {
      cwd: home, env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe']
    });
    this.closed = false; let buffer = '';
    this.process.stdout.setEncoding('utf8');
    this.process.stdout.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 2_000_000) { this.close(); return; }
      let pos;
      while ((pos = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0,pos); buffer = buffer.slice(pos+1);
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id != null && this.pending.has(msg.id)) {
          const pending = this.pending.get(msg.id); clearTimeout(pending.timer); this.pending.delete(msg.id);
          // Raw server errors can contain credentials; never forward or log them.
          if (msg.error) pending.reject(new Error('Codex could not complete the request. Check sign-in, CLI version, and OS keychain access.'));
          else pending.resolve(msg.result);
        } else if (msg.method && msg.id == null) this.emit('notification', msg);
        else if (msg.method && msg.id != null) this.write({ id: msg.id, error: { code: -32601, message: 'This read-only usage client does not support server requests.' } });
      }
    });
    this.process.stderr.on('data', () => {}); // Drain without persisting diagnostic secrets.
    this.process.stdin.on('error', () => this.fail());
    this.process.on('error', () => this.fail()); this.process.on('exit', () => this.fail());
    this.ready = this.request('initialize', { clientInfo: { name: 'ai_usage_tracker', title: 'AI Usage Tracker', version: '0.1.0' } }).then(() => this.write({ method: 'initialized', params: {} }));
    this.ready.catch(() => {});
  }
  write(message) { if (!this.closed) this.process.stdin.write(JSON.stringify(message) + '\n'); }
  request(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('Codex connection closed. Refresh to reconnect.'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Codex request timed out. Check the CLI and try again.')); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer }); this.write({ id, method, params });
    });
  }
  async call(method, params = {}) { await this.ready; return this.request(method, params); }
  fail() {
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex connection closed. Check the selected CLI executable.')); }
    this.pending.clear();
  }
  close() { this.fail(); this.process.kill(); }
}
