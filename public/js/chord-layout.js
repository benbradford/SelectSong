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

  function applyTwoCol(contentEl, twoColEnabled, onUnapplied) {
    const existing = contentEl.querySelector('.cp-two-col')
    if (existing) {
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
        if (colIdx < cols.length - 1) {
          const brk = document.createElement('div')
          brk.className = 'cp-blank cp-page-break'
          origSong.appendChild(brk)
        }
      })

      existing.replaceWith(origSong)
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
  // Priority: 1) fewest pages, 2) largest font, 3) maximize space.
  // 2-up rejected if chord lines overflow columns.
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

    // Test landscape 2-col — reduce font until no chord line overflow
    setupMeasure(LANDSCAPE_WIDTH)
    applyTwoCol(measure, false)
    const applied = applyTwoCol(measure, true)
    let landscape2colSize = 0
    let landscape2colPages = 99
    if (applied !== false) {
      const maxSize = autoFitSize(measure, false, LANDSCAPE_HEIGHT)
      for (let size = maxSize; size >= MIN_SIZE; size--) {
        const target = measure.querySelector('.cp-two-col')
        if (target) target.style.fontSize = size + 'px'
        if (!hasHorizontalOverflow(measure)) {
          landscape2colSize = size
          landscape2colPages = 1
          break
        }
      }
    }

    document.body.removeChild(measure)

    // Prefer landscape 2-up if it fits on 1 page without overflow.
    // It uses page space most efficiently. Fall back to portrait otherwise.
    if (landscape2colSize >= MIN_SIZE && landscape2colPages === 1) {
      return { layout: 'landscape', twoCol: true, fontSize: landscape2colSize, pages: 1 }
    }

    return { layout: 'portrait', twoCol: false, fontSize: portraitSize, pages: portraitPages }
  }



  // Open a print preview window with controls to adjust layout before printing.
  function printOptimized(cssText, contentEl, font) {
    const savedHTML = contentEl.innerHTML
    const best = optimizeForPrint(contentEl)

    // Strip CCLI from the source HTML
    const tmp = document.createElement('div')
    tmp.innerHTML = savedHTML
    stripCCLI(tmp)
    const cleanHTML = tmp.innerHTML

    const win = window.open('', '_blank')
    win.document.write(`<html><head>
<style>
${cssText}
body { margin: 0; padding: 0; font-family: -apple-system, sans-serif; }
.controls { position: fixed; top: 0; left: 0; right: 0; background: #f5f5f5; border-bottom: 1px solid #ccc; padding: 8px 16px; display: flex; align-items: center; gap: 12px; font-size: 13px; z-index: 100; }
.controls button { padding: 4px 12px; cursor: pointer; }
.controls label { display: flex; align-items: center; gap: 4px; }
#content { padding: 60px 20px 20px; }
.cp-song, .cp-two-col { font-family: ${font} !important; line-height: 1.3; }
.cp-line { padding-top: 1.1em; }
.cp-blank-clickable { cursor: default; }
.cp-blank.cp-page-break { border: none; margin: 0; padding: 0; }
.cp-blank.cp-page-break::after { display: none; }
.cp-two-col-row { break-inside: avoid; page-break-inside: avoid; }
.cp-col { overflow: hidden; }
@media print {
  .controls { display: none !important; }
  #content { padding: 0; }
  .cp-blank.cp-page-break { page-break-after: always; break-after: page; }
}
</style>
</head><body>
<div class="controls">
  <label>Size: <input type="range" id="size" min="10" max="36" value="${best.fontSize}" step="1"><span id="sizeLabel">${best.fontSize}px</span></label>
  <label><input type="checkbox" id="twoCol" ${best.twoCol ? 'checked' : ''}> 2-up</label>
  <label><input type="checkbox" id="landscape" ${best.layout === 'landscape' ? 'checked' : ''}> Landscape</label>
  <button id="printBtn">Print</button>
</div>
<div id="content"></div>
<script>
const sourceHTML = ${JSON.stringify(cleanHTML)};
const font = ${JSON.stringify(font)};

function rebuild() {
  const size = document.getElementById('size').value;
  const twoCol = document.getElementById('twoCol').checked;
  const landscape = document.getElementById('landscape').checked;
  document.getElementById('sizeLabel').textContent = size + 'px';

  const content = document.getElementById('content');
  content.innerHTML = sourceHTML;
  const el = content.querySelector('.cp-song') || content.querySelector('.cp-two-col');
  if (el) el.style.fontFamily = font;

  // Undo existing 2-col
  const existing = content.querySelector('.cp-two-col');
  if (existing) {
    const orig = document.createElement('div');
    orig.className = 'cp-song';
    orig.style.fontFamily = existing.style.fontFamily;
    existing.querySelectorAll('.cp-two-col-header > *').forEach(e => orig.appendChild(e));
    [...existing.querySelectorAll('.cp-col')].forEach((col, i, arr) => {
      [...col.children].forEach(e => orig.appendChild(e));
      if (i < arr.length - 1) { const b = document.createElement('div'); b.className = 'cp-blank'; orig.appendChild(b); }
    });
    existing.replaceWith(orig);
  }

  if (twoCol) {
    const song = content.querySelector('.cp-song');
    if (song) {
      const children = [...song.children];
      const headerEls = children.filter(c => c.tagName === 'H1' || (c.tagName === 'P' && (c.classList.contains('cp-artist') || c.classList.contains('cp-meta'))));
      const bodyEls = children.filter(c => !headerEls.includes(c));
      if (bodyEls.length >= 4) {
        const mid = Math.floor(bodyEls.length / 2);
        const wrapper = document.createElement('div');
        wrapper.className = 'cp-two-col';
        const header = document.createElement('div');
        header.className = 'cp-two-col-header';
        headerEls.forEach(e => header.appendChild(e));
        wrapper.appendChild(header);
        const row = document.createElement('div');
        row.className = 'cp-two-col-row';
        const left = document.createElement('div');
        left.className = 'cp-col';
        bodyEls.slice(0, mid).forEach(e => left.appendChild(e));
        const right = document.createElement('div');
        right.className = 'cp-col';
        bodyEls.slice(mid).forEach(e => right.appendChild(e));
        row.appendChild(left);
        row.appendChild(right);
        wrapper.appendChild(row);
        song.replaceWith(wrapper);
      }
    }
  }

  const target = content.querySelector('.cp-two-col') || content.querySelector('.cp-song');
  if (target) { target.style.fontSize = size + 'px'; target.style.fontFamily = font; }

  // Update @page
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
