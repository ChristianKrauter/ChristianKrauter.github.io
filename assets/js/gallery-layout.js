// Justified-row layout: photos are grouped into rows, each scaled so the
// row's photos fill the container width at a shared height. Unlike a
// column layout, this never crops a photo - only its displayed size changes.
const GALLERY_TARGET_ROW_HEIGHT = 320
const GALLERY_GAP = 14
// how far a leftover row can stretch before folding into the previous row
const GALLERY_MAX_LAST_ROW_SCALE = 1.4
// matches style.css's phone/tablet breakpoint - below it, one photo per row
const GALLERY_MOBILE_BREAKPOINT = 720

function layoutGallery() {
  const gallery = document.querySelector('.gallery')
  if (!gallery) return

  const items = [...document.querySelectorAll('.galleryItem')]
  if (items.length === 0) return

  const containerWidth = gallery.clientWidth
  const isMobile = containerWidth < GALLERY_MOBILE_BREAKPOINT

  // fill each row until it reaches the container width at the target
  // height; on mobile every photo gets its own row
  const rows = []
  let currentRow = []
  let currentRowWidth = 0

  items.forEach(item => {
    const aspect = parseFloat(item.dataset.aspect)
    const widthAtTargetHeight = GALLERY_TARGET_ROW_HEIGHT * aspect

    currentRow.push({ item, widthAtTargetHeight })
    currentRowWidth += widthAtTargetHeight

    const gapsWidth = (currentRow.length - 1) * GALLERY_GAP
    if (isMobile || currentRowWidth + gapsWidth >= containerWidth) {
      rows.push(currentRow)
      currentRow = []
      currentRowWidth = 0
    }
  })
  if (currentRow.length > 0) {
    const gapsWidth = (currentRow.length - 1) * GALLERY_GAP
    const naturalWidth = currentRow.reduce((sum, r) => sum + r.widthAtTargetHeight, 0)
    const scale = (containerWidth - gapsWidth) / naturalWidth

    // fold an excessively-stretched leftover row into the previous one - a
    // moderate stretch is fine and looks intentional
    if (rows.length > 0 && !isMobile && scale > GALLERY_MAX_LAST_ROW_SCALE) {
      rows[rows.length - 1].push(...currentRow)
    } else {
      rows.push(currentRow)
    }
  }

  let top = 0
  rows.forEach(row => {
    const gapsWidth = (row.length - 1) * GALLERY_GAP
    const naturalWidth = row.reduce((sum, r) => sum + r.widthAtTargetHeight, 0)
    const scale = (containerWidth - gapsWidth) / naturalWidth
    const rowHeight = GALLERY_TARGET_ROW_HEIGHT * scale

    let left = 0
    row.forEach(({ item, widthAtTargetHeight }) => {
      const width = widthAtTargetHeight * scale
      item.style.width = `${width}px`
      item.style.height = `${rowHeight}px`
      item.style.left = `${left}px`
      item.style.top = `${top}px`
      left += width + GALLERY_GAP
    })

    top += rowHeight + GALLERY_GAP
  })

  gallery.style.height = `${Math.max(0, top - GALLERY_GAP)}px`
}

let resizeTimer
function scheduleGalleryLayout() {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(layoutGallery, 100)
}

layoutGallery()
window.addEventListener('resize', scheduleGalleryLayout)
