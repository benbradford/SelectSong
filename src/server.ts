import 'dotenv/config'
import express from 'express'
import { resolve } from 'path'
import { songsRouter } from './routes/songs.js'
import { servicesRouter } from './routes/services.js'
import { chordproRouter } from './routes/chordpro.js'
import { syncRouter } from './routes/sync.js'
import { suggestRouter } from './routes/suggest.js'
import { planRouter } from './routes/plan.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.static(resolve(import.meta.dirname, '../public')))
app.use('/sheets', express.static(resolve(import.meta.dirname, '../data/sheets')))

app.use('/api/songs', songsRouter)
app.use('/api/services', servicesRouter)
app.use('/api/chordpro', chordproRouter)
app.use('/api/sync', syncRouter)
app.use('/api/suggest', suggestRouter)
app.use('/api/plan', planRouter)

app.listen(PORT, () => {
  console.log(`SelectSong running at http://localhost:${PORT}`)
})
