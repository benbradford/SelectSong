const form = document.getElementById('suggest-form')
const loading = document.getElementById('loading')
const results = document.getElementById('results')
const error = document.getElementById('error')

const positionLabels = {
  'intro': 'Intro',
  'pre-sermon-1': 'Pre-sermon 1',
  'pre-sermon-2': 'Pre-sermon 2',
  'pre-sermon-3': 'Pre-sermon 3',
  'outro': 'Outro',
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const theme = document.getElementById('theme').value
  const passage = document.getElementById('passage').value

  loading.classList.remove('hidden')
  results.classList.add('hidden')
  error.classList.add('hidden')
  document.getElementById('submit-btn').disabled = true

  try {
    const res = await fetch('/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme, passage }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Request failed')
    }

    const data = await res.json()

    const recBody = document.querySelector('#recommendations-table tbody')
    recBody.innerHTML = data.recommendations.map(r => `
      <tr>
        <td><strong>${positionLabels[r.position] || r.position}</strong></td>
        <td>${r.songName}</td>
        <td>${r.rating}/10</td>
        <td>${r.rationale}</td>
      </tr>
    `).join('')

    const altBody = document.querySelector('#alternatives-table tbody')
    altBody.innerHTML = (data.alternatives || []).map(a => `
      <tr>
        <td>${a.songName}</td>
        <td>${a.rating}/10</td>
        <td>${a.bestAs}</td>
        <td>${a.rationale}</td>
      </tr>
    `).join('')

    results.classList.remove('hidden')
  } catch (err) {
    error.textContent = err.message
    error.classList.remove('hidden')
  } finally {
    loading.classList.add('hidden')
    document.getElementById('submit-btn').disabled = false
  }
})
