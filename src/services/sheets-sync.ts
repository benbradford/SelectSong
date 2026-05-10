import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import Database from 'better-sqlite3'

const dbPath = resolve(import.meta.dirname, '../../data/selectsong.db')

function getAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
  if (!keyPath) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH not set')

  const keyFile = resolve(keyPath)
  const credentials = JSON.parse(readFileSync(keyFile, 'utf-8'))

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
}

function parseBool(val: string | undefined | null): boolean {
  return val?.toUpperCase() === 'TRUE'
}

function parseDate(dateStr: string): string {
  const parts = dateStr.split('/')
  if (parts.length !== 3) return dateStr
  const [day, month, year] = parts
  const fullYear = year.length === 2 ? `20${year}` : year
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

export async function syncSonglist() {
  const spreadsheetId = process.env.SONGLIST_SPREADSHEET_ID
  if (!spreadsheetId) throw new Error('SONGLIST_SPREADSHEET_ID not set')

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Sheet1!A2:H',
  })

  const rows = res.data.values
  if (!rows || rows.length === 0) {
    console.log('No songlist data found')
    return 0
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  const upsert = db.prepare(`
    INSERT INTO songs (name, author, copyright, recently_added, is_hymn, is_song, is_atn, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      author = excluded.author,
      copyright = excluded.copyright,
      recently_added = excluded.recently_added,
      is_hymn = excluded.is_hymn,
      is_song = excluded.is_song,
      is_atn = excluded.is_atn,
      notes = excluded.notes
  `)

  // Add unique constraint if not exists
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_songs_name ON songs(name)`)

  let count = 0
  for (const row of rows) {
    const name = row[0]?.trim()
    if (!name) continue

    upsert.run(
      name,
      row[1]?.trim() || null,
      row[2]?.trim() || null,
      parseBool(row[3]) ? 1 : 0,
      parseBool(row[4]) ? 1 : 0,
      parseBool(row[5]) ? 1 : 0,
      parseBool(row[6]) ? 1 : 0,
      row[7]?.trim() || null,
    )
    count++
  }

  db.close()
  console.log(`Synced ${count} songs from Google Sheets`)
  return count
}

export async function syncLedger() {
  const spreadsheetId = process.env.LEDGER_SPREADSHEET_ID
  if (!spreadsheetId) throw new Error('LEDGER_SPREADSHEET_ID not set')

  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // Get all sheet tab names
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  })
  const tabNames = meta.data.sheets?.map(s => s.properties?.title).filter(Boolean) as string[]

  // Pull data from all tabs
  let allRows: string[][] = []
  for (const tab of tabNames) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tab}'!A2:E`,
    })
    if (res.data.values) {
      allRows = allRows.concat(res.data.values as string[][])
    }
  }

  const rows = allRows
  if (rows.length === 0) {
    console.log('No ledger data found')
    return 0
  }

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  // Clear and re-import ledger entries
  db.exec('DELETE FROM service_entries')

  const insert = db.prepare(`
    INSERT INTO service_entries (date, song_name, first_line, music_leader, ccli_ref, song_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const songLookup = new Map<string, number>()
  const allSongs = db.prepare('SELECT id, name FROM songs').all() as { id: number; name: string }[]
  for (const s of allSongs) {
    songLookup.set(s.name.toLowerCase(), s.id)
  }

  let count = 0
  for (const row of rows) {
    const dateRaw = row[0]?.trim()
    const songName = row[1]?.trim()
    if (!dateRaw || !songName) continue

    const date = parseDate(dateRaw)
    const firstLine = row[2]?.trim() || null
    const musicLeader = row[3]?.trim() || null
    const ccliRef = row[4]?.trim() || null
    const songId = songLookup.get(songName.toLowerCase()) ?? null

    insert.run(date, songName, firstLine, musicLeader, ccliRef, songId)
    count++
  }

  db.close()
  console.log(`Synced ${count} ledger entries from Google Sheets`)
  return count
}

export async function syncAll() {
  let songCount = 0
  try {
    songCount = await syncSonglist()
  } catch (e: any) {
    console.log(`Songlist sync skipped: ${e.message}`)
  }
  const entryCount = await syncLedger()
  return { songCount, entryCount }
}
