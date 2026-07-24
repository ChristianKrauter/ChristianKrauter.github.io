// Native <dialog> handles the backdrop, focus, and Escape; only
// backdrop-click-to-close needs wiring up below.
function openLightbox(src, alt) {
  const image = document.getElementById('lightboxImage')
  image.src = src
  image.alt = alt
  document.getElementById('lightbox').showModal()
}

function closeLightbox() {
  document.getElementById('lightbox').close()
}

// A click on the <dialog> itself (not the image/button inside it) is a
// backdrop click.
document.getElementById('lightbox').addEventListener('click', (event) => {
  if (event.target.id === 'lightbox') closeLightbox()
})
