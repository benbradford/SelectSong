import { readdirSync, renameSync, mkdirSync, existsSync } from 'fs'
import { resolve, extname, basename } from 'path'
import Database from 'better-sqlite3'

const dbPath = resolve(import.meta.dirname, '../../data/selectsong.db')
const downloadsDir = resolve(import.meta.dirname, '../../downloads')
const chordproDir = resolve(import.meta.dirname, '../../data/chordpro')
const sheetsDir = resolve(import.meta.dirname, '../../data/sheets')

if (!existsSync(downloadsDir)) {
  console.log('No downloads/ folder found. Create it and drop files there.')
  process.exit(0)
}

if (!existsSync(chordproDir)) mkdirSync(chordproDir, { recursive: true })
if (!existsSync(sheetsDir)) mkdirSync(sheetsDir, { recursive: true })

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

const songs = db.prepare('SELECT id, name FROM songs WHERE excluded = 0').all() as { id: number; name: string }[]

const aliases = db.prepare('SELECT song_id, alias FROM song_aliases').all() as { song_id: number; alias: string }[]

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

function matchSongByFilename(filename: string): { id: number; name: string } | null {
  const cleaned = filename.toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\.(txt|cho|chordpro|pdf)$/, '')
    .replace(/\s*(chordpro|lead|chord|sheet)\s*/g, ' ')
    .replace(/\s*[A-G][#b]?\s*$/, '')
    .trim()

  const fileNorm = normalize(cleaned)

  // Build all possible names per song (canonical + stripped + aliases)
  let bestMatch: { id: number; name: string } | null = null
  let bestScore = 0

  for (const song of songs) {
    const candidates = [
      normalize(song.name),
      normalize(song.name.replace(/\s*\(.*\)$/, '')),
      normalize(song.name.replace(/\s*-\s.*$/, '')),
    ]

    // Add aliases for this song
    for (const a of aliases) {
      if (a.song_id === song.id) {
        candidates.push(normalize(a.alias))
      }
    }

    for (const candidate of candidates) {
      if (!candidate) continue

      // Exact match — highest priority
      if (fileNorm === candidate) return song

      // File contains full song name — score by how close the lengths are (prefer tighter matches)
      if (fileNorm.includes(candidate)) {
        const score = candidate.length * 1000 - Math.abs(fileNorm.length - candidate.length)
        if (score > bestScore) {
          bestMatch = song
          bestScore = score
        }
      }

      // Song name contains full file name — only if file name is reasonably specific
      if (fileNorm.length >= 6 && candidate.includes(fileNorm)) {
        const score = fileNorm.length * 1000 - Math.abs(candidate.length - fileNorm.length)
        if (score > bestScore) {
          bestMatch = song
          bestScore = score
        }
      }
    }
  }

  return bestMatch
}

const files = readdirSync(downloadsDir)
let imported = 0
let unmatched: string[] = []

for (const file of files) {
  if (file.startsWith('.')) continue
  const ext = extname(file).toLowerCase()
  if (!['.txt', '.cho', '.chordpro', '.pdf'].includes(ext)) continue

  const match = matchSongByFilename(file)
  if (!match) {
    unmatched.push(file)
    continue
  }

  const src = resolve(downloadsDir, file)

  if (ext === '.pdf') {
    const dest = resolve(sheetsDir, file)
    renameSync(src, dest)
    db.prepare('UPDATE songs SET sheet_pdf = ? WHERE id = ?').run(file, match.id)
    console.log(`  PDF: ${file} → ${match.name}`)
  } else {
    const dest = resolve(chordproDir, file)
    renameSync(src, dest)
    db.prepare('UPDATE songs SET chordpro_file = ? WHERE id = ?').run(file, match.id)
    console.log(`  ChordPro: ${file} → ${match.name}`)
  }
  imported++
}

if (imported > 0) {
  console.log(`\nImported ${imported} file(s)`)
}
if (unmatched.length > 0) {
  console.log(`\nCould not match (left in downloads/):`)
  for (const f of unmatched) {
    console.log(`  - ${f}`)
  }
}
if (imported === 0 && unmatched.length === 0) {
  console.log('No files to import in downloads/')
}
