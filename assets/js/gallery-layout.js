// Justified-row layout: photos are grouped into rows, each scaled so the
// row's photos fill the container width at a shared height. Unlike a
// column layout, this never crops a photo - only its displayed size changes.
const GALLERY_TARGET_ROW_HEIGHT = 320
// below this, a row closes early (leaving its last item for the next row)
// instead of shrinking further - otherwise rows packed with portrait photos
// can squeeze in one more image and end up much shorter than the target
const GALLERY_MIN_ROW_HEIGHT = 260
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

    // would adding this item shrink the row below the minimum height? close
    // the row now (without it) instead - a row that isn't full yet always
    // scales up to at least the target height
    if (!isMobile && currentRow.length > 0) {
      const prospectiveGapsWidth = currentRow.length * GALLERY_GAP
      const prospectiveWidth = currentRowWidth + widthAtTargetHeight
      const prospectiveScale = (containerWidth - prospectiveGapsWidth) / prospectiveWidth
      if (prospectiveScale * GALLERY_TARGET_ROW_HEIGHT < GALLERY_MIN_ROW_HEIGHT) {
        rows.push(currentRow)
        currentRow = []
        currentRowWidth = 0
      }
    }

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
    if (isMobile || rows.length === 0) {
      rows.push(currentRow)
    } else {
      // the leftover row is too small to fill the width on its own. Rather
      // than always folding it whole into the previous row - which can push
      // that row below the minimum height - try a few ways to split the
      // last two rows and keep whichever is least bad (stays in bounds, or
      // misses by the smallest amount)
      const prevRow = rows[rows.length - 1]

      const rowHeight = row => {
        const gapsWidth = (row.length - 1) * GALLERY_GAP
        const naturalWidth = row.reduce((sum, r) => sum + r.widthAtTargetHeight, 0)
        return GALLERY_TARGET_ROW_HEIGHT * (containerWidth - gapsWidth) / naturalWidth
      }
      const maxRowHeight = GALLERY_TARGET_ROW_HEIGHT * GALLERY_MAX_LAST_ROW_SCALE
      const badness = height => height < GALLERY_MIN_ROW_HEIGHT
        ? GALLERY_MIN_ROW_HEIGHT - height
        : Math.max(0, height - maxRowHeight)

      const candidates = [
        // leave them as two separate rows
        { split: [prevRow, currentRow], score: badness(rowHeight(prevRow)) + badness(rowHeight(currentRow)) },
        // fold the leftover entirely into the previous row
        { split: [[...prevRow, ...currentRow]], score: badness(rowHeight([...prevRow, ...currentRow])) },
      ]
      if (prevRow.length > 1) {
        // move the last photo of the previous row into the leftover row,
        // balancing both instead of leaving one full and one half-empty
        const shrunkPrevRow = prevRow.slice(0, -1)
        const grownCurrentRow = [prevRow[prevRow.length - 1], ...currentRow]
        candidates.push({
          split: [shrunkPrevRow, grownCurrentRow],
          score: badness(rowHeight(shrunkPrevRow)) + badness(rowHeight(grownCurrentRow)),
        })
      }

      const best = candidates.reduce((a, b) => (b.score < a.score ? b : a))
      rows[rows.length - 1] = best.split[0]
      if (best.split[1]) rows.push(best.split[1])
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
