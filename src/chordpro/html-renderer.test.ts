import { describe, it, expect } from 'vitest'
import { parseChordPro } from './parser.js'
import { renderToHtml } from './html-renderer.js'

describe('renderToHtml', () => {
  it('renders title and metadata', () => {
    const song = parseChordPro('{title: Test Song}\n{artist: Test Artist}\n{key: C}')
    const html = renderToHtml(song)
    expect(html).toContain('<h1 class="cp-title">Test Song</h1>')
    expect(html).toContain('Test Artist')
    expect(html).toContain('Key: C')
  })

  it('renders section headers', () => {
    const song = parseChordPro('{comment: Verse 1}')
    const html = renderToHtml(song)
    expect(html).toContain('cp-section')
    expect(html).toContain('Verse 1')
  })

  it('renders chords above lyrics', () => {
    const song = parseChordPro('[G]Amazing grace')
    const html = renderToHtml(song)
    expect(html).toContain('cp-chord')
    expect(html).toContain('>G<')
    expect(html).toContain('Amazing grace')
  })

  it('simplifies F2(no3) to F2', () => {
    const song = parseChordPro('[F2(no3)]Hello')
    const html = renderToHtml(song)
    expect(html).toContain('>F2<')
    expect(html).not.toContain('no3')
  })

  it('renders chord-only lines inline', () => {
    const song = parseChordPro('[|] [A] [.] [A2sus] [|]')
    const html = renderToHtml(song)
    expect(html).toContain('cp-chords-only')
    expect(html).toContain('cp-chord-inline')
    expect(html).toContain('A')
    expect(html).toContain('A2sus')
    expect(html).not.toContain('|')
    expect(html).not.toContain('.')
  })

  it('uses nbsp for trailing chords with no lyrics', () => {
    const song = parseChordPro('[G]praise [F2]')
    const html = renderToHtml(song)
    expect(html).toContain('&nbsp;')
  })

  it('preserves word spacing with nbsp', () => {
    const song = parseChordPro('[F]Fix in [Bb]us Thy')
    const html = renderToHtml(song)
    // Should have nbsp after syllables to prevent word joining
    expect(html).toContain('&nbsp;')
  })

  it('wraps sections in cp-verse for page break control', () => {
    const song = parseChordPro('{comment: Verse 1}\n[C]Line one\n[G]Line two\n\n{comment: Chorus}\n[Am]Chorus line')
    const html = renderToHtml(song)
    const verseCount = (html.match(/cp-verse/g) || []).length
    expect(verseCount).toBeGreaterThanOrEqual(2)
  })

  it('closes verse block on blank lines', () => {
    const song = parseChordPro('{comment: Verse 1}\n[C]Line one\n\n{comment: Verse 2}\n[G]Line two')
    const html = renderToHtml(song)
    // Each verse should be its own block
    const opens = (html.match(/<div class="cp-verse">/g) || []).length
    expect(opens).toBe(2)
  })
})
