import { readFileSync, readdirSync, existsSync, writeFileSync } from "fs";
import path from 'path'
import crypto from 'crypto'
import sharp from 'sharp'

if (process.argv.length < 4) {
  console.error('Usage: node watermark.js <dir> "<text>" [maxSize], e.g. node watermark.js assets/img/photos "© Chris Krauter" 1800')
  process.exit(1)
}

const directory = process.argv[2]
const text = process.argv[3]
const maxSize = process.argv[4] ? +process.argv[4] : undefined

await watermarkFolder(directory, text, maxSize)

function getHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex')
}

async function watermarkFolder(srcDir, text, maxSize) {
  const manifestPath = path.join(srcDir, 'watermark-manifest.json')

  let manifest = {}
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch (e) {
      console.warn("Malformed manifest found, resetting...")
    }
  }

  const files = readdirSync(srcDir)
  let manifestChanged = false

  for (const file of files) {
    if (!/\.(jpg|jpeg|png|webp)$/i.test(file)) continue

    const filePath = path.join(srcDir, file)
    const currentBuffer = readFileSync(filePath)
    const currentHash = getHash(currentBuffer)

    // Hash is of the already-processed file, so a match means it's done.
    // Resize+watermark happen in one pass under one manifest check - as two
    // separate steps, each one's write would invalidate the other's hash.
    if (manifest[file] === currentHash) {
      continue
    }

    try {
      console.log(`[watermarking] ${file}...`)

      // Bake EXIF orientation into the pixels first: metadata() still
      // reports pre-rotation dimensions otherwise, and the orientation tag
      // would be lost on save, turning sensor-side-up portraits sideways.
      let workingBuffer = await sharp(currentBuffer).rotate().toBuffer()

      if (maxSize) {
        const uprightMeta = await sharp(workingBuffer).metadata()
        // Cap whichever side is longer, so portraits aren't left oversized
        // just because their width was already under the limit
        if (Math.max(uprightMeta.width, uprightMeta.height) > maxSize) {
          const resizeOptions = uprightMeta.width >= uprightMeta.height ? { width: maxSize } : { height: maxSize }
          workingBuffer = await sharp(workingBuffer).resize(resizeOptions).toBuffer()
        }
      }

      const image = sharp(workingBuffer)
      const { width, height } = await image.metadata()

      const fontSize = Math.max(16, Math.min(80, Math.round(Math.min(width, height) * 0.022)))
      const padding = Math.round(fontSize * 0.6)

      const escapeXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

      const svg = `
        <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
          <text
            x="${width - padding}"
            y="${height - padding}"
            text-anchor="end"
            font-family="DejaVu Sans"
            font-size="${fontSize}"
            fill="rgba(255,255,255,0.75)"
            stroke="rgba(0,0,0,0.55)"
            stroke-width="${Math.max(1, Math.round(fontSize * 0.06))}"
            paint-order="stroke"
          >${escapeXml(text)}</text>
        </svg>
      `

      const outBuffer = await image
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .toBuffer()

      // Buffer write, not read+write through the same handle - safe to
      // overwrite the original in place.
      writeFileSync(filePath, outBuffer)

      manifest[file] = getHash(outBuffer)
      manifestChanged = true
    } catch (err) {
      console.error(`Failed to process ${file}:`, err)
    }
  }

  if (manifestChanged) {
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    console.log(`[Watermark] Manifest updated.`)
  }
}
