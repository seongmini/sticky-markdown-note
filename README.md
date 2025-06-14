# Sticky Markdown Note

A lightweight, always-on-top sticky note applicatoin with Markdown support, built with Electron. Save and manage your notes in Markdown format, complete with live preview, math rendering (KaTeX), themes, and session restore.

## Features

- **Persistent Notes**: Notes saved as `.md` files in your user data directory.
- **Live Preview**: Real-time Markdown rendering with KaTex math support.
- **Customizable Themes**: Toggle between light and dark modes via a dedicated settings window.
- **Autosave & Session Restore**: Automatically restores open notes on startup.
- **Search & Filter**: Quickly find notes by title or content.
- **Note List Sorting**: Notes are automatically sorted by their last modification date.
- **Window Memory**: Remembers last position and size of each note window.
- **Customizable Keyboard Shortcuts**: Personalize keybindings for various actions through the settings interface.
- **Automatic Updates**: App automatically checks for and installs updates from GitHub releases.
- **Cross-Platform**: Supports both Windows and macOS (macOS version is built but not tested).
- **Image Handling**: Paste images directly from clipboard, saved locally with automatic cleanup for orphaned images.
- **Interactive Checkboxes**: Click rendered checkboxes in preview to update markdown.

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (>=14)
- npm (comes with Node.js)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/seongmini/sticky-markdown-note.git
cd sticky-markdown

# Install dependencies
npm install

# Run in development mode
npm start
```

### Building for Windows
```bash
# Generate installer and unpacked app in the `dist` folder
npm run build:win
```

### Building for macOS
```bash
# Generate DMG installer and app bundle in the `dist` folder
npm run build:mac
```

After building, you'll find:

- **Windows**: 
  - **Sticky Note Setup.exe** ─ the installer
  - **win-unpacked/** ─ the portable executable folder
- **macOS**:
  - **Sticky Markdown.dmg** ─ the installer
  - **mac/** ─ the app bundle

> **Note**: While the macOS version is built and should work, it has not been thoroughly tested on macOS systems. Please report any issues you encounter.

## Usage

1. **Launch** the app. The **Memo List** window shows all your notes.
2. Click **➕ New note** or press the shortcut to create a new note.
3. Select a note in the list to open it in its own window.
4. Edit text on the left; preview appears on the right.
5. Use search or shortcuts to navigate and manage notes.
6. Access **Settings** from the Memo List window to customize themes and shortcuts.

## Configuration

You can customize default font sizes and theme via a `.env` file in your user data path:

```dotenv
FONT_SIZE_DEFAULT=16
FONT_SIZE_MIN=8
FONT_SIZE_MAX=40
THEME=LIGHT # or dark
```

## Keyboard Shortcuts

### Global (any window)

| Shortcut   | Action                                                    |
| ---------- | --------------------------------------------------------- |
| **Ctrl+P** / **Cmd+P** | Switch to **Both** view mode                              |
| **Ctrl+O** / **Cmd+O** | Toggle between **Editor Only** and **Preview Only** modes |
| **Ctrl+M** / **Cmd+M** | Open the **Memo List** window                             |
| **Ctrl+N** / **Cmd+N** | Create a **New Note**                                     |

### In Note Editor Window

| Shortcut               | Action                                   |
| ---------------------- | ---------------------------------------- |
| **Ctrl+B** / **Cmd+B** | **Bold** formatting (`**text**`)         |
| **Ctrl+I** / **Cmd+I** | *Italic* formatting (`*text*`)           |
| **Ctrl+\`** / **Cmd+\`** | Inline `code` formatting                 |
| **Ctrl+K** / **Cmd+K** | Insert code block (`\n code \n`)         |
| **Ctrl+Q** / **Cmd+Q** | Blockquote (`> `)                        |
| **Ctrl+H** / **Cmd+H** | Heading (`# `)                           |
| **Ctrl+Shift+S** / **Cmd+Shift+S** | ~~Strikethrough~~ (`~~text~~`)           |
| **Ctrl+L** / **Cmd+L** | Create or edit **Link** (`[text](url)`)  |
| **Ctrl+Shift+L** / **Cmd+Shift+L** | Bullet list (`- item`)                   |
| **Ctrl+Shift+O** / **Cmd+Shift+O** | Numbered list (`1. item`)                |
| **Ctrl+Shift+C** / **Cmd+Shift+C** | Toggle task checkbox (`- [ ]` / `- [x]`) |
| **Tab**                | Indent line(s)                           |
| **Shift+Tab**          | Outdent line(s)                          |
| **Ctrl/Cmd + Mouse Wheel** | Increase / decrease font size            |

### In Memo List Window

| Shortcut               | Action                     |
| ---------------------- | -------------------------- |
| **Ctrl+N** / **Cmd+N** | Create a **New Note**      |
| **Ctrl+F** / **Cmd+F** | Focus the **Search** input |

## Support

If you find this app useful, consider supporting its development:

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/notemad)

### License

This project is licensed under the [MIT License](LICENSE).
