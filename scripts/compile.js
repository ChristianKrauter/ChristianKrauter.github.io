import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import QRCode from 'qrcode'
import sharp from 'sharp'
import { pageUrl, pageTitle, allowedMissingPDF, allowedPDFLink, allowedArxiv, allowedMissingDOI } from '../config.js'
import pkg from 'bibtex-tidy'
const { tidy } = pkg
import * as bibtexParse from 'bibtex-parse'

let srOnlyText = "<span class='sr-only'>(opens in new tab)</span>"

// Ensure output directories exist
mkdirSync('./pages', { recursive: true })
mkdirSync('./assets/img/repos', { recursive: true })

// Load files
const allTeasers = new Set(readdirSync("assets/img/teaser"))
const allQRs = new Set(readdirSync("assets/img/qr"))
const allPdfs = new Set(readdirSync("assets/pdf"))
const allPubHTML = new Set(readdirSync("pub"))
const allRepoImages = new Set(readdirSync("assets/img/repos"))
// real photos only (skips small/ and the manifest), newest-first by filename
const allGalleryImages = [...readdirSync("assets/img/photos")]
  .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
  .sort()
  .reverse()

// aspect ratio per photo, used by assets/js/gallery-layout.js
const galleryAspectRatios = new Map(await Promise.all(allGalleryImages.map(async file => {
  const { width, height } = await sharp(`assets/img/photos/small/${file}`).metadata()
  return [file, width / height]
})))

// Load coauthor config
const coauthorConfig = JSON.parse(readFileSync('./assets/docs/coauthors.json').toString())
const nameCoauthorMap = new Map(coauthorConfig.map(d => [d.name, d]))

// Load about page content
const aboutConfig = JSON.parse(readFileSync('./assets/docs/about.json').toString())

// Load repositories
const repositoriesConfig = JSON.parse(readFileSync('./assets/docs/repositories.json').toString())

// Load CV (JSON Resume format, see https://jsonresume.org/schema/)
const resume = JSON.parse(readFileSync('./assets/docs/resume.json').toString())

// Maps a Student Supervision project category name to its inline type label
const supervisionTypeLabels = {
  'Master Thesis Supervision': "Master's Thesis",
  'Bachelor Thesis Supervision': "Bachelor's Thesis",
  'Master Research Project Supervision': "Master's Research Project",
  'Student Assistant Supervision': 'Student Assistant'
}

// Load publications
const publications = bibtexParse.entries(
  readFileSync('./assets/docs/cleaned_bibstring.bib').toString()
  + readFileSync('./assets/docs/bibliography.bib').toString());

// Check the most important stuff
publications.forEach(pub => {
  if (!pub['AUTHOR'] || pub['AUTHOR'] === '') {
    console.log(`Publication ${pub['key']} is missing author(s)`)
    console.log('Compile panic')
    process.exit(1)
  }
  if (!pub['TITLE'] || pub['TITLE'] === '') {
    console.log(`Publication ${pub['key']} is missing a title`)
    console.log('Compile panic')
    process.exit(1)
  }
  if (!pub['YEAR'] || pub['YEAR'] === '') {
    console.log(`Publication ${pub['key']} is missing a year`)
    console.log('Compile panic')
    process.exit(1)
  }
  if (!pub['MONTH'] || pub['MONTH'] === '') {
    console.log(`Publication ${pub['key']} is missing a month`)
    console.log('Compile panic')
    process.exit(1)
  } else if (!/^\d+$/.test(pub['MONTH'])) {
    console.log(`Publication ${pub['key']}'s month is not numeric`)
    console.log('Compile panic')
    process.exit(1)
  }
})

// Sort publications by year and month descending, then title ascending
publications.sort((a, b) => {
  if (parseInt(a['YEAR']) !== parseInt(b['YEAR']))
    return parseInt(b['YEAR']) - parseInt(a['YEAR'])
  else if (parseInt(b['MONTH']) !== parseInt(a['MONTH']))
    return parseInt(b['MONTH']) - parseInt(a['MONTH'])
  return a['TITLE'].localeCompare(b['TITLE'])
})

parseBibtexAuthorNames(publications)

console.log("\nstart compile\n-------------\n\n")

console.log('Stats:')
console.log(`  ${publications.length} publications`)
console.log(`  ${allTeasers.size - 1} teasers`) // -1 for the 'small' folder
console.log(`  ${allPdfs.size} pdfs`)
console.log(`  ${allGalleryImages.length} gallery photos`)

createPages()

console.log("\n\n-------------\ndone\n")

/*
 *
 * Main Content HTML Functions 
 *
 */

/**
 * Creates all HTML pages
*/
async function createPages() {
  // Main page
  createMainPageHtml()

  // Publications page
  createPublicationsPageHtml(publications)

  // Repositories page
  createRepositoriesPageHtml(repositoriesConfig)

  // Gallery page
  createGalleryPageHtml(allGalleryImages)

  // CV page
  createCvPageHtml(resume)

  // Publication pages
  for (const pub of publications) {
    createPublicationPageHtml(pub)
  }

  // Create missing QR codes
  await createQRCodes(publications)

  // Detect missing and extra files
  reportMissingOrExtraInfo(publications)
}

