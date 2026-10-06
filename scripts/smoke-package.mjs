import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'usage-packaged-'));
const executablePath=process.argv[2] || path.resolve('release/win-unpacked/AI Usage Tracker.exe');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.AI_TRACKER_DATA_DIR;
let desktop;
try {
 desktop=await electron.launch({executablePath,args:[`--user-data-dir=${profile}`],env});
 const page=await desktop.firstWindow();await page.getByRole('heading',{name:'Your AI, in view.'}).waitFor();
 const runtime=await desktop.evaluate(({app,safeStorage})=>({packaged:app.isPackaged,directory:app.getPath('userData'),encryption:safeStorage.isEncryptionAvailable()}));
 assert.equal(runtime.packaged,true);assert.equal(path.resolve(runtime.directory),path.resolve(profile));assert.equal(runtime.encryption,true);
 const state=await page.evaluate(()=>window.tracker.state());assert.equal(state.ok,true);assert.equal(state.value.accounts.length,0);
 assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
 fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/packaged-empty.png'});
 console.log('Packaged executable verified: production entry point, isolated profile, empty dashboard, OS encryption, sandboxed renderer.');
} finally {await desktop?.close();fs.rmSync(profile,{recursive:true,force:true});}
