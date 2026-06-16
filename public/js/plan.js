let currentPlan = null
let draggedEl = null
let manualBreaksMode = false
let currentViewSongId = null
let savedBreakIndices = []

const COMMUNION_OFFSET = 1000

function posLabel(pos) {
  if (pos === 0) return 'Pre-service'
  if (pos >= COMMUNION_OFFSET) return `Communion ${pos - COMMUNION_OFFSET + 1}`
  return `Song ${pos}`
}

const keys = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']

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

  const showNotes = song.position >= 1 && song.position < COMMUNION_OFFSET
  el.innerHTML = `
    <div class="plan-song-drag">&#x2630;</div>
    <div class="plan-song-info">
      <span class="plan-song-position">${posLabel(song.position)}</span>
      <span class="plan-song-name song-swappable">${song.name}</span>
      ${song.is_hymn ? '<span class="badge badge-hymn">Hymn</span>' : ''}
      ${showNotes ? `<input class="plan-song-notes-input" placeholder="Justification..." value="${(song.notes || '').replace(/"/g, '&quot;')}" data-song-id="${song.song_id}">` : ''}
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
  const mainSongs = currentPlan.songs.filter(s => s.position >= 1 && s.position < COMMUNION_OFFSET)
  const communionSongs = currentPlan.songs.filter(s => s.position >= COMMUNION_OFFSET)

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

  container.querySelectorAll('.plan-song-notes-input').forEach(input => {
    input.addEventListener('blur', handleNotesChange)
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur() })
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
      const communionPositions = currentPlan.songs.filter(s => s.position >= COMMUNION_OFFSET).map(s => s.position)
      position = Math.max(COMMUNION_OFFSET, ...communionPositions, COMMUNION_OFFSET - 1) + 1
    } else if (section === 'preservice') {
      position = 0
    } else {
      const mainPositions = currentPlan.songs.filter(s => s.position >= 1 && s.position < COMMUNION_OFFSET).map(s => s.position)
      position = Math.max(...mainPositions, 0) + 1
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

function collectSongsFromCards() {
  const container = document.getElementById('song-list')
  const cards = [...container.querySelectorAll('.plan-song-card')]
  const preSongs = []
  const mainSongs = []
  const communionSongs = []
  for (const card of cards) {
    const origPos = Number(card.dataset.position)
    const songId = Number(card.dataset.songId)
    const keySelect = card.querySelector('.key-select')
    const notesInput = card.querySelector('.plan-song-notes-input')
    const entry = { songId, key: keySelect?.value || null, notes: notesInput?.value || null }
    if (origPos === 0) preSongs.push(entry)
    else if (origPos >= COMMUNION_OFFSET) communionSongs.push(entry)
    else mainSongs.push(entry)
  }
  return [
    ...preSongs.map(s => ({ ...s, position: 0 })),
    ...mainSongs.map((s, i) => ({ ...s, position: i + 1 })),
    ...communionSongs.map((s, i) => ({ ...s, position: i + COMMUNION_OFFSET })),
  ]
}

async function handleNotesChange() {
  const songs = collectSongsFromCards()
  await fetch(`/api/plan/${currentPlan.id}/songs`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ songs }),
  })
}

async function saveOrder() {
  const songs = collectSongsFromCards()

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
  const songs = collectSongsFromCards()

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

  currentViewSongId = Number(card.dataset.songId)

  const res = await fetch(`/api/chordpro/${encodeURIComponent(file)}?${params}`)
  const html = await res.text()

  manualBreaksMode = false
  const viewer = document.getElementById('chord-viewer')
  viewer.dataset.currentFile = file
  document.getElementById('chord-viewer-title').textContent = file.replace(/\.(cho|chordpro|txt)$/, '')
  document.getElementById('chord-viewer-content').innerHTML = html
  viewer.classList.remove('hidden')

  // Load saved display prefs for this song
  const prefsRes = await fetch(`/api/plan/display-prefs/${currentViewSongId}`)
  const prefs = await prefsRes.json()

  const fontSelect = document.getElementById('font-select')
  const sizeSlider = document.getElementById('size-slider')
  const autoSize = document.getElementById('auto-size')
  const twoCol = document.getElementById('two-col')

  savedBreakIndices = []

  if (prefs) {
    if (prefs.font) fontSelect.value = prefs.font
    if (prefs.font_size) {
      sizeSlider.value = prefs.font_size
      document.getElementById('size-label').textContent = prefs.font_size + 'px'
      autoSize.checked = false
    } else {
      autoSize.checked = true
    }
    twoCol.checked = !!prefs.two_col

    // Restore manual breaks
    if (prefs.manual_breaks) {
      manualBreaksMode = true
      const breakIndices = JSON.parse(prefs.manual_breaks)
      savedBreakIndices = breakIndices
      const blanks = document.querySelectorAll('#chord-viewer-content .cp-blank')
      for (const idx of breakIndices) {
        if (blanks[idx]) blanks[idx].classList.add('cp-page-break')
      }
    }
  } else {
    autoSize.checked = true
    twoCol.checked = false
  }

  const song = document.querySelector('#chord-viewer-content .cp-song')
  if (song) {
    song.style.fontFamily = fontSelect.value
  }
  setupPageBreakClickHandlers()

  // Size/break calculation must happen before 2-col, since applyTwoCol needs page breaks in the DOM
  if (autoSize.checked) {
    autoFitSize()
  } else {
    if (song) song.style.fontSize = sizeSlider.value + 'px'
  }

  if (twoCol.checked) {
    savedBreakIndices = collectBreakIndices()
    applyTwoCol()
  }
}

