let currentPlan = null
let draggedEl = null

const posLabels = {
  1: 'Intro',
  2: 'Pre-sermon 1',
  3: 'Pre-sermon 2',
  4: 'Pre-sermon 3',
  5: 'Outro',
}

const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

async function loadPlan() {
  // Load upcoming plans into the selector
  const allRes = await fetch('/api/plan/all')
  const allPlans = await allRes.json()

  if (!allPlans.length) {
    document.getElementById('no-plan').classList.remove('hidden')
    loadArchives()
    return
  }

  const select = document.getElementById('plan-select')
  select.innerHTML = ''
  for (const p of allPlans) {
    const opt = document.createElement('option')
    opt.value = p.id
    opt.textContent = `${p.date}${p.theme ? ' — ' + p.theme : ''}`
    select.appendChild(opt)
  }

  // Check URL for specific plan ID
  const urlParams = new URLSearchParams(window.location.search)
  const requestedId = urlParams.get('id')
  if (requestedId) select.value = requestedId

  select.addEventListener('change', () => loadPlanById(select.value))

  await loadPlanById(select.value)
  loadArchives()
}

async function loadPlanById(id) {
  const res = await fetch(`/api/plan/${id}`)
  const plan = await res.json()

  if (!plan) return

  currentPlan = plan
  document.getElementById('plan-view').classList.remove('hidden')
  document.getElementById('plan-date').textContent = plan.date
  document.getElementById('plan-theme').textContent = plan.theme ? `Theme: ${plan.theme}` : ''
  document.getElementById('plan-passage').textContent = plan.bible_passage ? `Passage: ${plan.bible_passage}` : ''

  renderSongs()
}

function renderSongs() {
  const container = document.getElementById('song-list')
  container.innerHTML = ''

  for (const song of currentPlan.songs) {
    const el = document.createElement('div')
    el.className = 'plan-song-card'
    el.draggable = true
    el.dataset.songId = song.song_id
    el.dataset.position = song.position

    const currentKey = song.key || song.default_key || ''
    const keyOptions = keys.map(k =>
      `<option value="${k}" ${k === currentKey ? 'selected' : ''}>${k}</option>`
    ).join('')

    const needsUpload = !song.chordpro_file || !song.sheet_pdf
    const uploadHtml = needsUpload
      ? `<label class="btn btn-small btn-upload">Upload <input type="file" class="file-upload" data-song-id="${song.song_id}" multiple accept=".txt,.cho,.chordpro,.pdf" hidden></label>`
      : ''

    el.innerHTML = `
      <div class="plan-song-drag">&#x2630;</div>
      <div class="plan-song-info">
        <span class="plan-song-position">${posLabels[song.position] || song.position}</span>
        <span class="plan-song-name">${song.name}</span>
        ${song.is_hymn ? '<span class="badge badge-hymn">Hymn</span>' : ''}
      </div>
      <div class="plan-song-controls">
        <select class="key-select" data-song-id="${song.song_id}">
          <option value="">Key</option>
          ${keyOptions}
        </select>
        ${song.chordpro_file
          ? `<button class="btn btn-small btn-chords" data-file="${song.chordpro_file}" data-key="${currentKey}">Chords</button>`
          : ''}
        ${song.sheet_pdf
          ? `<a href="/sheets/${encodeURIComponent(song.sheet_pdf)}" target="_blank" class="btn btn-small">PDF</a>`
          : ''}
        ${song.songselect_url
          ? `<a href="${song.songselect_url}" target="_blank" class="btn btn-small btn-outline">SongSelect</a>`
          : ''}
        ${uploadHtml}
      </div>
    `

    el.addEventListener('dragstart', handleDragStart)
    el.addEventListener('dragover', handleDragOver)
    el.addEventListener('drop', handleDrop)
    el.addEventListener('dragend', handleDragEnd)

    container.appendChild(el)
  }

  container.querySelectorAll('.key-select').forEach(select => {
    select.addEventListener('change', handleKeyChange)
  })

  container.querySelectorAll('.btn-chords').forEach(btn => {
    btn.addEventListener('click', handleViewChords)
  })

  container.querySelectorAll('.file-upload').forEach(input => {
    input.addEventListener('change', handleFileUpload)
  })
}

