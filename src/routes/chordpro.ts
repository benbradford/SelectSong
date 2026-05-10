import { Router } from 'express'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { parseChordPro, transposeSong, semitonesFromTo, renderToText } from '../chordpro/parser.js'

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
  } else {
    res.json(song)
  }
})
