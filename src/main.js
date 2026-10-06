import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, session, Tray, Menu, nativeImage, powerMonitor } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Store, Vault } from './core/store.js';
import { Tracker } from './core/service.js';
import { allowedExternal } from './core/security.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// A standard local launch switch also permits isolated packaged-app verification.
const profileDirectory = app.commandLine.getSwitchValue('user-data-dir');
if (profileDirectory) app.setPath('userData', path.resolve(profileDirectory));
if (!app.isPackaged && process.env.AI_TRACKER_DATA_DIR) app.setPath('userData',path.resolve(process.env.AI_TRACKER_DATA_DIR));
app.setName('AI Usage Tracker');
let window, tracker, tray, quitting = false, tick, poll;
const rendererURL = pathToFileURL(path.join(here,'renderer','index.html')).href;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { window?.show(); window?.focus(); });
  app.whenReady().then(boot).catch(e => { dialog.showErrorBox('AI Usage Tracker', e.message); app.quit(); });
}
async function openExternal(url) { if (!allowedExternal(url)) throw new Error('This external destination is not allowed.'); await shell.openExternal(url); }
function handle(name, fn) {
  ipcMain.handle(`tracker:${name}`, async(event,...args)=> {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== rendererURL) throw new Error('Untrusted request.');
    try { return { ok: true, value: await fn(...args) }; } catch(e) { return { ok: false, error: e.message || 'The operation failed. Please try again.' }; }
  });
}
async function boot() {
  const directory = app.getPath('userData');
  tracker = new Tracker(new Store(directory),new Vault(directory,safeStorage),directory);
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  session.defaultSession.setPermissionCheckHandler(()=>false);
  window = new BrowserWindow({ width: 1340, height: 930, minWidth: 900, minHeight: 680, show: false, backgroundColor: '#101415', title: 'AI Usage Tracker', icon: path.join(here,'assets','icon.png'), webPreferences: { preload: path.join(here,'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  window.webContents.setWindowOpenHandler(()=>({ action:'deny' }));
  window.webContents.on('will-navigate', event=>event.preventDefault());
  window.webContents.on('will-attach-webview', event=>event.preventDefault());
  window.setMenuBarVisibility(false);
  window.on('close', event=> { if (!quitting && tray && tracker.store.data.settings.closeToTray) { event.preventDefault(); window.hide(); } });
  handle('state',()=>tracker.state());
  handle('add',input=>tracker.add(input));
  handle('edit',(id,input)=>tracker.edit(id,input));
  handle('refresh',id=>id ? tracker.refresh(id) : tracker.refreshAll());
  handle('key',(id,key)=>tracker.connectKey(id,key));
  handle('login',async id=>{ const url = await tracker.beginLogin(id); try { await openExternal(url); } catch(e) { await tracker.cancelLogin(); throw e; } });
  handle('cancel-login',()=>tracker.cancelLogin());
  handle('disconnect',id=>tracker.disconnect(id));
  handle('remove',id=>tracker.remove(id));
  handle('logs',async id=> {
    tracker.store.account(id);
    const selection = await dialog.showOpenDialog(window,{ title: 'Select logs for this account only', properties:['openDirectory'] });
    if (!selection.canceled) await tracker.setLogPath(id,selection.filePaths[0]);
  });
  handle('clear-logs',id=>tracker.clearLogs(id));
  handle('start',id=> { tracker.store.checkpoint(Date.now(),powerMonitor.getSystemIdleTime()); tracker.store.start(id); tracker.changed(); });
  handle('stop',()=> { tracker.store.stop('Timer stopped',Date.now(),powerMonitor.getSystemIdleTime()); tracker.changed(); });
  handle('settings',input=>tracker.settings(input));
  handle('codex',async()=> {
    const selection = await dialog.showOpenDialog(window,{ title: 'Choose the official Codex native executable', properties:['openFile'], filters: process.platform === 'win32' ? [{name:'Codex executable',extensions:['exe']}] : [] });
    if (!selection.canceled) { await tracker.cancelLogin(); for (const c of tracker.clients.values()) c.close(); tracker.clients.clear(); tracker.store.data.settings.codexPath = selection.filePaths[0]; tracker.store.save(); tracker.changed(); }
  });
  handle('external',openExternal);
  tracker.on('changed',()=> { if (!window.isDestroyed()) window.webContents.send('tracker:changed'); updateTray(); });
  await window.loadFile(path.join(here,'renderer','index.html'));
  if (app.isPackaged || process.env.AI_TRACKER_HIDDEN_TEST !== '1') window.show();
  try {
    const icon = nativeImage.createFromPath(path.join(here,'assets',process.platform === 'darwin' ? 'trayTemplate.png' : 'icon.png')).resize({width:20,height:20});
    if (process.platform === 'darwin') icon.setTemplateImage(true);
    tray = new Tray(icon); tray.setToolTip('AI Usage Tracker'); tray.on('click',()=> { window.show(); window.focus(); }); updateTray();
  } catch { /* Without a tray the window closes normally, so the app is never hidden without a way back. */ }
  tick = setInterval(()=> { if (tracker.store.active) { tracker.store.checkpoint(Date.now(),powerMonitor.getSystemIdleTime()); tracker.changed(); } },15000);
  poll = setInterval(()=>void tracker.refreshAll(true),15000);
  powerMonitor.on('suspend',()=>{ tracker.store.stop('Timer paused for sleep',Date.now(),powerMonitor.getSystemIdleTime()); tracker.changed(); });
  powerMonitor.on('lock-screen',()=>{ tracker.store.stop('Timer paused while screen is locked',Date.now(),powerMonitor.getSystemIdleTime()); tracker.changed(); });
  powerMonitor.on('resume',()=>void tracker.refreshAll());
  void tracker.refreshAll();
}
function updateTray() {
  if (!tray || !tracker) return;
  const active = tracker.store.active;
  const items = [{label:'Open dashboard',click:()=>window.show()},{type:'separator'}];
  for (const a of tracker.store.data.accounts.slice(0,12)) {
    const q = a.quotas?.[0]; const usage = q ? ` · ${Math.round(q.remainingPercent)}% left${a.status === 'error' ? ' (stale)' : ''}` : '';
    items.push({ label:`${a.label}${usage}`,click:()=>window.show() });
  }
  items.push({type:'separator'},{label:active ? 'Stop focus timer' : 'Focus timer is stopped',enabled:!!active,click:()=>{tracker.store.stop('Timer stopped',Date.now(),powerMonitor.getSystemIdleTime()); tracker.changed();}},{label:'Refresh accounts',click:()=>void tracker.refreshAll()},{label:'Quit',click:()=>app.quit()});
  tray.setContextMenu(Menu.buildFromTemplate(items));
}
app.on('before-quit',()=>{ quitting = true; clearInterval(tick); clearInterval(poll); if (tracker) { tracker.store.stop('App closed',Date.now(),powerMonitor.getSystemIdleTime()); tracker.close(); } });
app.on('window-all-closed',()=>app.quit());
app.on('activate',()=>window?.show());
