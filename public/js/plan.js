let currentPlan = null
let draggedEl = null

const posLabels = {
  0: 'Pre-service',
  1: 'Intro',
  2: 'Pre-sermon 1',
  3: 'Pre-sermon 2',
  4: 'Pre-sermon 3',
  5: 'Outro',
  6: 'Communion 1',
  7: 'Communion 2',
  8: 'Communion 3',
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

function buildSongCard(song, extraClass = '') {
  const el = document.createElement('div')
  el.className = `plan-song-card ${extraClass}`.trim()
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
      <span class="plan-song-position">${posLabels[song.position] ?? song.position}</span>
      <span class="plan-song-name song-swappable">${song.name}</span>
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
      <button class="btn btn-small btn-delete" data-song-id="${song.song_id}">&times;</button>
    </div>
  `

  el.addEventListener('dragstart', handleDragStart)
  el.addEventListener('dragover', handleDragOver)
  el.addEventListener('drop', handleDrop)
  el.addEventListener('dragend', handleDragEnd)

  return el
}

function renderSongs() {
  const container = document.getElementById('song-list')
  container.innerHTML = ''

  const preServiceSongs = currentPlan.songs.filter(s => s.position === 0)
  const mainSongs = currentPlan.songs.filter(s => s.position >= 1 && s.position <= 5)
  const communionSongs = currentPlan.songs.filter(s => s.position >= 6)

  if (preServiceSongs.length > 0) {
    const divider = document.createElement('div')
    divider.className = 'section-divider'
    divider.innerHTML = '<h3>Pre-service</h3>'
    container.appendChild(divider)
  }

  for (const song of preServiceSongs) {
    container.appendChild(buildSongCard(song))
  }

  const addPreBtn = document.createElement('div')
  addPreBtn.className = 'add-song-row'
  addPreBtn.innerHTML = preServiceSongs.length === 0
    ? `<button class="btn btn-small btn-outline add-song-btn" data-section="preservice">+ Add Pre-service Song</button>`
    : `<button class="btn btn-small btn-outline add-song-btn" data-section="preservice">+ Add Pre-service Song</button>`
  container.appendChild(addPreBtn)

  const mainDivider = document.createElement('div')
  mainDivider.className = 'section-divider'
  mainDivider.innerHTML = '<h3>Main Set</h3>'
  container.appendChild(mainDivider)

  for (const song of mainSongs) {
    container.appendChild(buildSongCard(song))
  }

  if (communionSongs.length > 0) {
    const divider = document.createElement('div')
    divider.className = 'communion-divider'
    divider.innerHTML = '<h3>Communion</h3>'
    container.appendChild(divider)

    for (const song of communionSongs) {
      container.appendChild(buildSongCard(song, 'communion-card'))
    }
  }

  // Add "Add Song" buttons
  const addMainBtn = document.createElement('div')
  addMainBtn.className = 'add-song-row'
  addMainBtn.innerHTML = `<button class="btn btn-small btn-outline add-song-btn" data-section="main">+ Add Song</button>`
  // Insert before communion divider or at end
  const communionDiv = container.querySelector('.communion-divider')
  if (communionDiv) {
    container.insertBefore(addMainBtn, communionDiv)
  } else {
    container.appendChild(addMainBtn)
  }

  if (communionSongs.length > 0 || container.querySelector('.communion-divider')) {
    const addCommunionBtn = document.createElement('div')
    addCommunionBtn.className = 'add-song-row'
    addCommunionBtn.innerHTML = `<button class="btn btn-small btn-outline add-song-btn" data-section="communion">+ Add Communion Song</button>`
    container.appendChild(addCommunionBtn)
  } else {
    const addCommunionBtn = document.createElement('div')
    addCommunionBtn.className = 'add-song-row'
    addCommunionBtn.innerHTML = `<button class="btn btn-small btn-outline add-song-btn" data-section="communion">+ Add Communion Song</button>`
    container.appendChild(addCommunionBtn)
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

  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', handleDeleteSong)
  })

  container.querySelectorAll('.song-swappable').forEach(el => {
    el.addEventListener('click', handleSwapSong)
  })

  container.querySelectorAll('.add-song-btn').forEach(btn => {
    btn.addEventListener('click', handleAddSong)
  })
}

async function handleDeleteSong(e) {
  const songId = e.currentTarget.dataset.songId
  if (!confirm('Remove this song from the plan?')) return

  await fetch(`/api/plan/${currentPlan.id}/songs/${songId}`, {
    method: 'DELETE',
  })

  await loadPlanById(currentPlan.id)
}

let allSongsCache = null

async function ensureSongsCache() {
  if (!allSongsCache) {
    const res = await fetch('/api/songs')
    allSongsCache = await res.json()
  }
  return allSongsCache
}

function createSongPicker(onSelect, onCancel) {
  const wrapper = document.createElement('div')
  wrapper.className = 'song-picker'
  wrapper.innerHTML = `
    <input type="text" class="song-picker-search" placeholder="Search songs...">
    <div class="song-picker-results"></div>
  `

  const search = wrapper.querySelector('.song-picker-search')
  const results = wrapper.querySelector('.song-picker-results')

  search.addEventListener('input', async () => {
    const songs = await ensureSongsCache()
    const query = search.value.toLowerCase()
    if (query.length < 2) { results.innerHTML = ''; return }

    const existing = currentPlan.songs.map(s => s.song_id)
    const matches = songs
      .filter(s => !s.excluded && s.name && s.name.toLowerCase().includes(query))
      .filter(s => !existing.includes(s.id))
      .slice(0, 8)

    let html = matches.map(s =>
      `<div class="song-picker-option" data-id="${s.id}">${s.name}${s.isHymn ? ' <span class="badge badge-hymn">Hymn</span>' : ''}</div>`
    ).join('')

    html += `<div class="song-picker-option song-picker-create" data-name="${search.value}">+ Add "${search.value}" as new song</div>`

    results.innerHTML = html

    results.querySelectorAll('.song-picker-option:not(.song-picker-create)').forEach(opt => {
      opt.addEventListener('click', () => {
        onSelect(Number(opt.dataset.id))
        wrapper.remove()
      })
    })

    results.querySelector('.song-picker-create')?.addEventListener('click', async () => {
      const name = search.value.trim()
      if (!name) return
      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const newSong = await res.json()
      allSongsCache = null
      onSelect(newSong.id)
      wrapper.remove()
    })
  })

  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (onCancel) onCancel()
      wrapper.remove()
    }
  })

  setTimeout(() => search.focus(), 50)
  return wrapper
}

async function handleSwapSong(e) {
  const card = e.currentTarget.closest('.plan-song-card')
  const oldSongId = Number(card.dataset.songId)
  const position = Number(card.dataset.position)

  const existing = card.querySelector('.song-picker')
  if (existing) { existing.remove(); return }

  const picker = createSongPicker(async (newSongId) => {
    await fetch(`/api/plan/${currentPlan.id}/songs/${oldSongId}`, { method: 'DELETE' })
    await fetch(`/api/plan/${currentPlan.id}/songs/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId: newSongId, position }),
    })
    await loadPlanById(currentPlan.id)
  })

  card.appendChild(picker)
}

