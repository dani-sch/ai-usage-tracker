import { test,expect,_electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dayUTC,lastDays,dayLocal } from '../../src/core/model.js';
let directory,desktop,page;
async function launch(){ const env={...process.env,AI_TRACKER_DATA_DIR:directory,AI_TRACKER_HIDDEN_TEST:'1'};delete env.ELECTRON_RUN_AS_NODE;desktop=await electron.launch({args:['.'],env});page=await desktop.firstWindow();await expect(page.getByRole('heading',{name:'Your AI, in view.'})).toBeVisible();await desktop.evaluate(({powerMonitor})=>{powerMonitor.getSystemIdleTime=()=>0;}); }
test.afterEach(async()=>{await desktop?.close();fs.rmSync(directory,{recursive:true,force:true});});
test('Copilot estimated remaining credits, allowance editing and restart persistence',async()=>{
 directory=fs.mkdtempSync(path.join(os.tmpdir(),'usage-copilot-balance-'));
 const now=Date.now();
 fs.writeFileSync(path.join(directory,'state.json'),JSON.stringify({version:1,settings:{pollSeconds:300,closeToTray:false},accounts:[{id:'00000000-0000-4000-a000-000000000003',provider:'copilot',label:'Fixture Copilot',subscription:'Max',billingMode:'ai_credit',quotas:[],usage:{value:8266.609,unit:'ai-credits',period:dayUTC(now).slice(0,7)},status:'ready',lastSuccess:now,nextPoll:now+999999}],segments:[]}));
 await launch();
 const card=page.locator('.account');
 await expect(card).toContainText('59% left');await expect(card.locator('.billing')).toContainText('11,733.391');await expect(card).toContainText('AI credits remaining');
 const meter=card.getByRole('meter');await expect(meter).toHaveAttribute('aria-label','Monthly AI credits · estimated remaining');
 expect(Number(await meter.getAttribute('aria-valuenow'))).toBeCloseTo(58.666955);
 await page.screenshot({path:'test-results/copilot-remaining-credits.png',fullPage:true});
 await card.getByRole('button',{name:'Manage Fixture Copilot'}).click();
 await page.getByRole('spinbutton',{name:'Monthly AI credit allowance (optional)',exact:true}).fill('10000');await page.getByRole('button',{name:'Save details',exact:true}).click();await expect(page.locator('#toast')).toHaveText('Account details saved.');await page.getByRole('button',{name:'Close dialog'}).click();
 await expect(card).toContainText('17% left');await expect(card.locator('.billing')).toContainText('1,733.391');
 await desktop.close();await launch();await expect(page.locator('.account')).toContainText('17% left');
 await page.getByRole('button',{name:'Manage Fixture Copilot'}).click();await page.getByRole('spinbutton',{name:'Monthly AI credit allowance (optional)',exact:true}).fill('8000');await page.getByRole('button',{name:'Save details',exact:true}).click();await page.getByRole('button',{name:'Close dialog'}).click();await expect(page.locator('.account')).toContainText('0% left');await expect(page.locator('.account')).toContainText('266.609 credits beyond');
 await page.getByRole('button',{name:'Manage Fixture Copilot'}).click();await page.getByRole('spinbutton',{name:'Monthly AI credit allowance (optional)',exact:true}).fill('');await page.getByRole('button',{name:'Save details',exact:true}).click();await page.getByRole('button',{name:'Close dialog'}).click();await expect(page.locator('.account')).toContainText('59% left');
 await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,680));expect(await page.locator('.account').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
test('desktop account lifecycle, filters, focus time, settings and restart persistence',async()=>{
 directory=fs.mkdtempSync(path.join(os.tmpdir(),'usage-desktop-'));await launch();
 await page.getByRole('button',{name:'Connect an account',exact:false}).click();
 await page.getByRole('combobox',{name:'Provider',exact:true}).selectOption('other');await page.getByRole('textbox',{name:'Account name',exact:true}).fill('Personal');await page.getByRole('textbox',{name:'Subscription / plan (optional)',exact:true}).fill('Plus');await page.locator('#add-form').getByRole('button',{name:'Add account',exact:true}).click();await expect(page.locator('#dialog-title')).toHaveText('Personal');await page.getByRole('button',{name:'Close dialog'}).click();
 await expect(page.locator('.account')).toHaveCount(1);await expect(page.getByText('Remaining usage unavailable')).toBeVisible();
 await page.getByRole('button',{name:'Start focus'}).click();await expect(page.locator('#focus-clock')).toBeVisible();await page.waitForTimeout(1200);await page.getByRole('button',{name:'Stop timer',exact:true}).click();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Automatic refresh').selectOption('60');await page.getByLabel('Keep running in the tray', {exact:false}).uncheck();await page.getByRole('button',{name:'Save settings'}).click();
 await desktop.close();await launch();await expect(page.locator('.account')).toHaveCount(1);await expect(page.locator('#focus-clock')).toHaveCount(0);const saved=JSON.parse(fs.readFileSync(path.join(directory,'state.json'),'utf8'));expect(saved.segments[0].ms).toBeGreaterThan(1000);expect(saved.settings.pollSeconds).toBe(60);
 await page.getByRole('combobox',{name:'Plan',exact:true}).selectOption('Plus');await expect(page.locator('.account')).toHaveCount(1);
 await page.getByRole('button',{name:'Manage Personal'}).click();await page.getByRole('button',{name:'Remove account',exact:true}).click();await page.getByRole('button',{name:'Remove account & history'}).click();await expect(page.locator('.account')).toHaveCount(0);
});
test('local log connection through native picker boundary and encrypted API credential flow',async()=>{
 directory=fs.mkdtempSync(path.join(os.tmpdir(),'usage-connect-'));const logs=path.join(directory,'selected-logs');fs.mkdirSync(logs);
 const event={type:'assistant',timestamp:new Date().toISOString(),message:{id:'fixture-msg',usage:{input_tokens:80,output_tokens:20,cache_read_input_tokens:50}}};fs.writeFileSync(path.join(logs,'session.jsonl'),JSON.stringify(event)+'\n'+JSON.stringify(event)+'\n');await launch();
 await desktop.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},logs);
 await page.getByRole('button',{name:'Connect an account',exact:false}).click();await page.getByRole('combobox',{name:'Provider',exact:true}).selectOption('claude');await page.getByRole('textbox',{name:'Account name',exact:true}).fill('Local Claude');await page.locator('#add-form').getByRole('button',{name:'Add account',exact:true}).click();await expect(page.locator('#dialog-title')).toHaveText('Local Claude');await page.getByRole('button',{name:'Select local logs'}).click();await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Choose folder'}).click();await expect(page.locator('#dialog-title')).toHaveText('Local Claude');await page.getByRole('button',{name:'Close dialog'}).click();await expect(page.locator('.account')).toContainText('150 tokens today');
 await desktop.evaluate(()=>{globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/user')?{login:'fixture-user'}:{usageItems:[{product:'Copilot AI Credits',unitType:'ai-credits',grossQuantity:12.5}]}),{status:200});});
 await page.locator('.intro').getByRole('button',{name:'Add account',exact:true}).click();await page.getByRole('combobox',{name:'Provider',exact:true}).selectOption('copilot');await page.getByRole('textbox',{name:'Account name',exact:true}).fill('Fixture GitHub');await page.locator('#add-form').getByRole('button',{name:'Add account',exact:true}).click();await expect(page.locator('#dialog-title')).toHaveText('Fixture GitHub');await page.getByRole('button',{name:'Connect securely',exact:true}).click();await page.locator('input[type=password]').fill('fixture-secret-not-a-real-token');await page.getByRole('button',{name:'Save & connect'}).click();await expect(page.locator('#dialog-title')).toHaveText('Fixture GitHub');await page.getByRole('button',{name:'Close dialog'}).click();await expect(page.locator('.account').filter({hasText:'Fixture GitHub'})).toContainText('12.5');
 const vault=fs.readFileSync(path.join(directory,'credentials.json'),'utf8');expect(vault).not.toContain('fixture-secret');const result=await page.evaluate(()=>window.tracker.state());expect(JSON.stringify(result)).not.toContain('fixture-secret');
});
test('30-day graph, exact hover values, provider filtering and renderer isolation',async()=>{
 directory=fs.mkdtempSync(path.join(os.tmpdir(),'usage-graph-'));const now=Date.now(),days=Object.fromEntries(lastDays(now).map((d,i)=>[d,(i+1)*1000]));
 fs.writeFileSync(path.join(directory,'state.json'),JSON.stringify({version:1,settings:{pollSeconds:300,closeToTray:false},accounts:[{id:'00000000-0000-4000-a000-000000000001',provider:'codex',label:'Fixture Codex',subscription:'Pro',signedIn:false,quotas:[{name:'codex · 5 hour',remainingPercent:72,resetsAt:now+7200000},{name:'codex · 7 day',remainingPercent:41,resetsAt:now+86400000}],tokens:{days,source:'Synthetic test fixture',scope:'E2E only',fetchedAt:now},status:'ready',lastSuccess:now,nextPoll:now+999999},{id:'00000000-0000-4000-a000-000000000002',provider:'claude',label:'Fixture Claude',subscription:'Max',quotas:[],tokens:null,status:'setup',nextPoll:now+999999}],segments:[{accountId:'00000000-0000-4000-a000-000000000001',day:dayLocal(now),ms:8100000}]}));
 await launch();await expect(page.locator('.bar-hit')).toHaveCount(30);await page.locator('#day-29').hover();await expect(page.locator('#chart-tooltip')).toContainText('30,000 tokens');await page.locator('#day-29').focus();await page.keyboard.press('ArrowLeft');await expect(page.locator('#day-28')).toBeFocused();await expect(page.locator('#chart-tooltip')).toContainText('29,000 tokens');
 expect(await page.evaluate(()=>({require:typeof window.require,process:typeof window.process}))).toEqual({require:'undefined',process:'undefined'});
 const blocked=await page.evaluate(()=>window.tracker.external('file:///C:/Windows'));expect(blocked.ok).toBe(false);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'test-results/dashboard.png',fullPage:true});
 await page.locator('#sidebar').getByRole('button',{name:'Claude 1',exact:true}).click();await expect(page.locator('.account')).toHaveCount(1);await page.locator('#day-29').hover();await expect(page.locator('#chart-tooltip')).toContainText('unavailable');
 await page.getByRole('button',{name:'Daily values'}).click();await expect(page.locator('.token-table tbody tr')).toHaveCount(30);await expect(page.locator('.token-table tbody tr').first()).toContainText(dayUTC(now));
});
