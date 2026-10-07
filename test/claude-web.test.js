import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanReport,usageWindows } from '../src/browser-extension/parse.js';
import { CLAUDE_EXTENSION_ID } from '../src/providers/claude-web-config.js';
import { ClaudeWebBridge } from '../src/providers/claude-web.js';
import { Tracker } from '../src/core/service.js';
import { Store,Vault } from '../src/core/store.js';
const org='12345678-1234-1234-1234-123456789abc';
const reading=()=>({orgId:org,kind:'message_limit',usage:{windows:{'5h':{utilization:0.25,resets_at:Math.floor(Date.now()/1000)+3600}}}});
test('Claude website normalizes free stream fractions separately from paid percentages',()=>{
 const now=Date.now(),reset=new Date(now+3600000).toISOString();
 assert.equal(cleanReport(reading()).quotas[0].remainingPercent,75);
 assert.equal(usageWindows('usage',{five_hour:{utilization:1,resets_at:reset}})[0].remainingPercent,99);
 assert.equal(usageWindows('message_limit',{windows:{'5h':{utilization:1,resets_at:reset}}})[0].remainingPercent,0);
 assert.equal(usageWindows('message_limit',{resolved:{limit:{percent:14,resets_at:reset}}})[0].remainingPercent,86);
 for(const usage of [{five_hour:null},{five_hour:{utilization:'40',resets_at:reset}},{five_hour:{utilization:NaN,resets_at:reset}},{five_hour:{utilization:20,resets_at:new Date(now-1).toISOString()}},{five_hour:{utilization:20}}])assert.deepEqual(usageWindows('usage',usage,now),[]);
 const clean=cleanReport({...reading(),chat:'secret',cookies:'secret'});assert.ok(!JSON.stringify(clean).includes('secret'));
});
test('loopback pairing rejects untrusted origins, wrong accounts, expired codes and revoked credentials',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'claude-web-unit-'));const vault=new Vault(dir,{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()});const tracker=new Tracker(new Store(dir),vault,dir);const bridge=new ClaudeWebBridge(tracker);
 try {
  await bridge.start(0);const id=tracker.add({provider:'claude',label:'Free',subscription:'free'});const {code}=await bridge.prepare(id);const token=code.split('.')[1];
  const headers={Origin:`chrome-extension://${CLAUDE_EXTENSION_ID}`,Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const request=(route,body,overrides={})=>fetch(`http://127.0.0.1:${bridge.port}${route}`,{method:'POST',headers:{...headers,...overrides},body:body&&JSON.stringify(body)});
  assert.equal((await request('/pair',null,{Origin:'https://evil.test'})).status,403);
  assert.equal((await request('/pair',null,{Authorization:'Bearer wrong'})).status,401);
  assert.equal((await request('/usage',reading())).status,401);
  tracker.store.account(id).claudeWeb.pairExpires=0;assert.equal((await request('/pair')).status,401);tracker.store.account(id).claudeWeb.pairExpires=Date.now()+10000;
  assert.equal((await request('/pair')).status,200);assert.equal((await request('/usage',reading())).status,200);
  assert.equal(tracker.store.account(id).quotas[0].remainingPercent,75);const timestamp=tracker.store.account(id).lastSuccess;await tracker.refresh(id);assert.equal(tracker.store.account(id).lastSuccess,timestamp);
  assert.equal((await request('/usage',{...reading(),orgId:'abcdefab-1234-1234-1234-123456789abc'})).status,409);
  assert.ok(!JSON.stringify(tracker.state()).includes(token));await tracker.disconnect(id);assert.equal((await request('/usage',reading())).status,401);
 } finally {bridge.close();tracker.close();fs.rmSync(dir,{recursive:true,force:true});}
});
