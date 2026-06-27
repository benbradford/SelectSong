// Chord sheet layout helpers — shared between the in-app chord viewer (plan.js),
// the chord sheets page (chordpro.js), and the server-side PDF export.
//
// All functions operate on a passed-in container element rather than reaching
// into the page's UI controls, so they work in both contexts.
;(function (root) {
  'use strict'

  // Print-area heights (A4 at 96dpi with ~15mm margins)
  const PORTRAIT_HEIGHT = 960
  const LANDSCAPE_HEIGHT = 640

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

  // Apply or remove a 2-column layout in place.
  // Returns true if 2-col was applied, false if there wasn't enough content,
  // or undefined when only undoing an existing layout.
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

  // Returns the picked font size (in px). Mutates the DOM to add auto-paginated
  // page breaks and set font-size. pageHeight overrides the default.
  function autoFitSize(contentEl, manualBreaksMode, pageHeight) {
    const PAGE_HEIGHT = pageHeight || PORTRAIT_HEIGHT

    const twoCol = contentEl.querySelector('.cp-two-col')
    if (twoCol) return autoFitTwoCol(twoCol, PAGE_HEIGHT)

    const song = contentEl.querySelector('.cp-song')
    if (!song) return TARGET_SIZE

    // Clear previous auto-breaks
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

    // No manual breaks — try to fit on one page first, sizing UP from target
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

  // Determine the optimal layout for printing. Tests portrait single-col,
  // portrait 2-col, and landscape 2-col, picks whichever yields the largest
  // readable font size on a single page.
  // Returns { layout: 'portrait'|'landscape', twoCol: boolean, fontSize: number }
  function optimizeForPrint(contentEl) {
    const song = contentEl.querySelector('.cp-song') || contentEl.querySelector('.cp-two-col')
    if (!song) return { layout: 'portrait', twoCol: false, fontSize: TARGET_SIZE }

    const savedHTML = contentEl.innerHTML
    const savedFont = song.style.fontFamily

    // Test 1: Portrait single-column — fit everything on one page
    applyTwoCol(contentEl, false)
    const portraitSingle = autoFitSize(contentEl, false, PORTRAIT_HEIGHT)
    const portraitSinglePages = countPages(contentEl)

    // Test 2: Portrait 2-col
    contentEl.innerHTML = savedHTML
    restoreFont(contentEl, savedFont)
    applyTwoCol(contentEl, false)
    const applied2col = applyTwoCol(contentEl, true)
    let portrait2col = 0
    if (applied2col !== false) {
      portrait2col = autoFitSize(contentEl, false, PORTRAIT_HEIGHT)
    }

    // Test 3: Landscape 2-col
    contentEl.innerHTML = savedHTML
    restoreFont(contentEl, savedFont)
    applyTwoCol(contentEl, false)
    const appliedLandscape = applyTwoCol(contentEl, true)
    let landscape2col = 0
    if (appliedLandscape !== false) {
      landscape2col = autoFitSize(contentEl, false, LANDSCAPE_HEIGHT)
    }

    // Restore original state
    contentEl.innerHTML = savedHTML
    restoreFont(contentEl, savedFont)

    // Pick the best: largest font that fits on one page
    // Portrait single-col gets a slight bonus (+1) because no column splitting
    const candidates = [
      { layout: 'portrait', twoCol: false, fontSize: portraitSingle + 1, pages: portraitSinglePages },
      { layout: 'portrait', twoCol: true, fontSize: portrait2col, pages: 1 },
      { layout: 'landscape', twoCol: true, fontSize: landscape2col, pages: 1 },
    ].filter(c => c.fontSize > MIN_SIZE)

    // Prefer single-page layouts; among those, pick largest font
    const singlePage = candidates.filter(c => c.pages === 1)
    const pool = singlePage.length > 0 ? singlePage : candidates

    pool.sort((a, b) => b.fontSize - a.fontSize)
    const best = pool[0] || { layout: 'portrait', twoCol: false, fontSize: TARGET_SIZE }
    // Remove the bonus we added for comparison
    if (!best.twoCol) best.fontSize = Math.min(best.fontSize - 1, MAX_SIZE)

    return best
  }

  function countPages(contentEl) {
    const song = contentEl.querySelector('.cp-song')
    if (!song) return 1
    const breaks = song.querySelectorAll('.cp-page-break')
    return breaks.length + 1
  }

  function restoreFont(contentEl, font) {
    const el = contentEl.querySelector('.cp-song') || contentEl.querySelector('.cp-two-col')
    if (el && font) el.style.fontFamily = font
  }

  // Open a print window with optimal layout applied.
  // cssText: the chordpro.css content
  // contentEl: the container with the chord sheet
  // font: font-family string
  function printOptimized(cssText, contentEl, font) {
    const savedHTML = contentEl.innerHTML
    const savedFont = (contentEl.querySelector('.cp-song') || contentEl.querySelector('.cp-two-col'))?.style.fontFamily

    // Run optimizer
    const best = optimizeForPrint(contentEl)

    // Rebuild DOM in the chosen layout
    contentEl.innerHTML = savedHTML
    restoreFont(contentEl, savedFont)
    applyTwoCol(contentEl, false)
    if (best.twoCol) applyTwoCol(contentEl, true)

    const target = contentEl.querySelector('.cp-two-col') || contentEl.querySelector('.cp-song')
    if (target) {
      target.style.fontSize = best.fontSize + 'px'
      target.style.fontFamily = font
    }

    const content = contentEl.innerHTML

    // Restore the on-screen state
    contentEl.innerHTML = savedHTML
    restoreFont(contentEl, savedFont)

    const pageCSS = best.layout === 'landscape'
      ? '@page { size: landscape; margin: 10mm; }'
      : '@page { size: portrait; margin: 12mm; }'

    const overrideCSS = `
      ${pageCSS}
      body { margin: 0; padding: 0; }
      .cp-song, .cp-two-col { font-family: ${font} !important; font-size: ${best.fontSize}px !important; }
      .cp-blank-clickable { cursor: default; }
      .cp-blank.cp-page-break { border: none; margin: 0; padding: 0; page-break-after: always; break-after: page; }
      .cp-blank.cp-page-break::after { display: none; }
      .cp-two-col-row { break-inside: avoid; page-break-inside: avoid; }
    `

    const win = window.open('', '_blank')
    win.document.write(`<html><head><style>${cssText}\n${overrideCSS}</style></head><body>${content}</body></html>`)
    win.document.close()
    setTimeout(() => win.print(), 150)

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
