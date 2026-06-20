// Chord sheet layout helpers — shared between the in-app chord viewer (plan.js)
// and the server-side PDF export (rendered inside a headless Chrome page).
//
// All functions operate on a passed-in container element rather than reaching
// into the page's UI controls, so they work in both contexts.
;(function (root) {
  'use strict'

  const PAGE_HEIGHT = 980
  const TARGET_SIZE = 20
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
    // Undo any existing 2-col layout first
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
      // Not enough explicit breaks — split content at midpoint of body sections
      const headerEls = children.filter(
        (c) =>
          c.tagName === 'H1' ||
          (c.tagName === 'P' &&
            (c.classList.contains('cp-artist') || c.classList.contains('cp-meta')))
      )
      const contentEls = children.filter((c) => !headerEls.includes(c))
      if (contentEls.length < 4) {
        return false // not enough content for two-col
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

    // Pull the title/artist/meta out into a single header that spans both columns
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
  // page breaks and set font-size.
  function autoFitSize(contentEl, manualBreaksMode) {
    const twoCol = contentEl.querySelector('.cp-two-col')
    if (twoCol) return autoFitTwoCol(twoCol)

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
        // User cleared all breaks — fit everything onto one page
        for (let size = TARGET_SIZE; size >= MIN_SIZE; size--) {
          song.style.fontSize = size + 'px'
          if (song.scrollHeight <= PAGE_HEIGHT) return size
        }
        song.style.fontSize = MIN_SIZE + 'px'
        return MIN_SIZE
      }

      for (let size = TARGET_SIZE; size >= MIN_SIZE; size--) {
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

    // No manual breaks and no user interaction — auto-paginate
    let bestSize = TARGET_SIZE
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

  function autoFitTwoCol(wrapper) {
    const rows = wrapper.querySelectorAll('.cp-two-col-row')
    for (let size = TARGET_SIZE; size >= MIN_SIZE; size--) {
      wrapper.style.fontSize = size + 'px'
      let fits = true
      for (const row of rows) {
        if (row.getBoundingClientRect().height > PAGE_HEIGHT) {
          fits = false
          break
        }
      }
      if (fits) return size
    }
    wrapper.style.fontSize = MIN_SIZE + 'px'
    return MIN_SIZE
  }

  root.ChordLayout = {
    applyManualBreaks,
    applyTwoCol,
    autoFitSize,
    autoFitTwoCol,
    PAGE_HEIGHT,
    TARGET_SIZE,
    MIN_SIZE,
  }
})(typeof window !== 'undefined' ? window : globalThis)
