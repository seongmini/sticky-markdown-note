const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// Theme application function
function applyTheme(theme) {
    document.body.classList.toggle('dark-mode', theme === 'dark');
}

let notesDir;
let currentSearch = '';

function getNoteTitle(content) {
  const firstLine = content.split('\n')[0];
  return firstLine.trim().substring(0, 30) || '(No title)';
}

document.addEventListener('DOMContentLoaded', async () => {
  const userDataPath = await ipcRenderer.invoke('get-user-data-path');
  notesDir = path.join(userDataPath, 'notes');

  // 초기 테마 설정
  ipcRenderer.invoke('get-current-theme').then(theme => {
      applyTheme(theme);
  });

  const container = document.getElementById('notes');
  const addButton = document.getElementById('add');
  const searchInput = document.getElementById('search');
  const settingsButton = document.getElementById('settings-button'); // Get the new settings button

  settingsButton.addEventListener('click', () => { // Add event listener for settings button
    ipcRenderer.send('open-settings-window');
  });

  // Listen for theme changes from the main process
  ipcRenderer.on('theme-changed', (event, theme) => {
    applyTheme(theme);
  });

  function loadNotes() {
    container.innerHTML = '';
    
    const allNoteFiles = fs.readdirSync(notesDir)
      .filter(file => file.endsWith('.md'))
      .map(file => {
        const fullPath = path.join(notesDir, file);
        const stats = fs.statSync(fullPath);
        return {
          file: file,
          fullPath: fullPath,
          mtime: stats.mtime.getTime() // 최종 수정 시간 (timestamp)
        };
      })
      .sort((a, b) => b.mtime - a.mtime); // 수정 시간 내림차순 정렬 (최신순)

    allNoteFiles.forEach(note => {
      const content = fs.readFileSync(note.fullPath, 'utf-8');
      // const stats = fs.statSync(fullPath); // stats는 이미 note 객체에 포함되어 있으므로 제거
      const lowerContent = content.toLowerCase();
      const lowerTitle = getNoteTitle(content).toLowerCase();
      if (
        currentSearch &&
        !lowerContent.includes(currentSearch) &&
        !lowerTitle.includes(currentSearch)
      ) {
        return;
      }
      const div = document.createElement('div');
      div.className = 'note';
      div.innerHTML = `
                <div class="title">${getNoteTitle(content)}</div>
                <div class="time">${new Date(note.mtime).toLocaleString()}</div>
            `;
      div.addEventListener('click', () => {
        ipcRenderer.send('open-note', note.file);
      });
      div.addEventListener('contextmenu', e => {
        e.preventDefault();
        document.querySelectorAll('.delete-btn').forEach(btn => btn.remove());
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.className = 'delete-btn';
        delBtn.style.position = 'absolute';
        delBtn.style.left = `${e.pageX}px`;
        delBtn.style.top = `${e.pageY}px`;
        delBtn.style.zIndex = '1000';
        delBtn.style.background = 'white';
        delBtn.style.border = '1px solid #888';
        delBtn.style.cursor = 'pointer';
        delBtn.addEventListener('click', () => {
          ipcRenderer.send('delete-note', note.file);
          delBtn.remove();
        });
        document.body.appendChild(delBtn);
        window.addEventListener('click', () => delBtn.remove(), { once: true });
      });
      container.appendChild(div);
    });
  }

  loadNotes();

  addButton.addEventListener('click', () => {
    ipcRenderer.send('create-new-note');
  });

  ipcRenderer.on('refresh-list', () => {
    loadNotes();
  });

  searchInput.addEventListener('input', e => {
    currentSearch = e.target.value.toLowerCase();
    loadNotes();
  });

  document.addEventListener('keydown', e => {
    const isMac = process.platform === 'darwin';
    const modifierKey = isMac ? e.metaKey : e.ctrlKey;

    if (modifierKey && e.key === 'n') {
      e.preventDefault();
      ipcRenderer.send('create-new-note');
    }
    if (modifierKey && e.key === 'f') {
      e.preventDefault();
      document.getElementById('search').focus();
    }
  });
}); 