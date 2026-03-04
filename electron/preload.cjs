const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  selectDataFolder: () => ipcRenderer.invoke('select-data-folder'),
  getDataFolder: () => ipcRenderer.invoke('get-data-folder'),
  readData: () => ipcRenderer.invoke('read-data'),
  writeData: (data) => ipcRenderer.invoke('write-data', data),
  getPdfFileUrl: (relativePath) => ipcRenderer.invoke('get-pdf-file-url', relativePath),
  writePdf: (paperId, buffer) => ipcRenderer.invoke('write-pdf', paperId, buffer),
  createDesktopShortcut: () => ipcRenderer.invoke('create-desktop-shortcut'),
  createFolderShortcut: () => ipcRenderer.invoke('create-folder-shortcut'),
});