/**
 * Creates main page HTML
 */
function createMainPageHtml() {
  const html = `${htmlHead(pageTitle)}

<body>
  <main>
    ${headerAndNav('.', 'home')}
    <div class="pageContent">
      <article>
        ${createAboutHtml(aboutConfig)}
      </article>
      ${footer()}
    </div>
  </main>
</body>

</html>`
  updateFile('./index.html', html)
}

/**
 * Creates the publications page HTML
 */
function createPublicationsPageHtml(publications) {
  const html = `${htmlHead(`Publications - ${pageTitle}`, '..')}

<body>
  <main>
    ${headerAndNav('..', 'publications')}
    <div class="pageContent">
      <article>
        <h1 id="publications" class="title">Publications</h1>
        ${createPublicationsHtml(publications)}
      </article>
      ${footer('..')}
    </div>
  </main>
</body>

</html>`
  updateFile('./pages/publications.html', html)
}

/**
 * Creates the repositories page HTML
 * @param {object[]} repositories repositories with name, description, url, and
 *   optional image (a filename in assets/img/repos/)
 */
function createRepositoriesPageHtml(repositories) {
  const html = `${htmlHead(`Repositories - ${pageTitle}`, '..')}

<body>
  <main>
    ${headerAndNav('..', 'repositories')}
    <div class="pageContent">
      <article>
        <h1 id="repositories" class="title">Repositories</h1>
        ${repositories.map(r => {
    const imageExists = r.image && allRepoImages.has(r.image)
    return `
  <div class="paper ${imageExists ? '' : 'noImage'}">
    <h3>
      <a href="${r.url}" target="_blank" rel="noreferrer">${r.name}</a>
    </h3>
    ${imageExists ? `
      <a href="${r.url}" target="_blank" rel="noreferrer">
        <img
          class="publicationImage"
          loading="lazy"
          src="../assets/img/repos/${r.image}"
          alt="Preview of ${r.name}"
        />
      </a>` : ''}
    <div class="metaData">
      ${r.description ? `<div>${r.description}</div>` : ''}
    </div>
  </div>
  `
  }).join('')}
      </article>
      ${footer('..')}
    </div>
  </main>
</body>

</html>`
  updateFile('./pages/repositories.html', html)
}

/**
 * Creates the gallery page HTML. Internally named "gallery" everywhere
 * (files, classes, nav); shown to visitors as "Photos".
 * @param {string[]} galleryImages gallery image filenames
 */
function createGalleryPageHtml(galleryImages) {
  const html = `${htmlHead(`Photos - ${pageTitle}`, '..')}

<body>
  <main>
    ${headerAndNav('..', 'gallery')}
    <div class="pageContent">
      <article>
        <h1 id="gallery" class="title">Photos</h1>
        <div class="gallery">
          ${galleryImages.map(file => {
    const alt = galleryImageAlt(file)
    const aspect = galleryAspectRatios.get(file)
    return `
          <button type="button" class="galleryItem" data-aspect="${aspect.toFixed(4)}" onclick="openLightbox('../assets/img/photos/${file}', '${alt}')">
            <img src="../assets/img/photos/small/${file}" alt="${alt}" loading="lazy" />
          </button>`
  }).join('')}
        </div>
        <dialog class="lightbox" id="lightbox">
          <button type="button" class="lightboxClose" onclick="closeLightbox()" aria-label="Close">&times;</button>
          <img id="lightboxImage" src="" alt="" />
        </dialog>
      </article>
      ${footer('..')}
    </div>
  </main>
  <script src="../assets/js/gallery-lightbox.js" defer></script>
  <script src="../assets/js/gallery-layout.js" defer></script>
</body>

</html>`
  updateFile('./pages/gallery.html', html)
}

/**
 * Derives alt text for a gallery photo from its filename, since there's no
 * per-photo caption data
 * @param {string} file gallery image filename
 * @returns {string} alt text
 */
function galleryImageAlt(file) {
  const stem = file.slice(0, file.lastIndexOf('.'))
  return `Photo: ${stem.charAt(0).toUpperCase()}${stem.slice(1)}`
}

/**
 * Creates the "about" section HTML for the main page from the about config
 * @param {object} aboutConfig about page content
 * @returns {string} HTML
 */
function createAboutHtml(aboutConfig) {
  return `
<h1 id="about" class="title">${aboutConfig.heading}</h1>

<div class="avatarAndBio">
  <img class="avatar" src="./assets/img/misc/ck.jpg" alt="${aboutConfig.name}" />
  <div class="bio">
    <p class="subtitle">${aboutConfig.intro}</p>

    ${aboutConfig.paragraphs.map(p => `<p style="text-align: justify;">${p}</p>`).join('\n    ')}
  </div>
</div>

<div class="social-links">
  <a href="${obfuscateMailto(aboutConfig.email)}" class="icon-link" title="Email" aria-label="Email">
    <i class="${networkIconClass('Email')}"></i>
  </a>
  ${aboutConfig.contact.map(c => `<a href="${c.url}" target="_blank" class="icon-link" title="${c.network}" aria-label="${c.network}">
    <i class="${networkIconClass(c.network)}"></i>
  </a>`).join('\n  ')}
</div>`
}

