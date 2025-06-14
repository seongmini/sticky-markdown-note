// note.js
const { ipcRenderer } = require('electron');
const { marked } = require('marked');
const katex = require('katex');
const fs = require('fs');
const path = require('path');
const CheckboxManager = require('./checkbox');

// Theme application function
function applyTheme(theme) {
    document.body.classList.toggle('dark-mode', theme === 'dark');
}

const defaultFontSize = parseInt(process.env.FONT_SIZE_DEFAULT) || 16;
const fontSizeMin = parseInt(process.env.FONT_SIZE_MIN) || 8;
const fontSizeMax = parseInt(process.env.FONT_SIZE_MAX) || 40;

let currentPath = null;
let currentFontSize = defaultFontSize;
let userImagesDir = null; // 사용자 이미지 저장 경로
let appRootPath = null; // 앱 루트 경로를 저장할 변수

// 고아 이미지 관리
class OrphanedImageManager {
  constructor() {
    // this.ONE_HOUR = 60 * 60 * 1000; // 1시간을 밀리초로 - 이 조건은 더 이상 사용하지 않습니다.
  }

  // 이미지 파일이 사용 중인지 확인
  isImageInUse(markdownImagePath) {
    if (!userImagesDir) return false; // userImagesDir가 설정되지 않았다면 검사할 수 없음
    
    // 모든 노트가 저장되는 기본 디렉토리를 사용
    const notesRootPath = path.dirname(userImagesDir);
    if (!fs.existsSync(notesRootPath)) return false;

    // 재귀적으로 모든 .md 파일을 찾는 함수
    const getAllMarkdownFiles = (dir) => {
      let markdownFiles = [];
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          markdownFiles = markdownFiles.concat(getAllMarkdownFiles(filePath));
        } else if (filePath.endsWith('.md')) {
          markdownFiles.push(filePath);
        }
      }
      return markdownFiles;
    };

    const allNotes = getAllMarkdownFiles(notesRootPath);

    // 'file:///' 접두사를 제거하고 백슬래시를 포워드 슬래시로 통일하여 경로 문자열 정규화
    // 예: file:///C:/Users/User/AppData/Roaming/Sticky%20Markdown%20Note/notes/images/my%20image%20[1].png
    //    -> C:/Users/User/AppData/Roaming/Sticky%20Markdown%20Note/notes/images/my%20image%20[1].png
    const normalizedRawPath = markdownImagePath.replace(/^file:\/\/\/?/, '').replace(/\\/g, '/');

    // 가능한 마크다운 링크 형태를 모두 생성하여 정규식 패턴으로 만듭니다.
    const possiblePathPatterns = [];

    // 1. 공백이 처리되지 않은 원본 경로 (raw path)
    possiblePathPatterns.push(escapeRegExp(normalizedRawPath));

    // 2. 공백이 %20으로 인코딩된 경로
    possiblePathPatterns.push(escapeRegExp(normalizedRawPath.replace(/ /g, '%20')));

    // 3. encodeURI로 인코딩된 경로 (일반적으로 사용)
    // 주의: encodeURI는 모든 특수문자를 인코딩하지 않음 (예: [ ] ).
    try {
      possiblePathPatterns.push(escapeRegExp(encodeURI(normalizedRawPath)));
    } catch (e) {
      console.error("Error encoding URI for path:", normalizedRawPath, e);
    }

    // 4. encodePathSpecialChars로 인코딩된 경로 (대괄호 등 추가 처리)
    possiblePathPatterns.push(escapeRegExp(encodePathSpecialChars(normalizedRawPath)));
    
    // 각 패턴에 'file:///' 및 'file://' 접두사를 추가하여 최종 패턴 생성
    const finalRegexPatterns = [];
    for (const pattern of possiblePathPatterns) {
      // file:/// 접두사
      finalRegexPatterns.push(`file:\/\/\/?${pattern}`);
      // file:// 접두사 (가끔 발생할 수 있는 경우 대비)
      finalRegexPatterns.push(`file:\/\/${pattern}`);
    }

    // 모든 패턴을 OR(|)로 연결하여 최종 정규식 생성
    const fullRegex = new RegExp(
      `(?:${finalRegexPatterns.join('|')})`,
      'gi' // 전역 및 대소문자 구분 없음
    );

    for (const notePath of allNotes) {
      try {
        const content = fs.readFileSync(notePath, 'utf-8');
        if (fullRegex.test(content)) {
          return true;
        }
      } catch (err) {
        console.error(`Error reading note file ${notePath}:`, err);
      }
    }
    return false;
  }

  // 고아 이미지 정리
  cleanupOrphanedImages() {
    if (!userImagesDir || !fs.existsSync(userImagesDir)) return;

    const images = fs.readdirSync(userImagesDir)
      .filter(file => /\.(png|jpg|jpeg|gif|webp)$/i.test(file));

    for (const image of images) {
      const imagePath = path.join(userImagesDir, image);
      try {
        // 이미지의 완전한 마크다운 링크 경로를 생성하여 isImageInUse로 전달
        const absoluteImagePathForMarkdown = `file:///${imagePath.replace(/\\/g, '/')}`;
        if (!this.isImageInUse(absoluteImagePathForMarkdown)) {
          fs.unlinkSync(imagePath);
          console.log(`Deleted orphaned image: ${image}`);
        }
      } catch (err) {
        console.error(`Failed to process image ${image}:`, err);
      }
    }
  }
}

