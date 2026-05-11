import { Router } from 'express'
import Database from 'better-sqlite3'
import { resolve } from 'path'

export const planRouter = Router()

const dbPath = resolve(import.meta.dirname, '../../data/selectsong.db')

function getDb() {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
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
