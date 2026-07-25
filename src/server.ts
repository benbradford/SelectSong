import 'dotenv/config'
import express from 'express'
import { resolve } from 'path'
import { songsRouter } from './routes/songs.js'
import { servicesRouter } from './routes/services.js'
import { chordproRouter } from './routes/chordpro.js'
import { syncRouter } from './routes/sync.js'
import { suggestRouter } from './routes/suggest.js'
import { planRouter } from './routes/plan.js'
import { terminalRouter } from './routes/terminal.js'
import { uploadRouter } from './routes/upload.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
// Local single-user tool: never cache static assets so JS/CSS edits show up on plain reload.
app.use(express.static(resolve(import.meta.dirname, '../public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store')
}))
app.use('/sheets', express.static(resolve(import.meta.dirname, '../data/sheets')))

app.use('/api/songs', songsRouter)
app.use('/api/services', servicesRouter)
app.use('/api/chordpro', chordproRouter)
app.use('/api/sync', syncRouter)
app.use('/api/suggest', suggestRouter)
app.use('/api/plan', planRouter)
app.use('/api/terminal', terminalRouter)
app.use('/api/upload', uploadRouter)

app.listen(PORT, () => {
  console.log(`SelectSong running at http://localhost:${PORT}`)
})
