const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('galery', {
  platform: process.platform,
  windowControl: (action) => ipcRenderer.invoke('window:control', action),
  windowInfo: () => ipcRenderer.invoke('window:info'),
  pickFolder: () => ipcRenderer.invoke('photos:pickFolder'),
  loadFolder: (folder) => ipcRenderer.invoke('photos:loadFolder', folder),
  pickFiles: () => ipcRenderer.invoke('photos:pickFiles'),
  rename: (filePath, newName) => ipcRenderer.invoke('photos:rename', { filePath, newName }),
  trash: (filePath) => ipcRenderer.invoke('photos:trash', filePath),
  reveal: (filePath) => ipcRenderer.invoke('photos:reveal', filePath),
  exportPhotos: (items) => ipcRenderer.invoke('photos:export', items),
  stat: (filePath) => ipcRenderer.invoke('photos:stat', filePath),
  systemThemeDark: () => ipcRenderer.invoke('app:theme'),
  onWindowState: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('window:state', handler);
    return () => ipcRenderer.removeListener('window:state', handler);
  },
  onMenuAction: (cb) => {
    const handler = (_e, action) => cb(action);
    ipcRenderer.on('menu:action', handler);
    return () => ipcRenderer.removeListener('menu:action', handler);
  }
});
