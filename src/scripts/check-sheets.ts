import 'dotenv/config'
import { google } from 'googleapis'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH!
const keyFile = resolve(keyPath)
const credentials = JSON.parse(readFileSync(keyFile, 'utf-8'))

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
})

const sheets = google.sheets({ version: 'v4', auth })

try {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: process.env.SONGLIST_SPREADSHEET_ID,
    fields: 'sheets.properties.title',
  })
  console.log('Songlist sheets:', res.data.sheets?.map(s => s.properties?.title))
} catch (e: any) {
  console.log('Songlist error:', e.message, e.code)
}

try {
  const res = await sheets.spreadsheets.get({
    spreadsheetId: process.env.LEDGER_SPREADSHEET_ID,
    fields: 'sheets.properties.title',
  })
  console.log('Ledger sheets:', res.data.sheets?.map(s => s.properties?.title))
} catch (e: any) {
  console.log('Ledger error:', e.message, e.code)
}
