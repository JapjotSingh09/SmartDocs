/**
 * SmartDocs – Electron Main Process
 *
 * Manages the desktop application lifecycle, secure BrowserWindow creation,
 * security sandboxing, and inter-process communication (IPC).
 */

const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const path = require('path');

// Disable hardware acceleration to guarantee consistent rendering across
// Windows virtualization, RDP, and diverse GPU drivers.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-direct-composition');

const supabaseService = require('./services/supabaseService');

// Global window reference prevents garbage collection from destroying the window
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 840,
    minHeight: 620,
    title: 'SmartDocs',
    backgroundColor: '#f3f5f8',
    show: false, // Shown on ready-to-show to prevent blank white flicker
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,  // Isolate Electron APIs from the DOM context
      nodeIntegration: false,   // Protect against remote code execution
      sandbox: true             // Run in Chromium sandbox
    }
  });

  mainWindow.center();

  // Prevent external link navigation from taking over the Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:') || url.startsWith('blob:')) return;
    event.preventDefault();
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
  });

  // Smooth appearance when content is painted
  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Open developer tools only in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Load the application renderer
  const htmlPath = path.join(__dirname, '../renderer/index.html');
  mainWindow.loadFile(htmlPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Application Lifecycle
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.smartdocs.app');
  }
  Menu.setApplicationMenu(null);
  // IPC: Provide desktop version and system info to renderer
  ipcMain.handle('app:get-info', () => {
    return {
      appName: 'SmartDocs',
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome,
      platform: process.platform
    };
  });

  // IPC: Supabase Authentication Handlers (Main Process Bridge)
  ipcMain.handle('auth:signup', async (_event, data) => {
    return await supabaseService.signUp(data.fullName, data.email, data.password);
  });

  ipcMain.handle('auth:login', async (_event, data) => {
    return await supabaseService.signIn(data.email, data.password);
  });

  ipcMain.handle('auth:logout', async () => {
    return await supabaseService.signOut();
  });

  ipcMain.handle('auth:get-session', async () => {
    return await supabaseService.getSession();
  });

  // Broadcast auth state updates from the main service to the renderer
  supabaseService.onAuthStateChange((event, session) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth:state-changed', {
        event,
        hasSession: Boolean(session),
        user: session?.user ? {
          id: session.user.id,
          email: session.user.email,
          fullName: session.user.user_metadata?.full_name || ''
        } : null
      });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed on Windows and Linux
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