async function handleFileUpload(e) {
  const songId = e.target.dataset.songId
  const files = e.target.files
  if (!files.length) return

  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file, file.name)
  }

  const res = await fetch(`/api/upload/${songId}`, {
    method: 'POST',
    body: formData,
  })

  const result = await res.json()
  if (result.updates) {
    // Reload the plan to reflect new files
    await loadPlanById(currentPlan.id)
  }
}

function handleDragStart(e) {
  draggedEl = e.currentTarget
  e.currentTarget.classList.add('dragging')
  e.dataTransfer.effectAllowed = 'move'
}

function handleDragOver(e) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  const target = e.currentTarget
  if (target !== draggedEl && target.classList.contains('plan-song-card')) {
    target.classList.add('drag-over')
  }
}

function handleDrop(e) {
  e.preventDefault()
  const target = e.currentTarget
  target.classList.remove('drag-over')

  if (target === draggedEl) return

  const container = document.getElementById('song-list')
  const cards = [...container.querySelectorAll('.plan-song-card')]
  const fromIndex = cards.indexOf(draggedEl)
  const toIndex = cards.indexOf(target)

  if (fromIndex < toIndex) {
    target.after(draggedEl)
  } else {
    target.before(draggedEl)
  }

  saveOrder()
}

function handleDragEnd(e) {
  e.currentTarget.classList.remove('dragging')
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'))
  draggedEl = null
}

async function saveOrder() {
  const container = document.getElementById('song-list')
  const cards = [...container.querySelectorAll('.plan-song-card')]

  const songs = cards.map((card, i) => {
    const songId = Number(card.dataset.songId)
    const keySelect = card.querySelector('.key-select')
    return {
      songId,
      position: i + 1,
      key: keySelect?.value || null,
    }
  })

  await fetch(`/api/plan/${currentPlan.id}/songs`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ songs }),
  })

  // Reload to update position labels
  const res = await fetch(`/api/plan/${currentPlan.id}`)
  currentPlan = await res.json()
  renderSongs()
}

async function handleKeyChange(e) {
  const container = document.getElementById('song-list')
  const cards = [...container.querySelectorAll('.plan-song-card')]

  const songs = cards.map((card, i) => {
    const songId = Number(card.dataset.songId)
    const keySelect = card.querySelector('.key-select')
    return {
      songId,
      position: i + 1,
      key: keySelect?.value || null,
    }
  })

  await fetch(`/api/plan/${currentPlan.id}/songs`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ songs }),
  })

  // Update the chords button data-key and refresh viewer if open
  const card = e.target.closest('.plan-song-card')
  const chordsBtn = card.querySelector('.btn-chords')
  if (chordsBtn) {
    chordsBtn.dataset.key = e.target.value
    // If chord viewer is open for this song, refresh it
    const viewer = document.getElementById('chord-viewer')
    if (!viewer.classList.contains('hidden') && viewer.dataset.currentFile === chordsBtn.dataset.file) {
      chordsBtn.click()
    }
  }
}

async function handleViewChords(e) {
  const file = e.currentTarget.dataset.file
  const card = e.currentTarget.closest('.plan-song-card')
  const keySelect = card.querySelector('.key-select')
  const key = keySelect?.value || e.currentTarget.dataset.key
  const params = new URLSearchParams({ format: 'html' })
  if (key) params.set('key', key)

  const res = await fetch(`/api/chordpro/${encodeURIComponent(file)}?${params}`)
  const html = await res.text()

  const viewer = document.getElementById('chord-viewer')
  viewer.dataset.currentFile = file
  document.getElementById('chord-viewer-title').textContent = file.replace(/\.(cho|chordpro|txt)$/, '')
  document.getElementById('chord-viewer-content').innerHTML = html
  viewer.classList.remove('hidden')

  // Apply current font
  const font = document.getElementById('font-select').value
  const song = document.querySelector('#chord-viewer-content .cp-song')
  if (song) {
    song.style.fontFamily = font
  }
  setupPageBreakClickHandlers()

  if (document.getElementById('auto-size').checked) {
    autoFitSize()
  } else {
    const size = document.getElementById('size-slider').value
    if (song) song.style.fontSize = size + 'px'
  }
}

