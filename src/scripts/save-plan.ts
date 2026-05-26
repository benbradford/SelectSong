import Database from 'better-sqlite3'
import { resolve } from 'path'
import { parseArgs } from 'util'

const dbPath = resolve(import.meta.dirname, '../../data/selectsong.db')
const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

const { values } = parseArgs({
  options: {
    date: { type: 'string' },
    theme: { type: 'string', default: '' },
    passage: { type: 'string', default: '' },
    leader: { type: 'string', default: '' },
    songs: { type: 'string' },
  },
})

if (!values.date || !values.songs) {
  console.error('Usage: save-plan.ts --date YYYY-MM-DD --theme "..." --passage "..." --leader "..." --songs \'[{"songId":1,"position":1,"key":"C"}]\'')
  process.exit(1)
}

const songs = JSON.parse(values.songs) as { songId: number; position: number; key?: string }[]

const insertService = db.prepare(
  'INSERT INTO planned_services (date, theme, bible_passage, music_leader) VALUES (?, ?, ?, ?)'
)
const insertSong = db.prepare(
  'INSERT INTO planned_service_songs (service_id, song_id, position, key) VALUES (?, ?, ?, ?)'
)

const result = insertService.run(values.date, values.theme || null, values.passage || null, values.leader || null)
const serviceId = result.lastInsertRowid as number

for (const s of songs) {
  insertSong.run(serviceId, s.songId, s.position, s.key || null)
}

console.log(`Saved service plan #${serviceId} for ${values.date}`)
console.log(`  Theme: ${values.theme}`)
console.log(`  Passage: ${values.passage}`)
console.log(`  Songs:`)

const COMMUNION_OFFSET = 1000
function posLabel(pos: number): string {
  if (pos === 0) return 'Pre-service'
  if (pos >= COMMUNION_OFFSET) return `Communion ${pos - COMMUNION_OFFSET + 1}`
  return `Song ${pos}`
}

const savedSongs = db.prepare(`
  SELECT pss.position, pss.key, s.name, s.chordpro_file, s.sheet_pdf, s.songselect_url
  FROM planned_service_songs pss
  JOIN songs s ON s.id = pss.song_id
  WHERE pss.service_id = ?
  ORDER BY pss.position
`).all(serviceId) as any[]

const missing: string[] = []
for (const s of savedSongs) {
  const key = s.key ? ` (key: ${s.key})` : ''
  console.log(`    ${posLabel(s.position)}. ${s.name}${key}`)
  if (!s.chordpro_file && !s.sheet_pdf) {
    missing.push(s.name + (s.songselect_url ? ` — ${s.songselect_url}` : ''))
  }
}

if (missing.length > 0) {
  console.log('\n  Missing music files:')
  for (const m of missing) {
    console.log(`    - ${m}`)
  }
}

const port = process.env.PORT || 3000
console.log(`\nView at: http://localhost:${port}/plan.html`)
