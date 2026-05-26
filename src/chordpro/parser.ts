const NOTES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B']
const FLAT_TO_SHARP: Record<string, string> = {
  'Db': 'C#', 'D#': 'Eb', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'A#': 'Bb', 'Cb': 'B',
}

export interface ChordProLine {
  type: 'chord-lyric' | 'directive' | 'comment' | 'empty'
  content?: string
  chords?: { chord: string; position: number }[]
  lyrics?: string
  directive?: { name: string; value: string }
}

export interface ChordProSong {
  title?: string
  artist?: string
  key?: string
  lines: ChordProLine[]
}

function normalizeNote(note: string): string {
  return FLAT_TO_SHARP[note] ?? note
}

function noteIndex(note: string): number {
  return NOTES.indexOf(normalizeNote(note))
}

export function transposeChord(chord: string, semitones: number): string {
  return chord.replace(/([A-G][#b]?)/g, (match) => {
    const idx = noteIndex(match)
    if (idx === -1) return match
    const newIdx = (idx + semitones + 12) % 12
    return NOTES[newIdx]
  })
}

export function parseChordPro(source: string): ChordProSong {
  const lines = source.split('\n')
  const song: ChordProSong = { lines: [] }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (!line) {
      song.lines.push({ type: 'empty' })
      continue
    }

    const directiveMatch = line.match(/^\{(\w+)(?::\s*(.+))?\}$/)
    if (directiveMatch) {
      const name = directiveMatch[1].toLowerCase()
      const value = directiveMatch[2] || ''
      song.lines.push({ type: 'directive', directive: { name, value } })

      if (name === 'title' || name === 't') song.title = value
      if (name === 'artist' || name === 'subtitle' || name === 'st') song.artist = value
      if (name === 'key') song.key = value
      continue
    }

    if (line.startsWith('#')) {
      song.lines.push({ type: 'comment', content: line.slice(1).trim() })
      continue
    }

    if (line.includes('[')) {
      const chords: { chord: string; position: number }[] = []
      let lyrics = ''
      let i = 0
      while (i < line.length) {
        if (line[i] === '[') {
          const end = line.indexOf(']', i)
          if (end === -1) {
            lyrics += line.slice(i)
            break
          }
          chords.push({ chord: line.slice(i + 1, end), position: lyrics.length })
          i = end + 1
        } else {
          lyrics += line[i]
          i++
        }
      }
      song.lines.push({ type: 'chord-lyric', chords, lyrics })
    } else {
      song.lines.push({ type: 'chord-lyric', lyrics: line, chords: [] })
    }
  }

  return song
}

export function transposeSong(song: ChordProSong, semitones: number): ChordProSong {
  return {
    ...song,
    key: song.key ? transposeChord(song.key, semitones) : undefined,
    lines: song.lines.map((line) => {
      if (line.type !== 'chord-lyric' || !line.chords) return line
      return {
        ...line,
        chords: line.chords.map((c) => ({
          ...c,
          chord: transposeChord(c.chord, semitones),
        })),
      }
    }),
  }
}

export function semitonesFromTo(from: string, to: string): number {
  const fromIdx = noteIndex(from)
  const toIdx = noteIndex(to)
  if (fromIdx === -1 || toIdx === -1) return 0
  return (toIdx - fromIdx + 12) % 12
}

export function renderToChordPro(song: ChordProSong): string {
  const output: string[] = []

  for (const line of song.lines) {
    if (line.type === 'empty') {
      output.push('')
    } else if (line.type === 'directive') {
      const d = line.directive!
      if (d.name === 'key' && song.key) {
        output.push(`{key: ${song.key}}`)
      } else {
        output.push(`{${d.name}${d.value ? ': ' + d.value : ''}}`)
      }
    } else if (line.type === 'comment') {
      output.push(`# ${line.content}`)
    } else if (line.type === 'chord-lyric') {
      if (!line.chords || line.chords.length === 0) {
        output.push(line.lyrics || '')
      } else {
        let result = ''
        let lastPos = 0
        const lyrics = line.lyrics || ''
        for (const c of line.chords) {
          result += lyrics.slice(lastPos, c.position)
          result += `[${c.chord}]`
          lastPos = c.position
        }
        result += lyrics.slice(lastPos)
        output.push(result)
      }
    }
  }

  return output.join('\n')
}

export function renderToText(song: ChordProSong): string {
  const output: string[] = []

  if (song.title) output.push(song.title)
  if (song.artist) output.push(song.artist)
  if (song.key) output.push(`Key: ${song.key}`)
  if (output.length > 0) output.push('')

  for (const line of song.lines) {
    if (line.type === 'empty') {
      output.push('')
    } else if (line.type === 'directive') {
      const d = line.directive!
      if (d.name === 'comment' || d.name === 'c') {
        output.push(`(${d.value})`)
      } else if (!['title', 't', 'artist', 'subtitle', 'st', 'key'].includes(d.name)) {
        output.push(`[${d.name}: ${d.value}]`)
      }
    } else if (line.type === 'comment') {
      output.push(`(${line.content})`)
    } else if (line.type === 'chord-lyric') {
      if (line.chords && line.chords.length > 0) {
        let chordLine = ''
        for (const c of line.chords) {
          while (chordLine.length < c.position) chordLine += ' '
          chordLine += c.chord
        }
        output.push(chordLine)
      }
      if (line.lyrics) output.push(line.lyrics)
    }
  }

  return output.join('\n')
}
