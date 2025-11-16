const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApp", {
  platform: process.platform,
  openPath: (targetPath) => ipcRenderer.invoke("locax:open-path", targetPath),
  selectDirectory: (options) => ipcRenderer.invoke("locax:select-directory", options),
});
