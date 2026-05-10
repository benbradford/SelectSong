async function init() {
  const fileSelect = document.getElementById('file-select')
  const keySelect = document.getElementById('key-select')
  const output = document.getElementById('chord-output')
  const printBtn = document.getElementById('print-btn')

  const res = await fetch('/api/chordpro')
  const files = await res.json()

  for (const f of files) {
    const opt = document.createElement('option')
    opt.value = f
    opt.textContent = f.replace(/\.(cho|chordpro|txt)$/, '')
    fileSelect.appendChild(opt)
  }

  async function loadSheet() {
    const file = fileSelect.value
    if (!file) { output.innerHTML = ''; return }
    const key = keySelect.value
    const params = new URLSearchParams({ format: 'html' })
    if (key) params.set('key', key)
    const r = await fetch(`/api/chordpro/${encodeURIComponent(file)}?${params}`)
    output.innerHTML = await r.text()
  }

  fileSelect.addEventListener('change', loadSheet)
  keySelect.addEventListener('change', loadSheet)
  printBtn.addEventListener('click', () => window.print())

  document.getElementById('spacing-slider').addEventListener('input', (e) => {
    const song = output.querySelector('.cp-song')
    if (song) song.style.setProperty('--cp-spacing', e.target.value)
  })

  document.getElementById('font-select').addEventListener('change', (e) => {
    const song = output.querySelector('.cp-song')
    if (song) song.style.fontFamily = e.target.value
  })
}

init()
