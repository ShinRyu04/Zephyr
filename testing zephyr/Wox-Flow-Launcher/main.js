const { app, BrowserWindow, globalShortcut, ipcMain, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOTKEY = 'Alt+Space';

let win = null;
let hidingForBlur = false;

function startMenuDirs() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  return [
    path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ];
}

// .lnk tidak bisa dibaca isinya tanpa shell COM, jadi nama file dipakai
// sebagai nama tampilan. Itu cukup untuk pencarian cepat.
function scanDir(dir, out, depth) {
  if (depth > 4) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(full, out, depth + 1);
    } else if (entry.name.toLowerCase().endsWith('.lnk')) {
      const name = entry.name.slice(0, -4);
      if (name.toLowerCase().includes('uninstall')) continue;
      out.push({ name, path: full, type: 'app' });
    }
  }
}

function collectApps() {
  const apps = [];
  for (const dir of startMenuDirs()) scanDir(dir, apps, 0);
  const seen = new Set();
  return apps.filter((a) => {
    const key = a.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let appIndex = [];

function createWindow() {
  win = new BrowserWindow({
    width: 680,
    height: 96,
    show: false,
    frame: false,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');

  win.on('blur', () => {
    if (hidingForBlur) return;
    hideWindow();
  });

  win.on('closed', () => {
    win = null;
  });
}

function showWindow() {
  if (!win) createWindow();
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;
  const w = 680;
  win.setBounds({
    x: Math.round(x + (width - w) / 2),
    y: Math.round(y + height * 0.22),
    width: w,
    height: 96,
  });
  win.show();
  win.focus();
  win.webContents.send('launcher:focus');
}

function hideWindow() {
  if (!win) return;
  hidingForBlur = true;
  win.hide();
  win.webContents.send('launcher:reset');
  setTimeout(() => {
    hidingForBlur = false;
  }, 100);
}

function toggleWindow() {
  if (!win) {
    createWindow();
    win.once('ready-to-show', showWindow);
    return;
  }
  if (win.isVisible() && win.isFocused()) hideWindow();
  else showWindow();
}

app.whenReady().then(() => {
  createWindow();
  appIndex = collectApps();

  const ok = globalShortcut.register(HOTKEY, toggleWindow);
  if (!ok) console.error('Hotkey gagal didaftarkan:', HOTKEY);

  win.once('ready-to-show', () => {
    showWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

ipcMain.handle('search', (_event, query) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    return appIndex.slice(0, 8).map((a) => ({ ...a, score: 0 }));
  }
  return appIndex
    .map((a) => ({ ...a, score: scoreMatch(a.name.toLowerCase(), q) }))
    .filter((a) => a.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length)
    .slice(0, 8);
});

function scoreMatch(name, q) {
  if (name === q) return 1000;
  if (name.startsWith(q)) return 800 - name.length;
  const wordStart = name.split(/[\s\-_.]/).some((w) => w.startsWith(q));
  if (wordStart) return 600 - name.length;
  if (name.includes(q)) return 400 - name.length;
  return subsequenceScore(name, q);
}

function subsequenceScore(name, q) {
  let i = 0;
  let gap = 0;
  for (const ch of name) {
    if (ch === q[i]) i++;
    else if (i > 0) gap++;
    if (i === q.length) break;
  }
  if (i !== q.length) return 0;
  return Math.max(1, 200 - gap);
}

ipcMain.handle('launch', async (_event, filePath) => {
  const err = await shell.openPath(filePath);
  if (!err) hideWindow();
  return err || null;
});

ipcMain.handle('hide', () => hideWindow());
