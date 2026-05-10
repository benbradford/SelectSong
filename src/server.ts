import express from 'express'
import { resolve } from 'path'
import { songsRouter } from './routes/songs.js'
import { servicesRouter } from './routes/services.js'
import { chordproRouter } from './routes/chordpro.js'

const app = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.static(resolve(import.meta.dirname, '../public')))

app.use('/api/songs', songsRouter)
app.use('/api/services', servicesRouter)
app.use('/api/chordpro', chordproRouter)

app.listen(PORT, () => {
  console.log(`SelectSong running at http://localhost:${PORT}`)
})
