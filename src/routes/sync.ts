import { Router } from 'express'
import { syncAll, syncSonglist, syncLedger } from '../services/sheets-sync.js'

export const syncRouter = Router()

syncRouter.post('/', async (_req, res) => {
  try {
    const result = await syncAll()
    res.json({ success: true, ...result })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

syncRouter.post('/songlist', async (_req, res) => {
  try {
    const songCount = await syncSonglist()
    res.json({ success: true, songCount })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

syncRouter.post('/ledger', async (_req, res) => {
  try {
    const entryCount = await syncLedger()
    res.json({ success: true, entryCount })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})
