// note.js
const { ipcRenderer } = require('electron');
const { marked } = require('marked');
const katex = require('katex');
const fs = require('fs');
const path = require('path');
const { getInitialTheme, applyTheme } = require('../../shared/theme');

const defaultFontSize = parseInt(process.env.FONT_SIZE_DEFAULT) || 16;
const fontSizeMin = parseInt(process.env.FONT_SIZE_MIN) || 8;
const fontSizeMax = parseInt(process.env.FONT_SIZE_MAX) || 40;

let currentPath = null;
let currentFontSize = defaultFontSize;

marked.setOptions({
  breaks: true,
  gfm: true,
});

function renderMathInMarkdown(markdown) {
  let html = marked.parse(markdown);
  html = html.replace(/\$(.+?)\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr, { throwOnError: false });
    } catch (err) {
      return `<code>${expr}</code>`;
    }
  });
  html = html.replace(/<li>\s*<input type="checkbox"(.*?)>(.*?)<\/li>/g, (_, attrs, content) => {
    const id = Math.random().toString(36).slice(2, 10);
    const checked = attrs.includes('checked') ? 'checked' : '';
    return `<li><label><input type="checkbox" ${checked} data-id="${id}"> ${content.trim()}</label></li>`;
  });
  return html;
}

function surround(before, after = before) {
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const text = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = text.slice(start, end);
  const newText = text.slice(0, start) + before + selected + after + text.slice(end);
  editor.value = newText;
  if (start === end) {
    editor.selectionStart = editor.selectionEnd = start + before.length;
  } else {
    editor.selectionStart = start;
    editor.selectionEnd = end + before.length + after.length;
  }
  preview.innerHTML = renderMathInMarkdown(editor.value);
}

