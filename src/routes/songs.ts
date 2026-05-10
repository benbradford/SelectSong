import { Router } from 'express'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { getSongCandidates } from '../services/suggestions.js'

export const songsRouter = Router()

songsRouter.get('/', (_req, res) => {
  const allSongs = db.select().from(schema.songs).all()
  res.json(allSongs)
})

songsRouter.get('/candidates', (_req, res) => {
  const candidates = getSongCandidates()
  res.json(candidates)
})

songsRouter.get('/:id', (req, res) => {
  const song = db
    .select()
    .from(schema.songs)
    .where(eq(schema.songs.id, Number(req.params.id)))
    .get()
  if (!song) return res.status(404).json({ error: 'Not found' })
  res.json(song)
})

songsRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id)
  db.update(schema.songs).set(req.body).where(eq(schema.songs.id, id)).run()
  const updated = db.select().from(schema.songs).where(eq(schema.songs.id, id)).get()
  res.json(updated)
})
