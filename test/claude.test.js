import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeIdentity,claudeStatus } from '../src/providers/claude.js';
test('Claude account detection returns metadata only and uses the official read-only command',async()=>{
 const raw={loggedIn:true,email:'person@example.test',subscriptionType:'max',authMethod:'claude.ai',accessToken:'secret'};
 assert.deepEqual(claudeIdentity(raw),{loggedIn:true,email:raw.email,subscription:'max',method:'claude.ai'});
 const result=await claudeStatus({executable:'fixture',run:async(file,args,options)=>{assert.equal(file,'fixture');assert.deepEqual(args,['auth','status','--json']);assert.equal(options.shell,false);return {stdout:JSON.stringify(raw)};}});
 assert.equal(result.subscription,'max');assert.ok(!JSON.stringify(result).includes('secret'));
});
test('Claude handles logged-out exit status and redacts subprocess failures',async()=>{
 assert.equal((await claudeStatus({executable:'fixture',run:async()=>{throw {stdout:'{"loggedIn":false}'};}})).loggedIn,false);
 await assert.rejects(claudeStatus({executable:'fixture',run:async()=>{throw new Error('secret credential');}}),e=>!e.message.includes('secret')&&e.message.includes('sign-in status'));
 assert.throws(()=>claudeIdentity({}),/unsupported/);
});
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { ClaudeLogin,claudeAuthURL } from '../src/providers/claude.js';
function child(){const p=new EventEmitter();p.stdout=new PassThrough();p.stderr=new PassThrough();p.stdin=new PassThrough();p.kill=()=>{p.killed=true;};return p;}
test('Claude browser login delegates OAuth to official CLI and retains only an allowed URL',async()=>{
 const p=child();const login=new ClaudeLogin({executable:'fixture',spawnProcess:(file,args,options)=>{assert.equal(file,'fixture');assert.deepEqual(args,['auth','login','--claudeai']);assert.equal(options.shell,false);assert.equal(options.windowsHide,true);return p;}});
 p.stdout.write('Open https://claude.ai/oauth/authorize?client_');p.stdout.write('id=test&state=temporary\n');
 assert.equal(new URL(login.url).hostname,'claude.ai');p.emit('close',0);await login.done;assert.equal(login.url,null);
 for(const bad of ['https://claude.ai.evil.test/oauth/authorize?client_id=a','http://claude.ai/oauth/authorize?client_id=a','https://x@claude.ai/oauth/authorize?client_id=a','https://claude.ai:8443/oauth/authorize?client_id=a','https://claude.ai/chat?client_id=a'])assert.equal(claudeAuthURL(bad),null);
});
test('Claude login cancellation, timeout and process errors settle once and redact output',async()=>{
 for(const mode of ['cancel','timeout','error','exit']){
  const p=child();const login=new ClaudeLogin({executable:'fixture',spawnProcess:()=>p,timeoutMs:mode==='timeout'?5:1000});
  p.stderr.write('sensitive output');
  if(mode==='cancel')login.cancel();if(mode==='error')p.emit('error',new Error('sensitive error'));if(mode==='exit')p.emit('close',1);
  await assert.rejects(login.done,e=>!e.message.includes('sensitive'));assert.equal(p.killed,true);assert.equal(login.url,null);p.emit('close',0);
 }
});
