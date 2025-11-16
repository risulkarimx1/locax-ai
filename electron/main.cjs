const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("path");

const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#09090b",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    mainWindow.loadFile(indexPath);
  }
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("locax:open-path", async (_event, targetPath) => {
  if (!targetPath) {
    return;
  }

  try {
    await shell.showItemInFolder(targetPath);
  } catch (error) {
    console.error("Failed to reveal folder", error);
    throw error;
  }
});

ipcMain.handle("locax:select-directory", async (_event, options = {}) => {
  const result = await dialog.showOpenDialog({
    title: options.title ?? "Select folder",
    defaultPath: options.defaultPath,
    properties: ["openDirectory", "createDirectory"],
    message: options.message,
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});
