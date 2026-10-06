import { CodexClient,findCodex } from '../src/providers/codex.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'usage-codex-smoke-'));
const client=new CodexClient(findCodex(),directory);
try { await client.ready; const account=await client.call('account/read',{refreshToken:false});if(account.account!==null)throw new Error('Expected an isolated, signed-out profile.'); console.log('Official Codex app-server handshake passed; isolated profile is signed out. No existing credentials accessed.'); }
finally {client.close();await new Promise(r=>setTimeout(r,500));fs.rmSync(directory,{recursive:true,force:true});}
