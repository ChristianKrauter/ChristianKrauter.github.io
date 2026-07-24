// Mobile hamburger menu. Only relevant below the tablet breakpoint (see
// .navToggle/nav ul in style.css) — at wider widths the toggle is hidden and
// the nav is always shown, so this just no-ops there.
function toggleNav() {
  const nav = document.getElementById('siteNav')
  const button = document.querySelector('.navToggle')
  const isOpen = nav.classList.toggle('navOpen')
  button.setAttribute('aria-expanded', String(isOpen))
  button.querySelector('i').className = isOpen ? 'fas fa-xmark' : 'fas fa-bars'
  // the menu covers the full screen, so lock background scrolling while open
  document.body.style.overflow = isOpen ? 'hidden' : ''
}

function closeNav() {
  const nav = document.getElementById('siteNav')
  if (!nav.classList.contains('navOpen')) return
  nav.classList.remove('navOpen')
  document.querySelector('.navToggle').setAttribute('aria-expanded', 'false')
  document.querySelector('.navToggle i').className = 'fas fa-bars'
  document.body.style.overflow = ''
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('#siteNav') && !event.target.closest('.navToggle')) closeNav()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeNav()
})
