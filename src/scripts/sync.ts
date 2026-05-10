import 'dotenv/config'
import { syncAll } from '../services/sheets-sync.js'

console.log('Syncing from Google Sheets...')
const result = await syncAll()
console.log(`Done! ${result.songCount} songs, ${result.entryCount} ledger entries`)