/**
 * Maps a contact network name to a Font Awesome / academicons icon class
 * @param {string} network network name
 * @returns {string} icon class
 */
function networkIconClass(network) {
  const map = {
    'Email': 'fas fa-envelope',
    'ORCID': 'ai ai-orcid',
    'Google Scholar': 'ai ai-google-scholar',
    'ResearchGate': 'ai ai-researchgate',
    'GitHub': 'fab fa-github',
    'LinkedIn': 'fab fa-linkedin',
    'DBLP': 'ai ai-dblp'
  }
  return map[network] || 'fas fa-link'
}

/**
 * Builds a "mailto:" link with letters percent-encoded, as a light deterrent
 * against naive email scrapers
 * @param {string} email plain email address
 * @returns {string} obfuscated mailto link
 */
function obfuscateMailto(email) {
  const encoded = [...email].map(c => /[a-zA-Z]/.test(c) ? `%${c.charCodeAt(0).toString(16).toUpperCase()}` : c).join('')
  return `mailto:${encoded}`
}

/**
 * Creates the CV page HTML from JSON Resume data
 * @see https://jsonresume.org/schema/
 * @param {object} resume JSON Resume data
 */
function createCvPageHtml(resume) {
  const { basics, work, volunteer, education, awards, languages, interests, projects } = resume

  const html = `${htmlHead(`CV - ${pageTitle}`, '..')}

<body>
  <main>
    ${headerAndNav('..', 'cv')}
    <div class="pageContent">
      <article class="cvSections">
        <h1 class="title">CV</h1>

        <div class="avatarAndBio cvAvatarBio">
          <img class="avatar" src="../assets/img/misc/ck.jpg" alt="${basics.name}" />
            <div class="furtherInfo">
              <div>
                <h2>Languages</h2>
                <p>${languages.map(l => `${l.language} (${l.fluency})`).join(', ')}</p>
              </div>
              <div>
                <h2>Interests</h2>
                <p>${interests.map(i => i.name).join(', ')}</p>
            </div>
          </div>
        </div>

        <h2 class="yearHeading">Education</h2>
        ${cvTimelineHtml(education.map(e => ({
    date: cvDateRange(e.startDate, e.endDate),
    title: `${e.studyType} ${e.area}`,
    subtitle: e.institution,
    items: e.courses
  })))}

        <h2 class="yearHeading">Awards</h2>
        ${cvTimelineHtml(awards.map(a => ({
    date: a.date,
    title: a.title,
    subtitle: a.awarder
  })), { plainDate: true })}

        <h2 class="yearHeading">Academic Volunteering</h2>
        ${cvTimelineHtml(volunteer.map(v => ({
      date: cvDateRange(v.startDate, v.endDate),
      title: v.position,
      subtitle: v.organization
    })), { plainDate: true })}

        <h2 class="yearHeading">Student Supervision</h2>
        ${cvTimelineHtml(projects.flatMap(p => {
      const type = supervisionTypeLabels[p.name] || p.name
      return p.highlights.map(h => {
        const entry = parseSupervisionEntry(h)
        return { date: entry.date, title: `${entry.name} <span class="cvGloss">(${type})</span>`, subtitle: entry.title }
      })
    }).sort(cvOngoingFirst), { plainDate: true })}

        <h2 class="yearHeading">Employment</h2>
        ${cvTimelineHtml(work.map(w => ({
      date: cvDateRange(w.startDate, w.endDate),
      title: w.position,
      subtitle: w.name,
      items: w.highlights
    })))}
      </article>
      ${footer('..')}
    </div>
  </main>
</body>

</html>`
  updateFile('./pages/cv.html', html)
}

/**
 * Formats a JSON Resume date (YYYY, YYYY-MM, or YYYY-MM-DD) as "Mon YYYY"
 * @param {string} date date string
 * @returns {string} formatted date
 */
function formatCvDate(date) {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [year, month] = date.split('-')
  return month ? `${monthNames[parseInt(month) - 1]} ${year}` : year
}

/**
 * Formats a start/end date pair as a date range, using "Present" for ongoing entries
 * @param {string} startDate start date
 * @param {string} [endDate] end date, omitted for ongoing entries
 * @returns {string} formatted date range
 */
function cvDateRange(startDate, endDate) {
  if (!startDate) return formatCvDate(endDate)
  const start = formatCvDate(startDate)
  const end = endDate ? formatCvDate(endDate) : 'Present'
  return start === end ? start : `${start} &ndash; ${end}`
}

/**
 * Creates HTML for a list of CV timeline entries (employment, education, awards, ...)
 * @param {object[]} entries entries with date, title, optional subtitle, and optional items
 * @param {object} [options]
 * @param {boolean} [options.plainDate=false] render the date at normal weight instead of bold
 * @returns {string} HTML
 */