document.addEventListener('DOMContentLoaded', async () => {
  const userDataPath = await ipcRenderer.invoke('get-user-data-path');
  const settingsPath = path.join(userDataPath, 'settings.json');

  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const titlebar = document.getElementById('titlebar');
  const openListBtn = document.getElementById('open-list');
  const viewToggleBtn = document.getElementById('view-toggle');
  const onlyToggleBtn = document.getElementById('only-toggle');
  const newNoteBtn = document.getElementById('new-note');

  applyTheme(getInitialTheme());

  let viewMode = 'only';
  let onlyTarget = 'preview';

  function saveSettings() {
    const settings = { fontSize: currentFontSize };
    fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), () => {});
  }

  function updateView() {
    if (viewMode === 'both') {
      editor.style.display = 'block';
      preview.style.display = 'block';
      onlyToggleBtn.style.display = 'none';
      viewToggleBtn.textContent = 'both';
    } else {
      editor.style.display = onlyTarget === 'editor' ? 'block' : 'none';
      preview.style.display = onlyTarget === 'preview' ? 'block' : 'none';
      onlyToggleBtn.style.display = 'inline-block';
      onlyToggleBtn.textContent = onlyTarget === 'editor' ? '✏️' : '📄';
      viewToggleBtn.textContent = 'only';
    }
    if (viewMode === 'only' && onlyTarget === 'editor') {
      editor.focus();
    }
    document.body.classList.remove('both-mode', 'only-mode');
    document.body.classList.add(viewMode === 'both' ? 'both-mode' : 'only-mode');
  }

  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (typeof settings.fontSize === 'number') {
        currentFontSize = settings.fontSize;
      }
    }
  } catch {
    // 설정 파일이 없거나 잘못된 형식인 경우 무시
  }

  editor.style.fontSize = `${currentFontSize}px`;
  preview.style.fontSize = `${currentFontSize}px`;

  ipcRenderer.on('load-note', (event, notePath, isNew) => {
    currentPath = notePath;
    if (isNew) {
      viewMode = 'both';
    }
    if (currentPath && fs.existsSync(currentPath)) {
      const content = fs.readFileSync(currentPath, 'utf-8');
      editor.value = content;
      preview.innerHTML = renderMathInMarkdown(content);
    }
    updateView();
  });

  ipcRenderer.on('window-focused', () => {
    titlebar.style.display = 'flex';
  });

  ipcRenderer.on('window-blurred', () => {
    titlebar.style.display = 'none';
  });

  editor.addEventListener('input', () => {
    const text = editor.value;
    preview.innerHTML = renderMathInMarkdown(text);
    if (currentPath) {
      fs.writeFile(currentPath, text, () => {});
    }
  });

  document.addEventListener('keydown', e => {
    const editorIsFocused = document.activeElement === editor;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selected = text.slice(start, end);
    const isMac = process.platform === 'darwin';
    const modifierKey = isMac ? e.metaKey : e.ctrlKey;

    if (modifierKey) {
      switch (e.key.toLowerCase()) {
        case 'p':
          e.preventDefault();
          viewMode = 'both';
          updateView();
          return;
        case 'o':
          e.preventDefault();
          if (viewMode === 'both' || onlyTarget === 'preview') {
            onlyTarget = 'editor';
          } else {
            onlyTarget = 'preview';
          }
          viewMode = 'only';
          updateView();
          return;
        case 'm':
          e.preventDefault();
          ipcRenderer.send('open-main-window');
          return;
      }
    }
    if ((modifierKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      ipcRenderer.send('create-new-note-nearby');
      return;
    }
    if (!editorIsFocused) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const lines = editor.value.slice(start, end).split('\n');
      let newText;
      if (e.shiftKey) {
        newText = lines
          .map(line =>
            line.startsWith('    ') ? line.slice(4) : line.startsWith('\t') ? line.slice(1) : line
          )
          .join('\n');
      } else {
        newText = lines.map(line => '    ' + line).join('\n');
      }
      const before = editor.value.slice(0, start);
      const after = editor.value.slice(end);
      editor.value = before + newText + after;
      
      // 커서 위치 조정
      if (start === end) {
        // 단일 커서인 경우
        editor.selectionStart = editor.selectionEnd = start + 4;
      } else {
        // 여러 줄이 선택된 경우
        editor.selectionStart = start;
        editor.selectionEnd = start + newText.length;
      }
      
      editor.dispatchEvent(new Event('input'));
      return;
    }
    if (modifierKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          surround('**');
          break;
        case 'i':
          e.preventDefault();
          surround('*');
          break;
        case '`':
          e.preventDefault();
          surround('`');
          break;
        case 'k':
          e.preventDefault();
          surround('\n```\n', '\n```');
          break;
        case 'q':
          e.preventDefault();
          {
            const quote = selected
              ? selected
                  .split('\n')
                  .map(line => '> ' + line)
                  .join('\n')
              : '> ';
            surround(quote);
          }
          break;
        case 'h':
          if (!e.shiftKey) {
            e.preventDefault();
            const heading = selected
              ? selected
                  .split('\n')
                  .map(line => '# ' + line)
                  .join('\n')
              : '# ';
            editor.value = text.slice(0, start) + heading + text.slice(end);
            editor.selectionStart = start;
            editor.selectionEnd = start + heading.length;
            preview.innerHTML = renderMathInMarkdown(editor.value);
          }
          break;
        case 's':
          if (e.shiftKey) {
            e.preventDefault();
            surround('~~');
          }
          break;
        case 'l':
          e.preventDefault();
          if (e.shiftKey) {
            const lines = selected ? selected.split('\n') : [''];
            const bullet = lines.map(line => `- ${line}`).join('\n');
            editor.value = text.slice(0, start) + bullet + text.slice(end);
            editor.selectionStart = start;
            editor.selectionEnd = start + bullet.length;
          } else {
            const link = selected ? `[${selected}](url)` : `[text](url)`;
            editor.value = text.slice(0, start) + link + text.slice(end);
            editor.selectionStart = start + 1;
            editor.selectionEnd = start + link.indexOf(']');
          }
          break;
        case 'o':
          if (e.shiftKey) {
            e.preventDefault();
            const numbered = selected
              ? selected
                  .split('\n')
                  .map((line, i) => `${i + 1}. ${line}`)
                  .join('\n')
              : '1. ';
            editor.value = text.slice(0, start) + numbered + text.slice(end);
            editor.selectionStart = start;
            editor.selectionEnd = start + numbered.length;
            preview.innerHTML = renderMathInMarkdown(editor.value);
          }
          break;
        case 'c':
          if (e.shiftKey) {
            e.preventDefault();
            const lines = selected ? selected.split('\n') : [''];
            const toggled = lines
              .map(line => {
                if (/^- \[ \] /.test(line)) return line.replace('- [ ] ', '- [x] ');
                if (/^- \[x\] /.test(line)) return line.replace('- [x] ', '');
                return '- [ ] ' + line;
              })
              .join('\n');
            editor.value = text.slice(0, start) + toggled + text.slice(end);
            editor.selectionStart = start;
            editor.selectionEnd = start + toggled.length;
            preview.innerHTML = renderMathInMarkdown(editor.value);
          }
          break;
      }
    }
  });

  openListBtn?.addEventListener('click', () => {
    ipcRenderer.send('open-main-window');
  });

  newNoteBtn?.addEventListener('click', () => {
    ipcRenderer.send('create-new-note-nearby');
  });

  window.addEventListener(
    'wheel',
    e => {
      const isMac = process.platform === 'darwin';
      const modifierKey = isMac ? e.metaKey : e.ctrlKey;
      
      if (!modifierKey) return;
      e.preventDefault();
      currentFontSize += e.deltaY < 0 ? 1 : -1;
      currentFontSize = Math.max(fontSizeMin, Math.min(currentFontSize, fontSizeMax));
      editor.style.fontSize = `${currentFontSize}px`;
      preview.style.fontSize = `${currentFontSize}px`;
      saveSettings();
    },
    { passive: false }
  );

  viewToggleBtn?.addEventListener('click', () => {
    viewMode = viewMode === 'both' ? 'only' : 'both';
    updateView();
  });

  onlyToggleBtn?.addEventListener('click', () => {
    onlyTarget = onlyTarget === 'editor' ? 'preview' : 'editor';
    updateView();
  });

  updateView();

  ipcRenderer.send('note-ready');
});
