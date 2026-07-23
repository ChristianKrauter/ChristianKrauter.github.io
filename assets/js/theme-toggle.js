// Flips the theme, persists the choice, and updates the toggle button.
// The initial theme itself is set by an inline script in <head> (before this
// file loads) to avoid a flash of the wrong theme on page load.
function toggleTheme() {
  const html = document.documentElement
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  html.setAttribute('data-theme', next)
  localStorage.setItem('theme', next)
  syncThemeToggleButton(next)
}

function syncThemeToggleButton(theme) {
  const button = document.querySelector('.themeToggle')
  if (!button) return
  const icon = button.querySelector('i')
  if (theme === 'dark') {
    icon.className = 'fas fa-sun'
    button.setAttribute('aria-label', 'Switch to light mode')
  } else {
    icon.className = 'fas fa-moon'
    button.setAttribute('aria-label', 'Switch to dark mode')
  }
}

// The button is rendered assuming light mode by default; correct it here in
// case the inline bootstrap script actually picked dark mode
syncThemeToggleButton(document.documentElement.getAttribute('data-theme'))