function cvTimelineHtml(entries, { plainDate = false } = {}) {
  return `
  <div class="cvTimeline${plainDate ? ' cvTimelinePlainDate' : ''}">
    ${entries.map(e => `
    <div class="cvEntry">
      <div class="cvDate">${e.date}</div>
      <div class="cvContent">
        <h3>${e.title}</h3>
        ${e.subtitle ? `<div class="cvSubtitle">${e.subtitle}</div>` : ''}
        ${e.items ? `<ul>${e.items.map(i => `<li>${i}</li>`).join('')}</ul>` : ''}
      </div>
    </div>`).join('')}
  </div>`
}

/**
 * Parses a "<date> <name>, <title>" supervision highlight string (the trailing
 * ", <title>" is omitted for entries without a thesis/project, e.g. student assistants)
 * @param {string} text highlight text
 * @returns {{date: string, name: string, title: string}} parsed entry
 */
function parseSupervisionEntry(text) {
  const dateMatch = text.match(/^(\d{4}(?:\s*–\s*(?:\d{4}|Present))?)\s+(.*)$/)
  const date = dateMatch ? dateMatch[1] : ''
  const rest = dateMatch ? dateMatch[2] : text
  const commaIndex = rest.indexOf(',')
  if (commaIndex === -1) return { date, name: rest, title: '' }
  return { date, name: rest.slice(0, commaIndex), title: rest.slice(commaIndex + 1).trim() }
}

/**
 * Sort comparator for cvTimelineHtml entries: ongoing ("Present") entries come first,
 * then everything else by start year descending
 * @param {{date: string}} a entry
 * @param {{date: string}} b entry
 * @returns {number} sort order
 */
function cvOngoingFirst(a, b) {
  const aOngoing = a.date.includes('Present')
  const bOngoing = b.date.includes('Present')
  if (aOngoing !== bOngoing) return aOngoing ? -1 : 1
  return parseInt(b.date) - parseInt(a.date)
}

/**
 * Creates HTML for an array of publications
 *
 * @param {object[]} publications publications
 * @returns {string} HTML
 */
function createPublicationsHtml(publications) {
  const p = '..'

  return publications.map((pub, i) => {
    const key = pub['key']
    const image = `${p}/assets/img/teaser/small/${key}.png`
    const year = parseInt(pub['YEAR'])
    const doi = pub['DOI']
    const url = pub['URL']
    const url2 = pub['URL2']
    const venue = pub['BOOKTITLE'] || pub['JOURNAL']
    const footNoteIndices = pub['FOOTNOTEINDICES']
    const footnoteText = pub['FOOTNOTETEXT']
    const imageExists = allTeasers.has(`${key}.png`)

    // PDF might be a link instead of file
    let pdfLink = pub['PDF']
    let pdfFile = allPdfs.has(`${key}.pdf`)
    if (pdfFile) {
      pdfLink = `${p}/assets/pdf/${key}.pdf`
    }

    // Poster might be a link instead of file
    let posterLink = pub['POSTER']
    let posterFile = allPdfs.has(`${key}-poster.pdf`)
    if (posterFile) {
      posterLink = `${p}/assets/pdf/${key}-poster.pdf`
    }

    let videoHTML = ''
    let videoLink = pub['VIDEO']
    if (videoLink) {
      if (videoLink.includes("youtube.com/embed")) {
        videoHTML = `<a href="https://www.youtube.com/watch?v=${videoLink.split("embed/")[1].split("?")[0]}" target="_blank" rel="noreferrer" aria-label="Video for ${pub['TITLE']}">video${srOnlyText}</a>`
      } else {
        videoHTML = `<a href="${videoLink}" target="_blank" rel="noreferrer" aria-label="Video for ${pub['TITLE']}">video${srOnlyText}</a>`
      }
    }

    let video2HTML = ''
    let video2Link = pub['VIDEO2']
    if (video2Link) {
      if (video2Link.includes("youtube.com/embed")) {
        video2HTML = `<a href="https://www.youtube.com/watch?v=${video2Link.split("embed/")[1].split("?")[0]}" target="_blank" rel="noreferrer" aria-label="Second video for ${pub['TITLE']}">video${srOnlyText}</a>`
      } else {
        video2HTML = `<a href="${video2Link}" target="_blank" rel="noreferrer" aria-label="Second video for ${pub['TITLE']}">video${srOnlyText}</a>`
      }
    }

    let supplLink = pub['SUPPL']

    var footNoteIndicesList = []
    if (footNoteIndices) {
      footNoteIndicesList = footNoteIndices.split(',').map(Number)
    }

    const authors = pub['cleanedAuthors'].split(',').map(d => d.trim())
    const authorHtml = authors.map((d, i) => {
      const text = footNoteIndicesList.includes(i) ? `${d}*` : d
      // If author is a coauthor with a configured link, link to it
      if (nameCoauthorMap.has(d)) {
        return `<a href="${nameCoauthorMap.get(d).link}" target="_blank" rel="noreferrer">${text}</a>`
      }
      return text
    }).join(', ')

    var badgesHTML = ''
    if (pub['BADGE']) {
      pub['BADGE'].split(',').forEach(badge => {
        badgesHTML += `<img style="height:1em; width:auto; vertical-align: sub;" src="${p}/assets/img/badges/${badge}.png" alt="${badge} badge"/> `
      });
    }

    return `
  ${i === 0 || year !== parseInt(publications[i - 1]['YEAR'])
        ? `<h2 class="yearHeading">${year}</h2>` : ''}
  <div class="paper ${imageExists ? '' : 'noImage'}" id="paper${key}">
    <h3>
      <a href="${p}/pub/${key}.html"> ${badgesHTML}${pub['TITLE']}
      </a>
    </h3>
    ${imageExists
        ? `
      <a href="${p}/pub/${key}.html">
        <img
          class="publicationImage"
          loading="lazy"
          src="${image}"
          alt="Teaser image for ${pub['TITLE']}"
        />
      </a>`
        : ''
      }
    <div class="metaData">
      <div class="authors">
        ${authorHtml}
      </div>
        ${footNoteIndices ? `<div>*${footnoteText}</div>` : ''}
      <div>
        ${venue} (${year})
      </div>
      <div class="links">
        ${doi && doi !== '' ? `<a href="${doi}" target="_blank" rel="noreferrer" aria-label="DOI for ${pub['TITLE']}">DOI${srOnlyText}</a>` : ''}
        ${url && url !== '' ? `<a href="${url}" target="_blank" rel="noreferrer" aria-label="Link for ${pub['TITLE']}">link${srOnlyText}</a>` : ''}
        ${url2 && url2 !== '' ? `<a href="${url2}" target="_blank" rel="noreferrer" aria-label="Additional link for ${pub['TITLE']}">link${srOnlyText}</a>` : ''}
        ${pdfLink ? `<a href="${pdfLink}" target="_blank" rel="noreferrer" aria-label="PDF for ${pub['TITLE']}">PDF${srOnlyText}</a>` : ''}
        ${posterLink ? `<a href="${posterLink}" target="_blank" rel="noreferrer" aria-label="Poster for ${pub['TITLE']}">poster${srOnlyText}</a>` : ''}
        ${supplLink ? `<a href="${supplLink}" target="_blank" rel="noreferrer" aria-label="Supplemental material for ${pub['TITLE']}">supplemental${srOnlyText}</a>` : ''}
        ${videoHTML}
        ${video2HTML}
      </div>
    </div>
  </div>
  `
  }).join('')
}