function collectBreakIndices() {
  const blanks = document.querySelectorAll('#chord-viewer-content .cp-blank')
  const indices = []
  blanks.forEach((blank, idx) => {
    if (blank.classList.contains('cp-page-break')) {
      indices.push(idx)
    }
  })
  return indices
}

async function saveDisplayPrefs() {
  if (!currentViewSongId) return
  const font = document.getElementById('font-select').value
  const autoSize = document.getElementById('auto-size').checked
  const fontSize = autoSize ? null : Number(document.getElementById('size-slider').value)
  const twoCol = document.getElementById('two-col').checked

  // When 2-col is active, breaks have been consumed from the DOM — use the saved copy
  const manualBreaks = twoCol ? savedBreakIndices : collectBreakIndices()

  await fetch(`/api/plan/display-prefs/${currentViewSongId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      font,
      fontSize,
      twoCol,
      manualBreaks: manualBreaks.length > 0 ? manualBreaks : null,
    }),
  })
}

// Edit Source
document.getElementById('edit-source-btn').addEventListener('click', async () => {
  const viewer = document.getElementById('chord-viewer')
  const file = viewer.dataset.currentFile
  if (!file) return

  const card = document.querySelector(`.plan-song-card .btn-chords[data-file="${file}"]`)?.closest('.plan-song-card')
  const keySelect = card?.querySelector('.key-select')
  const currentKey = keySelect?.value || ''
  const params = new URLSearchParams({ format: 'raw' })
  if (currentKey) params.set('key', currentKey)

  const res = await fetch(`/api/chordpro/${encodeURIComponent(file)}?${params}`)
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
      manualBreaksMode = true

      // Clear all auto-breaks
      const song = document.querySelector('#chord-viewer-content .cp-song')
      if (song) {
        song.querySelectorAll('.cp-blank.cp-auto-break').forEach(el => {
          el.classList.remove('cp-page-break', 'cp-auto-break')
        })
      }

      blank.classList.toggle('cp-page-break')
      savedBreakIndices = collectBreakIndices()

      if (document.getElementById('auto-size').checked) {
        autoFitSize()
      }
      saveDisplayPrefs()
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
  win.document.write(`<html><head><style>${css} .cp-song, .cp-two-col { font-family: ${font} !important; font-size: ${size}px !important; } .cp-blank-clickable { cursor: default; } .cp-blank.cp-page-break { border: none; margin: 0; padding: 0; page-break-after: always; break-after: page; } .cp-blank.cp-page-break::after { display: none; } .cp-two-col-row { break-inside: avoid; page-break-inside: avoid; }</style></head><body>${content}</body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 100)
})

document.getElementById('print-summary-btn').addEventListener('click', () => {
  window.print()
})


document.getElementById('font-select').addEventListener('change', (e) => {
  const target = document.querySelector('#chord-viewer-content .cp-two-col') || document.querySelector('#chord-viewer-content .cp-song')
  if (target) target.style.fontFamily = e.target.value
  if (document.getElementById('auto-size').checked) autoFitSize()
  saveDisplayPrefs()
})

let sizeDebounceTimer = null
document.getElementById('size-slider').addEventListener('input', (e) => {
  document.getElementById('auto-size').checked = false
  const target = document.querySelector('#chord-viewer-content .cp-two-col') || document.querySelector('#chord-viewer-content .cp-song')
  if (target) target.style.fontSize = e.target.value + 'px'
  document.getElementById('size-label').textContent = e.target.value + 'px'
  clearTimeout(sizeDebounceTimer)
  sizeDebounceTimer = setTimeout(() => saveDisplayPrefs(), 500)
})