// 고아 이미지 매니저 인스턴스 생성
const orphanedImageManager = new OrphanedImageManager();

// 정규식에서 특수문자를 이스케이프하는 헬퍼 함수
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the matched substring
}

// URL 경로에서 특정 특수문자를 인코딩하는 헬퍼 함수
// (encodeURI는 일부 문자를 인코딩하지 않으므로 직접 처리)
function encodePathSpecialChars(pathStr) {
  return pathStr
    .replace(/ /g, '%20') // 공백
    .replace(/\(/g, '%28') // 여는 소괄호
    .replace(/\)/g, '%29') // 닫는 소괄호
    .replace(/\[/g, '%5B') // 여는 대괄호
    .replace(/\]/g, '%5D') // 닫는 대괄호
    .replace(/\+/g, '%2B') // 더하기 기호
    .replace(/\#/g, '%23') // 샵 기호
    .replace(/\?/g, '%3F') // 물음표
    .replace(/\&/g, '%26'); // 앰퍼샌드
}

// app-asset:/// 링크를 file:// 링크로 변환하는 함수
async function convertAppAssetLinks(content) {
  if (!content) return content;
  
  // app-asset:/// 링크를 찾아서 file:// 링크로 변환
  return content.replace(/!\[([^\]]*)\]\(app-asset:\/\/\/([^)]+)\)/g, (match, alt, assetPath) => {
    // app-asset 경로에서 실제 파일 경로 추출
    const imagePath = path.join(appRootPath, assetPath);
    // file:// 프로토콜과 절대 경로로 변환
    const filePath = `file:///${imagePath.replace(/\\/g, '/')}`;
    return `![${alt}](${filePath})`;
  });
}

// 이미지 붙여넣기 처리
async function handleImagePaste(event) {
  const items = event.clipboardData.items;
  
  for (const item of items) {
    if (item.type.indexOf('image') === 0) {
      event.preventDefault();
      
      const file = item.getAsFile();
      const buffer = await file.arrayBuffer();
      const imageBuffer = Buffer.from(buffer);
      
      // 이미지 파일명 생성 (timestamp + random string)
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const ext = file.type.split('/')[1];
      const filename = `${timestamp}-${random}.${ext}`;
      const imagePath = path.join(userImagesDir, filename);
      
      // 이미지 저장
      fs.writeFileSync(imagePath, imageBuffer);
      
      // 마크다운 이미지 링크 생성 (file:// 프로토콜과 절대 경로 사용)
      const absoluteImagePath = `file:///${imagePath.replace(/\\/g, '/')}`;
      const imageMarkdown = `![${filename}](${absoluteImagePath})`;
      
      // 에디터에 이미지 링크 삽입
      const editor = document.getElementById('editor');
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const text = editor.value;
      editor.value = text.slice(0, start) + imageMarkdown + text.slice(end);
      editor.selectionStart = editor.selectionEnd = start + imageMarkdown.length;
      
      // 프리뷰 업데이트
      const preview = document.getElementById('preview');
      preview.innerHTML = renderMathInMarkdown(editor.value);
      
      // 파일 저장
      if (currentPath) {
        fs.writeFile(currentPath, String(editor.value), () => {
          // 이미지가 추가되었으므로 고아 이미지 정리
          orphanedImageManager.cleanupOrphanedImages();
        });
      }
      
      break;
    }
  }
}

marked.setOptions({
  breaks: true,
  gfm: true,
});

// 전역 렌더러 인스턴스 생성
const checkboxManager = new CheckboxManager();

// 수식이 포함된 마크다운인지 확인하는 함수
function hasMathExpression(markdown) {
  return /\$(.+?)\$/.test(markdown);
}

