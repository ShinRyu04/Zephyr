const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zephyr', {
  search: (query) => ipcRenderer.invoke('search', query),
  launch: (filePath) => ipcRenderer.invoke('launch', filePath),
  hide: () => ipcRenderer.invoke('hide'),
  onFocus: (cb) => ipcRenderer.on('launcher:focus', () => cb()),
  onReset: (cb) => ipcRenderer.on('launcher:reset', () => cb()),
});
