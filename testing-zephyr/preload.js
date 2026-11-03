const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notesAPI', {
  load: () => ipcRenderer.invoke('notes:load'),
  save: (notes) => ipcRenderer.invoke('notes:save', notes)
});
