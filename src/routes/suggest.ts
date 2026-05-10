import { Router } from 'express'
import { suggestSongs } from '../services/suggest.js'

export const suggestRouter = Router()

suggestRouter.post('/', async (req, res) => {
  const { theme, passage } = req.body
  if (!theme || !passage) {
    return res.status(400).json({ error: 'theme and passage are required' })
  }

  try {
    const result = await suggestSongs(theme, passage)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
