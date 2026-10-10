import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import subsetFont from 'subset-font'

// Regenerates assets/fonts/*.woff2 from the full Font Awesome Free /
// Academicons font files, keeping only the glyphs actually used on the site
// (see the icon classes referenced in scripts/compile.js). Re-run this
// (`npm run subsetIcons`) whenever a new icon is added or removed.

mkdirSync('./assets/fonts', { recursive: true })

const fonts = {
  'fa-solid-900': {
    src: './node_modules/@fortawesome/fontawesome-free/webfonts/fa-solid-900.ttf',
    out: './assets/fonts/fa-solid-900.woff2',
    codepoints: [0xf0c9, 0xf0e0, 0xf185, 0xf0c1, 0xf186] // bars, envelope, sun, link, moon
  },
  'fa-brands-400': {
    src: './node_modules/@fortawesome/fontawesome-free/webfonts/fa-brands-400.ttf',
    out: './assets/fonts/fa-brands-400.woff2',
    codepoints: [0xf08c, 0xf09b] // linkedin, github
  },
  'academicons': {
    src: './node_modules/academicons/fonts/academicons.ttf',
    out: './assets/fonts/academicons.woff2',
    codepoints: [0xe94f, 0xe9d4, 0xe9d9, 0xe95e] // dblp, google-scholar, orcid, researchgate
  }
}

for (const [name, { src, out, codepoints }] of Object.entries(fonts)) {
  const buffer = readFileSync(src)
  const text = codepoints.map(cp => String.fromCodePoint(cp)).join('')
  const subset = await subsetFont(buffer, text, { targetFormat: 'woff2' })
  writeFileSync(out, subset)
  console.log(`${name}: ${buffer.length} -> ${subset.length} bytes`)
}
