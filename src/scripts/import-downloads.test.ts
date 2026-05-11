import { describe, it, expect } from 'vitest'

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
}

function matchSongByFilename(
  filename: string,
  songs: { id: number; name: string }[],
  aliases: { song_id: number; alias: string }[] = []
): { id: number; name: string } | null {
  const cleaned = filename.toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\.(txt|cho|chordpro|pdf)$/, '')
    .replace(/\s*(chordpro|lead|chord|sheet)\s*/g, ' ')
    .replace(/\s*[A-G][#b]?\s*$/, '')
    .trim()

  const fileNorm = normalize(cleaned)

  let bestMatch: { id: number; name: string } | null = null
  let bestScore = 0

  for (const song of songs) {
    const candidates = [
      normalize(song.name),
      normalize(song.name.replace(/\s*\(.*\)$/, '')),
      normalize(song.name.replace(/\s*-\s.*$/, '')),
    ]

    for (const a of aliases) {
      if (a.song_id === song.id) {
        candidates.push(normalize(a.alias))
      }
    }

    for (const candidate of candidates) {
      if (!candidate) continue

      if (fileNorm === candidate) return song

      if (fileNorm.includes(candidate)) {
        const score = candidate.length * 1000 - Math.abs(fileNorm.length - candidate.length)
        if (score > bestScore) {
          bestMatch = song
          bestScore = score
        }
      }

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

const testSongs = [
  { id: 44, name: 'Holy Spirit, living breath' },
  { id: 137, name: 'Holy Spirit' },
  { id: 22, name: 'Christ our hope in life and death (Christ alone)' },
  { id: 97, name: 'Rejoice the Lord is King' },
  { id: 96, name: 'Rejoice by Dustin Kenfrue' },
  { id: 42, name: 'His mercy is more' },
  { id: 7, name: 'And can it be' },
  { id: 122, name: 'Way Maker' },
  { id: 72, name: 'Love divine' },
  { id: 46, name: 'How deep the fathers love for us' },
]

const testAliases = [
  { song_id: 22, alias: 'Christ Our Hope In Life And Death' },
  { song_id: 96, alias: 'Rejoice' },
  { song_id: 122, alias: 'Waymaker' },
]

describe('import filename matching', () => {
  it('matches exact song names', () => {
    const match = matchSongByFilename('his-mercy-is-more-chordpro-F.txt', testSongs, testAliases)
    expect(match?.id).toBe(42)
  })

  it('matches with lead sheet PDF naming', () => {
    const match = matchSongByFilename('And Can It Be (Sagina)-lead-F.pdf', testSongs, testAliases)
    expect(match?.id).toBe(7)
  })

  it('prefers exact match over substring match — Holy Spirit vs Holy Spirit living breath', () => {
    const match = matchSongByFilename('holy-spirit-chordpro-A.txt', testSongs, testAliases)
    expect(match?.id).toBe(137)
  })

  it('matches via alias — Christ Our Hope In Life And Death', () => {
    const match = matchSongByFilename('Christ Our Hope In Life And Death-lead-E.pdf', testSongs, testAliases)
    expect(match?.id).toBe(22)
  })

  it('matches via alias — Rejoice to Dustin Kensrue version', () => {
    const match = matchSongByFilename('Rejoice-lead-C.pdf', testSongs, testAliases)
    expect(match?.id).toBe(96)
  })

  it('matches Way Maker with spaces', () => {
    const match = matchSongByFilename('Way Maker-lead-G.pdf', testSongs, testAliases)
    expect(match?.id).toBe(122)
  })

  it('matches Waymaker without space via alias', () => {
    const match = matchSongByFilename('waymaker-chordpro-G.txt', testSongs, testAliases)
    expect(match?.id).toBe(122)
  })

  it('matches How Deep The Fathers Love', () => {
    const match = matchSongByFilename('How Deep The Father\'s Love For Us-lead-D.pdf', testSongs, testAliases)
    expect(match?.id).toBe(46)
  })

  it('matches love divine with blaenwern suffix', () => {
    const match = matchSongByFilename('love-divine-blaenwern-chordpro-F.txt', testSongs, testAliases)
    expect(match?.id).toBe(72)
  })

  it('returns null for completely unknown songs', () => {
    const match = matchSongByFilename('totally-unknown-song-lead-C.pdf', testSongs, testAliases)
    expect(match).toBeNull()
  })
})
