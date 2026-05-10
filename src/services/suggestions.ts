import Database from 'better-sqlite3'
import { resolve } from 'path'

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
  // Use raw sqlite for the alias-based lookup
  const dbPath = resolve(import.meta.dirname, '../../data/selectsong.db')
  const raw = new Database(dbPath)

  const allSongs = raw.prepare(
    'SELECT id, name, author, is_hymn FROM songs WHERE excluded = 0 AND name != \'\''
  ).all() as { id: number; name: string; author: string | null; is_hymn: number }[]

  // Build a map from song_id -> all names (canonical + aliases)
  const aliases = raw.prepare('SELECT song_id, alias FROM song_aliases').all() as { song_id: number; alias: string }[]
  const namesBySongId = new Map<number, string[]>()
  for (const song of allSongs) {
    namesBySongId.set(song.id, [song.name.toLowerCase()])
  }
  for (const a of aliases) {
    const existing = namesBySongId.get(a.song_id)
    if (existing) existing.push(a.alias.toLowerCase())
  }

  // Pre-fetch all ledger entries
  const allEntries = raw.prepare(
    'SELECT song_name, date FROM service_entries ORDER BY date DESC'
  ).all() as { song_name: string; date: string }[]

  const today = new Date().toISOString().slice(0, 10)

  const results = allSongs.map((song) => {
    const names = namesBySongId.get(song.id) || [song.name.toLowerCase()]

    const matchingEntries = allEntries.filter((e) => {
      const ledgerName = e.song_name.toLowerCase()
      return names.some((n) => ledgerName === n)
    })

    const lastPlayed = matchingEntries[0]?.date ?? null
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
      isHymn: !!song.is_hymn,
      lastPlayed,
      daysSinceLastPlayed,
      playCount: matchingEntries.length,
    }
  })

  raw.close()
  return results
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
