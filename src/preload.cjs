const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tracker', {
  state: () => ipcRenderer.invoke('tracker:state'),
  add: input => ipcRenderer.invoke('tracker:add', input),
  edit: (id, input) => ipcRenderer.invoke('tracker:edit', id, input),
  refresh: id => ipcRenderer.invoke('tracker:refresh', id),
  connectKey: (id, key) => ipcRenderer.invoke('tracker:key', id, key),
  login: id => ipcRenderer.invoke('tracker:login', id),
  cancelLogin: () => ipcRenderer.invoke('tracker:cancel-login'),
  disconnect: id => ipcRenderer.invoke('tracker:disconnect', id),
  remove: id => ipcRenderer.invoke('tracker:remove', id),
  chooseLogs: id => ipcRenderer.invoke('tracker:logs', id),
  clearLogs: id => ipcRenderer.invoke('tracker:clear-logs', id),
  start: id => ipcRenderer.invoke('tracker:start', id),
  stop: () => ipcRenderer.invoke('tracker:stop'),
  settings: input => ipcRenderer.invoke('tracker:settings', input),
  chooseCodex: () => ipcRenderer.invoke('tracker:codex'),
  external: url => ipcRenderer.invoke('tracker:external', url),
  onChange: callback => { const listener = () => callback(); ipcRenderer.on('tracker:changed', listener); return () => ipcRenderer.removeListener('tracker:changed', listener); }
});
