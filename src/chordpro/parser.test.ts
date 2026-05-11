import { describe, it, expect } from 'vitest'
import { parseChordPro, transposeChord, transposeSong, semitonesFromTo } from './parser.js'

describe('transposeChord', () => {
  it('transposes simple chords up', () => {
    expect(transposeChord('C', 2)).toBe('D')
    expect(transposeChord('G', 3)).toBe('A#')
    expect(transposeChord('A', 2)).toBe('B')
  })

  it('wraps around from B to C', () => {
    expect(transposeChord('B', 1)).toBe('C')
  })

  it('transposes compound chords', () => {
    expect(transposeChord('Am', 2)).toBe('Bm')
    expect(transposeChord('C/E', 2)).toBe('D/F#')
    expect(transposeChord('Dm7', 5)).toBe('Gm7')
  })

  it('handles sharps', () => {
    expect(transposeChord('F#', 1)).toBe('G')
    expect(transposeChord('C#m', 2)).toBe('D#m')
  })

  it('normalises flats to sharps', () => {
    expect(transposeChord('Bb', 0)).toBe('A#')
    expect(transposeChord('Eb', 0)).toBe('D#')
  })

  it('transposes down (negative semitones via modulo)', () => {
    expect(transposeChord('D', -2 + 12)).toBe('C')
  })
})

describe('semitonesFromTo', () => {
  it('calculates distance between keys', () => {
    expect(semitonesFromTo('C', 'D')).toBe(2)
    expect(semitonesFromTo('G', 'C')).toBe(5)
    expect(semitonesFromTo('A', 'A')).toBe(0)
    expect(semitonesFromTo('D', 'C')).toBe(10)
  })
})

describe('parseChordPro', () => {
  it('parses title, artist, and key directives', () => {
    const source = `{title: Amazing Grace}
{artist: John Newton}
{key: G}`
    const song = parseChordPro(source)
    expect(song.title).toBe('Amazing Grace')
    expect(song.artist).toBe('John Newton')
    expect(song.key).toBe('G')
  })

  it('parses chord-lyric lines', () => {
    const source = '[G]Amazing [C]grace how [G]sweet the sound'
    const song = parseChordPro(source)
    expect(song.lines[0].type).toBe('chord-lyric')
    expect(song.lines[0].chords).toHaveLength(3)
    expect(song.lines[0].chords![0]).toEqual({ chord: 'G', position: 0 })
    expect(song.lines[0].chords![1]).toEqual({ chord: 'C', position: 8 })
    expect(song.lines[0].lyrics).toBe('Amazing grace how sweet the sound')
  })

  it('parses comment directives as sections', () => {
    const source = '{comment: Verse 1}'
    const song = parseChordPro(source)
    expect(song.lines[0].type).toBe('directive')
    expect(song.lines[0].directive!.name).toBe('comment')
    expect(song.lines[0].directive!.value).toBe('Verse 1')
  })

  it('handles empty lines', () => {
    const source = 'line one\n\nline two'
    const song = parseChordPro(source)
    expect(song.lines[1].type).toBe('empty')
  })

  it('parses lines without chords', () => {
    const source = 'Just plain lyrics'
    const song = parseChordPro(source)
    expect(song.lines[0].type).toBe('chord-lyric')
    expect(song.lines[0].chords).toHaveLength(0)
    expect(song.lines[0].lyrics).toBe('Just plain lyrics')
  })
})

describe('transposeSong', () => {
  it('transposes all chords in a song', () => {
    const source = `{key: C}
[C]Amazing [G]grace`
    const song = parseChordPro(source)
    const transposed = transposeSong(song, 2)
    expect(transposed.key).toBe('D')
    expect(transposed.lines[1].chords![0].chord).toBe('D')
    expect(transposed.lines[1].chords![1].chord).toBe('A')
  })

  it('preserves lyrics when transposing', () => {
    const source = '[C]Hello [Am]world'
    const song = parseChordPro(source)
    const transposed = transposeSong(song, 5)
    expect(transposed.lines[0].lyrics).toBe('Hello world')
    expect(transposed.lines[0].chords![0].chord).toBe('F')
    expect(transposed.lines[0].chords![1].chord).toBe('Dm')
  })
})