function setupPageBreakClickHandlers() {
  const blanks = document.querySelectorAll('#chord-viewer-content .cp-blank')
  blanks.forEach(blank => {
    blank.classList.add('cp-blank-clickable')
    blank.addEventListener('click', () => {
      blank.classList.toggle('cp-page-break')
      if (document.getElementById('auto-size').checked) autoFitSize()
    })
  })
}

document.getElementById('chord-viewer-close').addEventListener('click', () => {
  document.getElementById('chord-viewer').classList.add('hidden')
})

document.getElementById('chord-viewer-print').addEventListener('click', async () => {
  const content = document.getElementById('chord-viewer-content').innerHTML
  const font = document.getElementById('font-select').value
  const size = document.getElementById('size-slider').value
  const cssRes = await fetch('/css/chordpro.css')
  const css = await cssRes.text()
  const win = window.open('', '_blank')
  win.document.write(`<html><head><style>${css} .cp-song { font-family: ${font}; font-size: ${size}px; } .cp-blank-clickable { cursor: default; } .cp-blank.cp-page-break { border: none; margin: 0; padding: 0; page-break-after: always; break-after: page; } .cp-blank.cp-page-break::after { display: none; }</style></head><body>${content}</body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 100)
})

document.getElementById('print-summary-btn').addEventListener('click', () => {
  window.print()
})


document.getElementById('font-select').addEventListener('change', (e) => {
  const song = document.querySelector('#chord-viewer-content .cp-song')
  if (song) song.style.fontFamily = e.target.value
  if (document.getElementById('auto-size').checked) autoFitSize()
})

document.getElementById('size-slider').addEventListener('input', (e) => {
  document.getElementById('auto-size').checked = false
  const song = document.querySelector('#chord-viewer-content .cp-song')
  if (song) song.style.fontSize = e.target.value + 'px'
  document.getElementById('size-label').textContent = e.target.value + 'px'
})

document.getElementById('auto-size').addEventListener('change', (e) => {
  if (e.target.checked) autoFitSize()
})

function autoFitSize() {
  const song = document.querySelector('#chord-viewer-content .cp-song')
  if (!song) return

  // Find page break positions to determine page contents
  const pageBreaks = song.querySelectorAll('.cp-page-break')
  const pageHeight = 980 // A4 printable area approx

  // Get all top-level children grouped by pages
  const pages = []
  let currentPage = []
  for (const child of song.children) {
    if (child.classList.contains('cp-page-break')) {
      if (currentPage.length) pages.push(currentPage)
      currentPage = []
    } else {
      currentPage.push(child)
    }
  }
  if (currentPage.length) pages.push(currentPage)

  // If no page breaks set, treat entire song as one page
  if (pages.length === 0) pages.push([...song.children])

  // Binary search for best font size that fits each page
  let bestSize = 12
  for (let size = 24; size >= 12; size--) {
    song.style.fontSize = size + 'px'
    let fits = true
    for (const page of pages) {
      let totalHeight = 0
      for (const el of page) {
        totalHeight += el.getBoundingClientRect().height
      }
      if (totalHeight > pageHeight) {
        fits = false
        break
      }
    }
    if (fits) {
      bestSize = size
      break
    }
  }

  song.style.fontSize = bestSize + 'px'
  document.getElementById('size-slider').value = bestSize
  document.getElementById('size-label').textContent = bestSize + 'px'
}

// Archive button
document.getElementById('archive-btn').addEventListener('click', async () => {
  if (!currentPlan) return
  if (!confirm(`Archive the plan for ${currentPlan.date}?`)) return

  await fetch(`/api/plan/${currentPlan.id}/archive`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived: true }),
  })

  loadPlan()
})

async function loadArchives() {
  const res = await fetch('/api/plan/all?archived=1')
  const archived = await res.json()

  const section = document.getElementById('archives-section')
  const list = document.getElementById('archives-list')

  if (!archived.length) {
    section.classList.add('hidden')
    return
  }

  section.classList.remove('hidden')
  list.innerHTML = archived.map(p => `
    <div class="service-card">
      <h3>${p.date}${p.theme ? ' — ' + p.theme : ''}</h3>
      <button class="btn btn-small btn-outline" onclick="unarchive(${p.id})">Restore</button>
    </div>
  `).join('')
}

async function unarchive(id) {
  await fetch(`/api/plan/${id}/archive`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived: false }),
  })
  loadPlan()
}

loadPlan()
