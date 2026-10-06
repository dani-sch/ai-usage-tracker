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
