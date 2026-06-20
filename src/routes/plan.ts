import { Router } from 'express'
import Database from 'better-sqlite3'
import { resolve } from 'path'
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'fs'
import puppeteer from 'puppeteer'
import { parseChordPro, transposeSong, semitonesFromTo, renderToText } from '../chordpro/parser.js'
import { renderToHtml } from '../chordpro/html-renderer.js'

export const planRouter = Router()

const dbPath = resolve(import.meta.dirname, '../../data/selectsong.db')

function getDb() {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`CREATE TABLE IF NOT EXISTS song_display_prefs (
    song_id INTEGER PRIMARY KEY REFERENCES songs(id),
    font TEXT,
    font_size INTEGER,
    two_col INTEGER DEFAULT 0,
    manual_breaks TEXT
  )`)
  return db
}

interface PlanSongInput {
  songId: number
  position: number
  key?: string
  notes?: string
}

planRouter.get('/all', (req, res) => {
  const db = getDb()
  const archived = req.query.archived === '1'
  const services = db.prepare(
    `SELECT id, date, theme, music_leader, archived FROM planned_services WHERE archived = ? ORDER BY date ASC`
  ).all(archived ? 1 : 0)
  db.close()
  res.json(services)
})

planRouter.patch('/:id/archive', (req, res) => {
  const db = getDb()
  const id = Number(req.params.id)
  const { archived } = req.body as { archived: boolean }
  db.prepare('UPDATE planned_services SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id)
  db.close()
  res.json({ id, archived })
})

planRouter.post('/', (req, res) => {
  const { date, theme, passage, leader, songs } = req.body as {
    date: string
    theme: string
    passage: string
    leader: string
    songs: PlanSongInput[]
  }

  if (!date || !songs?.length) {
    return res.status(400).json({ error: 'date and songs are required' })
  }

  const db = getDb()
  const insertService = db.prepare(
    'INSERT INTO planned_services (date, theme, bible_passage, music_leader) VALUES (?, ?, ?, ?)'
  )
  const insertSong = db.prepare(
    'INSERT INTO planned_service_songs (service_id, song_id, position, key, notes) VALUES (?, ?, ?, ?, ?)'
  )

  const result = insertService.run(date, theme || null, passage || null, leader || null)
  const serviceId = result.lastInsertRowid as number

  for (const s of songs) {
    insertSong.run(serviceId, s.songId, s.position, s.key || null, s.notes || null)
  }

  db.close()
  res.json({ id: serviceId })
})

planRouter.get('/latest', (_req, res) => {
  const db = getDb()
  const service = db.prepare(
    'SELECT * FROM planned_services ORDER BY created_at DESC LIMIT 1'
  ).get() as any

  if (!service) {
    db.close()
    return res.json(null)
  }

  const songs = db.prepare(`
    SELECT pss.*, s.name, s.author, s.is_hymn, s.default_key, s.chordpro_file, s.sheet_pdf, s.songselect_url
    FROM planned_service_songs pss
    JOIN songs s ON s.id = pss.song_id
    WHERE pss.service_id = ?
    ORDER BY pss.position
  `).all(service.id)

  db.close()
  res.json({ ...service, songs })
})

planRouter.get('/display-prefs/:songId', (req, res) => {
  const db = getDb()
  const prefs = db.prepare(
    'SELECT * FROM song_display_prefs WHERE song_id = ?'
  ).get(Number(req.params.songId)) as any
  db.close()
  res.json(prefs || null)
})

planRouter.put('/display-prefs/:songId', (req, res) => {
  const songId = Number(req.params.songId)
  const { font, fontSize, twoCol, manualBreaks } = req.body as {
    font?: string
    fontSize?: number
    twoCol?: boolean
    manualBreaks?: number[]
  }

  const db = getDb()
  db.prepare(`
    INSERT INTO song_display_prefs (song_id, font, font_size, two_col, manual_breaks)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(song_id) DO UPDATE SET
      font = excluded.font,
      font_size = excluded.font_size,
      two_col = excluded.two_col,
      manual_breaks = excluded.manual_breaks
  `).run(songId, font || null, fontSize || null, twoCol ? 1 : 0, manualBreaks ? JSON.stringify(manualBreaks) : null)
  db.close()
  res.json({ saved: true })
})

planRouter.get('/:id', (req, res) => {
  const db = getDb()
  const service = db.prepare(
    'SELECT * FROM planned_services WHERE id = ?'
  ).get(Number(req.params.id)) as any

  if (!service) {
    db.close()
    return res.status(404).json({ error: 'Not found' })
  }

  const songs = db.prepare(`
    SELECT pss.*, s.name, s.author, s.is_hymn, s.default_key, s.chordpro_file, s.sheet_pdf, s.songselect_url
    FROM planned_service_songs pss
    JOIN songs s ON s.id = pss.song_id
    WHERE pss.service_id = ?
    ORDER BY pss.position
  `).all(service.id)

  db.close()
  res.json({ ...service, songs })
})

planRouter.post('/:id/songs/add', (req, res) => {
  const serviceId = Number(req.params.id)
  const { songId, position, key } = req.body as { songId: number; position: number; key?: string }

  if (!songId || position === undefined || position === null) {
    return res.status(400).json({ error: 'songId and position are required' })
  }

  const db = getDb()
  db.prepare(
    'INSERT INTO planned_service_songs (service_id, song_id, position, key) VALUES (?, ?, ?, ?)'
  ).run(serviceId, songId, position, key || null)
  db.close()
  res.json({ added: true })
})

planRouter.delete('/:id/songs/:songId', (req, res) => {
  const serviceId = Number(req.params.id)
  const songId = Number(req.params.songId)

  const db = getDb()
  db.prepare(
    'DELETE FROM planned_service_songs WHERE service_id = ? AND song_id = ?'
  ).run(serviceId, songId)
  db.close()
  res.json({ deleted: true })
})

planRouter.patch('/:id/songs', (req, res) => {
  const { songs } = req.body as { songs: PlanSongInput[] }
  const serviceId = Number(req.params.id)

  const db = getDb()

  db.prepare('DELETE FROM planned_service_songs WHERE service_id = ?').run(serviceId)

  const insert = db.prepare(
    'INSERT INTO planned_service_songs (service_id, song_id, position, key, notes) VALUES (?, ?, ?, ?, ?)'
  )
  for (const s of songs) {
    insert.run(serviceId, s.songId, s.position, s.key || null, s.notes || null)
  }

  const updated = db.prepare(`
    SELECT pss.*, s.name, s.author, s.is_hymn, s.default_key, s.chordpro_file, s.sheet_pdf, s.songselect_url
    FROM planned_service_songs pss
    JOIN songs s ON s.id = pss.song_id
    WHERE pss.service_id = ?
    ORDER BY pss.position
  `).all(serviceId)

  db.close()
  res.json({ songs: updated })
})

planRouter.post('/:id/export', async (req, res) => {
  const db = getDb()
  const service = db.prepare(
    'SELECT * FROM planned_services WHERE id = ?'
  ).get(Number(req.params.id)) as any

  if (!service) {
    db.close()
    return res.status(404).json({ error: 'Not found' })
  }

  const songs = db.prepare(`
    SELECT pss.*, s.name, s.chordpro_file, s.sheet_pdf, s.default_key
    FROM planned_service_songs pss
    JOIN songs s ON s.id = pss.song_id
    WHERE pss.service_id = ?
    ORDER BY pss.position
  `).all(service.id) as any[]

  const exportBase = resolve(import.meta.dirname, '../../exports', service.date)
  mkdirSync(exportBase, { recursive: true })

  const chordproDir = resolve(import.meta.dirname, '../../data/chordpro')
  const sheetsDir = resolve(import.meta.dirname, '../../data/sheets')
  const cssPath = resolve(import.meta.dirname, '../../public/css/chordpro.css')
  const layoutJsPath = resolve(import.meta.dirname, '../../public/js/chord-layout.js')
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf-8') : ''
  const layoutJs = existsSync(layoutJsPath) ? readFileSync(layoutJsPath, 'utf-8') : ''
  const exported: { name: string; chordpro: boolean; pdf: boolean }[] = []

  // Launch one browser for the whole export
  const browser = await puppeteer.launch({ headless: true })

  try {
    for (const song of songs) {
      const safeName = song.name.replace(/[/\\?%*:|"<>]/g, '-')
      const songDir = resolve(exportBase, safeName)
      mkdirSync(songDir, { recursive: true })

      let hasChordpro = false
      let hasPdf = false

      if (song.chordpro_file) {
        const cpPath = resolve(chordproDir, song.chordpro_file)
        if (existsSync(cpPath)) {
          const source = readFileSync(cpPath, 'utf-8')
          let parsed = parseChordPro(source)
          const targetKey = song.key || song.default_key
          if (targetKey && parsed.key) {
            const semitones = semitonesFromTo(parsed.key, targetKey)
            if (semitones !== 0) parsed = transposeSong(parsed, semitones)
          }

          const text = renderToText(parsed)
          writeFileSync(resolve(songDir, `${safeName}.txt`), text, 'utf-8')

          const prefs = db.prepare(
            'SELECT * FROM song_display_prefs WHERE song_id = ?'
          ).get(song.song_id) as any

          const html = renderToHtml(parsed)
          const font = prefs?.font || "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          const fontSize: number | null = prefs?.font_size ?? null // null => auto-fit
          const twoCol = !!prefs?.two_col
          const manualBreaks: number[] = prefs?.manual_breaks ? JSON.parse(prefs.manual_breaks) : []

          // The 2-col layout and auto-fit are JS-driven against the live DOM, so we run
          // them inside the headless page using the same shared module the in-app
          // chord viewer uses. This keeps the PDF visually identical to the print preview.
          const styledHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${safeName}</title>
<style>${css}
body { margin: 0; padding: 0; }
.cp-song, .cp-two-col { font-family: ${font}; }
.cp-blank.cp-page-break {
  border: none;
  margin: 0;
  padding: 0;
  page-break-after: always;
  break-after: page;
}
.cp-blank.cp-page-break::after { display: none; }
.cp-two-col-row {
  break-inside: avoid;
  page-break-inside: avoid;
}
</style></head><body><div id="chord-viewer-content">${html}</div>
<script>${layoutJs}</script>
<script>
(function () {
  var content = document.getElementById('chord-viewer-content');
  var manualBreaks = ${JSON.stringify(manualBreaks)};
  var twoCol = ${JSON.stringify(twoCol)};
  var fixedSize = ${fontSize === null ? 'null' : JSON.stringify(fontSize)};

  ChordLayout.applyManualBreaks(content, manualBreaks);

  var song = content.querySelector('.cp-song');
  if (fixedSize !== null && song) {
    song.style.fontSize = fixedSize + 'px';
  }

  if (twoCol) ChordLayout.applyTwoCol(content, true);

  if (fixedSize === null) {
    // Auto-fit (matches the chord viewer when "Auto size" is on)
    ChordLayout.autoFitSize(content, manualBreaks.length > 0);
  } else if (twoCol) {
    var wrapper = content.querySelector('.cp-two-col');
    if (wrapper) wrapper.style.fontSize = fixedSize + 'px';
  }
})();
</script>
</body></html>`

          // Render to PDF via headless Chrome (matches the in-app Print Chords output)
          const page = await browser.newPage()
          // Match the chord viewer's measurement viewport so auto-fit picks the same size.
          // PAGE_HEIGHT = 980 in the layout module — give the viewport a bit more headroom.
          await page.setViewport({ width: 816, height: 1056 })
          await page.setContent(styledHtml, { waitUntil: 'load' })
          await page.pdf({
            path: resolve(songDir, `${safeName} - Chords.pdf`),
            format: 'Letter',
            printBackground: true,
            margin: { top: '0.4in', right: '0.4in', bottom: '0.4in', left: '0.4in' },
          })
          await page.close()

          hasChordpro = true
        }
      }

      if (song.sheet_pdf) {
        const pdfPath = resolve(sheetsDir, song.sheet_pdf)
        if (existsSync(pdfPath)) {
          copyFileSync(pdfPath, resolve(songDir, song.sheet_pdf))
          hasPdf = true
        }
      }

      exported.push({ name: song.name, chordpro: hasChordpro, pdf: hasPdf })
    }
  } finally {
    await browser.close()
    db.close()
  }

  res.json({ path: `exports/${service.date}`, songs: exported })
})
