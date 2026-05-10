const form = document.getElementById('suggest-form')
const terminalContainer = document.getElementById('terminal-container')
const terminalFrame = document.getElementById('terminal-frame')
const stopBtn = document.getElementById('stop-btn')

// Reconnect to existing session on page load
async function checkExistingSession() {
  const res = await fetch('/api/terminal/status')
  const data = await res.json()
  if (data.running) {
    terminalFrame.src = data.url
    terminalContainer.classList.remove('hidden')
    form.classList.add('hidden')
  }
}
checkExistingSession()

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const date = document.getElementById('date').value
  const theme = document.getElementById('theme').value
  const passage = document.getElementById('passage').value

  document.getElementById('submit-btn').disabled = true

  try {
    const res = await fetch('/api/terminal/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, theme, passage }),
    })

    const data = await res.json()
    if (data.error) throw new Error(data.error)

    terminalFrame.src = data.url
    terminalContainer.classList.remove('hidden')
    form.classList.add('hidden')
  } catch (err) {
    alert('Failed to start terminal: ' + err.message)
    document.getElementById('submit-btn').disabled = false
  }
})

stopBtn.addEventListener('click', async () => {
  await fetch('/api/terminal/stop', { method: 'POST' })
  terminalFrame.src = ''
  terminalContainer.classList.add('hidden')
  form.classList.remove('hidden')
  document.getElementById('submit-btn').disabled = false
})
