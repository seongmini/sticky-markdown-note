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
let userImagesDir = null; // User image save path
let appRootPath = null; // Variable to store the app root path

let shortcuts = {};

// Load shortcuts
ipcRenderer.invoke('get-shortcuts').then(savedShortcuts => {
    shortcuts = savedShortcuts;
});

// Listen for shortcut updates
ipcRenderer.on('shortcuts-updated', (event, newShortcuts) => {
    shortcuts = newShortcuts;
});

// Listen for theme changes from the main process
ipcRenderer.on('theme-changed', (event, theme) => {
  applyTheme(theme);
});

// Helper function to check if a key combination matches a shortcut
function matchesShortcut(e, shortcut) {
    const isMac = process.platform === 'darwin';
    const modifierKey = isMac ? e.metaKey : e.ctrlKey;
    
    // Check modifiers
    if (shortcut.modifiers.includes('ctrl') && !modifierKey) return false;
    if (shortcut.modifiers.includes('shift') && !e.shiftKey) return false;
    if (shortcut.modifiers.includes('alt') && !e.altKey) return false;
    
    // Check key
    return e.key.toLowerCase() === shortcut.key;
}

// Orphaned image management
class OrphanedImageManager {
  constructor() {
    // 1 hour in milliseconds - this condition is no longer used.
  }

