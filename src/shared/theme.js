// theme.js

function getInitialTheme() {
  return localStorage.getItem('theme') || 'light';
}

function applyTheme(theme) {
  document.body.classList.remove('light-theme', 'dark-theme');
  document.body.classList.add(theme === 'dark' ? 'dark-theme' : 'light-theme');
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const current = localStorage.getItem('theme') || process.env.THEME || 'light';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
}

module.exports = {
  getInitialTheme,
  applyTheme,
  toggleTheme,
};
