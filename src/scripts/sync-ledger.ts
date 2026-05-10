import 'dotenv/config'
import { syncLedger } from '../services/sheets-sync.js'

console.log('Syncing ledger from Google Sheets...')
const count = await syncLedger()
console.log(`Done! ${count} ledger entries`)
