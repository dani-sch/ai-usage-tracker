import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codexQuotas,apiTokens,githubUsage } from '../src/providers/api.js';
import { TokenAccumulator,readLogs } from '../src/providers/logs.js';
import { jsonRequest } from '../src/core/http.js';
const now=Date.UTC(2026,9,6,14), json=data=>new Response(JSON.stringify(data),{status:200});
test('Codex prefers multi-bucket windows and never translates percentages into tokens',()=>{
 const q=codexQuotas({rateLimits:{primary:{usedPercent:99}},rateLimitsByLimitId:{codex:{primary:{usedPercent:28,windowDurationMins:300,resetsAt:1000},secondary:null},other:{primary:{usedPercent:140,windowDurationMins:60,resetsAt:null}}}});
 assert.equal(q.length,2);assert.equal(q[0].remainingPercent,72);assert.equal(q[0].resetsAt,1000000);assert.equal(q[1].remainingPercent,0);assert.equal(q[1].resetsAt,null);assert.equal(q[0].tokens,undefined);
});
test('OpenAI paginated token usage does not count cached inputs twice',async()=>{
 const urls=[];const result=await apiTokens('openai-api','test-key',{now,fetcher:async url=>{urls.push(new URL(url));return json({data:[{start_time:Date.UTC(2026,9,6)/1000,results:[{input_tokens:100,output_tokens:20,input_cached_tokens:70}]}],has_more:urls.length===1,next_page:'next'});}});
 assert.equal(urls.length,2);assert.equal(urls[1].searchParams.get('page'),'next');assert.equal(result.days['2026-10-06'],240);assert.equal(result.days['2026-10-05'],0);
});
test('Anthropic disjoint input, cache read/write and output categories are all counted',async()=>{
 const r=await apiTokens('anthropic-api','test-key',{now,fetcher:async()=>json({data:[{starting_at:'2026-10-06T00:00:00Z',results:[{uncached_input_tokens:100,output_tokens:20,cache_read_input_tokens:50,cache_creation:{ephemeral_1h_input_tokens:30,ephemeral_5m_input_tokens:40}}]}],has_more:false})});assert.equal(r.days['2026-10-06'],240);
});
test('malformed and incomplete pagination never become zero usage',async()=>{
 await assert.rejects(apiTokens('openai-api','test-key',{now,fetcher:async()=>json({data:[],has_more:true})}),/pagination/);
 await assert.rejects(apiTokens('openai-api','test-key',{now,fetcher:async()=>json({data:[{start_time:now/1000,results:[{input_tokens:null,output_tokens:10}]}],has_more:false})}),/unsupported/);
});
test('GitHub checks identity and returns real billing units, no fabricated limit or reset',async()=>{
 const calls=[];const r=await githubUsage({billingMode:'ai_credit'},'test-key',{now,fetcher:async(url,opts)=>{calls.push(url);assert.equal(opts.headers.Authorization,'Bearer test-key');return json(url.endsWith('/user')?{login:'test-user'}:{usageItems:[{product:'Copilot AI Credits',unitType:'ai-credits',grossQuantity:12.5},{product:'Spark',unitType:'ai-credits',grossQuantity:100}]});}});
 assert.equal(r.identity,'test-user');assert.equal(r.usage.value,12.5);assert.equal(r.usage.period,'2026-10');assert.deepEqual(r.quotas,[]);assert.ok(calls[1].includes('/users/test-user/settings/billing/ai_credit/usage'));assert.equal(r.tokens,undefined);
});
test('GitHub daily history crosses months, preserves zero, caches dates and isolates credentials',async()=>{
 const calls=[],fetcher=async url=>{
   const u=new URL(url);calls.push(u);
   return json(u.pathname==='/user'?{login:'daily-user'}:{usageItems:[{product:'Copilot',unitType:'ai-credits',grossQuantity:u.searchParams.has('day')?Number(u.searchParams.get('day'))===5?0:Number(u.searchParams.get('day')):100}]});
 };
 const first=await githubUsage({},'test-key',{now,fetcher});
 assert.equal(calls.length,32);assert.equal(first.usageHistory.days['2026-10-05'],0);assert.equal(first.usageHistory.days['2026-09-07'],7);assert.equal(first.usageHistory.days['2026-10-06'],6);
 assert.ok(calls.some(u=>u.searchParams.get('month')==='9'&&u.searchParams.get('day')==='7'));
 calls.length=0;const again=await githubUsage(first,'test-key',{now:now+300000,fetcher});assert.equal(calls.length,3);assert.equal(again.usageHistory.days['2026-09-07'],7);
 calls.length=0;await githubUsage({...first,usageHistory:{...first.usageHistory,identity:'different-user'}},'test-key',{now,fetcher});assert.equal(calls.length,32);
});
test('daily report failures keep monthly usage and never replace missing days with zero',async()=>{
 const r=await githubUsage({},'test-key',{now,fetcher:async url=>new URL(url).searchParams.has('day')?new Response('',{status:429,headers:{'retry-after':'120'}}):json(url.endsWith('/user')?{login:'daily-user'}:{usageItems:[{product:'Copilot',unitType:'ai-credits',grossQuantity:40}]})});
 assert.equal(r.usage.value,40);assert.equal(Object.keys(r.usageHistory.days).length,0);assert.match(r.usageHistory.warning,/incomplete/);assert.equal(r.usageHistory.retryAt,now+120000);
 let dailyCalls=0;await githubUsage(r,'test-key',{now:now+1000,fetcher:async url=>{if(new URL(url).searchParams.has('day'))dailyCalls++;return json(url.endsWith('/user')?{login:'daily-user'}:{usageItems:[]});}});assert.equal(dailyCalls,0);
});
test('oversized local attachments do not suppress valid token history',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'usage-large-record-'));
 try {
  fs.writeFileSync(path.join(dir,'session.jsonl'),JSON.stringify({type:'response_item',payload:'x'.repeat(10000001)})+'\n'+JSON.stringify({type:'event_msg',timestamp:'2026-10-06T12:00:00Z',payload:{type:'token_count',info:{total_token_usage:{total_tokens:1234}}}})+'\n');
  const r=await readLogs(dir,'codex',now);assert.equal(r.days['2026-10-06'],1234);assert.match(r.warning,/1 oversized/);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('429 Retry-After is honored and server errors cannot echo credentials',async()=>{
 await assert.rejects(jsonRequest('https://example.invalid',{}, {fetcher:async()=>new Response('secret-key',{status:429,headers:{'retry-after':'120'}})}),e=>e.retryAfter===120&&!e.message.includes('secret-key'));
 await assert.rejects(jsonRequest('https://example.invalid',{}, {fetcher:async()=>new Response('secret-key',{status:403})}),e=>!e.message.includes('secret-key'));
});
test('Codex cumulative records deduplicate copied sessions and respect day boundaries',()=>{
 const t=new TokenAccumulator('codex',now);const event=(timestamp,total)=>({timestamp,type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{total_tokens:total}}}});
 t.add(event('2026-10-05T23:59:00Z',100),'first','same');t.add(event('2026-10-05T23:59:00Z',100),'copy','same');t.add(event('2026-10-06T01:00:00Z',170),'first','same');t.add(event('2026-10-06T02:00:00Z',170),'first','same');const r=t.result();assert.equal(r['2026-10-05'],100);assert.equal(r['2026-10-06'],70);
});
test('Claude streamed copies count each message once, preserving cached tokens',()=>{
 const t=new TokenAccumulator('claude',now);for(const output of [5,20,10])t.add({type:'assistant',timestamp:'2026-10-06T01:00:00Z',requestId:'req',message:{id:'msg',usage:{input_tokens:100,output_tokens:output,cache_read_input_tokens:30,cache_creation_input_tokens:10}}},'file');assert.equal(t.result()['2026-10-06'],160);
});
test('real JSONL reader finds nested logs, handles incomplete tail, rejects no telemetry',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'usage-logs-'));try {
 await assert.rejects(readLogs(dir,'claude',now),/No reported token/);
 fs.mkdirSync(path.join(dir,'nested'));fs.writeFileSync(path.join(dir,'nested','session.jsonl'),JSON.stringify({type:'assistant',timestamp:'2026-10-06T01:00:00Z',message:{id:'msg',usage:{input_tokens:8,output_tokens:2}}})+'\n{"unfinished":');
 const r=await readLogs(dir,'claude',now);assert.equal(r.days['2026-10-06'],10);assert.match(r.warning,/1 incomplete/);assert.equal(r.scope,'Selected folder only • UTC days • not account-wide');
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
