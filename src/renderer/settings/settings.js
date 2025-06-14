const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');

    // Initial theme setting based on stored preference or system setting
    ipcRenderer.invoke('get-current-theme').then(theme => {
        document.body.classList.toggle('dark-mode', theme === 'dark');
        themeToggle.textContent = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    });

    themeToggle.addEventListener('click', () => {
        ipcRenderer.invoke('toggle-theme').then(theme => {
            document.body.classList.toggle('dark-mode', theme === 'dark');
            themeToggle.textContent = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
        });
    });
}); 