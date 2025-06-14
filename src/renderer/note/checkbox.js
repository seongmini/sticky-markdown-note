const marked = require('marked');
const fs = require('fs');

class CheckboxManager {
  constructor() {
    this.renderer = new marked.Renderer();
    this.renderer.checkbox = (checked) => {
      return `<input type="checkbox" ${checked ? 'checked' : ''}>`;
    };
  }

  // 마크다운에서 체크박스 HTML로 변환
  renderCheckboxes(markdown) {
    return marked.parse(markdown, { renderer: this.renderer });
  }

  // 체크박스 상태 변경 시 부분 업데이트
  updateCheckboxState(checkbox, editor, preview) {
    const checkboxes = Array.from(preview.querySelectorAll('input[type="checkbox"]'));
    const idx = checkboxes.indexOf(checkbox);
    if (idx === -1) return;

    const text = editor.value;
    const lines = text.split('\n');
    let checkboxLineIdx = -1;
    let found = 0;

    // 변경된 체크박스의 라인 찾기
    for (let i = 0; i < lines.length; i++) {
      if (/^\s*- \[[ x]\]/.test(lines[i])) {
        if (found === idx) {
          checkboxLineIdx = i;
          break;
        }
        found++;
      }
    }
    if (checkboxLineIdx === -1) return;

    // 체크박스 상태 업데이트
    const indent = lines[checkboxLineIdx].match(/^\s*/)[0];
    const newLine = lines[checkboxLineIdx].replace(
      /^\s*- \[[ x]\]/,
      `${indent}- [${checkbox.checked ? 'x' : ' '}]`
    );
    lines[checkboxLineIdx] = newLine;

    // 에디터와 프리뷰 업데이트
    editor.value = lines.join('\n');
    
    // 부분 업데이트: 체크박스 요소만 업데이트
    const checkboxElement = checkboxes[idx];
    checkboxElement.checked = checkbox.checked;

    return lines.join('\n');
  }

  handleCheckboxChange(event, editor, preview, currentPath) {
    if (event.target.type !== 'checkbox') return;

    const updatedContent = this.updateCheckboxState(event.target, editor, preview);
    
    // 파일이 열려있는 경우에만 저장
    if (currentPath && updatedContent) {
      fs.writeFile(currentPath, updatedContent, () => {});
    }
  }
}

module.exports = CheckboxManager; 