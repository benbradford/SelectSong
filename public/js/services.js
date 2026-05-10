async function loadServices() {
  const res = await fetch('/api/services/recent')
  const services = await res.json()
  const container = document.getElementById('services-list')

  container.innerHTML = services.map(s => `
    <div class="service-card">
      <h3>${s.date} — ${s.musicLeader || 'Unknown'}</h3>
      <ul>
        ${s.songs.map(name => `<li>${name}</li>`).join('')}
      </ul>
    </div>
  `).join('')
}

loadServices()
