import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store,Vault } from '../src/core/store.js';
import { Tracker } from '../src/core/service.js';
import { TelemetryError } from '../src/core/http.js';
function setup(adapters){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'usage-service-'));const store=new Store(directory);const vault=new Vault(directory,{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()});const tracker=new Tracker(store,vault,directory,adapters);return {tracker,store,vault,directory,clean:()=>{tracker.close();fs.rmSync(directory,{recursive:true,force:true});}};}
test('refresh coalesces overlapping requests and preserves prior data after failure',async()=>{
 let count=0,fail=false;const f=setup({githubUsage:async()=>{count++;await new Promise(r=>setTimeout(r,10));if(fail)throw new TelemetryError('Rate limited',120);return {usage:{value:42},quotas:[],identity:'test'};}});
 try{const id=f.tracker.add({provider:'copilot',label:'Work'});f.vault.set(id,'test-key');await Promise.all([f.tracker.refresh(id),f.tracker.refresh(id)]);assert.equal(count,1);assert.equal(f.store.account(id).usage.value,42);
 fail=true;f.store.account(id).lastAttempt=0;await f.tracker.refresh(id);assert.equal(f.store.account(id).usage.value,42);assert.equal(f.store.account(id).status,'error');assert.ok(f.store.account(id).retryAt>Date.now());f.store.account(id).lastAttempt=0;await f.tracker.refresh(id);assert.equal(count,2);
 assert.ok(!JSON.stringify(f.tracker.state()).includes('test-key'));
 }finally{f.clean();}
});
test('log sources cannot overlap across accounts; removing account cleans history',async()=>{
 const f=setup({readLogs:async()=>({days:{},source:'Fixture'})});try{const a=f.tracker.add({provider:'claude',label:'A'}),b=f.tracker.add({provider:'claude',label:'B'});const root=path.join(f.directory,'logs');fs.mkdirSync(path.join(root,'child'),{recursive:true});await f.tracker.setLogPath(a,root);await assert.rejects(f.tracker.setLogPath(b,path.join(root,'child')),/overlaps/);f.store.data.segments.push({accountId:a,day:'2026-10-06',ms:1000});await f.tracker.remove(a);assert.equal(f.store.data.accounts.length,1);assert.equal(f.store.data.segments.length,0);assert.ok(fs.existsSync(root));}finally{f.clean();}
});

test('Claude account link records detected identity and plan, and unlinks without credentials',async()=>{
 const f=setup({readLogs:async()=>({days:{},source:'Fixture'})});
 try {
  const id=f.tracker.add({provider:'claude',label:'Personal',subscription:'free'});
  await assert.rejects(f.tracker.linkClaude(id,{loggedIn:false},f.directory),/Sign in/);
  await f.tracker.linkClaude(id,{loggedIn:true,email:'fixture@example.test',subscription:'max'},f.directory);
  assert.equal(f.store.account(id).identity,'fixture@example.test');assert.equal(f.store.account(id).subscription,'max');assert.equal(f.store.account(id).status,'ready');assert.equal(f.vault.has(id),false);
  await f.tracker.clearLogs(id);assert.equal(f.store.account(id).identity,null);assert.equal(f.store.account(id).status,'setup');assert.equal(f.store.account(id).tokens,null);
 }finally{f.clean();}
});

test('Claude browser completion records verified account, clears mismatched history and cancels safely',async()=>{
 let finish,identity={loggedIn:true,email:'new@example.test',subscription:'pro'};
 const f=setup({claudeStatus:async()=>identity,createClaudeLogin:()=>{let reject;return {done:new Promise((resolve,r)=>{finish=resolve;reject=r;}),cancel:()=>reject(new Error('canceled'))};}});
 try{
  const id=f.tracker.add({provider:'claude',label:'Claude'});const a=f.store.account(id);a.identity='old@example.test';a.logPath='old-history';a.tokens={days:{}};
  const pending=f.tracker.beginClaudeLogin(id);assert.equal(f.tracker.state().accounts[0].loginPending,true);await assert.rejects(f.tracker.beginClaudeLogin(id),/already/);finish();await pending;
  assert.equal(a.identity,identity.email);assert.equal(a.subscription,'pro');assert.equal(a.logPath,null);assert.equal(a.tokens,null);assert.equal(f.tracker.state().accounts[0].connected,true);
  const next=f.tracker.beginClaudeLogin(id);f.tracker.cancelClaudeLogin();await assert.rejects(next,/canceled/);assert.equal(f.tracker.state().accounts[0].loginPending,false);assert.equal(a.identity,identity.email);
 }finally{f.clean();}
});
test('Claude account switching blocks history refresh until the original account returns',async()=>{
 let reads=0;const f=setup({claudeStatus:async()=>({loggedIn:true,email:'different@example.test'}),readLogs:async()=>{reads++;return {days:{}};}});
 try {const id=f.tracker.add({provider:'claude',label:'Claude'});const a=f.store.account(id);Object.assign(a,{claudeSignedIn:true,identity:'owner@example.test',logPath:'history'});await f.tracker.refresh(id);a.lastAttempt=0;await f.tracker.refresh(id);assert.equal(reads,0);assert.equal(f.tracker.state().accounts[0].connected,false);assert.match(a.error,/another account/);}finally{f.clean();}
});
