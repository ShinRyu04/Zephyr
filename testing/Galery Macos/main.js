const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.svg']);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 860,
    minHeight: 520,
    show: false,
    backgroundColor: '#1c1c1e',
    // macOS: titlebar tersembunyi dengan traffic light asli.
    // Windows/Linux: tanpa frame, traffic light digambar sendiri di HTML.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: { x: 16, y: 18 },
    frame: process.platform === 'darwin',
    roundedCorners: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('maximize', () => mainWindow.webContents.send('window:state', { maximized: true }));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:state', { maximized: false }));

  // Link luar jangan pernah menimpa jendela galeri.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { label: 'Preferences…', accelerator: 'Cmd+,', click: () => send('menu:action', 'preferences') },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        }]
      : []),
    {
      label: 'File',
      submenu: [
        { label: 'Import Folder…', accelerator: 'CmdOrCtrl+O', click: () => send('menu:action', 'import-folder') },
        { label: 'Import Photos…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('menu:action', 'import-photos') },
        { type: 'separator' },
        { label: 'Export Selected…', accelerator: 'CmdOrCtrl+E', click: () => send('menu:action', 'export-selected') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: () => send('menu:action', 'find') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Grid', accelerator: 'CmdOrCtrl+1', click: () => send('menu:action', 'view-grid') },
        { label: 'Timeline', accelerator: 'CmdOrCtrl+2', click: () => send('menu:action', 'view-timeline') },
        { type: 'separator' },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => send('menu:action', 'toggle-sidebar') },
        { label: 'Toggle Info Panel', accelerator: 'CmdOrCtrl+I', click: () => send('menu:action', 'toggle-info') },
        { label: 'Toggle Dark Mode', accelerator: 'CmdOrCtrl+Shift+D', click: () => send('menu:action', 'toggle-theme') },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        ...(isMac ? [{ role: 'zoom' }, { type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])
      ]
    },
    {
      role: 'help',
      submenu: [
        { label: 'Shortcuts', click: () => send('menu:action', 'shortcuts') },
        { label: 'Zephyr di GitHub', click: () => shell.openExternal('https://github.com/ShinRyu04/Zephyr') }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- IPC: jendela ---------- */
ipcMain.handle('window:control', (_e, action) => {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
  switch (action) {
    case 'minimize': mainWindow.minimize(); break;
    case 'maximize':
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
      break;
    case 'close': mainWindow.close(); break;
    case 'fullscreen': mainWindow.setFullScreen(!mainWindow.isFullScreen()); break;
    default: return { ok: false, error: 'unknown-action' };
  }
  return { ok: true, maximized: mainWindow.isMaximized(), fullscreen: mainWindow.isFullScreen() };
});

ipcMain.handle('window:info', () => ({
  platform: process.platform,
  version: app.getVersion(),
  electron: process.versions.electron,
  maximized: mainWindow ? mainWindow.isMaximized() : false,
  frame: process.platform !== 'darwin'
}));

/* ---------- IPC: berkas ---------- */
async function readFolder(folder) {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const photos = [];
  const errors = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXT.has(ext)) continue;
    const full = path.join(folder, entry.name);
    try {
      const stat = await fs.stat(full);
      photos.push({
        id: full,
        name: entry.name,
        path: full,
        url: new URL('file://' + full.replace(/\\/g, '/')).href,
        size: stat.size,
        mtime: stat.mtimeMs
      });
    } catch (err) {
      errors.push({ file: entry.name, message: err.message });
    }
  }
  photos.sort((a, b) => b.mtime - a.mtime);
  return { photos, errors, folder };
}

ipcMain.handle('photos:pickFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih folder foto',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true, photos: [] };
  const folder = result.filePaths[0];
  const data = await readFolder(folder);
  return { canceled: false, ...data };
});

ipcMain.handle('photos:loadFolder', async (_e, folder) => {
  if (typeof folder !== 'string' || !folder) return { photos: [], errors: [], folder: null };
  try {
    return await readFolder(folder);
  } catch (err) {
    return { photos: [], errors: [{ file: folder, message: err.message }], folder };
  }
});

ipcMain.handle('photos:pickFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih foto',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Gambar', extensions: [...IMAGE_EXT].map((e) => e.slice(1)) }]
  });
  if (result.canceled) return { canceled: true, photos: [] };
  const photos = [];
  const errors = [];
  for (const full of result.filePaths) {
    try {
      const stat = await fs.stat(full);
      photos.push({
        id: full,
        name: path.basename(full),
        path: full,
        url: new URL('file://' + full.replace(/\\/g, '/')).href,
        size: stat.size,
        mtime: stat.mtimeMs
      });
    } catch (err) {
      errors.push({ file: full, message: err.message });
    }
  }
  return { canceled: false, photos, errors, folder: null };
});

ipcMain.handle('photos:rename', async (_e, { filePath, newName }) => {
  if (typeof filePath !== 'string' || typeof newName !== 'string') return { ok: false, error: 'bad-args' };
  const clean = newName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim();
  if (!clean) return { ok: false, error: 'nama kosong' };
  const target = path.join(path.dirname(filePath), clean);
  try {
    await fs.access(target);
    return { ok: false, error: 'nama sudah dipakai' };
  } catch {
    /* belum ada, aman */
  }
  try {
    await fs.rename(filePath, target);
    return { ok: true, path: target };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('photos:trash', async (_e, filePath) => {
  if (typeof filePath !== 'string') return { ok: false, error: 'bad-args' };
  try {
    await shell.trashItem(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('photos:reveal', async (_e, filePath) => {
  if (typeof filePath !== 'string') return { ok: false, error: 'bad-args' };
  shell.showItemInFolder(filePath);
  return { ok: true };
});

ipcMain.handle('photos:export', async (_e, items) => {
  if (!Array.isArray(items) || !items.length) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Ekspor ke folder',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const dest = result.filePaths[0];
  let copied = 0;
  const errors = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    try {
      await fs.copyFile(item, path.join(dest, path.basename(item)));
      copied += 1;
    } catch (err) {
      errors.push({ file: item, message: err.message });
    }
  }
  return { canceled: false, copied, errors, dest };
});

ipcMain.handle('photos:stat', async (_e, filePath) => {
  try {
    const stat = await fs.stat(filePath);
    return { ok: true, size: stat.size, mtime: stat.mtimeMs };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:theme', () => nativeTheme.shouldUseDarkColors);

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
