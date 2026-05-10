import { Router } from 'express'
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { parseChordPro, transposeSong, semitonesFromTo, renderToText } from '../chordpro/parser.js'
import { renderToHtml } from '../chordpro/html-renderer.js'

export const chordproRouter = Router()

const dataDir = resolve(import.meta.dirname, '../../data/chordpro')

chordproRouter.get('/', (_req, res) => {
  if (!existsSync(dataDir)) return res.json([])
  const files = readdirSync(dataDir).filter((f) => f.endsWith('.cho') || f.endsWith('.chordpro') || f.endsWith('.txt'))
  res.json(files)
})

chordproRouter.get('/:filename', (req, res) => {
  const filePath = resolve(dataDir, req.params.filename)
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Not found' })

  const source = readFileSync(filePath, 'utf-8')
  let song = parseChordPro(source)

  const targetKey = req.query.key as string | undefined
  if (targetKey && song.key) {
    const semitones = semitonesFromTo(song.key, targetKey)
    if (semitones !== 0) {
      song = transposeSong(song, semitones)
    }
  }

  const format = req.query.format as string | undefined
  if (format === 'text') {
    res.type('text/plain').send(renderToText(song))
  } else if (format === 'html') {
    res.type('text/html').send(renderToHtml(song))
  } else if (format === 'raw') {
    res.type('text/plain').send(source)
  } else {
    res.json(song)
  }
})

const backupDir = resolve(import.meta.dirname, '../../data/chordpro/.backups')

chordproRouter.put('/:filename', (req, res) => {
  const filePath = resolve(dataDir, req.params.filename)
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Not found' })

  const { source } = req.body as { source: string }
  if (!source) return res.status(400).json({ error: 'source is required' })

  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true })
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = resolve(backupDir, `${req.params.filename}.${timestamp}`)
  const original = readFileSync(filePath, 'utf-8')
  writeFileSync(backupPath, original, 'utf-8')

  writeFileSync(filePath, source, 'utf-8')
  res.json({ saved: true })
})

chordproRouter.get('/:filename/backups', (req, res) => {
  if (!existsSync(backupDir)) return res.json([])
  const prefix = req.params.filename + '.'
  const backups = readdirSync(backupDir)
    .filter(f => f.startsWith(prefix))
    .sort()
    .reverse()
  res.json(backups)
})

chordproRouter.post('/:filename/restore', (req, res) => {
  const { backup } = req.body as { backup: string }
  if (!backup) return res.status(400).json({ error: 'backup name required' })

  const backupPath = resolve(backupDir, backup)
  const filePath = resolve(dataDir, req.params.filename)
  if (!existsSync(backupPath)) return res.status(404).json({ error: 'Backup not found' })

  const content = readFileSync(backupPath, 'utf-8')
  writeFileSync(filePath, content, 'utf-8')
  res.json({ restored: true })
})
