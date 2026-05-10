import { Router } from 'express'
import { db, schema } from '../db/index.js'
import { desc } from 'drizzle-orm'

export const servicesRouter = Router()

servicesRouter.get('/entries', (_req, res) => {
  const entries = db
    .select()
    .from(schema.serviceEntries)
    .orderBy(desc(schema.serviceEntries.date))
    .limit(100)
    .all()
  res.json(entries)
})

servicesRouter.get('/recent', (_req, res) => {
  const entries = db
    .select()
    .from(schema.serviceEntries)
    .orderBy(desc(schema.serviceEntries.date))
    .limit(50)
    .all()

  const byDate = new Map<string, typeof entries>()
  for (const e of entries) {
    const existing = byDate.get(e.date) ?? []
    existing.push(e)
    byDate.set(e.date, existing)
  }

  const services = Array.from(byDate.entries()).map(([date, songs]) => ({
    date,
    musicLeader: songs[0].musicLeader,
    songs: songs.map((s) => s.songName),
  }))

  res.json(services)
})