/**
 * Creates html page for a publication
 */
function createPublicationPageHtml(pub) {
  const key = pub['key']
  const year = parseInt(pub['YEAR'])
  const doi = pub['DOI']
  const url = pub['URL']
  const url2 = pub['URL2']
  const venue = pub['BOOKTITLE'] || pub['JOURNAL']
  const footNoteIndices = pub['FOOTNOTEINDICES']
  const footnoteText = pub['FOOTNOTETEXT']
  const imageExists = allTeasers.has(`${key}.png`)

  // PDF might be a link instead of file
  let pdfLink = pub['PDF']
  let pdfFile = allPdfs.has(`${key}.pdf`)
  if (pdfFile) {
    pdfLink = `../assets/pdf/${key}.pdf`
  }

  // Poster might be a link instead of file
  let posterLink = pub['POSTER']
  let posterFile = allPdfs.has(`${key}-poster.pdf`)
  if (posterFile) {
    posterLink = `../assets/pdf/${key}-poster.pdf`
  }

  let videoHTML = ''
  let videoLink = pub['VIDEO']
  if (videoLink) {
    if (videoLink.includes("youtube.com/embed")) {
      videoHTML = `<p><iframe class="video" src="${videoLink}" title="Video for ${pub['TITLE']}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></p>`
    } else {
      videoHTML = `<a href="${videoLink}" target="_blank" rel="noreferrer">video${srOnlyText}</a>`
    }
  }

  let video2HTML = ''
  let video2Link = pub['VIDEO2']
  if (video2Link) {
    if (video2Link.includes("youtube.com/embed")) {
      video2HTML = `<p><iframe class="video" src="${video2Link}" title="Second video for ${pub['TITLE']}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></p>`
    } else {
      video2HTML = `<a href="${video2Link}" target="_blank" rel="noreferrer">video${srOnlyText}</a>`
    }
  }

  let supplLink = pub['SUPPL']

  var footNoteIndicesList = []
  if (footNoteIndices) {
    footNoteIndicesList = footNoteIndices.split(',').map(Number)
  }

  const authors = pub['cleanedAuthors'].split(',').map(d => d.trim())
  const authorHtml = authors.map((d, i) => {
    const text = footNoteIndicesList.includes(i) ? `${d}*` : d

    // If author is a coauthor with a configured link, link to it
    if (nameCoauthorMap.has(d)) {
      return `<a href="${nameCoauthorMap.get(d).link}" target="_blank" rel="noreferrer">${text}</a>`
    }
    return text
  }).join(', ')

  var badgesHTML = ''
  if (pub['BADGE']) {
    pub['BADGE'].split(',').forEach(badge => {
      badgesHTML += ` <img style="height:1em; width:auto; vertical-align: sub;" src="../assets/img/badges/${badge}.png" alt="${badge} badge"/>`
    });
  }

  const title = `${pub['TITLE']}`

  // rows sized to fit the whole citation without internal scrolling. Lines don't
  // wrap (see the textarea's white-space: pre + overflow-x: auto), so the exact
  // line count is enough; trim() drops bibtex-tidy's trailing blank line
  const bibtexText = formatBibtex(pub['key'], bibtexObjToString(pub)).trim()
  const bibtexRows = bibtexText.split('\n').length

  const html = `${htmlHead(title, '..')}
    <body>
      <main>
        ${headerAndNav('..', 'publication')}
        <div class="pageContent">
          <article>
            <h1>${badgesHTML} ${title}</h1>
            <div class="pubPageContent">
              ${imageExists ? `
              <a href="../assets/img/teaser/${key}.png" target="_blank" title="show image full size">
                <img class="teaser" id="image${key}" src="../assets/img/teaser/${key}.png" alt="Teaser image for ${title}"/>${srOnlyText}
              </a>` : ''}
              <div>
                <div class="authors">
                  <b>Authors.</b> ${authorHtml}
                </div>
                  ${footNoteIndices ? `<div>*${footnoteText}</div>` : ''}
                <div>
                  <b>Venue.</b> ${venue} (${year})
                </div>
                ${pub['ABSTRACT'] ? `<div class="abstract"><b>Abstract.</b> ${pub['ABSTRACT']}</div>` : ''}
                ${pub['ACKS'] ? `<div class="abstract"><b>Acknowledgements.</b> ${pub['ACKS']}</div>` : ''}
                ${pub['NOTE'] ? `<div>${pub['NOTE']} ${pub['BADGE'] ? badgesHTML : ''}</div>` : ''}
                <div class="materials">
                  <b>Materials.</b>
                  ${doi && doi !== '' ? `<a href="${doi}" target="_blank" rel="noreferrer">DOI${srOnlyText}</a>` : ''}
                  ${url && url !== '' ? `<a href="${url}" target="_blank" rel="noreferrer">link${srOnlyText}</a>` : ''}
                  ${url2 && url2 !== '' ? `<a href="${url2}" target="_blank" rel="noreferrer">link${srOnlyText}</a>` : ''}
                  ${pdfLink ? `<a href="${pdfLink}" target="_blank" rel="noreferrer">PDF${srOnlyText}</a>` : ''}
                  ${posterLink ? `<a href="${posterLink}" target="_blank" rel="noreferrer">poster${srOnlyText}</a>` : ''}
                  ${supplLink ? `<a href="${supplLink}" target="_blank" rel="noreferrer">supplemental${srOnlyText}</a>` : ''}
                  ${videoHTML}
                  ${video2HTML}
                </div>
                <div><b>How to cite.</b></div>
                <div class="bibtex">
                  <textarea readonly aria-label="BibTeX citation" rows="${bibtexRows}">${bibtexText}</textarea>
                  <button type="button" class="copyButton" onclick="copyBibtexText(this)" aria-label="Copy BibTeX citation">Copy</button>
                  <span class="sr-only" role="status"></span>
                </div>
                <div class="qrcontainer">
                  <div class="qrtitle">Link to this page:</div>
                  <img class="qrimage" src="../assets/img/qr/${key}.png" alt="QR code linking to this page"/>
                </div>
            </div>
          </article>
          ${footer('..')}
        </div>
      </main>
      <script src="../assets/js/copy-bibtex.js" defer></script>
    </body>
    </html>`
  const outFile = `./pub/${pub['key']}.html`
  updateFile(outFile, html)
}

