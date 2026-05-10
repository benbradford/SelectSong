import { Router } from 'express'
import { resolve } from 'path'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import Database from 'better-sqlite3'

export const uploadRouter = Router()

const dbPath = resolve(import.meta.dirname, '../../data/selectsong.db')
const chordproDir = resolve(import.meta.dirname, '../../data/chordpro')
const sheetsDir = resolve(import.meta.dirname, '../../data/sheets')

if (!existsSync(chordproDir)) mkdirSync(chordproDir, { recursive: true })
if (!existsSync(sheetsDir)) mkdirSync(sheetsDir, { recursive: true })

uploadRouter.post('/:songId', (req, res) => {
  const songId = Number(req.params.songId)
  const contentType = req.headers['content-type'] || ''

  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'multipart/form-data required' })
  }

  const chunks: Buffer[] = []
  req.on('data', (chunk) => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    const boundary = contentType.split('boundary=')[1]
    if (!boundary) return res.status(400).json({ error: 'no boundary' })

    const files = parseMultipart(body, boundary)
    if (files.length === 0) return res.status(400).json({ error: 'no files' })

    const db = new Database(dbPath)
    db.pragma('journal_mode = WAL')

    const updates: string[] = []

    for (const file of files) {
      const filename = file.filename
      if (filename.endsWith('.txt') || filename.endsWith('.cho') || filename.endsWith('.chordpro')) {
        writeFileSync(resolve(chordproDir, filename), file.data)
        db.prepare('UPDATE songs SET chordpro_file = ? WHERE id = ?').run(filename, songId)
        updates.push(`chordpro: ${filename}`)
      } else if (filename.endsWith('.pdf')) {
        writeFileSync(resolve(sheetsDir, filename), file.data)
        db.prepare('UPDATE songs SET sheet_pdf = ? WHERE id = ?').run(filename, songId)
        updates.push(`pdf: ${filename}`)
      }
    }

    db.close()
    res.json({ songId, updates })
  })
})

interface ParsedFile {
  filename: string
  data: Buffer
}

function parseMultipart(body: Buffer, boundary: string): ParsedFile[] {
  const files: ParsedFile[] = []
  const boundaryBuf = Buffer.from(`--${boundary}`)
  const parts = splitBuffer(body, boundaryBuf)

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd === -1) continue

    const headerStr = part.slice(0, headerEnd).toString()
    const filenameMatch = headerStr.match(/filename="([^"]+)"/)
    if (!filenameMatch) continue

    const data = part.slice(headerEnd + 4)
    // Remove trailing \r\n
    const end = data.lastIndexOf('\r\n')
    files.push({
      filename: filenameMatch[1],
      data: end > 0 ? data.slice(0, end) : data,
    })
  }

  return files
}

function splitBuffer(buf: Buffer, separator: Buffer): Buffer[] {
  const parts: Buffer[] = []
  let start = 0
  while (true) {
    const idx = buf.indexOf(separator, start)
    if (idx === -1) {
      if (start < buf.length) parts.push(buf.slice(start))
      break
    }
    if (idx > start) parts.push(buf.slice(start, idx))
    start = idx + separator.length
  }
  return parts
}
