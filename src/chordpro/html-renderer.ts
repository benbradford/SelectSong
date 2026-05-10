import { ChordProSong, ChordProLine } from './parser.js'

function simplifyChord(chord: string): string {
  return chord
    .replace(/\(no\d+\)/g, '')
    .replace(/2\(no3\)/g, '2')
    .replace(/\s+$/, '')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderChordLyricLine(line: ChordProLine): string {
  if (!line.chords || line.chords.length === 0) {
    return `<div class="cp-line"><span class="cp-lyrics">${escapeHtml(line.lyrics || '')}</span></div>`
  }

  const lyrics = line.lyrics || ''
  let html = ''
  let lastPos = 0

  for (const c of line.chords) {
    const before = lyrics.slice(lastPos, c.position)
    if (before) {
      html += `<span class="cp-syllable">${escapeHtml(before)}</span>`
    }
    const simplified = simplifyChord(c.chord)
    const nextChord = line.chords[line.chords.indexOf(c) + 1]
    const endPos = nextChord ? nextChord.position : lyrics.length
    const syllable = lyrics.slice(c.position, endPos)

    html += `<span class="cp-syllable"><span class="cp-chord">${escapeHtml(simplified)}</span>${escapeHtml(syllable)}</span>`
    lastPos = endPos
  }

  if (lastPos < lyrics.length) {
    html += `<span class="cp-syllable">${escapeHtml(lyrics.slice(lastPos))}</span>`
  }

  return `<div class="cp-line">${html}</div>`
}

export function renderToHtml(song: ChordProSong): string {
  let html = '<div class="cp-song">'

  if (song.title) {
    html += `<h1 class="cp-title">${escapeHtml(song.title)}</h1>`
  }
  if (song.artist) {
    html += `<p class="cp-artist">${escapeHtml(song.artist)}</p>`
  }
  if (song.key) {
    html += `<p class="cp-meta">Key: ${escapeHtml(song.key)}</p>`
  }

  let inSection = false

  for (const line of song.lines) {
    if (line.type === 'directive') {
      const d = line.directive!
      if (d.name === 'comment' || d.name === 'c') {
        if (inSection) html += '</div>'
        html += `<div class="cp-verse"><div class="cp-section">${escapeHtml(d.value)}</div>`
        inSection = true
      }
    } else if (line.type === 'comment') {
      if (inSection) html += '</div>'
      html += `<div class="cp-verse"><div class="cp-section">${escapeHtml(line.content || '')}</div>`
      inSection = true
    } else if (line.type === 'empty') {
      html += '<div class="cp-blank"></div>'
    } else if (line.type === 'chord-lyric') {
      html += renderChordLyricLine(line)
    }
  }

  if (inSection) html += '</div>'

  html += '</div>'
  return html
}
