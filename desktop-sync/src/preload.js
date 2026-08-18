const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tjDesktop', {
  login: (email, password) => ipcRenderer.invoke('tj-login', { email, password }),
  openFolder: () => ipcRenderer.invoke('tj-open-folder'),
});
