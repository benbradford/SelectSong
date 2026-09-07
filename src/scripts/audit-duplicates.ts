import Database from 'better-sqlite3'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Finds catalogue rows that are the same song entered twice — typically once
// under its title and once under its opening lyric. Evidence, strongest first:
// matching CCLI number, then a row name matching another row's first line.

const root = resolve(import.meta.dirname, '../..')
const db = new Database(resolve(root, 'data/selectsong.db'), { readonly: true })

type Song = {
  id: number
  name: string
  chordpro_file: string | null
  songselect_url: string | null
  first_line: string | null
}

const songs = db.prepare(
  'SELECT id, name, chordpro_file, songselect_url, first_line FROM songs WHERE name != \'\''
).all() as Song[]

const norm = (s: string) =>
  s.toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

// Pull the title, CCLI number and opening lyric out of a ChordPro file.
function parseChordpro(file: string) {
  const path = resolve(root, 'data/chordpro', file)
  if (!existsSync(path)) return null
  const lines = readFileSync(path, 'utf8').split('\n')
  let title: string | null = null
  let ccli: string | null = null
  let firstLine: string | null = null
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const t = line.match(/^\{title:\s*(.+?)\}$/i)
    if (t) { title = t[1].trim(); continue }
    const c = line.match(/^\{ccli:\s*(\d+)\}$/i)
    if (c) { ccli = c[1]; continue }
    if (line.startsWith('{') || line.startsWith('#')) continue
    // Strip [chord] markers; the remainder is lyric text.
    const lyric = line.replace(/\[[^\]]*\]/g, '').trim()
    if (lyric && !firstLine) firstLine = lyric
  }
  return { title, ccli, firstLine }
}

const ccliFromUrl = (url: string | null) => url?.match(/songs\/(\d+)/)?.[1] ?? null

const enriched = songs.map((s) => {
  const cp = s.chordpro_file ? parseChordpro(s.chordpro_file) : null
  return {
    ...s,
    ccli: cp?.ccli ?? ccliFromUrl(s.songselect_url),
    cpTitle: cp?.title ?? null,
    cpFirstLine: cp?.firstLine ?? null,
  }
})

console.log('=== DUPLICATE CCLI (definite same song) ===')
const byCcli = new Map<string, typeof enriched>()
for (const s of enriched) {
  if (!s.ccli) continue
  const list = byCcli.get(s.ccli) ?? []
  list.push(s)
  byCcli.set(s.ccli, list)
}
for (const [ccli, list] of byCcli) {
  if (list.length > 1) {
    console.log(`  CCLI ${ccli}: ${list.map((s) => `id:${s.id} "${s.name}"`).join('  ==  ')}`)
  }
}

console.log('\n=== ROW NAME MATCHES ANOTHER ROW\'S FIRST LINE ===')
for (const a of enriched) {
  const aName = norm(a.name)
  if (aName.length < 8) continue
  for (const b of enriched) {
    if (a.id === b.id) continue
    for (const fl of [b.cpFirstLine, b.first_line]) {
      if (!fl) continue
      const nfl = norm(fl)
      if (nfl.length < 8) continue
      if (nfl.startsWith(aName) || aName.startsWith(nfl)) {
        console.log(`  id:${a.id} "${a.name}"\n    is the first line of  id:${b.id} "${b.name}"  (${fl})`)
      }
    }
  }
}

console.log('\n=== FIRST LINES AVAILABLE FROM CHORDPRO (for populating songs.first_line) ===')
for (const s of enriched) {
  if (s.cpFirstLine) console.log(`  id:${s.id} | ${s.name} | title="${s.cpTitle}" | FL="${s.cpFirstLine}"`)
}

console.log('\n=== NO IDENTITY EVIDENCE (no chordpro, no CCLI) ===')
for (const s of enriched) {
  if (!s.ccli && !s.cpFirstLine) console.log(`  id:${s.id} | ${s.name}`)
}

db.close()
