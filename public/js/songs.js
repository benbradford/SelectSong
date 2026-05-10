async function loadSongs() {
  const res = await fetch('/api/songs/candidates')
  const candidates = await res.json()

  const tbody = document.getElementById('songs-body')
  const search = document.getElementById('search')

  function render(filter = '') {
    const filtered = candidates.filter(c =>
      c.name.toLowerCase().includes(filter.toLowerCase())
    )
    tbody.innerHTML = filtered.map(c => `
      <tr>
        <td>${c.name}</td>
        <td>${c.author || ''}</td>
        <td>${c.isHymn ? '<span class="badge badge-hymn">Hymn</span>' : ''}</td>
        <td>${c.daysSinceLastPlayed !== null ? c.daysSinceLastPlayed + 'd ago' : 'Never'}</td>
        <td>${c.playCount}</td>
      </tr>
    `).join('')
  }

  render()
  search.addEventListener('input', (e) => render(e.target.value))
}

loadSongs()
