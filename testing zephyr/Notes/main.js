const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1000,
		height: 680,
		minWidth: 720,
		minHeight: 480,
		frame: false,
		titleBarStyle: 'hidden',
		backgroundColor: '#00000000',
		transparent: true,
		hasShadow: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false
		}
	});

	mainWindow.loadFile('index.html');

	mainWindow.on('closed', () => {
		mainWindow = null;
	});
}

ipcMain.handle('window:minimize', () => {
	if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window:maximize', () => {
	if (!mainWindow) return false;
	if (mainWindow.isMaximized()) {
		mainWindow.unmaximize();
		return false;
	}
	mainWindow.maximize();
	return true;
});

ipcMain.handle('window:close', () => {
	if (mainWindow) mainWindow.close();
});

ipcMain.handle('window:isMaximized', () => {
	return mainWindow ? mainWindow.isMaximized() : false;
});

ipcMain.handle('app:info', () => {
	return {
		name: app.getName(),
		version: app.getVersion(),
		electron: process.versions.electron,
		chrome: process.versions.chrome,
		node: process.versions.node,
		platform: process.platform
	};
});

app.whenReady().then(() => {
	createWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});
