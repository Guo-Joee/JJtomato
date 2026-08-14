const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tomatoDesktop', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  setOpacity: (value) => ipcRenderer.invoke('window:set-opacity', value),
  resizeMini: (size) => ipcRenderer.invoke('window:resize-mini', size),
  openMini: () => ipcRenderer.invoke('window:open-mini'),
  restoreMain: () => ipcRenderer.invoke('window:restore-main'),
  quit: () => ipcRenderer.invoke('app:quit'),
  saveSettings: (settings) => ipcRenderer.invoke('store:settings', settings),
  loadSettings: () => ipcRenderer.invoke('store:load-settings'),
  notify: (title, body) => ipcRenderer.invoke('app:notify', { title, body }),
  onMiniState: (callback) => ipcRenderer.on('timer:state', (_event, value) => callback(value)),
  sendTimerState: (value) => ipcRenderer.send('timer:state', value),
});