async function handleAddSong(e) {
  const section = e.currentTarget.dataset.section
  const row = e.currentTarget.closest('.add-song-row')

  const existing = row.querySelector('.song-picker')
  if (existing) { existing.remove(); return }

  const picker = createSongPicker(async (songId) => {
    let position
    if (section === 'communion') {
      position = Math.max(6, ...currentPlan.songs.filter(s => s.position >= 6).map(s => s.position), 5) + 1
    } else if (section === 'preservice') {
      position = 0
    } else {
      position = Math.max(...currentPlan.songs.filter(s => s.position >= 1 && s.position <= 5).map(s => s.position), 0) + 1
    }

    await fetch(`/api/plan/${currentPlan.id}/songs/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ songId, position }),
    })
    await loadPlanById(currentPlan.id)
  })

  row.appendChild(picker)
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

// Edit Source
document.getElementById('edit-source-btn').addEventListener('click', async () => {
  const viewer = document.getElementById('chord-viewer')
  const file = viewer.dataset.currentFile
  if (!file) return

  const res = await fetch(`/api/chordpro/${encodeURIComponent(file)}?format=raw`)
  const source = await res.text()

  document.getElementById('source-textarea').value = source
  document.getElementById('source-editor').classList.remove('hidden')
  document.getElementById('chord-viewer-content').classList.add('hidden')

  // Load backups
  const backupsRes = await fetch(`/api/chordpro/${encodeURIComponent(file)}/backups`)
  const backups = await backupsRes.json()
  const restoreSelect = document.getElementById('restore-select')
  const restoreBtn = document.getElementById('restore-btn')
  if (backups.length > 0) {
    restoreSelect.innerHTML = '<option value="">Restore backup...</option>' +
      backups.map(b => `<option value="${b}">${b.split('.').slice(-1)[0].replace(/T/, ' ').replace(/-/g, ':').slice(0,16)}</option>`).join('')
    restoreSelect.classList.remove('hidden')
    restoreBtn.classList.remove('hidden')
  } else {
    restoreSelect.classList.add('hidden')
    restoreBtn.classList.add('hidden')
  }
})

document.getElementById('cancel-source-btn').addEventListener('click', () => {
  document.getElementById('source-editor').classList.add('hidden')
  document.getElementById('chord-viewer-content').classList.remove('hidden')
})

document.getElementById('restore-btn').addEventListener('click', async () => {
  const viewer = document.getElementById('chord-viewer')
  const file = viewer.dataset.currentFile
  const backup = document.getElementById('restore-select').value
  if (!file || !backup) return

  if (!confirm('Restore this backup? Current version will be overwritten.')) return

  await fetch(`/api/chordpro/${encodeURIComponent(file)}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backup }),
  })

  // Reload the source into editor
  const res = await fetch(`/api/chordpro/${encodeURIComponent(file)}?format=raw`)
  document.getElementById('source-textarea').value = await res.text()
})

document.getElementById('save-source-btn').addEventListener('click', async () => {
  const viewer = document.getElementById('chord-viewer')
  const file = viewer.dataset.currentFile
  const source = document.getElementById('source-textarea').value

  await fetch(`/api/chordpro/${encodeURIComponent(file)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  })

  // Re-render the preview
  document.getElementById('source-editor').classList.add('hidden')
  document.getElementById('chord-viewer-content').classList.remove('hidden')

  const card = document.querySelector(`.plan-song-card .btn-chords[data-file="${file}"]`)
  if (card) card.click()
})

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