function renderMathInMarkdown(markdown) {
  // 체크박스 렌더링
  let html = checkboxManager.renderCheckboxes(markdown);
  
  // 수식이 있는 경우에만 수식 렌더링
  if (hasMathExpression(markdown)) {
    html = html.replace(/\$(.+?)\$/g, (_, expr) => {
      try {
        return katex.renderToString(expr, { throwOnError: false });
      } catch (err) {
        return `<code>${expr}</code>`;
      }
    });
  }
  
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
  // 앱 루트 경로 가져오기
  appRootPath = await ipcRenderer.invoke('get-app-path');
  
  const userDataPath = await ipcRenderer.invoke('get-user-data-path');
  const settingsPath = path.join(userDataPath, 'settings.json');

  // 사용자 이미지 저장 경로 설정 및 폴더 생성
  userImagesDir = path.join(userDataPath, 'notes', 'images');
  if (!fs.existsSync(userImagesDir)) {
    fs.mkdirSync(userImagesDir, { recursive: true });
  }

  // 초기 고아 이미지 정리
  console.log('DOMContentLoaded: Initial cleanup triggered.');
  orphanedImageManager.cleanupOrphanedImages();

  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const titlebar = document.getElementById('titlebar');
  const openListBtn = document.getElementById('open-list');
  const viewToggleBtn = document.getElementById('view-toggle');
  const onlyToggleBtn = document.getElementById('only-toggle');
  const newNoteBtn = document.getElementById('new-note');

  let viewMode = 'only';
  let onlyTarget = 'preview';
  let saveTimeout = null;

  // 체크박스 클릭 이벤트 리스너 (이벤트 위임)
  preview.addEventListener('change', (event) => {
    checkboxManager.handleCheckboxChange(event, editor, preview, currentPath);
  });

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

  ipcRenderer.on('load-note', async (event, notePath, isNew) => {
    currentPath = notePath;
    if (isNew) {
      viewMode = 'both';
    }
    if (currentPath && fs.existsSync(currentPath)) {
      let content = fs.readFileSync(currentPath, 'utf-8');
      // 기존 app-asset:/// 링크를 file:// 링크로 변환
      content = await convertAppAssetLinks(content);
      editor.value = content;
      preview.innerHTML = renderMathInMarkdown(content);
      
      // 변환된 내용이 있다면 파일에 저장
      if (content !== fs.readFileSync(currentPath, 'utf-8')) {
        fs.writeFile(currentPath, content, () => {});
      }
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
    
    // 자동 저장 (1초 디바운스)
    if (currentPath) {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      saveTimeout = setTimeout(() => {
        fs.writeFile(currentPath, String(text), () => {});
      }, 1000);
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
    if (e.key === 'Enter') {
      const text = editor.value;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const before = text.slice(0, start);
      const after = text.slice(end);
      const lines = before.split('\n');
      const currentLine = lines[lines.length - 1];
      
      // 글머리기호 연속 처리
      const bulletMatch = currentLine.match(/^(\s*[-*+]\s)/);
      const numberMatch = currentLine.match(/^(\s*\d+\.\s)/);
      
      if (bulletMatch || numberMatch) {
        e.preventDefault();
        const bullet = bulletMatch ? bulletMatch[1] : numberMatch[1];
        
        // 현재 줄이 글머리기호만 있는 경우 (내용이 없는 경우)
        if (currentLine.trim() === bullet.trim()) {
          // 글머리기호를 제거하고 새 줄 추가
          const newText = before.slice(0, -currentLine.length) + '\n' + after;
          editor.value = newText;
          editor.selectionStart = editor.selectionEnd = start - currentLine.length;
        } else {
          // 일반적인 경우: 다음 줄에 글머리기호 추가
          let nextBullet = bullet;
          if (numberMatch) {
            // 숫자 목록인 경우 다음 숫자로 증가
            const currentNumber = parseInt(numberMatch[1]);
            const indent = numberMatch[1].match(/^(\s*)/)[0];
            nextBullet = `${indent}${currentNumber + 1}. `;
          }
          const newText = before + '\n' + nextBullet + after;
          editor.value = newText;
          editor.selectionStart = editor.selectionEnd = start + nextBullet.length + 1;
        }
        preview.innerHTML = renderMathInMarkdown(editor.value);
        return;
      }
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
  
  // 이미지 붙여넣기 이벤트 리스너 추가
  editor.addEventListener('paste', handleImagePaste);

  // 초기 테마 설정
  ipcRenderer.on('set-initial-theme', (event, theme) => {
    applyTheme(theme);
  });

  // 테마 변경 이벤트 수신
  ipcRenderer.on('theme-changed', (event, theme) => {
    applyTheme(theme);
  });
});