document.getElementById('auto-size').addEventListener('change', (e) => {
  if (e.target.checked) autoFitSize()
  saveDisplayPrefs()
})

document.getElementById('two-col').addEventListener('change', () => {
  const twoCol = document.getElementById('two-col').checked
  if (twoCol) {
    savedBreakIndices = collectBreakIndices()
  }
  applyTwoCol()
  if (document.getElementById('auto-size').checked) autoFitSize()
  saveDisplayPrefs()
})

function applyTwoCol() {
  const content = document.getElementById('chord-viewer-content')
  const twoCol = document.getElementById('two-col').checked

  // Undo existing two-col layout
  const existing = content.querySelector('.cp-two-col')
  if (existing) {
    const origSong = document.createElement('div')
    origSong.className = 'cp-song'
    origSong.style.fontFamily = existing.style.fontFamily
    origSong.style.fontSize = existing.style.fontSize

    // Restore header elements
    existing.querySelectorAll('.cp-two-col-header > *').forEach(el => {
      origSong.appendChild(el)
    })

    // Restore column content with page breaks between sections
    const cols = [...existing.querySelectorAll('.cp-col')]
    cols.forEach((col, colIdx) => {
      ;[...col.children].forEach(el => origSong.appendChild(el))
      if (colIdx < cols.length - 1) {
        const brk = document.createElement('div')
        brk.className = 'cp-blank cp-page-break'
        origSong.appendChild(brk)
      }
    })

    existing.replaceWith(origSong)
    if (!twoCol) {
      setupPageBreakClickHandlers()
      return
    }
  }

  const song = content.querySelector('.cp-song')
  if (!song || !twoCol) return

  // Split at page breaks into sections
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
    // No page breaks found — split content at midpoint of verse blocks
    const headerEls = children.filter(c =>
      c.tagName === 'H1' || (c.tagName === 'P' && (c.classList.contains('cp-artist') || c.classList.contains('cp-meta')))
    )
    const contentEls = children.filter(c => !headerEls.includes(c))
    if (contentEls.length < 4) {
      document.getElementById('two-col').checked = false
      return
    }
    const mid = Math.floor(contentEls.length / 2)
    pages.length = 0
    // Include headers in first page so they get extracted downstream
    pages.push([...headerEls, ...contentEls.slice(0, mid)])
    pages.push(contentEls.slice(mid))
  }

  // Build two-col wrapper
  const wrapper = document.createElement('div')
  wrapper.className = 'cp-two-col'
  wrapper.style.fontFamily = song.style.fontFamily
  wrapper.style.fontSize = song.style.fontSize

  // Extract header (title/artist/key)
  const headerEls = pages[0].filter(el =>
    el.tagName === 'H1' || (el.tagName === 'P' && (el.classList.contains('cp-artist') || el.classList.contains('cp-meta')))
  )
  if (headerEls.length) {
    const header = document.createElement('div')
    header.className = 'cp-two-col-header'
    for (const el of headerEls) header.appendChild(el)
    wrapper.appendChild(header)
    pages[0] = pages[0].filter(el => !headerEls.includes(el))
    if (pages[0].length === 0) pages.shift()
  }

  // Pair sections into rows
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
}

