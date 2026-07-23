// Copies the BibTeX text from the textarea right before the clicked button.
// The button right after it is a role="status" region announced to screen
// readers, since changing the button's own text isn't reliably announced.
function copyBibtexText(button) {
  const textarea = button.previousElementSibling
  const status = button.nextElementSibling
  const original = button.textContent

  function showCopied() {
    button.textContent = 'Copied!'
    status.textContent = 'Copied to clipboard'
    setTimeout(() => {
      button.textContent = original
      status.textContent = ''
    }, 1500)
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(textarea.value).then(showCopied, () => fallbackCopy(textarea, showCopied))
  } else {
    fallbackCopy(textarea, showCopied)
  }
}

// Fallback for browsers/contexts without the Clipboard API (e.g. local file:// testing).
// Selects the text so the copy at least succeeds via execCommand or manual Ctrl+C.
function fallbackCopy(textarea, onSuccess) {
  textarea.select()
  try {
    if (document.execCommand('copy')) {
      onSuccess()
    }
  } catch (error) {
    // selection remains so the user can still copy manually
  }
}
