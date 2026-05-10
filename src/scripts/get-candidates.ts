import Database from 'better-sqlite3'
import { resolve } from 'path'

const dbPath = resolve(import.meta.dirname, '../../data/selectsong.db')
const db = new Database(dbPath)

const targetDate = process.argv[2] || new Date().toISOString().slice(0, 10)

const songs = db.prepare(`
  SELECT id, name, is_hymn, author FROM songs
  WHERE excluded = 0 AND name != ''
  ORDER BY name
`).all() as { id: number; name: string; is_hymn: number; author: string | null }[]

const aliases = db.prepare('SELECT song_id, alias FROM song_aliases').all() as { song_id: number; alias: string }[]

const entries = db.prepare('SELECT song_name, date FROM service_entries ORDER BY date DESC').all() as { song_name: string; date: string }[]

// Also get planned services not yet in the ledger
const maxLedgerDate = db.prepare('SELECT MAX(date) as d FROM service_entries').get() as { d: string }
const plannedSongs = db.prepare(`
  SELECT ps.date, s.name as song_name
  FROM planned_service_songs pss
  JOIN planned_services ps ON ps.id = pss.service_id
  JOIN songs s ON s.id = pss.song_id
  WHERE ps.date > ? AND ps.archived = 0
  ORDER BY ps.date DESC
`).all(maxLedgerDate.d) as { date: string; song_name: string }[]

// Build name lookup: song_id -> all known names
const namesBySongId = new Map<number, string[]>()
for (const song of songs) {
  namesBySongId.set(song.id, [song.name.toLowerCase()])
}
for (const a of aliases) {
  const existing = namesBySongId.get(a.song_id)
  if (existing) existing.push(a.alias.toLowerCase())
}

// Combine ledger entries with planned songs
const allEntries = [
  ...plannedSongs.map(p => ({ song_name: p.song_name, date: p.date })),
  ...entries,
]

const today = new Date(targetDate)

const results = songs.map((song) => {
  const names = namesBySongId.get(song.id) || [song.name.toLowerCase()]

  const matchingEntries = allEntries.filter((e) => {
    const ledgerName = e.song_name.toLowerCase()
    return names.some((n) => ledgerName === n)
  })

  const lastPlayed = matchingEntries[0]?.date ?? null
  let daysSinceLastPlayed: number | null = null
  if (lastPlayed) {
    const last = new Date(lastPlayed)
    daysSinceLastPlayed = Math.floor((today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
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

// Output in a readable format for Claude
console.log(`Song candidates for ${targetDate} (${results.filter(r => r.playCount > 0).length} with history, ${results.filter(r => r.playCount === 0).length} never played):`)
console.log('')

if (plannedSongs.length > 0) {
  console.log('Already planned (treat as recent):')
  const byDate = new Map<string, string[]>()
  for (const p of plannedSongs) {
    const existing = byDate.get(p.date) || []
    existing.push(p.song_name)
    byDate.set(p.date, existing)
  }
  for (const [date, names] of byDate) {
    console.log(`  ${date}: ${names.join(', ')}`)
  }
  console.log('')
}

console.log('Songs with play history (sorted by days since last played):')
const played = results.filter(r => r.playCount > 0).sort((a, b) => (b.daysSinceLastPlayed ?? 0) - (a.daysSinceLastPlayed ?? 0))
for (const r of played) {
  const hymn = r.isHymn ? ' [HYMN]' : ''
  console.log(`  ${r.name}${hymn} | ${r.daysSinceLastPlayed}d ago (${r.playCount}x) | id:${r.id}`)
}

console.log('')
console.log('Never played:')
const never = results.filter(r => r.playCount === 0)
for (const r of never) {
  const hymn = r.isHymn ? ' [HYMN]' : ''
  console.log(`  ${r.name}${hymn} | id:${r.id}`)
}
