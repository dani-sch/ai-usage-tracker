import { test,expect,chromium } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLAUDE_EXTENSION_ID } from '../../src/providers/claude-web-config.js';
import { ClaudeWebBridge } from '../../src/providers/claude-web.js';
import { Store,Vault } from '../../src/core/store.js';
import { Tracker } from '../../src/core/service.js';
test('real browser companion pairs and delivers only usage from a free Claude response',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'usage-browser-'));const store=new Store(dir);const tracker=new Tracker(store,new Vault(dir,{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()}),dir);const bridge=new ClaudeWebBridge(tracker);let context;
 try{
  await bridge.start(0);const id=tracker.add({provider:'claude',label:'Free fixture',subscription:'free'});const {code}=await bridge.prepare(id);
  const extension=path.resolve('src/browser-extension');context=await chromium.launchPersistentContext(path.join(dir,'browser'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  const org='12345678-1234-1234-1234-123456789abc';
  await context.route('https://claude.ai/**',async route=>{
   if(route.request().url().endsWith('/completion'))return route.fulfill({contentType:'text/event-stream',body:`data: ${JSON.stringify({type:'content_block_delta',text:'private-chat-text'})}\n\ndata: ${JSON.stringify({type:'message_limit',message_limit:{windows:{'5h':{utilization:0.37,resets_at:Math.floor(Date.now()/1000)+7200}}}})}\n\n`});
   if(route.request().url().endsWith('/usage'))return route.fulfill({contentType:'application/json',body:'{"five_hour":null,"seven_day":null}'});
   return route.fulfill({contentType:'text/html',body:`<html><body><button id="chat">Normal fixture chat</button><script>document.querySelector('#chat').onclick=()=>fetch('/api/organizations/${org}/chat_conversations/12345678-1234-1234-1234-123456789abc/completion',{method:'POST'}).then(r=>r.text());</script></body></html>`});
  });
  const popup=await context.newPage();await popup.goto(`chrome-extension://${CLAUDE_EXTENSION_ID}/popup.html`);await popup.locator('#code').fill(code);await popup.getByRole('button',{name:'Connect & open Claude'}).click();await expect(popup.locator('#status')).toContainText('Connected.');
  await expect.poll(()=>context.pages().some(p=>p.url().startsWith('https://claude.ai/'))).toBe(true);const claude=context.pages().find(p=>p.url().startsWith('https://claude.ai/'));await claude.goto('https://claude.ai/fixture');await claude.locator('#chat').click();
  await expect.poll(()=>store.account(id).quotas?.[0]?.remainingPercent).toBe(63);expect(store.account(id).subscription).toBe('free');expect(JSON.stringify(store.data)).not.toContain('private-chat-text');expect(JSON.stringify(store.data)).not.toContain(code.split('.')[1]);
 }finally{await context?.close();bridge.close();tracker.close();fs.rmSync(dir,{recursive:true,force:true});}
});