/*
 *
 * Extra HTML Functions 
 *
 */

/**
 * Generates the HTML <head> of a page
 * @param {string} title page title for <title>
 * @param {'.'|'..'} [path=.] either '.' for index.html or '..' for others
 * @returns {string} HTML code
*/
function htmlHead(title, path = '.') {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script>
      (function () {
        var stored = localStorage.getItem('theme')
        var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        document.documentElement.setAttribute('data-theme', theme)
      })()
    </script>

    <title>${title}</title>
    
    <link rel="stylesheet" href="${path}/style.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/jpswalsh/academicons@1/css/academicons.min.css">
    <link rel="shortcut icon" href="${path}/assets/img/misc/favicon.png">
    <link rel="icon" type="image/png" href="${path}/assets/img/misc/favicon.png" sizes="256x256">
    <link rel="apple-touch-icon" sizes="256x256" href="${path}/assets/img/misc/favicon.png">

    <!-- OG Metadata -->
    <meta property="og:site_name" content="Chris Krauter" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${pageTitle}" />
    <meta property="og:url" content="https://chriskrauter.de/" />
    <meta property="og:description" content="Personal website of Chris Krauter" />
    <meta property="og:image" content="https://chriskrauter.de/assets/img/misc/link_preview.jpg" />
    <meta property="og:locale" content="EN" />

    <!-- Twitter card -->
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title"  content="${pageTitle}" />
    <meta name="twitter:description" content="Personal website of Chris Krauter" />
    <meta name="twitter:image" content="https://chriskrauter.de/assets/img/misc/ck.jpg" />
  </head>
  `
}

/**
 * Generates the HTML header of a page. The nav always shows the same links
 * (home, publications, cv) on every page, including the current one.
 * @param {'.'|'..'} [path=.] either '.' for index.html or '..' for others
 * @param {'home'|'publications'|'cv'|'repositories'|'gallery'|'publication'} pageType type of the current page
 * @returns {string} HTML code
 */
function headerAndNav(path = '.', pageType) {
  // pages/*.html are siblings, so they link to each other directly instead
  // of round-tripping through the site root
  const inPages = ['cv', 'publications', 'repositories', 'gallery'].includes(pageType)
  const pageHref = (page) => inPages ? `./${page}.html` : `${path}/pages/${page}.html`
  const currentAttr = (match) => pageType === match ? ' aria-current="page"' : ''

  return `
  <div>
  <header>
    <div class="headerInner">
      <button type="button" class="navToggle" onclick="toggleNav()" aria-expanded="false" aria-controls="siteNav" aria-label="Toggle navigation menu">
        <i class="fas fa-bars" aria-hidden="true"></i>
      </button>
      <div class="siteName">Chris Krauter</div>
      <nav id="siteNav">
        <ul>
          <li><a href="${path}/"${currentAttr('home')}>about</a></li>
          <li><a href="${pageHref('publications')}"${currentAttr('publications')}>publications</a></li>
          <li><a href="${pageHref('repositories')}"${currentAttr('repositories')}>repositories</a></li>
          <li><a href="${pageHref('gallery')}"${currentAttr('gallery')}>photos</a></li>
          <li><a href="${pageHref('cv')}"${currentAttr('cv')}>cv</a></li>
        </ul>
      </nav>
      <button type="button" class="themeToggle" onclick="toggleTheme()" aria-label="Switch to dark mode">
        <i class="fas fa-moon" aria-hidden="true"></i>
      </button>
    </div>
  </header>
</div>
<script src="${path}/assets/js/theme-toggle.js" defer></script>
<script src="${path}/assets/js/nav-toggle.js" defer></script>`
}

/**
 * Generates the HTML footer of a page
 * @param {'.'|'..'} [path=.] either '.' for index.html or '..' for others
 * @returns {string} HTML code
 */
function footer(path = '.') {
  const today = new Date();
  const options = { month: 'long', day: 'numeric', year: 'numeric' };
  const formattedDate = new Intl.DateTimeFormat('en-US', options).format(today);

  return `
<footer class="siteFooter" style="text-align: center">
  © 2026 Chris Krauter. Hosted by GitHub Pages. Analytics by GoatCounter. Last updated: ${formattedDate}.
</footer>`
}

/*
 *
 * Helper Functions 
 *
 */

function parseBibtexAuthorNames(publications) {
  publications.forEach(pub => {
    let authorsOrig = pub['AUTHOR'];
    let authorsList = authorsOrig.split(' and ');
    let cleanedAuthors = ''

    authorsList.forEach(author => {
      let authorParts = author.split(',');
      switch (authorParts.length) {
        case 1:
          cleanedAuthors += authorParts[0].trim() + ', '
          break;
        case 2:
          cleanedAuthors += authorParts[1].trim() + ' ' + authorParts[0].trim() + ', '
          break;
        case 3:
          cleanedAuthors += authorParts[2] + ' ' + authorParts[0].trim() + ' ' + authorParts[1].trim() + ', '
          break;
        default:
          console.log(`Publication ${pub['key']} has wrongly formatted authors`)
          console.log('Compile panic')
          process.exit(1)
          break;
      }
    });

    cleanedAuthors = cleanedAuthors.trim().replace(/,$/, '')
    pub['cleanedAuthors'] = cleanedAuthors
  });
}

function bibtexObjToString(bibObj) {
  let output = '@';
  output += bibObj['type'] + '{' + bibObj['key'] + ',\n';

  for (const [key, value] of Object.entries(bibObj)) {
    if (key == 'key' | key == 'type') {
      continue;
    }
    output += key;
    output += "=";
    output += '{' + value + '},';
  }

  output += '}';

  return output
}

/**
 * Logs missing and extra files to the console as warnings
 * @param {object[]} publications publication data
 */
function reportMissingOrExtraInfo(publications) {
  // Extra files
  let extra = []
  const allKeys = new Set(publications.map(d => d['key']))
  const allFiles = [...allTeasers, ...allPdfs, ...allPubHTML]
  const ignore = new Set(["small", "people", "misc"])
  for (const f of allFiles) {
    // strip a trailing "-poster" so a poster PDF resolves to its
    // publication's own key instead of being flagged as an extra file
    const key = f.slice(0, f.lastIndexOf(".")).replace(/-poster$/, '')
    if (!allKeys.has(key) && !ignore.has(f)) {
      extra.push(f)
    }
  }
  // Extra QR codes
  for (const pub of publications) {
    const key = pub['key']
    allQRs.delete(`${key}.png`)
  }
  allQRs.delete('.gitkeep')
  for (const qr of allQRs) {
    extra.push(qr)
  }
  // Print extra files report
  if (extra.length > 0) {
    console.log(`\n\nextra files:\n  ${extra.sort().join("\n  ")}`)
  }

  // Missing files and information
  let missingPublicationInfo = false
  let missingFiles = false
  let missingPdfFileGotLink = false
  let missingData = {
    publication: [],
    pdfIsLink: false
  }

  // Function to add an item to one of the two lists for a given key
  function addMissing(list, item) {
    // Add the item to the specified list
    if (list === 'publication') {
      missingData.publication.push(item)
    } else if (list === 'pdfIsLink') {
      missingData.pdfIsLink = true
    } else {
      console.error("Invalid list:", list)
    }
  }

  for (const pub of publications) {
    const key = pub['key']

    // Missing publication info
    if (!pub['DOI'] || pub['DOI'] === '') {
      if (!allowedMissingDOI.includes(key)) {
        missingPublicationInfo = true
        addMissing('publication', `${key} is missing a doi`)
      }
    } else {
      if (!pub['DOI'].includes('http')) {
        missingPublicationInfo = true
        addMissing('publication', `${key} the doi is not a link`)
      }
      if (pub['DOI'].toLowerCase().includes('arxiv') && !allowedArxiv.includes(key)) {
        missingPublicationInfo = true
        addMissing('publication', `${key} the doi is not final but arxiv`)
      }
    }
    if ((!pub['BOOKTITLE'] || pub['BOOKTITLE'] === '') && (!pub['JOURNAL'] || pub['JOURNAL'] === '')) {
      missingPublicationInfo = true
      addMissing('publication', `${key} is missing a booktitle/journal`)
    }
    if (!pub['ABSTRACT'] | pub['ABSTRACT'] === '') {
      missingPublicationInfo = true
      addMissing('publication', `${key} is missing an abstract`)
    }
    if (pub['BADGE'] && !pub['NOTE']) {
      missingPublicationInfo = true
      addMissing('publication', `${key} is missing info about the badge in the note`)
    }

    // Missing files
    // Publication teaser images
    if (!allTeasers.has(`${key}.png`)) {
      missingFiles = true
      addMissing('publication', `${key} is missing a teaser image`)
    }
    // Publication PDF
    let pdfLink = pub['PDF']
    let pdfFile = allPdfs.has(`${key}.pdf`)

    // No file, no exception
    if (!pdfFile && !allowedMissingPDF.includes(key)) {
      // Is a link, but no exception
      if (pdfLink) {
        // link not allowed if not excepted
        if (!allowedPDFLink.includes(key)) {
          missingPdfFileGotLink = true
          addMissing('publication', `${key} is missing a PDF file`)
          addMissing('pdfIsLink', '')
        }
        // no pdf, not even a link
      } else {
        missingFiles = true
        addMissing('publication', `${key} is missing a PDF file`)
      }
    }
  }

  // Create Report
  if (missingData.publication.length > 0) {
    console.log(`\n\nmissing files:\n`)
    console.log('  Publications:')
    missingData.publication.forEach(info => {
      console.log('    ' + info)
    })
  }
}

/**
 * Formats bibtex for more beautiful and uniform display
 *
 * @see https://github.com/FlamingTempura/bibtex-tidy
 * @param {string} key pub key (for debugging logs)
 * @param {string} bibtexString bibtex string
 */
function formatBibtex(key, bibtexString) {
  try {
    const formatted = tidy(bibtexString, {
      omit: ['abstract', 'acks', 'address', 'badge', 'note', 'pdf', 'poster', 'suppl', 'url2', 'video', 'video2', 'footnoteindices', 'footnotetext', 'cleanedauthors'],
      curly: true,
      space: 4,
      align: 14,
      stripEnclosingBraces: true,
      sortFields: true,
      removeEmptyFields: true,
      lowercase: true,
    })
    return formatted.bibtex
  } catch (e) {
    console.warn(`Invalid bibtex for pub with key ${key}: ${e}`)
    return bibtexString
  }
}

/**
 * Creates QR codes with awesome-qr (https://github.com/sumimakito/Awesome-qr.js)
 *
 * @param {object[]} publications publication data
 */
async function createQRCodes(publications) {
  let count = 0
  const dir = "./assets/img/qr"
  const options = {
    color: {
      dark: '#444',  // Dots
      light: '#0000' // Transparent background
    },
    errorCorrectionLevel: 'Q',
    scale: 12,
    margin: 0,
  }

  // For publications
  for (const pub of publications) {
    const key = pub['key']
    const path = `${dir}/${key}.png`
    // Check if QR code image already exists
    if (existsSync(path)) { continue }
    const url = `${pageUrl}/pub/${key}.html`
    QRCode.toFile(path, url, options)
    count++
  }
}

/**
 * Writes content to a file, but only if the content has changed or it does not
 * exist yet
 *
 * @param {string} path file path
 * @param {string} newContent the new content that would be written to the file
 */
function updateFile(path, newContent) {
  if (!existsSync(path)) {
    writeFileSync(path, newContent)
    return
  }
  const oldContent = readFileSync(path).toString()
  if (oldContent !== newContent) {
    writeFileSync(path, newContent)
  }
}
