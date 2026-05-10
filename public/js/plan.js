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
  const res = await fetch('/api/plan/latest')
  const plan = await res.json()

  if (!plan) {
    document.getElementById('no-plan').classList.remove('hidden')
    return
  }

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
}

document.getElementById('chord-viewer-close').addEventListener('click', () => {
  document.getElementById('chord-viewer').classList.add('hidden')
})

document.getElementById('chord-viewer-print').addEventListener('click', async () => {
  const content = document.getElementById('chord-viewer-content').innerHTML
  const cssRes = await fetch('/css/chordpro.css')
  const css = await cssRes.text()
  const win = window.open('', '_blank')
  win.document.write(`<html><head><style>${css}</style></head><body>${content}</body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 100)
})

document.getElementById('print-summary-btn').addEventListener('click', () => {
  window.print()
})

loadPlan()
