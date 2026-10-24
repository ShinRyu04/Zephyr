const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mac', {
	minimize: () => ipcRenderer.invoke('window:minimize'),
	maximize: () => ipcRenderer.invoke('window:maximize'),
	close: () => ipcRenderer.invoke('window:close'),
	isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
	appInfo: () => ipcRenderer.invoke('app:info')
});
