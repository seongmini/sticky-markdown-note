// main.js
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

app.setAppUserModelId('com.hsmin.stickymarkdownnote');

const openNoteWindows = {}; // { fullPath: BrowserWindow }

const stateFilePath = path.join(app.getPath('userData'), 'note-window-state.json');

const notesDir = path.join(app.getPath('userData'), 'notes');
if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true });

// 마지막 세션(열려 있던 노트들) 저장용
const sessionFile = path.join(app.getPath('userData'), 'last-session.json');

// === 세션 즉시 저장 함수 ===
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

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile('src/renderer/list/list.html');
}

function createNoteWindow(notePath, position = null, isNew = false) {
  const fullPath = path.resolve(notePath); // 경로 표준화

  if (!fs.existsSync(fullPath)) {
    console.error('This file does not exist:', fullPath);
    return;
  }

  // 이미 열려 있는 창이면 포커싱만 함
  if (openNoteWindows[fullPath]) {
    if (!openNoteWindows[fullPath].isDestroyed()) {
      openNoteWindows[fullPath].focus();
      return;
    } else {
      // 파괴됐는데 아직 등록된 경우 -> 정리하고 새로 연다
      delete openNoteWindows[fullPath];
    }
  }

  // 이전 위치/크기 불러오기
  const savedBounds = loadWindowState(fullPath);

  // 새 창 생성
  const win = new BrowserWindow({
    width: savedBounds?.width || 400,
    height: savedBounds?.height || 400,
    x: position?.x ?? savedBounds?.x,
    y: position?.y ?? savedBounds?.y,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile('src/renderer/note/note.html');

  // 노트 경로를 기억시킴
  win.notePath = notePath;
  win.isNewNote = isNew;

  win.on('focus', () => {
    win.webContents.send('window-focused');
  });

  win.on('blur', () => {
    win.webContents.send('window-blurred');
  });

  win.on('close', () => {
    // 창 위치/크기 저장
    const bounds = win.getBounds();
    saveWindowState(fullPath, bounds);
  });

  win.on('closed', () => {
    delete openNoteWindows[fullPath];
    writeSessionNow(); // 창이 사라졌으니 다시 저장장

    // 창 닫히면 목록 갱신
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send('refresh-list');
    }
  });

  // 메모 경로 -> 창 등록
  openNoteWindows[fullPath] = win;

  // 창이 새로 열렸으니 바로 세션 저장
  writeSessionNow();
}

function createNewNote(position = null) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `note-${timestamp}.md`;
  const filePath = path.join(notesDir, fileName);

  // 파일 내용 비워두고 생성
  fs.writeFileSync(filePath, '', 'utf-8');

  // 새 창 열기
  createNoteWindow(filePath, position, /* isNew */ true);

  // 목록 창에게 새로고침 요청
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

  // 파일 삭제
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }

  // 창이 열려 있다면 닫기
  if (openNoteWindows[fullPath]) {
    openNoteWindows[fullPath].close(); // 'closed' 이벤트에서 자동 정리됨
  }

  // 목록 갱신
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('refresh-list');
  }
});

ipcMain.on('open-main-window', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow(); // 새로 생성
  } else {
    mainWindow.focus(); // 기존 창 포커스
  }
});

ipcMain.handle('get-user-data-path', () => {
  return app.getPath('userData');
});

app.whenReady().then(() => {
  // == only auto-launch in a packeaged build ==
  if (!app.isPackaged) {
    console.warn('Dev mode - skipping auto-launch registration');
  } else {
    // 1) removing all automatic execution setting
    cleanStartup();

    // 2) setting automatic execution with platform-specific settings
    if (process.platform === 'darwin') {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: [],
        name: app.getName(),
        enabled: true
      });
    } else {
      app.setLoginItemSettings({
        openAtLogin: true,
        path: process.execPath,
        args: [],
        name: app.getName(),
      });
    }
  }
  let sessionRestored = false;

  // === 세션 복원 시도 ===
  if (fs.existsSync(sessionFile)) {
    try {
      const paths = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      for (const p of paths) {
        if (fs.existsSync(p)) {
          createNoteWindow(p);
          sessionRestored = true;
        }
      }
    } catch (e) {
      console.error('session recovering failed:', e);
    }
  }

  // 복원된 세션이 없을 때만 리스트 창 띄우기
  if (!sessionRestored) {
    createMainWindow();
  }
});

app.on('before-quit', writeSessionNow);
