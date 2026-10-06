import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lastDays,tokenSeries,timeTotals,splitInterval,validateAccount } from '../src/core/model.js';
import { Store,Vault } from '../src/core/store.js';
import { allowedExternal } from '../src/core/security.js';
const now=Date.UTC(2026,9,6,14);
test('30 UTC days cross a month boundary; unavailable is distinct from zero',()=>{
 const days=lastDays(now);assert.equal(days.length,30);assert.equal(days[0],'2026-09-07');
 const series=tokenSeries([{tokens:{days:{'2026-10-06':0}}},{tokens:null}],now);assert.equal(series[0].total,null);assert.deepEqual(series.at(-1),{day:'2026-10-06',total:0,reporting:1,accounts:2});
});
test('working intervals split at local midnight and filters apply',()=>{
 const from=new Date(2026,9,5,23,59).getTime(),to=new Date(2026,9,6,0,2).getTime();const pieces=splitInterval('a',from,to);
 assert.deepEqual(pieces.map(p=>p.ms),[60000,120000]);
 const totals=timeTotals([...pieces,{accountId:'b',day:'2026-10-06',ms:500}],['a'],to);assert.equal(totals.todayMs,120000);assert.equal(totals.monthMs,180000);
});
test('calendar splitting respects DST fall-back and spring-forward',()=>{
 const old=process.env.TZ;process.env.TZ='America/New_York';
 try { for(const [month,day,hours] of [[2,8,23],[10,1,25]]) { const from=new Date(2026,month,day).getTime(),to=new Date(2026,month,day+1).getTime();assert.equal(splitInterval('a',from,to)[0].ms,hours*3600000); } } finally { if(old)process.env.TZ=old;else delete process.env.TZ; }
});
test('focus checkpoints persist but never resume across a restart; sleep gaps discarded',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'usage-store-'));
 try {const s=new Store(dir);s.data.accounts.push({id:'a'});s.start('a',now);s.checkpoint(now+15000);s.checkpoint(now+120000);assert.equal(s.active,null);assert.equal(s.data.segments[0].ms,15000);const restored=new Store(dir);assert.equal(restored.active,null);assert.equal(restored.data.segments[0].ms,15000);
 s.start('a',now+120000);s.checkpoint(now+135000,301);assert.equal(s.active,null);assert.equal(s.data.segments[0].ms,15000);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('corrupt history is preserved instead of overwritten',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'usage-corrupt-'));try{fs.writeFileSync(path.join(dir,'state.json'),'broken');assert.throws(()=>new Store(dir),/preserved/);assert.equal(fs.readFileSync(path.join(dir,'state.json'),'utf8'),'broken');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('vault refuses insecure fallback, encrypts data, and deletes credentials',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'usage-vault-'));try{
 const unavailable=new Vault(dir,{isEncryptionAvailable:()=>false});assert.throws(()=>unavailable.set('a','secret'),/unavailable/);
 const fallback=new Vault(dir,{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'basic_text'});assert.throws(()=>fallback.set('a','secret'),/unavailable/);
 const vault=new Vault(dir,{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from([...s].reverse().join('')),decryptString:b=>[...b.toString()].reverse().join('')});vault.set('a','secret-123');assert.equal(vault.get('a'),'secret-123');assert.ok(!fs.readFileSync(vault.file,'utf8').includes('secret-123'));vault.remove('a');assert.equal(vault.has('a'),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('external links and account validation reject injected destinations',()=>{
 for(const url of ['file:///etc/passwd','javascript:alert(1)','https://github.com.evil.test/','https://github.com@evil.test','https://github.com:9000/'])assert.equal(allowedExternal(url),false);
 assert.equal(allowedExternal('https://auth.openai.com/oauth/authorize?state=example'),true);assert.throws(()=>validateAccount({provider:'__proto__',label:'a'}));assert.throws(()=>validateAccount({provider:'codex',label:' '}));assert.equal(validateAccount({provider:'codex',label:' Name ',secret:'ignored'}).label,'Name');
});
