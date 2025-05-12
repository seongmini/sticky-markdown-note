// note.js
const { ipcRenderer } = require('electron');
const { marked } = require('marked');
const katex = require('katex');
const fs = require('fs');
const path = require('path');
const { getInitialTheme, applyTheme } = require('./theme.js');

const defaultFontSize = parseInt(process.env.FONT_SIZE_DEFAULT) || 16;
const fontSizeMin = parseInt(process.env.FONT_SIZE_MIN) || 8;
const fontSizeMax = parseInt(process.env.FONT_SIZE_MAX) || 40;

let currentPath = null;
let currentFontSize = defaultFontSize;

marked.setOptions({
  breaks: true,    // 줄바꿈 한 번으로 <br> 적용
  gfm: true,
  smartLists: true,
  smartypants: false
});

function renderMathInMarkdown(markdown) {
  let html = marked(markdown);  // marked 먼저 실행

  // 수식 렌더링
  html = html.replace(/\$(.+?)\$/g, (_, expr) => {
    try {
      return katex.renderToString(expr, { throwOnError: false });
    } catch (err) {
      return `<code>${expr}</code>`;
    }
  });

  html = html.replace(
    /<li>\s*<input type="checkbox"(.*?)>(.*?)<\/li>/g,
    (_, attrs, content) => {
      const id = Math.random().toString(36).slice(2, 10);
      const checked = attrs.includes('checked') ? 'checked' : '';
      return `<li><label><input type="checkbox" ${checked} data-id="${id}"> ${content.trim()}</label></li>`;
    }
  );

  return html;
}

// 핵심: async 함수 안에서 모든 초기화 수행
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
  } catch {}

  editor.style.fontSize = `${currentFontSize}px`;
  preview.style.fontSize = `${currentFontSize}px`;

  ipcRenderer.on('load-note', (event, notePath, isNew) => {
    currentPath = notePath;

    if (isNew) {
      viewMode = 'both';
    }

    if (fs.existsSync(currentPath)) {
      const content = fs.readFileSync(currentPath, 'utf-8');
      editor.value = content;
      preview.innerHTML = renderMathInMarkdown(content);
    }

    updateView(); // 초기 상태 반영
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

  document.addEventListener('keydown', (e) => {
    const editorIsFocused = document.activeElement === editor;

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selected = text.slice(start, end);

    // 뷰 모드 단축키 (global)
    if (e.ctrlKey) {
      switch (e.key.toLowerCase()) {
        case 'p': // Ctrl+p: both 모드
          e.preventDefault();
          viewMode = 'both';
          updateView();
          return;
        case 'o': // Ctrl+o: editor only or editor/preview
          e.preventDefault();
          if (viewMode === 'both' || onlyTarget === 'preview') {
            onlyTarget = 'editor';
          } else {
            onlyTarget = 'preview';
          }
          viewMode = 'only';
          updateView();
          return;
        case 'm': // Ctrl+m: open Stick Markdown Note list
          e.preventDefault();
          ipcRenderer.send('open-main-window');
          return;
      }
    }

    // Ctrl+N: 새 노트 생성
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      ipcRenderer.send('create-new-note-nearby');
      return;
    }

    // editor에 포커스 없으면 텍스트 편집 단축키 비활성
    if (!editorIsFocused) return;

    // Tab 입력 처리
    if (e.key === 'Tab') {
      e.preventDefault();

      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const lines = editor.value.slice(start, end).split('\n');

      let newText;
      if (e.shiftKey) {
        // Shift + Tab: 들여쓰기 제거
        newText = lines.map(line =>
          line.startsWith('    ') ? line.slice(4) :
          line.startsWith('\t') ? line.slice(1) : line
        ).join('\n');
      } else {
        // Tab: 들여쓰기 추가
        newText = lines.map(line => '    ' + line).join('\n');
      }

      const before = editor.value.slice(0, start);
      const after = editor.value.slice(end);

      editor.value = before + newText + after;
      editor.selectionStart = start;
      editor.selectionEnd = start + newText.length;

      // 강제 input 이벤트 발생시켜 preview 반영
      editor.dispatchEvent(new Event('input'));
      return;
    }

    // 마크다운 단축키
    if (e.ctrlKey) {
      function surround(before, after = before) {
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
          const quote = selected ? selected.split('\n').map(line => '> ' + line).join('\n') : '> ';
          editor.value = text.slice(0, start) + quote + text.slice(end);
          editor.selectionStart = start;
          editor.selectionEnd = start + quote.length;
          preview.innerHTML = renderMathInMarkdown(editor.value);
          break;

        case 'h':
          if (!e.shiftKey) {
            e.preventDefault();
            const heading = selected
              ? selected.split('\n').map(line => '# ' + line).join('\n')
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
              ? selected.split('\n').map((line, i) => `${i + 1}. ${line}`).join('\n')
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
            const toggled = lines.map(line => {
              if (/^- \[ \] /.test(line)) return line.replace('- [ ] ', '- [x] ');
              if (/^- \[x\] /.test(line)) return line.replace('- [x] ', '');
              return '- [ ] ' + line;
            }).join('\n');
            editor.value = text.slice(0, start) + toggled + text.slice(end);
            editor.selectionStart = start;
            editor.selectionEnd = start + toggled.length;
            preview.innerHTML = renderMathInMarkdown(editor.value);
          }
          break;
      }
    }
  })

  openListBtn?.addEventListener('click', () => {
    ipcRenderer.send('open-main-window');
  });

  newNoteBtn?.addEventListener('click', () => {
    ipcRenderer.send('create-new-note-nearby');
  });

  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    currentFontSize += e.deltaY < 0 ? 1 : -1;
    currentFontSize = Math.max(fontSizeMin, Math.min(currentFontSize, fontSizeMax));
    editor.style.fontSize = `${currentFontSize}px`;
    preview.style.fontSize = `${currentFontSize}px`;
    saveSettings();
  }, { passive: false });

  viewToggleBtn?.addEventListener('click', () => {
    viewMode = viewMode === 'both' ? 'only' : 'both';
    updateView();
  });

  onlyToggleBtn?.addEventListener('click', () => {
    onlyTarget = onlyTarget === 'editor' ? 'preview' : 'editor';
    updateView();
  });

  updateView();

  // 렌더러 프로세스 준비 완료 신호 전송
  ipcRenderer.send('note-ready');
});