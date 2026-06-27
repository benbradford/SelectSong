// Chord sheet layout helpers — shared between the in-app chord viewer (plan.js),
// the chord sheets page (chordpro.js), and the server-side PDF export.
//
// All functions operate on a passed-in container element rather than reaching
// into the page's UI controls, so they work in both contexts.
;(function (root) {
  'use strict'

  // A4 print dimensions at 96dpi with margins
  const PORTRAIT_WIDTH = 553   // 146mm content width
  const PORTRAIT_HEIGHT = 1020 // 269mm content height (12mm margins)
  const LANDSCAPE_WIDTH = 860  // 227mm content width
  const LANDSCAPE_HEIGHT = 680 // 180mm content height

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

  // Check if any chord line (with actual chords) overflows its column
  function hasHorizontalOverflow(containerEl) {
    const lines = containerEl.querySelectorAll('.cp-line')
    for (const line of lines) {
      if (!line.querySelector('.cp-chord')) continue
      const parent = line.closest('.cp-col') || line.closest('.cp-song') || line.closest('.cp-two-col') || containerEl
      const parentWidth = parent.getBoundingClientRect().width
      if (line.scrollWidth > parentWidth + 2) return true
    }
    return false
  }

  // Determine the optimal print layout. Tests portrait single-col, portrait
  // 2-col, and landscape 2-col. Rejects layouts where chord lines overflow.
  // Returns { layout: 'portrait'|'landscape', twoCol: boolean, fontSize: number }
  function optimizeForPrint(contentEl) {
    const song = contentEl.querySelector('.cp-song') || contentEl.querySelector('.cp-two-col')
    if (!song) return { layout: 'portrait', twoCol: false, fontSize: TARGET_SIZE }

    const savedHTML = contentEl.innerHTML
    const font = song.style.fontFamily

    const measure = document.createElement('div')
    measure.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;'
    document.body.appendChild(measure)

    function testLayout(width, height, useTwoCol) {
      measure.style.width = width + 'px'
      measure.innerHTML = savedHTML
      // Apply print-tight spacing for accurate measurement
      measure.querySelectorAll('.cp-line').forEach(l => { l.style.paddingTop = '1.1em' })
      measure.querySelectorAll('.cp-song').forEach(s => { s.style.lineHeight = '1.3' })
      const el = measure.querySelector('.cp-song') || measure.querySelector('.cp-two-col')
      if (el && font) el.style.fontFamily = font
      applyTwoCol(measure, false)
      if (useTwoCol) {
        const result = applyTwoCol(measure, true)
        if (result === false) return 0
      }
      const size = autoFitSize(measure, false, height)
      // Reject if chord lines overflow columns
      if (hasHorizontalOverflow(measure)) return 0
      return size
    }

    const portraitSingle = testLayout(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, false)
    const portraitSinglePages = countPages(measure)
    const portrait2col = testLayout(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, true)
    const landscape2col = testLayout(LANDSCAPE_WIDTH, LANDSCAPE_HEIGHT, true)

    document.body.removeChild(measure)

    // Decision logic:
    // 1. If portrait single-col fits on one page at >=12px, always use it
    //    (cleanest layout, no column splitting, full width for chords)
    // 2. Otherwise pick the largest font among viable options
    if (portraitSingle >= 12 && portraitSinglePages === 1) {
      return { layout: 'portrait', twoCol: false, fontSize: portraitSingle }
    }

    const candidates = [
      { layout: 'portrait', twoCol: false, fontSize: portraitSingle, pages: portraitSinglePages },
      { layout: 'portrait', twoCol: true, fontSize: portrait2col, pages: 1 },
      { layout: 'landscape', twoCol: true, fontSize: landscape2col, pages: 1 },
    ].filter(c => c.fontSize > 0)

    const singlePage = candidates.filter(c => c.pages === 1)
    const pool = singlePage.length > 0 ? singlePage : candidates

    pool.sort((a, b) => b.fontSize - a.fontSize)
    return pool[0] || { layout: 'portrait', twoCol: false, fontSize: TARGET_SIZE }
  }

  function countPages(contentEl) {
    const song = contentEl.querySelector('.cp-song')
    if (!song) return 1
    const breaks = song.querySelectorAll('.cp-page-break')
    return breaks.length + 1
  }

  // Open a print window with optimal layout applied.
  function printOptimized(cssText, contentEl, font) {
    const savedHTML = contentEl.innerHTML

    const best = optimizeForPrint(contentEl)

    // Build final print content in a width-constrained container
    const width = best.layout === 'landscape' ? LANDSCAPE_WIDTH : PORTRAIT_WIDTH
    const build = document.createElement('div')
    build.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;width:${width}px;`
    document.body.appendChild(build)
    build.innerHTML = savedHTML
    const el = build.querySelector('.cp-song') || build.querySelector('.cp-two-col')
    if (el) el.style.fontFamily = font
    applyTwoCol(build, false)
    if (best.twoCol) applyTwoCol(build, true)
    const target = build.querySelector('.cp-two-col') || build.querySelector('.cp-song')
    if (target) {
      target.style.fontSize = best.fontSize + 'px'
      target.style.fontFamily = font
    }
    const content = build.innerHTML
    document.body.removeChild(build)

    const pageCSS = best.layout === 'landscape'
      ? '@page { size: landscape; margin: 10mm; }'
      : '@page { size: portrait; margin: 12mm; }'

    const overrideCSS = `
      ${pageCSS}
      body { margin: 0; padding: 0; }
      .cp-song, .cp-two-col { font-family: ${font} !important; font-size: ${best.fontSize}px !important; line-height: 1.3; }
      .cp-line { padding-top: 1.1em; }
      .cp-blank-clickable { cursor: default; }
      .cp-blank.cp-page-break { border: none; margin: 0; padding: 0; page-break-after: always; break-after: page; }
      .cp-blank.cp-page-break::after { display: none; }
      .cp-two-col-row { break-inside: avoid; page-break-inside: avoid; }
      .cp-col { overflow: hidden; }
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
