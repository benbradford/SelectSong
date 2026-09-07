import Database from 'better-sqlite3'
import { resolve } from 'path'

// Reports ledger (service_entries) song names that don't resolve to a row in
// `songs` via the name/alias matching that get-candidates.ts uses. Unmatched
// names make a played song look never-played, which skews recency.

const dbPath = resolve(import.meta.dirname, '../../data/selectsong.db')
const db = new Database(dbPath, { readonly: true })

// Match against ALL songs, including excluded ones, so excluded songs are
// reported separately rather than looking like missing catalogue entries.
const songs = db.prepare('SELECT id, name, excluded FROM songs WHERE name != \'\'').all() as
  { id: number; name: string; excluded: number }[]

const aliases = db.prepare('SELECT song_id, alias FROM song_aliases').all() as
  { song_id: number; alias: string }[]

const known = new Map<string, { id: number; name: string; excluded: number }>()
for (const s of songs) known.set(s.name.toLowerCase(), s)
for (const a of aliases) {
  const song = songs.find((s) => s.id === a.song_id)
  if (song) known.set(a.alias.toLowerCase(), song)
}

const entries = db.prepare(`
  SELECT song_name, COUNT(*) as plays, MAX(date) as last, MIN(date) as first
  FROM service_entries
  WHERE song_name != ''
  GROUP BY LOWER(song_name)
  ORDER BY MAX(date) DESC
`).all() as { song_name: string; plays: number; last: string; first: string }[]

const unmatched = entries.filter((e) => !known.has(e.song_name.toLowerCase()))
const matchedExcluded = entries.filter((e) => known.get(e.song_name.toLowerCase())?.excluded === 1)

console.log(`Ledger has ${entries.length} distinct song names; ${unmatched.length} unmatched.\n`)

console.log('UNMATCHED (most recently played first):')
for (const e of unmatched) {
  console.log(`  ${e.last} | ${String(e.plays).padStart(3)}x | ${e.song_name}`)
}

console.log(`\nMATCHED BUT EXCLUDED (${matchedExcluded.length}) — never suggestable:`)
for (const e of matchedExcluded) {
  const song = known.get(e.song_name.toLowerCase())!
  console.log(`  ${e.last} | ${String(e.plays).padStart(3)}x | ${e.song_name} -> id:${song.id}`)
}

// Songs in the catalogue that no ledger name resolves to at all.
const resolved = new Set<number>()
for (const e of entries) {
  const song = known.get(e.song_name.toLowerCase())
  if (song) resolved.add(song.id)
}
const neverMatched = songs.filter((s) => !resolved.has(s.id) && s.excluded === 0)
console.log(`\nCATALOGUE SONGS WITH NO LEDGER MATCH (${neverMatched.length}):`)
for (const s of neverMatched) {
  console.log(`  id:${s.id} | ${s.name}`)
}

db.close()
