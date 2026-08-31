const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tomatoDesktop', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  setOpacity: (value) => ipcRenderer.invoke('window:set-opacity', value),
  resizeMini: (size) => ipcRenderer.invoke('window:resize-mini', size),
  startMiniDrag: () => ipcRenderer.invoke('window:mini-drag-start'),
  moveMini: () => ipcRenderer.send('window:mini-drag-move'),
  endMiniDrag: () => ipcRenderer.send('window:mini-drag-end'),
  openMini: () => ipcRenderer.invoke('window:open-mini'),
  restoreMain: () => ipcRenderer.invoke('window:restore-main'),
  quit: () => ipcRenderer.invoke('app:quit'),
  saveSettings: (settings) => ipcRenderer.invoke('store:settings', settings),
  loadSettings: () => ipcRenderer.invoke('store:load-settings'),
  saveCompanionSession: (session) => ipcRenderer.invoke('companion-session:save', session),
  loadCompanionSession: () => ipcRenderer.invoke('companion-session:load'),
  getTimerState: () => ipcRenderer.invoke('timer:get-state'),
  notify: (title, body) => ipcRenderer.invoke('app:notify', { title, body }),
  onMiniState: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('timer:state', handler);
    return () => ipcRenderer.removeListener('timer:state', handler);
  },
  sendTimerState: (value) => ipcRenderer.send('timer:state', value),
});
