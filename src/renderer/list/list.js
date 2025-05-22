const { getInitialTheme, applyTheme, toggleTheme } = require('../../shared/theme');
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let notesDir;
let currentSearch = '';

function getNoteTitle(content) {
  const firstLine = content.split('\n')[0];
  return firstLine.trim().substring(0, 30) || '(No title)';
}

document.addEventListener('DOMContentLoaded', async () => {
  const userDataPath = await ipcRenderer.invoke('get-user-data-path');
  notesDir = path.join(userDataPath, 'notes');

  // 테마 적용
  const theme = getInitialTheme();
  applyTheme(theme);

  const container = document.getElementById('notes');
  const addButton = document.getElementById('add');
  const searchInput = document.getElementById('search');
  const themeToggleBtn = document.getElementById('theme-toggle');

  themeToggleBtn.addEventListener('click', toggleTheme);

  function loadNotes() {
    container.innerHTML = '';
    fs.readdirSync(notesDir).forEach(file => {
      if (!file.endsWith('.md')) return;
      const fullPath = path.join(notesDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const stats = fs.statSync(fullPath);
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
                <div class="time">${new Date(stats.mtime).toLocaleString()}</div>
            `;
      div.addEventListener('click', () => {
        ipcRenderer.send('open-note', file);
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
          ipcRenderer.send('delete-note', file);
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      ipcRenderer.send('create-new-note');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      document.getElementById('search').focus();
    }
  });
}); 