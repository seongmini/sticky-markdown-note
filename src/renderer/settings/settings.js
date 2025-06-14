const { ipcRenderer } = require('electron');

// Close button handler
document.getElementById('close-button').addEventListener('click', () => {
    window.close();
});

// Theme handling
const themeToggle = document.getElementById('theme-toggle');
let isDarkMode = false;

// Load current theme
ipcRenderer.invoke('get-current-theme').then(theme => {
    isDarkMode = theme === 'dark';
    document.body.classList.toggle('dark-mode', isDarkMode);
    updateThemeButtonText();
});

// Theme toggle button click handler
themeToggle.addEventListener('click', async () => {
    const newTheme = await ipcRenderer.invoke('toggle-theme');
    isDarkMode = newTheme === 'dark';
    document.body.classList.toggle('dark-mode', isDarkMode);
    updateThemeButtonText();
});

function updateThemeButtonText() {
    themeToggle.textContent = isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode';
}

// Shortcut handling
const defaultShortcuts = {
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
};

let currentShortcuts = { ...defaultShortcuts };
let isRecordingShortcut = false;
let currentRecordingElement = null;

// Load saved shortcuts
ipcRenderer.invoke('get-shortcuts').then(shortcuts => {
    if (shortcuts) {
        currentShortcuts = { ...defaultShortcuts, ...shortcuts };
        updateShortcutDisplay();
    }
});

// Update shortcut display
function updateShortcutDisplay() {
    document.querySelectorAll('.shortcut-input').forEach(input => {
        const shortcutId = input.dataset.shortcut;
        const shortcut = currentShortcuts[shortcutId];
        const display = formatShortcut(shortcut);
        input.querySelector('.current-shortcut').textContent = display;
    });
}

// Format shortcut for display
function formatShortcut(shortcut) {
    const isMac = process.platform === 'darwin';
    const modifierKey = isMac ? 'Cmd' : 'Ctrl';
    const modifiers = shortcut.modifiers.map(mod => {
        if (mod === 'ctrl') return modifierKey;
        if (mod === 'shift') return 'Shift';
        if (mod === 'alt') return 'Alt';
        return mod;
    });
    return [...modifiers, shortcut.key.toUpperCase()].join(' + ');
}

// Edit shortcut button click handler
document.querySelectorAll('.edit-shortcut').forEach(button => {
    button.addEventListener('click', () => {
        if (isRecordingShortcut) {
            stopRecording();
            return;
        }

        const shortcutInput = button.closest('.shortcut-input');
        startRecording(shortcutInput);
    });
});

// Start recording new shortcut
function startRecording(element) {
    isRecordingShortcut = true;
    currentRecordingElement = element;
    
    // Update UI to show recording state
    element.querySelector('.current-shortcut').textContent = 'Press keys...';
    element.querySelector('.edit-shortcut').textContent = 'Cancel';
    
    // Add recording class for visual feedback
    element.classList.add('recording');
}

// Stop recording shortcut
function stopRecording() {
    if (!isRecordingShortcut) return;
    
    isRecordingShortcut = false;
    currentRecordingElement.classList.remove('recording');
    currentRecordingElement.querySelector('.edit-shortcut').textContent = 'Edit';
    updateShortcutDisplay();
    currentRecordingElement = null;
}

// Global keydown handler for shortcut recording
document.addEventListener('keydown', e => {
    if (!isRecordingShortcut) return;
    
    e.preventDefault();
    
    const shortcutId = currentRecordingElement.dataset.shortcut;
    const modifiers = [];
    
    if (e.ctrlKey || e.metaKey) modifiers.push('ctrl');
    if (e.shiftKey) modifiers.push('shift');
    if (e.altKey) modifiers.push('alt');
    
    // Don't allow modifier-only shortcuts
    if (modifiers.length === 0) return;
    
    // Get the key, handling special cases
    let key = e.key.toLowerCase();
    if (key === 'control' || key === 'shift' || key === 'alt' || key === 'meta') return;
    
    // Update the shortcut
    currentShortcuts[shortcutId] = { key, modifiers };
    
    // Save shortcuts
    ipcRenderer.send('save-shortcuts', currentShortcuts);
    
    // Update display and stop recording
    updateShortcutDisplay();
    stopRecording();
});

// Handle escape key to cancel recording
document.addEventListener('keyup', e => {
    if (isRecordingShortcut && e.key === 'Escape') {
        stopRecording();
    }
}); 