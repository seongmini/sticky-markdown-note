// list.js
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { getInitialTheme, applyTheme, toggleTheme } = require('./theme.js');

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
    let theme = getInitialTheme();
    applyTheme(theme);

    const container = document.getElementById('notes');
    const addButton = document.getElementById('add');
    const searchInput = document.getElementById('search');
    const themeToggleBtn = document.getElementById('theme-toggle');

    themeToggleBtn.addEventListener('click', toggleTheme);

    // 1. 메모 목록 로딩 함수 정의의
    function loadNotes() {
        container.innerHTML = ''; // 기존 목록 초기화

        fs.readdirSync(notesDir).forEach(file => {
            if (!file.endsWith('.md')) return;
        
            const fullPath = path.join(notesDir, file);
            const content = fs.readFileSync(fullPath, 'utf-8');
            const stats = fs.statSync(fullPath);

            // 검색어 필터링
            const lowerContent = content.toLowerCase();
            const lowerTitle = getNoteTitle(content).toLowerCase();
            if (
                currentSearch &&
                !lowerContent.includes(currentSearch) &&
                !lowerTitle.includes(currentSearch)
            ) {
                return; // 이 메모는 검색에 안 맞음
            }
        
            const div = document.createElement('div');
            div.className = 'note';
            div.innerHTML = `
                <div class="title">${getNoteTitle(content)}</div>
                <div class="time">${new Date(stats.mtime).toLocaleString()}</div>
            `;

            // 클릭 = 열기기
            div.addEventListener('click', () => {
                ipcRenderer.send('open-note', file);
            });
        
            // 우클릭 = 삭제 메뉴
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();

                // 이미 다른 delete 버튼이 있으면 제거
                document.querySelectorAll('.delete-btn').forEach(btn => btn.remove());

                const delBtn = document.createElement('button');
                delBtn.textContent = "Delete";
                delBtn.className = 'delete-btn';
                delBtn.style.position = 'absolute';
                delBtn.style.left = `${e.pageX}px`;
                delBtn.style.top = `${e.pageY}px`;
                delBtn.style.zIndex = '1000';
                delBtn.style.background = 'white';
                delBtn.style.border = '1px solid #888';
                delBtn.style.cursor = 'pointer';

                delBtn.addEventListener('click', () => {
                    ipcRenderer.send('delete-note', file);  // file은 예전부터 있던 변수
                    delBtn.remove();
                });

                document.body.appendChild(delBtn);

                // 다른 곳 클릭하면 삭제 버튼 숨기기
                window.addEventListener('click', () => delBtn.remove(), { once: true });
            });

            container.appendChild(div);
        });
    }

    // 2. 최초 실행 시 목록 불러오기
    loadNotes();

    // 3. 새 메모 버튼 이벤트
    addButton.addEventListener('click', () => {
        ipcRenderer.send('create-new-note');
    });

    // 4. 메모 추가되면 메인 프로세스에서 신호 받아 다시 로딩
    ipcRenderer.on('refresh-list', () => {
        loadNotes();
    })

    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.toLowerCase();
        loadNotes();
    });

    document.addEventListener('keydown', (e) => {
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