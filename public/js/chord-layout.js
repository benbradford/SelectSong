// Chord sheet layout helpers — shared between the in-app chord viewer (plan.js),
// the chord sheets page (chordpro.js), and the server-side PDF export.
//
// All functions operate on a passed-in container element rather than reaching
// into the page's UI controls, so they work in both contexts.
;(function (root) {
  'use strict'

  // A4 print dimensions at 96dpi (actual Chrome print rendering)
  const PORTRAIT_WIDTH = 715   // 190mm content width (10mm margins)
  const PORTRAIT_HEIGHT = 1047 // 277mm content height
  const LANDSCAPE_WIDTH = 1060 // 281mm content width (8mm margins)
  const LANDSCAPE_HEIGHT = 730 // 194mm content height

  const TARGET_SIZE = 20
  const MAX_SIZE = 36
  const MIN_SIZE = 10

  function applyManualBreaks(contentEl, breakIndices) {
    if (!breakIndices || !breakIndices.length) return
    const blanks = contentEl.querySelectorAll('.cp-blank')
    for (const idx of breakIndices) {
      if (blanks[idx]) blanks[idx].classList.add('cp-page-break')
    }
  }

  function isHeaderEl(el) {
    return (
      el.tagName === 'H1' ||
      (el.tagName === 'P' &&
        (el.classList.contains('cp-artist') || el.classList.contains('cp-meta')))
    )
  }

  // Turn a .cp-two-col wrapper back into a plain .cp-song.
  // markBreaks re-inserts a page break where each column boundary was, so the
  // interactive viewer keeps the user's column split when they untick 2-up.
  function unapplyTwoCol(contentEl, markBreaks) {
    const existing = contentEl.querySelector('.cp-two-col')
    if (!existing) return false

    const origSong = document.createElement('div')
    origSong.className = 'cp-song'
    origSong.style.fontFamily = existing.style.fontFamily
    origSong.style.fontSize = existing.style.fontSize

    existing.querySelectorAll('.cp-two-col-header > *').forEach((el) => {
      origSong.appendChild(el)
    })

    const cols = [...existing.querySelectorAll('.cp-col')]
    cols.forEach((col, colIdx) => {
      ;[...col.children].forEach((el) => origSong.appendChild(el))
      if (markBreaks && colIdx < cols.length - 1) {
        const brk = document.createElement('div')
        brk.className = 'cp-blank cp-page-break'
        origSong.appendChild(brk)
      }
    })

    existing.replaceWith(origSong)
    return true
  }

  // Drop every page break marker (manual or auto) inside a container.
  function clearPageBreaks(containerEl) {
    containerEl.querySelectorAll('.cp-page-break').forEach((el) => {
      el.classList.remove('cp-page-break', 'cp-auto-break')
    })
  }

  function applyTwoCol(contentEl, twoColEnabled, onUnapplied) {
    if (unapplyTwoCol(contentEl, true)) {
      if (!twoColEnabled) {
        if (onUnapplied) onUnapplied()
        return
      }
    }

    const song = contentEl.querySelector('.cp-song')
    if (!song || !twoColEnabled) return

    const children = [...song.children]
    const pages = []
    let current = []

    for (const child of children) {
      if (child.classList.contains('cp-page-break')) {
        if (current.length) pages.push(current)
        current = []
      } else {
        current.push(child)
      }
    }
    if (current.length) pages.push(current)

    if (pages.length < 2) {
      const headerEls = children.filter(
        (c) =>
          c.tagName === 'H1' ||
          (c.tagName === 'P' &&
            (c.classList.contains('cp-artist') || c.classList.contains('cp-meta')))
      )
      const contentEls = children.filter((c) => !headerEls.includes(c))
      if (contentEls.length < 4) {
        return false
      }
      const mid = Math.floor(contentEls.length / 2)
      pages.length = 0
      pages.push([...headerEls, ...contentEls.slice(0, mid)])
      pages.push(contentEls.slice(mid))
    }

    const wrapper = document.createElement('div')
    wrapper.className = 'cp-two-col'
    wrapper.style.fontFamily = song.style.fontFamily
    wrapper.style.fontSize = song.style.fontSize

    const headerEls = pages[0].filter(
      (el) =>
        el.tagName === 'H1' ||
        (el.tagName === 'P' &&
          (el.classList.contains('cp-artist') || el.classList.contains('cp-meta')))
    )
    if (headerEls.length) {
      const header = document.createElement('div')
      header.className = 'cp-two-col-header'
      for (const el of headerEls) header.appendChild(el)
      wrapper.appendChild(header)
      pages[0] = pages[0].filter((el) => !headerEls.includes(el))
      if (pages[0].length === 0) pages.shift()
    }

    for (let i = 0; i < pages.length; i += 2) {
      const row = document.createElement('div')
      row.className = 'cp-two-col-row'

      const left = document.createElement('div')
      left.className = 'cp-col'
      for (const el of pages[i]) left.appendChild(el)
      row.appendChild(left)

      if (pages[i + 1]) {
        const right = document.createElement('div')
        right.className = 'cp-col'
        for (const el of pages[i + 1]) right.appendChild(el)
        row.appendChild(right)
      }

      wrapper.appendChild(row)
    }

    song.replaceWith(wrapper)
    return true
  }

  // Flow the song into columns for printing, two columns per printed page.
  //
  // Unlike applyTwoCol — which splits at existing page breaks and so can leave a
  // "page-break-after: always" marker sitting inside a column, tearing the page
  // in half — this drops all breaks and measures each section at the real column
  // width, filling one column at a time up to pageHeight. Extra printed pages
  // become extra rows instead of content being clipped by .cp-col's overflow.
  //
  // Returns the number of rows (printed pages), or false if there is too little
  // content to split.
  function buildTwoColFlow(contentEl, pageHeight, fontSize) {
    const PAGE_HEIGHT = pageHeight || LANDSCAPE_HEIGHT
    unapplyTwoCol(contentEl, false)

    const song = contentEl.querySelector('.cp-song')
    if (!song) return false
    clearPageBreaks(song)

    const children = [...song.children]
    const headerEls = children.filter(isHeaderEl)
    const bodyEls = children.filter((el) => !isHeaderEl(el))
    if (bodyEls.length < 4) return false

    const wrapper = document.createElement('div')
    wrapper.className = 'cp-two-col'
    wrapper.style.fontFamily = song.style.fontFamily
    wrapper.style.fontSize =
      (fontSize || parseFloat(song.style.fontSize) || TARGET_SIZE) + 'px'

    if (headerEls.length) {
      const header = document.createElement('div')
      header.className = 'cp-two-col-header'
      for (const el of headerEls) header.appendChild(el)
      wrapper.appendChild(header)
    }

    // Park everything in one column first so heights are measured at the width
    // the sections will actually be printed at (a full-width measurement would
    // under-report any line that wraps).
    const measureRow = document.createElement('div')
    measureRow.className = 'cp-two-col-row'
    const measureCol = document.createElement('div')
    measureCol.className = 'cp-col'
    const filler = document.createElement('div')
    filler.className = 'cp-col'
    measureRow.appendChild(measureCol)
    measureRow.appendChild(filler)
    wrapper.appendChild(measureRow)
    for (const el of bodyEls) measureCol.appendChild(el)

    song.replaceWith(wrapper)

    const header = wrapper.querySelector('.cp-two-col-header')
    const headerHeight = header ? header.getBoundingClientRect().height : 0
    const heights = bodyEls.map((el) => el.getBoundingClientRect().height)

    // The header sits above both columns, so only the first page pays for it.
    const cols = []
    let col = []
    let used = 0
    let budget = PAGE_HEIGHT - headerHeight
    for (let i = 0; i < bodyEls.length; i++) {
      if (col.length && used + heights[i] > budget) {
        cols.push(col)
        col = []
        used = 0
        if (cols.length >= 2) budget = PAGE_HEIGHT
      }
      col.push(bodyEls[i])
      used += heights[i]
    }
    if (col.length) cols.push(col)

    measureRow.remove()

    for (let i = 0; i < cols.length; i += 2) {
      const row = document.createElement('div')
      row.className = 'cp-two-col-row'

      const left = document.createElement('div')
      left.className = 'cp-col'
      for (const el of cols[i]) left.appendChild(el)
      row.appendChild(left)

      // Always add the second column, empty if need be, so a lone trailing
      // column keeps its half-page width rather than stretching across.
      const right = document.createElement('div')
      right.className = 'cp-col'
      if (cols[i + 1]) for (const el of cols[i + 1]) right.appendChild(el)
      row.appendChild(right)

      wrapper.appendChild(row)
    }

    return Math.ceil(cols.length / 2)
  }

  function autoFitSize(contentEl, manualBreaksMode, pageHeight) {
    const PAGE_HEIGHT = pageHeight || PORTRAIT_HEIGHT

    const twoCol = contentEl.querySelector('.cp-two-col')
    if (twoCol) return autoFitTwoCol(twoCol, PAGE_HEIGHT)

    const song = contentEl.querySelector('.cp-song')
    if (!song) return TARGET_SIZE

    song.querySelectorAll('.cp-blank.cp-auto-break').forEach((el) => {
      el.classList.remove('cp-page-break', 'cp-auto-break')
    })

    const sections = [...song.children]
    const manualBreaks = new Set(
      sections.filter((el) => el.classList.contains('cp-page-break'))
    )

    if (manualBreaksMode || manualBreaks.size > 0) {
      if (manualBreaks.size === 0) {
        for (let size = MAX_SIZE; size >= MIN_SIZE; size--) {
          song.style.fontSize = size + 'px'
          if (song.scrollHeight <= PAGE_HEIGHT) return size
        }
        song.style.fontSize = MIN_SIZE + 'px'
        return MIN_SIZE
      }

      for (let size = MAX_SIZE; size >= MIN_SIZE; size--) {
        song.style.fontSize = size + 'px'
        let pageUsed = 0
        let fits = true
        for (const el of sections) {
          if (manualBreaks.has(el)) {
            pageUsed = 0
            continue
          }
          pageUsed += el.getBoundingClientRect().height
          if (pageUsed > PAGE_HEIGHT) {
            fits = false
            break
          }
        }
        if (fits) return size
      }
      song.style.fontSize = MIN_SIZE + 'px'
      return MIN_SIZE
    }

    // No manual breaks — try to fit on one page, sizing down from max
    for (let size = MAX_SIZE; size >= MIN_SIZE; size--) {
      song.style.fontSize = size + 'px'
      if (song.scrollHeight <= PAGE_HEIGHT) return size
    }

    // Doesn't fit on one page even at min size — auto-paginate
    let bestSize = MIN_SIZE
    for (let size = TARGET_SIZE; size >= MIN_SIZE; size--) {
      song.style.fontSize = size + 'px'

      const heights = sections.map((el) => ({
        el,
        h: el.getBoundingClientRect().height,
        isBlank: el.classList.contains('cp-blank'),
      }))

      let pageUsed = 0
      let fits = true
      const breakPoints = []

      for (let i = 0; i < heights.length; i++) {
        const { el, h, isBlank } = heights[i]
        if (pageUsed + h <= PAGE_HEIGHT) {
          pageUsed += h
        } else if (isBlank && pageUsed > 0) {
          breakPoints.push(el)
          pageUsed = 0
        } else if (pageUsed === 0) {
          pageUsed = h
        } else {
          let broke = false
          for (let j = i - 1; j >= 0; j--) {
            if (heights[j].isBlank && !breakPoints.includes(heights[j].el)) {
              breakPoints.push(heights[j].el)
              pageUsed = 0
              for (let k = j + 1; k <= i; k++) pageUsed += heights[k].h
              broke = true
              break
            }
          }
          if (!broke) {
            fits = false
            break
          }
        }
      }

      if (fits) {
        breakPoints.forEach((el) => {
          el.classList.add('cp-page-break', 'cp-auto-break')
        })
        bestSize = size
        break
      }
    }

    song.style.fontSize = bestSize + 'px'
    return bestSize
  }

  function autoFitTwoCol(wrapper, pageHeight) {
    const PAGE_HEIGHT = pageHeight || PORTRAIT_HEIGHT
    const rows = wrapper.querySelectorAll('.cp-two-col-row')
    for (let size = MAX_SIZE; size >= MIN_SIZE; size--) {
      wrapper.style.fontSize = size + 'px'
      let totalHeight = 0
      const header = wrapper.querySelector('.cp-two-col-header')
      if (header) totalHeight += header.getBoundingClientRect().height
      for (const row of rows) {
        totalHeight += row.getBoundingClientRect().height
      }
      if (totalHeight <= PAGE_HEIGHT) return size
    }
    wrapper.style.fontSize = MIN_SIZE + 'px'
    return MIN_SIZE
  }

  // Remove CCLI footer (the last .cp-verse that has no .cp-section header)
  function stripCCLI(containerEl) {
    const verses = containerEl.querySelectorAll('.cp-verse')
    if (!verses.length) return
    const last = verses[verses.length - 1]
    if (!last.querySelector('.cp-section')) {
      const prev = last.previousElementSibling
      if (prev && prev.classList.contains('cp-blank')) prev.remove()
      last.remove()
    }
  }

  // Check if any chord line (with actual chords) would overflow its column.
  // Temporarily forces nowrap to measure true content width.
  function hasHorizontalOverflow(containerEl) {
    const lines = containerEl.querySelectorAll('.cp-line')
    for (const line of lines) {
      if (!line.querySelector('.cp-chord')) continue
      const saved = line.style.whiteSpace
      line.style.whiteSpace = 'nowrap'
      const parent = line.closest('.cp-col') || line.closest('.cp-song') || line.closest('.cp-two-col') || containerEl
      const parentWidth = parent.getBoundingClientRect().width
      const overflow = line.scrollWidth > parentWidth + 2
      line.style.whiteSpace = saved
      if (overflow) return true
    }
    return false
  }

  // Determine the optimal print layout.
  // Prefer landscape 2-up: on one page if it fits at a readable size, otherwise
  // at TARGET_SIZE or the largest size whose chord lines don't overflow a column,
  // spilling onto further pages. Falls back to portrait single-column if 2-up
  // needs more pages or can't fit the chord lines.
  // Returns { layout: 'portrait'|'landscape', twoCol: boolean, fontSize: number, pages: number }
  function optimizeForPrint(contentEl) {
    const song = contentEl.querySelector('.cp-song') || contentEl.querySelector('.cp-two-col')
    if (!song) return { layout: 'portrait', twoCol: false, fontSize: TARGET_SIZE, pages: 1 }

    const savedHTML = contentEl.innerHTML
    const font = song.style.fontFamily

    const measure = document.createElement('div')
    measure.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;'
    document.body.appendChild(measure)

    function setupMeasure(width) {
      measure.style.width = width + 'px'
      measure.innerHTML = savedHTML
      stripCCLI(measure)
      measure.querySelectorAll('.cp-line').forEach(l => { l.style.paddingTop = '1.1em' })
      measure.querySelectorAll('.cp-song').forEach(s => { s.style.lineHeight = '1.3' })
      const el = measure.querySelector('.cp-song') || measure.querySelector('.cp-two-col')
      if (el && font) el.style.fontFamily = font
    }

    function countPages() {
      const s = measure.querySelector('.cp-song')
      if (!s) return 1
      return s.querySelectorAll('.cp-page-break').length + 1
    }

    // Test portrait single-col
    setupMeasure(PORTRAIT_WIDTH)
    const portraitSize = autoFitSize(measure, false, PORTRAIT_HEIGHT)
    const portraitPages = countPages()

    // Test landscape 2-up. Two passes, largest font first:
    //  1) big text (>= TARGET_SIZE) that still fits on a single page
    //  2) otherwise TARGET_SIZE or below, over as many pages as it takes —
    //     a readable sheet across two pages beats a one-page squint.
    setupMeasure(LANDSCAPE_WIDTH)
    let landscape2colSize = 0
    let landscape2colPages = 99
    for (let size = MAX_SIZE; size >= MIN_SIZE; size--) {
      const rows = buildTwoColFlow(measure, LANDSCAPE_HEIGHT, size)
      if (rows === false) break
      if (hasHorizontalOverflow(measure)) continue
      if (rows === 1 || size <= TARGET_SIZE) {
        landscape2colSize = size
        landscape2colPages = rows
        break
      }
    }

    document.body.removeChild(measure)

    // Prefer landscape 2-up when it doesn't cost extra pages — it uses the page
    // space most efficiently. Fall back to portrait otherwise.
    if (landscape2colSize >= MIN_SIZE && landscape2colPages <= portraitPages) {
      return {
        layout: 'landscape',
        twoCol: true,
        fontSize: landscape2colSize,
        pages: landscape2colPages,
      }
    }

    return { layout: 'portrait', twoCol: false, fontSize: portraitSize, pages: portraitPages }
  }



  // Open a print preview window with controls to adjust layout before printing.
  function printOptimized(cssText, contentEl, font) {
    const savedHTML = contentEl.innerHTML
    const best = optimizeForPrint(contentEl)

    // Strip CCLI from the source HTML, and drop the auto-breaks the on-screen
    // viewer inserted — those were fitted to the screen, not to the printed page.
    const tmp = document.createElement('div')
    tmp.innerHTML = savedHTML
    stripCCLI(tmp)
    tmp.querySelectorAll('.cp-blank.cp-auto-break').forEach((el) => {
      el.classList.remove('cp-page-break', 'cp-auto-break')
    })
    const cleanHTML = tmp.innerHTML

    const win = window.open('', '_blank')
    win.document.write(`<html><head>
<style>
${cssText}
body { margin: 0; padding: 0; font-family: -apple-system, sans-serif; }
.controls { position: fixed; top: 0; left: 0; right: 0; background: #f5f5f5; border-bottom: 1px solid #ccc; padding: 8px 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; z-index: 100; }
.controls button { padding: 4px 12px; cursor: pointer; }
.controls label { display: flex; align-items: center; gap: 4px; }
/* Grey preview area with a visible white "page" whose shape reflects orientation. */
#preview { padding: 60px 20px 20px; background: #e0e0e0; min-height: 100vh; box-sizing: border-box; }
#sheet { background: #fff; margin: 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.2); box-sizing: border-box; padding: 16px; width: 715px; min-height: 1047px; }
#sheet.landscape { width: 1060px; min-height: 730px; }
#content { }
.cp-song, .cp-two-col { font-family: ${font} !important; line-height: 1.3; }
.cp-line { padding-top: 1.1em; }
.cp-blank-clickable { cursor: default; }
.cp-blank.cp-page-break { border: none; margin: 0; padding: 0; }
.cp-blank.cp-page-break::after { display: none; }
.cp-two-col-row { break-inside: avoid; page-break-inside: avoid; }
/* Clip sideways only — clipping vertically would silently swallow content. */
.cp-col { overflow-x: clip; overflow-y: visible; }
@media print {
  .controls { display: none !important; }
  #preview { padding: 0; background: none; min-height: 0; }
  #sheet, #sheet.landscape { width: auto; box-shadow: none; padding: 0; margin: 0; }
  #content { padding: 0; }
  .cp-blank.cp-page-break { page-break-after: always; break-after: page; }
  /* Each row of columns is one printed page. */
  .cp-two-col-row + .cp-two-col-row { break-before: page; page-break-before: always; }
}
</style>
</head><body>
<div class="controls">
  <label>Size: <input type="range" id="size" min="10" max="36" value="${best.fontSize}" step="1"><span id="sizeLabel">${best.fontSize}px</span></label>
  <label><input type="checkbox" id="twoCol" ${best.twoCol ? 'checked' : ''}> 2-up</label>
  <label><input type="checkbox" id="landscape" ${best.layout === 'landscape' ? 'checked' : ''}> Landscape</label>
  <button id="printBtn">Print</button>
</div>
<div id="preview"><div id="sheet"><div id="content"></div></div></div>
<script src="${location.origin}/js/chord-layout.js"><\/script>
<script>
const sourceHTML = ${JSON.stringify(cleanHTML)};
const font = ${JSON.stringify(font)};

function rebuild() {
  const size = document.getElementById('size').value;
  const twoCol = document.getElementById('twoCol').checked;
  const landscape = document.getElementById('landscape').checked;
  document.getElementById('sizeLabel').textContent = size + 'px';

  // Reflect orientation in the on-screen preview sheet width before measuring...
  document.getElementById('sheet').classList.toggle('landscape', landscape);

  const content = document.getElementById('content');
  content.innerHTML = sourceHTML;
  const el = content.querySelector('.cp-song');
  if (el) { el.style.fontFamily = font; el.style.fontSize = size + 'px'; }

  if (twoCol) {
    const pageHeight = landscape ? ChordLayout.LANDSCAPE_HEIGHT : ChordLayout.PORTRAIT_HEIGHT;
    ChordLayout.buildTwoColFlow(content, pageHeight, Number(size));
  }

  const target = content.querySelector('.cp-two-col') || content.querySelector('.cp-song');
  if (target) { target.style.fontSize = size + 'px'; target.style.fontFamily = font; }

  // ...and in the actual printed page.
  let pageStyle = document.getElementById('pageStyle');
  if (!pageStyle) { pageStyle = document.createElement('style'); pageStyle.id = 'pageStyle'; document.head.appendChild(pageStyle); }
  pageStyle.textContent = '@page { size: ' + (landscape ? 'landscape' : 'portrait') + '; margin: 8mm; }';
}

document.getElementById('size').addEventListener('input', rebuild);
document.getElementById('twoCol').addEventListener('change', rebuild);
document.getElementById('landscape').addEventListener('change', rebuild);
document.getElementById('printBtn').addEventListener('click', () => window.print());
rebuild();
<\/script>
</body></html>`)
    win.document.close()

    return best
  }

  root.ChordLayout = {
    applyManualBreaks,
    applyTwoCol,
    unapplyTwoCol,
    buildTwoColFlow,
    clearPageBreaks,
    autoFitSize,
    autoFitTwoCol,
    optimizeForPrint,
    printOptimized,
    PORTRAIT_HEIGHT,
    LANDSCAPE_HEIGHT,
    MAX_SIZE,
    TARGET_SIZE,
    MIN_SIZE,
  }
})(typeof window !== 'undefined' ? window : globalThis)
