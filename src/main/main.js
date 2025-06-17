// main.js
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const { autoUpdater } = require('electron-updater');
const { dialog, nativeTheme } = require('electron');

app.setAppUserModelId('com.hsmin.stickymarkdownnote');

const openNoteWindows = {}; // { fullPath: BrowserWindow }

const stateFilePath = path.join(app.getPath('userData'), 'note-window-state.json');

const notesDir = path.join(app.getPath('userData'), 'notes');
if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true });

// For saving the last session (open notes)
const sessionFile = path.join(app.getPath('userData'), 'last-session.json');

// === Immediate Session Save Function ===
function writeSessionNow() {
  const openPaths = Object.keys(openNoteWindows).filter(fullPath => {
    const w = openNoteWindows[fullPath];
    return w && !w.isDestroyed();
  });
  try {
    fs.writeFileSync(sessionFile, JSON.stringify(openPaths, null, 2));
  } catch (e) {
    console.error('last-session write failed:', e);
  }
}

let Store; // Declare Store as a variable globally
let store; // Declare store instance globally

let mainWindow;
let settingsWindow; // Add this line to declare settingsWindow globally

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    show: false, // Start hidden
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('src/renderer/list/list.html');

  // Set initial theme and show window when ready
  mainWindow.webContents.once('did-finish-load', () => {
    if (store) {
      mainWindow.webContents.send('theme-changed', store.get('theme'));
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // Settings button click event handler
  ipcMain.on('open-settings-window', () => {
    createSettingsWindow();
  });
}

function createNoteWindow(notePath, position = null, isNew = false) {
  const fullPath = path.resolve(notePath); // Standardize path

  if (!fs.existsSync(fullPath)) {
    console.error('This file does not exist:', fullPath);
    return;
  }

  // If window is already open, just focus it
  if (openNoteWindows[fullPath]) {
    if (!openNoteWindows[fullPath].isDestroyed()) {
      openNoteWindows[fullPath].focus();
      return;
    } else {
      // If destroyed but still registered -> clean up and reopen
      delete openNoteWindows[fullPath];
    }
  }

  // Load previous position/size
  const savedBounds = loadWindowState(fullPath);

  // Create new window
  const win = new BrowserWindow({
    width: savedBounds?.width || 400,
    height: savedBounds?.height || 400,
    x: position?.x ?? savedBounds?.x,
    y: position?.y ?? savedBounds?.y,
    frame: false,
    show: false, // Start hidden
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile('src/renderer/note/note.html');

  // Set initial theme and show window when ready
  win.webContents.once('did-finish-load', () => {
    if (store) { // Ensure 'store' is initialized before accessing it
      win.webContents.send('theme-changed', store.get('theme'));
    } else {
      console.warn("Store not initialized when setting initial theme for note window.");
    }
    
    // Show window and focus it
    win.show();
    win.focus();
  });

  win.notePath = notePath;
  win.isNewNote = isNew;

  win.on('focus', () => {
    win.webContents.send('window-focused');
  });

  win.on('blur', () => {
    win.webContents.send('window-blurred');
    win.flashFrame(false); // Stop flashing when focus is lost
  });

  win.on('close', () => {
    // Save window position/size
    const bounds = win.getBounds();
    saveWindowState(fullPath, bounds);
  });

  win.on('moved', () => {
    // Save every time the window is moved
    const bounds = win.getBounds();
    saveWindowState(fullPath, bounds);
  });

  win.on('resized', () => {
    // Save every time the window is resized
    const bounds = win.getBounds();
    saveWindowState(fullPath, bounds);
  });

  win.on('closed', () => {
    delete openNoteWindows[fullPath];
    writeSessionNow(); // Window closed, save session again

    // Refresh list when window is closed
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send('refresh-list');
    }
  });

  // Register note path -> window
  openNoteWindows[fullPath] = win;

  // Window is new, save session immediately
  writeSessionNow();
}

function createNewNote(position = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `note-${timestamp}.md`;
  const filePath = path.join(notesDir, fileName);

  // Create file with empty content
  fs.writeFileSync(filePath, '', 'utf-8');

  // Open new window
  createNoteWindow(filePath, position, /* isNew */ true);

  // Request refresh to list window
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('refresh-list');
  }
}

function loadWindowState(notePath) {
  const fullPath = path.resolve(notePath);
  if (!fs.existsSync(stateFilePath)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
    return data[fullPath] || null;
  } catch {
    return null;
  }
}

function saveWindowState(notePath, bounds) {
  const fullPath = path.resolve(notePath);
  let data = {};
  if (fs.existsSync(stateFilePath)) {
    try {
      data = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
    } catch {
      data = {};
    }
  }
  data[fullPath] = bounds;
  fs.writeFileSync(stateFilePath, JSON.stringify(data, null, 2));
}

function cleanStartup() {
  if (process.platform === 'win32') {
    const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
    const toDelete = [
      'electron.app.Sticky Markdown Note',
      'electron.app.Electron',
      'com.hsmin.stickymarkdownnote',
    ];

    // delete registry Run key
    toDelete.forEach(name => {
      try {
        execSync(`reg delete "${runKey}" /v "${name}" /f`, { stdio: 'ignore' });
      } catch (error) {
        console.warn('Failed to delete registry key ${name}:', error);
      }
    });

    // 1) per-user Startup folder
    const userStartup = path.join(
      app.getPath('appData'),
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup'
    );
    // 2) all-users Startup folder
    const commonStartup = path.join(
      process.env.ProgramData || '',
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup'
    );
    [userStartup, commonStartup].forEach(dir => {
      const lnk = path.join(dir, 'Sticky Markdown Note.lnk');
      if (fs.existsSync(lnk)) {
        try {
          fs.unlinkSync(lnk);
        } catch (e) {
          console.warn('Startup shortcut deletion failed:', e);
        }
      }
    });
  } else if (process.platform === 'darwin') {
    // macOS startup items cleanup
    const launchAgentsDir = path.join(app.getPath('home'), 'Library/LaunchAgents');
    const plistFile = path.join(launchAgentsDir, 'com.sticky.markdown.note.plist');
    
    if (fs.existsSync(plistFile)) {
      try {
        fs.unlinkSync(plistFile);
      } catch (e) {
        console.warn('Failed to remove macOS launch agent:', e);
      }
    }
  }
}

ipcMain.on('open-note', (event, noteFile) => {
  const notePath = path.join(notesDir, noteFile);
  createNoteWindow(notePath);
});

ipcMain.on('note-ready', event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win.notePath) {
    const isNew = !!win.isNewNote;
    win.webContents.send('load-note', win.notePath, isNew);
  }
});

