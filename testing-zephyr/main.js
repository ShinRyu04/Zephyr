const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

function notesFile() {
  return path.join(app.getPath('userData'), 'notes.json');
}

async function readNotes() {
  try {
    const raw = await fs.readFile(notesFile(), 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function writeNotes(notes) {
  const file = notesFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(notes, null, 2), 'utf8');
  await fs.rename(tmp, file);
  return { ok: true, file, count: notes.length };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 920,
    height: 700,
    minWidth: 520,
    minHeight: 460,
    backgroundColor: '#1c1c1e',
    title: 'Catatan',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.removeMenu();
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  ipcMain.handle('notes:load', () => readNotes());

  ipcMain.handle('notes:save', (_event, notes) => {
    if (!Array.isArray(notes)) throw new Error('Format catatan tidak valid');
    return writeNotes(notes);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
