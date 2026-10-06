import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const execute=promisify(execFile);
export function claudeDirectory() { return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(),'.claude'); }
export function findClaude() {
  const name=process.platform==='win32'?'claude.exe':'claude';
  for(const dir of [path.join(os.homedir(),'.local','bin'),...(process.env.PATH||'').split(path.delimiter),'/opt/homebrew/bin','/usr/local/bin']) {
    if(!dir)continue;const candidate=path.join(dir,name);if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return candidate;
  }
  throw new Error('Claude Code was not found. Install it and sign in there, or select an existing local history folder.');
}
export function claudeIdentity(raw) {
  if(typeof raw?.loggedIn!=='boolean')throw new Error('Claude Code returned an unsupported sign-in status. Update Claude Code and try again.');
  return {loggedIn:raw.loggedIn,subscription:typeof raw.subscriptionType==='string'?raw.subscriptionType.slice(0,80):null,email:typeof raw.email==='string'?raw.email.slice(0,254):null,method:typeof raw.authMethod==='string'?raw.authMethod.slice(0,80):null};
}
export async function claudeStatus({run=execute,executable}={}) {
  const env={...process.env};
  // Read status through the official CLI. Never read or import its credential files.
  try {
    const {stdout}=await run(executable||findClaude(),['auth','status','--json'],{env,cwd:os.homedir(),windowsHide:true,shell:false,timeout:15000,maxBuffer:65536});
    return claudeIdentity(JSON.parse(stdout));
  } catch(e) {
    if(e.stdout) { try {const status=claudeIdentity(JSON.parse(e.stdout));if(!status.loggedIn)return status;}catch{} }
    if(!executable) { try {findClaude();} catch(missing) {throw missing;} }
    throw new Error('Unable to read Claude Code sign-in status. Open Claude Code, sign in, and try again.');
  }
}