ipcMain.on('create-new-note', () => {
  createNewNote();
});

ipcMain.on('create-new-note-nearby', event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;

  const bounds = win.getBounds();
  const offset = 40;

  const newPos = {
    x: bounds.x + offset,
    y: bounds.y + offset,
  };

  createNewNote(newPos);
});

ipcMain.on('delete-note', (event, noteFile) => {
  const fullPath = path.resolve(path.join(notesDir, noteFile));
  const stateDataPath = path.join(app.getPath('userData'), 'note-window-state.json');
  if (fs.existsSync(stateDataPath)) {
    try {
      const stateData = JSON.parse(fs.readFileSync(stateDataPath, 'utf-8'));
      delete stateData[fullPath];
      fs.writeFileSync(stateDataPath, JSON.stringify(stateData, null, 2));
    } catch (err) {
      console.error('Failed to clean up window state:', err);
    }
  }

  // Delete file
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }

  // Close window if it's open
  if (openNoteWindows[fullPath]) {
    openNoteWindows[fullPath].close(); // Automatically cleaned up in 'closed' event
  }

  // Refresh list
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('refresh-list');
  }
});

ipcMain.on('open-main-window', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow(); // Create new window
  } else {
    mainWindow.focus(); // Focus existing window
  }
});

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

app.on('ready', async () => {
  createMainWindow();

  // Dynamically import electron-store and initialize store instance here
  Store = (await import('electron-store')).default;
  store = new Store();

  // Initial theme setting (system theme or stored setting)
  if (store.get('theme') === undefined) {
    store.set('theme', nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  }

  // IPC handlers for theme
  ipcMain.handle('toggle-theme', () => {
    const currentTheme = store.get('theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    store.set('theme', newTheme);

    // Notify all open windows about theme change
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('theme-changed', newTheme);
    });

    return newTheme;
  });

  ipcMain.handle('get-current-theme', () => {
    return store.get('theme');
  });

  // Set default shortcuts if not exists
  if (!store.get('shortcuts')) {
    store.set('shortcuts', {
      'preview': { key: 'p', modifiers: ['ctrl'] },
      'toggle-view': { key: 'o', modifiers: ['ctrl'] },
      'open-main': { key: 'm', modifiers: ['ctrl'] },
      'new-note': { key: 'n', modifiers: ['ctrl'] },
      'bold': { key: 'b', modifiers: ['ctrl'] },
      'italic': { key: 'i', modifiers: ['ctrl'] },
      'inline-code': { key: '`', modifiers: ['ctrl'] },
      'code-block': { key: 'k', modifiers: ['ctrl'] },
      'quote': { key: 'q', modifiers: ['ctrl'] },
      'heading': { key: 'h', modifiers: ['ctrl'] },
      'strikethrough': { key: 's', modifiers: ['ctrl', 'shift'] },
      'link': { key: 'l', modifiers: ['ctrl'] },
      'bullet-list': { key: 'l', modifiers: ['ctrl', 'shift'] },
      'numbered-list': { key: 'o', modifiers: ['ctrl', 'shift'] },
      'focus-search': { key: 'f', modifiers: ['ctrl'] }
    });
  }

  // Register IPC handlers for shortcuts
  ipcMain.handle('get-shortcuts', () => {
    return store.get('shortcuts');
  });

  ipcMain.on('save-shortcuts', (event, shortcuts) => {
    store.set('shortcuts', shortcuts);
    // Notify all windows about shortcut changes
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('shortcuts-updated', shortcuts);
    });
  });

  // Last session restore
  try {
    if (fs.existsSync(sessionFile)) {
      const lastSession = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      if (Array.isArray(lastSession)) {
        lastSession.forEach(notePath => {
          if (fs.existsSync(notePath)) {
            createNoteWindow(notePath, null, false);
          }
        });
      }
    }
  } catch (e) {
    console.error('last-session restore failed:', e);
  }

  // Register a custom protocol to serve local assets securely
  protocol.handle('app-asset', (request) => {
    const assetPath = request.url.replace(/^app-asset:\/\//, '');
    const fullPath = path.join(app.getAppPath(), assetPath);
    console.log('Serving asset:', fullPath);
    return net.fetch(fullPath);
  });

  // ===== Auto-update logic start =====
  // Don't check for updates in development mode
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-available', () => {
      // Notify user about available update (show dialog if needed)
      console.log('Update available. Downloading...');
    });

    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
      const dialogOpts = {
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Application Update',
        message: process.platform === 'win32' ? releaseNotes : releaseName,
        detail: 'A new version has been downloaded. Restart the application to apply the updates.'
      };

      dialog.showMessageBox(dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) autoUpdater.quitAndInstall();
      });
    });

    autoUpdater.on('error', message => {
      console.error('There was a problem updating the application');
      console.error(message);
    });

    // (Optional) Show download progress
    autoUpdater.on('download-progress', (progressObj) => {
      let log_message = "Download speed: " + progressObj.bytesPerSecond;
      log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
      log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
      console.log(log_message);
    });
  }
  // ===== Auto-update logic end =====
});

app.on('before-quit', writeSessionNow);

// Settings window creation function
function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    show: false, // Start hidden
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  settingsWindow.loadFile('src/renderer/settings/settings.html');

  // Set initial theme and show window when ready
  settingsWindow.webContents.once('did-finish-load', () => {
    if (store) {
      settingsWindow.webContents.send('theme-changed', store.get('theme'));
    }
    settingsWindow.show();
    settingsWindow.focus();
  });

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}