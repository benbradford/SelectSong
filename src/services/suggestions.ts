import { db } from '../db/index.js'
import { songs, serviceEntries } from '../db/schema.js'
import { desc, sql } from 'drizzle-orm'

export interface SongCandidate {
  id: number
  name: string
  author: string | null
  isHymn: boolean
  lastPlayed: string | null
  daysSinceLastPlayed: number | null
  playCount: number
}

export function getSongCandidates(): SongCandidate[] {
  const allSongs = db.select().from(songs).all()
  const today = new Date().toISOString().slice(0, 10)

  return allSongs.map((song) => {
    const entries = db
      .select({ date: serviceEntries.date })
      .from(serviceEntries)
      .where(sql`lower(${serviceEntries.songName}) = lower(${song.name})`)
      .orderBy(desc(serviceEntries.date))
      .all()

    const lastPlayed = entries[0]?.date ?? null
    let daysSinceLastPlayed: number | null = null
    if (lastPlayed) {
      const last = new Date(lastPlayed)
      const now = new Date(today)
      daysSinceLastPlayed = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
    }

    return {
      id: song.id,
      name: song.name,
      author: song.author,
      isHymn: song.isHymn,
      lastPlayed,
      daysSinceLastPlayed,
      playCount: entries.length,
    }
  })
}

export function formatCandidatesForPrompt(candidates: SongCandidate[]): string {
  const lines = candidates.map((c) => {
    const hymn = c.isHymn ? ' [HYMN]' : ''
    const lastInfo = c.daysSinceLastPlayed !== null
      ? `last played ${c.daysSinceLastPlayed} days ago (${c.playCount}x total)`
      : 'never played'
    return `- ${c.name}${hymn} | ${lastInfo}`
  })
  return lines.join('\n')
}
