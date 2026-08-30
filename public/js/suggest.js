const form = document.getElementById('suggest-form')
const terminalContainer = document.getElementById('terminal-container')
const terminalFrame = document.getElementById('terminal-frame')
const stopBtn = document.getElementById('stop-btn')

function showTerminal(url) {
  // Each session gets its own port, so the URL itself differs per session —
  // no cache-busting needed (ttyd would parse a query string as its own option)
  terminalFrame.src = url
  terminalContainer.classList.remove('hidden')
  form.classList.add('hidden')
}

function hideTerminal() {
  terminalFrame.src = 'about:blank'
  terminalContainer.classList.add('hidden')
  form.classList.remove('hidden')
  document.getElementById('submit-btn').disabled = false
}

// Reconnect to existing session on page load
async function checkExistingSession() {
  const res = await fetch('/api/terminal/status')
  const data = await res.json()
  if (data.running) showTerminal(data.url)
}
checkExistingSession()

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const date = document.getElementById('date').value
  const theme = document.getElementById('theme').value
  const passage = document.getElementById('passage').value
  const notes = document.getElementById('notes').value

  document.getElementById('submit-btn').disabled = true

  try {
    const res = await fetch('/api/terminal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, theme, passage, notes }),
    })

    const data = await res.json()
    if (data.error) throw new Error(data.error)

    showTerminal(data.url)
  } catch (err) {
    alert('Failed to start terminal: ' + err.message)
    document.getElementById('submit-btn').disabled = false
  }
})

stopBtn.addEventListener('click', async () => {
  await fetch('/api/terminal/stop', { method: 'POST' })
  hideTerminal()
})