function autoFitSize() {
  const twoCol = document.querySelector('#chord-viewer-content .cp-two-col')
  if (twoCol) {
    autoFitTwoCol(twoCol)
    return
  }
  const song = document.querySelector('#chord-viewer-content .cp-song')
  if (!song) return

  const PAGE_HEIGHT = 980
  const TARGET_SIZE = 20

  // Clear any previous auto page breaks
  song.querySelectorAll('.cp-blank.cp-auto-break').forEach(el => {
    el.classList.remove('cp-page-break', 'cp-auto-break')
  })

  const sections = [...song.children]
  const manualBreaks = new Set(
    sections.filter(el => el.classList.contains('cp-page-break'))
  )

  // If user has interacted with breaks or manual breaks exist, only adjust font size
  if (manualBreaksMode || manualBreaks.size > 0) {
    if (manualBreaks.size === 0) {
      // User removed all breaks — just fit everything on one page
      for (let size = TARGET_SIZE; size >= 10; size--) {
        song.style.fontSize = size + 'px'
        if (song.scrollHeight <= PAGE_HEIGHT) {
          document.getElementById('size-slider').value = size
          document.getElementById('size-label').textContent = size + 'px'
          return
        }
      }
      song.style.fontSize = '10px'
      document.getElementById('size-slider').value = 10
      document.getElementById('size-label').textContent = '10px'
      return
    }

    for (let size = TARGET_SIZE; size >= 10; size--) {
      song.style.fontSize = size + 'px'

      let pageUsed = 0
      let fits = true
      for (const el of sections) {
        if (manualBreaks.has(el)) {
          pageUsed = 0
          continue
        }
        pageUsed += el.getBoundingClientRect().height
        if (pageUsed > PAGE_HEIGHT) { fits = false; break }
      }

      if (fits) {
        document.getElementById('size-slider').value = size
        document.getElementById('size-label').textContent = size + 'px'
        return
      }
    }

    song.style.fontSize = '10px'
    document.getElementById('size-slider').value = 10
    document.getElementById('size-label').textContent = '10px'
    return
  }

  // No manual breaks and no user interaction — auto-paginate
  let bestSize = TARGET_SIZE
  for (let size = TARGET_SIZE; size >= 10; size--) {
    song.style.fontSize = size + 'px'

    const heights = sections.map(el => ({
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
            for (let k = j + 1; k <= i; k++) {
              pageUsed += heights[k].h
            }
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
      breakPoints.forEach(el => {
        el.classList.add('cp-page-break', 'cp-auto-break')
      })
      bestSize = size
      break
    }
  }

  song.style.fontSize = bestSize + 'px'
  document.getElementById('size-slider').value = bestSize
  document.getElementById('size-label').textContent = bestSize + 'px'
}

function autoFitTwoCol(wrapper) {
  const PAGE_HEIGHT = 980
  const TARGET_SIZE = 20
  const rows = wrapper.querySelectorAll('.cp-two-col-row')

  for (let size = TARGET_SIZE; size >= 10; size--) {
    wrapper.style.fontSize = size + 'px'
    let fits = true
    for (const row of rows) {
      if (row.getBoundingClientRect().height > PAGE_HEIGHT) {
        fits = false
        break
      }
    }
    if (fits) {
      document.getElementById('size-slider').value = size
      document.getElementById('size-label').textContent = size + 'px'
      return
    }
  }
  wrapper.style.fontSize = '10px'
  document.getElementById('size-slider').value = 10
  document.getElementById('size-label').textContent = '10px'
}

// Email draft
document.getElementById('email-draft-btn').addEventListener('click', () => {
  const draft = document.getElementById('email-draft')
  if (!draft.classList.contains('hidden')) {
    draft.classList.add('hidden')
    return
  }

  if (!currentPlan) return

  const mainSongs = currentPlan.songs.filter(s => s.position >= 1 && s.position < COMMUNION_OFFSET)
  const songLines = mainSongs.map((s, i) => `${i + 1}. ${s.name}`).join('\n')
  const reasonLines = mainSongs
    .filter(s => s.notes)
    .map((s, i) => `${i + 1}. ${s.notes}`)
    .join('\n')

  const date = currentPlan.date
  const theme = currentPlan.theme || ''
  const passage = currentPlan.bible_passage || ''

  let text = `Hi Vicar,\n\nHere are the songs for ${date}${theme || passage ? ` (${[theme, passage].filter(Boolean).join(' / ')})` : ''}:\n\n${songLines}`

  if (reasonLines) {
    text += `\n\nReasoning:\n${reasonLines}`
  }

  text += `\n\nLet me know if you'd like any changes.\n\nBen`

  document.getElementById('email-draft-content').textContent = text
  draft.classList.remove('hidden')
})

document.getElementById('copy-email-btn').addEventListener('click', () => {
  const text = document.getElementById('email-draft-content').textContent
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-email-btn')
    btn.textContent = 'Copied!'
    setTimeout(() => { btn.textContent = 'Copy to Clipboard' }, 2000)
  })
})

// Export All button
document.getElementById('export-all-btn').addEventListener('click', async () => {
  if (!currentPlan) return
  const btn = document.getElementById('export-all-btn')
  btn.textContent = 'Exporting...'
  btn.disabled = true

  try {
    const res = await fetch(`/api/plan/${currentPlan.id}/export`, { method: 'POST' })
    const result = await res.json()
    const summary = result.songs.map(s =>
      `${s.name}: ${[s.chordpro ? 'chords' : '', s.pdf ? 'PDF' : ''].filter(Boolean).join(', ') || 'no files'}`
    ).join('\n')
    alert(`Exported to ./${result.path}/\n\n${summary}`)
  } catch (err) {
    alert('Export failed: ' + err.message)
  } finally {
    btn.textContent = 'Export All'
    btn.disabled = false
  }
})

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
