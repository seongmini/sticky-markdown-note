const marked = require('marked');
const fs = require('fs');

class CheckboxManager {
  constructor() {
    this.renderer = new marked.Renderer();
    this.renderer.checkbox = (checked) => {
      return `<input type="checkbox" ${checked ? 'checked' : ''}>`;
    };
  }

  // Convert markdown to checkbox HTML
  renderCheckboxes(markdown) {
    return marked.parse(markdown, { renderer: this.renderer });
  }

  // Partial update when checkbox state changes
  updateCheckboxState(checkbox, editor, preview) {
    const checkboxes = Array.from(preview.querySelectorAll('input[type="checkbox"]'));
    const idx = checkboxes.indexOf(checkbox);
    if (idx === -1) return;

    const text = editor.value;
    const lines = text.split('\n');
    let checkboxLineIdx = -1;
    let found = 0;

    // Find the line of the changed checkbox
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

    // Update checkbox state
    const indent = lines[checkboxLineIdx].match(/^\s*/)[0];
    const newLine = lines[checkboxLineIdx].replace(
      /^\s*- \[[ x]\]/,
      `${indent}- [${checkbox.checked ? 'x' : ' '}]`
    );
    lines[checkboxLineIdx] = newLine;

    // Update editor and preview
    editor.value = lines.join('\n');
    
    // Manually trigger the editor's input event to update the preview.
    editor.dispatchEvent(new Event('input'));

    // Partial update: update only the checkbox element
    // const checkboxElement = checkboxes[idx];
    // checkboxElement.checked = checkbox.checked;

    return lines.join('\n');
  }

  handleCheckboxChange(event, editor, preview, currentPath) {
    if (event.target.type !== 'checkbox') return;

    const updatedContent = this.updateCheckboxState(event.target, editor, preview);
    
    // Save only if file is open
    if (currentPath && updatedContent) {
      fs.writeFile(currentPath, updatedContent, () => {});
    }
  }
}

module.exports = CheckboxManager; 