async function init() {
  const fileSelect = document.getElementById('file-select')
  const keySelect = document.getElementById('key-select')
  const output = document.getElementById('chord-output')
  const printBtn = document.getElementById('print-btn')
  const twoColCheckbox = document.getElementById('two-col')
  const autoSizeCheckbox = document.getElementById('auto-size')
  const sizeSlider = document.getElementById('size-slider')
  const sizeLabel = document.getElementById('size-label')
  const fontSelect = document.getElementById('font-select')

  const res = await fetch('/api/chordpro')
  const files = await res.json()

  for (const f of files) {
    const opt = document.createElement('option')
    opt.value = f
    opt.textContent = f.replace(/\.(cho|chordpro|txt)$/, '')
    fileSelect.appendChild(opt)
  }

  function applyLayout() {
    const twoCol = twoColCheckbox.checked
    const result = ChordLayout.applyTwoCol(output, twoCol, () => {
      if (autoSizeCheckbox.checked) runAutoSize()
    })
    if (result === false) {
      twoColCheckbox.checked = false
    }
    if (autoSizeCheckbox.checked) runAutoSize()
  }

  function runAutoSize() {
    const size = ChordLayout.autoFitSize(output, false)
    sizeSlider.value = size
    sizeLabel.textContent = size + 'px'
  }

  async function loadSheet() {
    const file = fileSelect.value
    if (!file) { output.innerHTML = ''; return }
    const key = keySelect.value
    const params = new URLSearchParams({ format: 'html' })
    if (key) params.set('key', key)
    const r = await fetch(`/api/chordpro/${encodeURIComponent(file)}?${params}`)
    output.innerHTML = await r.text()

    const song = output.querySelector('.cp-song')
    if (song) {
      song.style.fontFamily = fontSelect.value
    }

    if (twoColCheckbox.checked) {
      const result = ChordLayout.applyTwoCol(output, true)
      if (result === false) twoColCheckbox.checked = false
    }

    if (autoSizeCheckbox.checked) {
      runAutoSize()
    }
  }

  fileSelect.addEventListener('change', loadSheet)
  keySelect.addEventListener('change', loadSheet)

  printBtn.addEventListener('click', async () => {
    if (!output.innerHTML.trim()) return
    const cssRes = await fetch('/css/chordpro.css')
    const cssText = await cssRes.text()
    const font = fontSelect.value
    ChordLayout.printOptimized(cssText, output, font)
  })

  twoColCheckbox.addEventListener('change', applyLayout)

  fontSelect.addEventListener('change', (e) => {
    const target = output.querySelector('.cp-two-col') || output.querySelector('.cp-song')
    if (target) target.style.fontFamily = e.target.value
    if (autoSizeCheckbox.checked) runAutoSize()
  })

  sizeSlider.addEventListener('input', (e) => {
    autoSizeCheckbox.checked = false
    const target = output.querySelector('.cp-two-col') || output.querySelector('.cp-song')
    if (target) target.style.fontSize = e.target.value + 'px'
    sizeLabel.textContent = e.target.value + 'px'
  })

  autoSizeCheckbox.addEventListener('change', () => {
    if (autoSizeCheckbox.checked) runAutoSize()
  })
}

init()