  // Check if an image file is in use
  isImageInUse(markdownImagePath) {
    if (!userImagesDir) return false; // Cannot check if userImagesDir is not set
    
    // Use the base directory where all notes are stored
    const notesRootPath = path.dirname(userImagesDir);
    if (!fs.existsSync(notesRootPath)) return false;

    // Function to recursively find all .md files
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

    // Normalize path string by removing 'file:///' prefix and unifying backslashes to forward slashes
    // Example: file:///C:/Users/User/AppData/Roaming/Sticky%20Markdown%20Note/notes/images/my%20image%20[1].png
    // -> C:/Users/User/AppData/Roaming/Sticky%20Markdown%20Note/notes/images/my%20image%20[1].png
    const normalizedRawPath = markdownImagePath.replace(/^file:\/\/\/?/, '').replace(/\\/g, '/');

    // Generate all possible markdown link forms to create regex patterns.
    const possiblePathPatterns = [];

    // 1. Original path with spaces (raw path)
    possiblePathPatterns.push(escapeRegExp(normalizedRawPath));

    // 2. Path with spaces encoded as %20
    possiblePathPatterns.push(escapeRegExp(normalizedRawPath.replace(/ /g, '%20')));

    // 3. Path encoded with encodeURI (commonly used)
    // Note: encodeURI does not encode all special characters (e.g., [ ]).
    try {
      possiblePathPatterns.push(escapeRegExp(encodeURI(normalizedRawPath)));
    } catch (e) {
      console.error("Error encoding URI for path:", normalizedRawPath, e);
    }

    // 4. Path encoded with encodePathSpecialChars (additional handling for brackets, etc.)
    possiblePathPatterns.push(escapeRegExp(encodePathSpecialChars(normalizedRawPath)));
    
    // Add 'file:///' and 'file://' prefixes to each pattern to create final patterns
    const finalRegexPatterns = [];
    for (const pattern of possiblePathPatterns) {
      // file:/// prefix
      finalRegexPatterns.push(`file:\/\/\/?${pattern}`);
      // file:// prefix (for cases where it might sometimes occur)
      finalRegexPatterns.push(`file:\/\/${pattern}`);
    }

    // Combine all patterns with OR (|) to create the final regex
    const fullRegex = new RegExp(
      `(?:${finalRegexPatterns.join('|')})`,
      'gi' // Global and case-insensitive
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

  // Clean up orphaned images
  cleanupOrphanedImages() {
    if (!userImagesDir || !fs.existsSync(userImagesDir)) return;

    const images = fs.readdirSync(userImagesDir)
      .filter(file => /\.(png|jpg|jpeg|gif|webp)$/i.test(file));

    for (const image of images) {
      const imagePath = path.join(userImagesDir, image);
      try {
        // Create markdown image link (using file:// protocol and absolute path)
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

// Orphaned image manager instance
const orphanedImageManager = new OrphanedImageManager();

// Helper function to escape special characters in a regex
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the matched substring
}

// Helper function to encode specific special characters in a URL path
// (encodeURI does not encode some characters, so handle manually)
function encodePathSpecialChars(pathStr) {
  return pathStr
    .replace(/ /g, '%20') // Spaces
    .replace(/\(/g, '%28') // Opening parenthesis
    .replace(/\)/g, '%29') // Closing parenthesis
    .replace(/\[/g, '%5B') // Opening square bracket
    .replace(/\]/g, '%5D') // Closing square bracket
    .replace(/\+/g, '%2B') // Plus sign
    .replace(/\#/g, '%23') // Hash symbol
    .replace(/\?/g, '%3F') // Question mark
    .replace(/\&/g, '%26'); // Ampersand
}

// Function to convert app-asset:/// links to file:// links
async function convertAppAssetLinks(content) {
  if (!content) return content;
  
  // Find app-asset:/// links and convert them to file:// links
  return content.replace(/!\[([^\]]*)\]\(app-asset:\/\/\/([^)]+)\)/g, (match, alt, assetPath) => {
    // Extract actual file path from app-asset path
    const imagePath = path.join(appRootPath, assetPath);
    // Convert to file:// protocol and absolute path
    const filePath = `file:///${imagePath.replace(/\\/g, '/')}`;
    return `![${alt}](${filePath})`;
  });
}

// Handle image paste
async function handleImagePaste(event) {
  const items = event.clipboardData.items;
  
  for (const item of items) {
    if (item.type.indexOf('image') === 0) {
      event.preventDefault();
      
      const file = item.getAsFile();
      const buffer = await file.arrayBuffer();
      const imageBuffer = Buffer.from(buffer);
      
      // Generate image filename (timestamp + random string)
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 8);
      const ext = file.type.split('/')[1];
      const filename = `${timestamp}-${random}.${ext}`;
      const imagePath = path.join(userImagesDir, filename);
      
      // Save image
      fs.writeFileSync(imagePath, imageBuffer);
      
      // Create markdown image link (using file:// protocol and absolute path)
      const absoluteImagePath = `file:///${imagePath.replace(/\\/g, '/')}`;
      const imageMarkdown = `![${filename}](${absoluteImagePath})`;
      
      // Insert image link into editor
      const editor = document.getElementById('editor');
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const text = editor.value;
      editor.value = text.slice(0, start) + imageMarkdown + text.slice(end);
      editor.selectionStart = editor.selectionEnd = start + imageMarkdown.length;
      
      // Update preview
      const preview = document.getElementById('preview');
      preview.innerHTML = renderMathInMarkdown(editor.value);
      
      // Save file
      if (currentPath) {
        fs.writeFile(currentPath, String(editor.value), () => {
          // Image added, so clean up orphaned images
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

// Create global renderer instance
const checkboxManager = new CheckboxManager();

// Function to check if markdown contains math expressions
function hasMathExpression(markdown) {
  return /\$(.+?)\$/.test(markdown);
}

function renderMathInMarkdown(markdown) {
  // Render checkboxes
  let html = checkboxManager.renderCheckboxes(markdown);
  
  // Render math expressions only if they exist
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
  
  // Insert text at cursor position
  const newText = text.slice(0, start) + before + selected + after + text.slice(end);
  editor.value = newText;
  
  // Update preview
  preview.innerHTML = renderMathInMarkdown(editor.value);
  
  // Focus editor and set cursor position
  editor.focus();
  const newPosition = start + before.length;
  editor.selectionStart = newPosition;
  editor.selectionEnd = newPosition;
  
  // Force cursor position update
  setTimeout(() => {
    editor.selectionStart = newPosition;
    editor.selectionEnd = newPosition;
  }, 0);
}

// Loading indicator control functions
function showLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'flex';
    }
}

function hideLoadingIndicator() {
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Set initial theme
  ipcRenderer.invoke('get-current-theme').then(theme => {
      applyTheme(theme);
  });

  // Get app root path
  appRootPath = await ipcRenderer.invoke('get-app-path');
  
  const userDataPath = await ipcRenderer.invoke('get-user-data-path');
  const settingsPath = path.join(userDataPath, 'settings.json');

  // Set user image save path and create folder
  userImagesDir = path.join(userDataPath, 'notes', 'images');
  if (!fs.existsSync(userImagesDir)) {
    fs.mkdirSync(userImagesDir, { recursive: true });
  }

  // Initial orphaned image cleanup
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

  // Checkbox click event listener (event delegation)
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
    // Ignore if settings file does not exist or is malformed
  }

  editor.style.fontSize = `${currentFontSize}px`;
  preview.style.fontSize = `${currentFontSize}px`;

  ipcRenderer.on('load-note', async (event, notePath, isNew) => {
    currentPath = notePath;
    if (isNew) {
      viewMode = 'both';
    }

    showLoadingIndicator(); // Show loading indicator before reading file

    try {
      if (currentPath && fs.existsSync(currentPath)) {
        const content = await new Promise((resolve, reject) => {
          fs.readFile(currentPath, 'utf-8', (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        });
        
        // Convert existing app-asset:/// links to file:// links
        const convertedContent = await convertAppAssetLinks(content);
        editor.value = convertedContent;
        preview.innerHTML = renderMathInMarkdown(convertedContent);
        
        // If content was converted, save to file
        if (convertedContent !== content) {
          await new Promise((resolve, reject) => {
            fs.writeFile(currentPath, convertedContent, (err) => {
              if (err) reject(err);
              else resolve();
            });
          });
        }
      }
    } catch (error) {
      console.error('Error loading note:', error);
      editor.value = '';
      preview.innerHTML = '';
    } finally {
      hideLoadingIndicator(); // Hide loading indicator after everything is done
      updateView();
    }
  });

  // Window focus/blur event handlers
  ipcRenderer.on('window-focused', () => {
    const titlebar = document.getElementById('titlebar');
    if (titlebar) {
      titlebar.style.display = 'flex';
    }
  });

  ipcRenderer.on('window-blurred', () => {
    const titlebar = document.getElementById('titlebar');
    if (titlebar) {
      titlebar.style.display = 'none';
    }
  });

  editor.addEventListener('input', () => {
    const text = editor.value;
    preview.innerHTML = renderMathInMarkdown(text);
    
    // Auto-save (1-second debounce)
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

    // Check for custom shortcuts
    for (const [action, shortcut] of Object.entries(shortcuts)) {
        if (matchesShortcut(e, shortcut)) {
            // Stop all event propagation
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            // Execute the action
            switch (action) {
                case 'preview':
                    viewMode = 'both';
                    updateView();
                    break;
                case 'toggle-view':
                    if (viewMode === 'both' || onlyTarget === 'preview') {
                        onlyTarget = 'editor';
                    } else {
                        onlyTarget = 'preview';
                    }
                    viewMode = 'only';
                    updateView();
                    break;
                case 'open-main':
                    ipcRenderer.send('open-main-window');
                    break;
                case 'new-note':
                    ipcRenderer.send('create-new-note-nearby');
                    break;
                case 'bold':
                    if (editorIsFocused) {
                        const newText = text.slice(0, start) + '**' + selected + '**' + text.slice(end);
                        editor.value = newText;
                        preview.innerHTML = renderMathInMarkdown(newText);
                        editor.focus();
                        editor.selectionStart = editor.selectionEnd = start + 2;
                    }
                    break;
                case 'italic':
                    if (editorIsFocused) {
                        const newText = text.slice(0, start) + '*' + selected + '*' + text.slice(end);
                        editor.value = newText;
                        preview.innerHTML = renderMathInMarkdown(newText);
                        editor.focus();
                        editor.selectionStart = editor.selectionEnd = start + 1;
                    }
                    break;
                case 'inline-code':
                    if (editorIsFocused) {
                        const newText = text.slice(0, start) + '`' + selected + '`' + text.slice(end);
                        editor.value = newText;
                        preview.innerHTML = renderMathInMarkdown(newText);
                        editor.focus();
                        editor.selectionStart = editor.selectionEnd = start + 1;
                    }
                    break;
                case 'code-block':
                    if (editorIsFocused) {
                        const newText = text.slice(0, start) + '\n```\n' + selected + '\n```' + text.slice(end);
                        editor.value = newText;
                        preview.innerHTML = renderMathInMarkdown(newText);
                        editor.focus();
                        editor.selectionStart = editor.selectionEnd = start + 5;
                    }
                    break;
                case 'quote':
                    if (editorIsFocused) {
                        const quote = selected
                            ? selected
                                .split('\n')
                                .map(line => '> ' + line)
                                .join('\n')
                            : '> ';
                        const newText = text.slice(0, start) + quote + text.slice(end);
                        editor.value = newText;
                        preview.innerHTML = renderMathInMarkdown(newText);
                        editor.focus();
                        editor.selectionStart = editor.selectionEnd = start + quote.length;
                    }
                    break;
                case 'heading':
                    if (editorIsFocused && !e.shiftKey) {
                        const heading = selected
                            ? selected
                                .split('\n')
                                .map(line => '# ' + line)
                                .join('\n')
                            : '# ';
                        const newText = text.slice(0, start) + heading + text.slice(end);
                        editor.value = newText;
                        preview.innerHTML = renderMathInMarkdown(newText);
                        editor.focus();
                        editor.selectionStart = editor.selectionEnd = start + heading.length;
                    }
                    break;
                case 'strikethrough':
                    if (editorIsFocused && e.shiftKey) {
                        const newText = text.slice(0, start) + '~~' + selected + '~~' + text.slice(end);
                        editor.value = newText;
                        preview.innerHTML = renderMathInMarkdown(newText);
                        editor.focus();
                        editor.selectionStart = editor.selectionEnd = start + 2;
                    }
                    break;
            }
            return;
        }
    }

    // Handle Tab key for indentation
    if (!editorIsFocused) return;
    if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const text = editor.value;
        
        // Get the current line
        const before = text.slice(0, start);
        const after = text.slice(end);
        const currentLineStart = before.lastIndexOf('\n') + 1;
        const currentLineEnd = after.indexOf('\n') === -1 ? text.length : end + after.indexOf('\n');
        const currentLine = text.slice(currentLineStart, currentLineEnd);
        
        // Check if we're in a list item
        const isListItem = /^(\s*)([-*+]\s|\d+\.\s)/.test(currentLine);
        
        let newText;
        if (e.shiftKey) {
            // Unindent
            if (isListItem) {
                const match = currentLine.match(/^(\s*)([-*+]\s|\d+\.\s)(.*)/);
                if (match) {
                    const [, indent, bullet, content] = match;
                    const newIndent = indent.length >= 4 ? indent.slice(4) : '';
                    newText = text.slice(0, currentLineStart) + newIndent + bullet + content + text.slice(currentLineEnd);
                    editor.value = newText;
                    editor.selectionStart = editor.selectionEnd = start - 4;
                }
            } else {
                const lines = text.slice(start, end).split('\n');
                newText = lines
                    .map(line => {
                        if (line.startsWith('    ')) {
                            return line.slice(4);
                        } else if (line.startsWith('\t')) {
                            return line.slice(1);
                        }
                        return line;
                    })
                    .join('\n');
                editor.value = before + newText + after;
                if (start === end) {
                    editor.selectionStart = editor.selectionEnd = start - 4;
                } else {
                    editor.selectionStart = start;
                    editor.selectionEnd = start + newText.length;
                }
            }
        } else {
            // Indent
            if (isListItem) {
                const match = currentLine.match(/^(\s*)([-*+]\s|\d+\.\s)(.*)/);
                if (match) {
                    const [, indent, bullet, content] = match;
                    newText = text.slice(0, currentLineStart) + indent + '    ' + bullet + content + text.slice(currentLineEnd);
                    editor.value = newText;
                    editor.selectionStart = editor.selectionEnd = start + 4;
                }
            } else {
                const lines = text.slice(start, end).split('\n');
                newText = lines.map(line => '    ' + line).join('\n');
                editor.value = before + newText + after;
                if (start === end) {
                    editor.selectionStart = editor.selectionEnd = start + 4;
                } else {
                    editor.selectionStart = start;
                    editor.selectionEnd = start + newText.length;
                }
            }
        }
        
        editor.dispatchEvent(new Event('input'));
        return;
    }

    // Handle Enter key for lists
    if (e.key === 'Enter') {
        const text = editor.value;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const before = text.slice(0, start);
        const after = text.slice(end);
        const lines = before.split('\n');
        const currentLine = lines[lines.length - 1];
        
        // Handle consecutive bullet points
        const bulletMatch = currentLine.match(/^(\s*)([-*+]\s)/);
        const numberMatch = currentLine.match(/^(\s*)(\d+\.\s)/);
        
        if (bulletMatch || numberMatch) {
            e.preventDefault();
            const match = bulletMatch || numberMatch;
            const [, indent, bullet] = match;
            
            // If current line only contains a bullet point (no content)
            if (currentLine.trim() === bullet.trim()) {
                // If bullet point is indented, unindent it
                if (indent.length >= 4) {
                    const newIndent = indent.slice(4);
                    const newText = before.slice(0, -currentLine.length) + newIndent + bullet + '\n' + after;
                    editor.value = newText;
                    editor.selectionStart = editor.selectionEnd = start - 4;
                } else {
                    // Remove bullet point and add new line
                    const newText = before.slice(0, -currentLine.length) + '\n' + after;
                    editor.value = newText;
                    editor.selectionStart = editor.selectionEnd = start - currentLine.length;
                }
            } else {
                // Normal case: add bullet point to next line
                let nextBullet = bullet;
                if (numberMatch) {
                    // For numbered lists, increment to the next number
                    const currentNumber = parseInt(bullet);
                    nextBullet = `${indent}${currentNumber + 1}. `;
                } else {
                    nextBullet = `${indent}${bullet}`;
                }
                const newText = before + '\n' + nextBullet + after;
                editor.value = newText;
                editor.selectionStart = editor.selectionEnd = start + nextBullet.length + 1;
            }
            preview.innerHTML = renderMathInMarkdown(editor.value);
            return;
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
  
  // Add image paste event listener
  editor.addEventListener('paste', handleImagePaste);
});
