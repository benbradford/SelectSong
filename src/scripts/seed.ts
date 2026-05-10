import { readFileSync } from 'fs'
import { resolve } from 'path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db/schema.js'

const dbPath = resolve(import.meta.dirname, '../../data/selectsong.db')
const sqlite = new Database(dbPath)
sqlite.pragma('journal_mode = WAL')
const db = drizzle(sqlite, { schema })

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current.trim())
  return fields
}

function parseBool(val: string): boolean {
  return val.toUpperCase() === 'TRUE'
}

function parseDate(dateStr: string): string {
  const parts = dateStr.split('/')
  if (parts.length !== 3) return dateStr
  const [day, month, year] = parts
  const fullYear = year.length === 2 ? `20${year}` : year
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

console.log('Seeding database...')

// Create tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    author TEXT,
    copyright TEXT,
    is_hymn INTEGER NOT NULL DEFAULT 0,
    is_song INTEGER NOT NULL DEFAULT 0,
    is_atn INTEGER NOT NULL DEFAULT 0,
    recently_added INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    first_line TEXT,
    themes TEXT,
    default_key TEXT,
    chordpro_file TEXT
  );

  CREATE TABLE IF NOT EXISTS service_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    song_name TEXT NOT NULL,
    first_line TEXT,
    music_leader TEXT,
    ccli_ref TEXT,
    song_id INTEGER REFERENCES songs(id),
    position INTEGER
  );

  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    theme TEXT,
    bible_passage TEXT,
    music_leader TEXT,
    notes TEXT
  );
`)

// Seed songs from songlist.csv
const songlistPath = resolve(import.meta.dirname, '../../songlist.csv')
const songlistRaw = readFileSync(songlistPath, 'utf-8')
const songlistLines = songlistRaw.split('\n')

let songsInserted = 0
const insertSong = sqlite.prepare(`
  INSERT OR IGNORE INTO songs (name, author, copyright, recently_added, is_hymn, is_song, is_atn, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`)

for (let i = 1; i < songlistLines.length; i++) {
  const line = songlistLines[i].trim()
  if (!line) continue
  const fields = parseCsvLine(line)
  const name = fields[0]
  if (!name) continue

  insertSong.run(
    name,
    fields[1] || null,
    fields[2] || null,
    parseBool(fields[3] || 'FALSE') ? 1 : 0,
    parseBool(fields[4] || 'FALSE') ? 1 : 0,
    parseBool(fields[5] || 'FALSE') ? 1 : 0,
    parseBool(fields[6] || 'FALSE') ? 1 : 0,
    fields[7] || null,
  )
  songsInserted++
}
console.log(`Inserted ${songsInserted} songs`)

// Build a lookup map for song matching
const allSongs = sqlite.prepare('SELECT id, name FROM songs').all() as { id: number; name: string }[]
const songLookup = new Map<string, number>()
for (const s of allSongs) {
  songLookup.set(s.name.toLowerCase(), s.id)
}

// Seed ledger
const ledgerPath = resolve(import.meta.dirname, '../../ledger.csv')
const ledgerRaw = readFileSync(ledgerPath, 'utf-8')
const ledgerLines = ledgerRaw.split('\n')

let entriesInserted = 0
const insertEntry = sqlite.prepare(`
  INSERT INTO service_entries (date, song_name, first_line, music_leader, ccli_ref, song_id)
  VALUES (?, ?, ?, ?, ?, ?)
`)

for (let i = 1; i < ledgerLines.length; i++) {
  const line = ledgerLines[i].trim()
  if (!line) continue
  const fields = parseCsvLine(line)
  const dateRaw = fields[0]
  const songName = fields[1]
  if (!dateRaw || !songName) continue

  const date = parseDate(dateRaw)
  const firstLine = fields[2] || null
  const musicLeader = fields[3] || null
  const ccliRef = fields[4] || null

  const songId = songLookup.get(songName.toLowerCase()) ?? null

  insertEntry.run(date, songName, firstLine, musicLeader, ccliRef, songId)
  entriesInserted++
}
console.log(`Inserted ${entriesInserted} service entries`)

console.log('Done!')
