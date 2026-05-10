# SelectSong

Worship song selection tool for planning Sunday services.

## What this project does

Given a theme and bible passage, suggests 5 songs from the church's approved song list, with suitability ratings and set placement recommendations.

**Set structure**: Intro (engaging) → 3 pre-sermon (mix of introspective/uplifting) → Outro (big send-off). Aim for 1-2 hymns per set.

## Tech stack

- TypeScript (strict mode, ESM)
- SQLite via better-sqlite3 + Drizzle ORM
- Express backend serving HTML pages
- ChordPro parser/transposer for musician chord sheets
- Claude API (Anthropic SDK) for automated song suggestions
- Google Sheets API (service account) for live data sync

## Commands

```bash
npm install          # install deps
npm run dev          # start dev server (port 3000)
npm run db:seed      # import songlist.csv and ledger.csv into SQLite
npm run db:migrate   # run Drizzle migrations
npm run sync         # pull latest data from Google Sheets into SQLite
```

## API Endpoints

- `GET /api/songs` — all songs
- `GET /api/songs/candidates` — songs with recency/play-count data
- `GET /api/services/recent` — last 50 services grouped by date
- `GET /api/chordpro` — list available ChordPro files
- `GET /api/chordpro/:filename?key=X&format=text` — get/transpose a chord sheet
- `POST /api/sync` — trigger Google Sheets sync
- `POST /api/suggest` — `{ theme, passage }` → AI song recommendations

## Data sources

- `songlist.csv` — approved song catalogue (local fallback / initial seed)
- `ledger.csv` — historical service log (local fallback / initial seed)
- Google Sheets (live sync via service account):
  - Songlist: `1K0W2FiU_85snsRfprY9dLxwdYw5p0uSHRTzcvYSUBNo`
  - Ledger: `1OUeQNTI97HAa9ZRyWHtDuGQA4JBPYIjxVUssY1K_fdQ`

## Configuration

Copy `.env.example` to `.env` and fill in:
- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` — path to service account JSON key
- `SONGLIST_SPREADSHEET_ID` / `LEDGER_SPREADSHEET_ID` — already filled
- `ANTHROPIC_API_KEY` — for the /api/suggest endpoint

## Song selection workflow (primary — conversational in Claude Code)

When the user asks for song suggestions:

1. **Sync the ledger** first: `npx tsx src/scripts/sync.ts` (pulls latest from Google Sheets)
2. **Query the database** for all non-excluded songs with play history:
   ```bash
   npx tsx -e "
   import Database from 'better-sqlite3'
   const db = new Database('./data/selectsong.db')
   const songs = db.prepare('SELECT id, name, is_hymn, author FROM songs WHERE excluded = 0 AND name != \"\" ORDER BY name').all()
   const aliases = db.prepare('SELECT song_id, alias FROM song_aliases').all()
   const entries = db.prepare('SELECT song_name, date FROM service_entries ORDER BY date DESC').all()
   // ... match songs to entries via aliases, compute days since last played
   "
   ```
3. **Consider**: thematic fit, recency (prefer 6+ weeks since last played), hymn balance (1-2 per set), energy flow
4. **Present** ~5 recommendations + alternatives with ratings, positions, rationale
5. **After agreement**, save the plan:
   ```bash
   npx tsx src/scripts/save-plan.ts --date YYYY-MM-DD --theme "..." --passage "..." --leader "..." --songs '[{"songId":N,"position":1,"key":"C"},...]'
   ```
6. **Report** which songs lack chordpro/PDF files — user will download from SongSelect
7. User views the plan at `http://localhost:3000/plan.html`

### Song matching notes
- The `song_aliases` table maps ledger names to songlist names (e.g. "Waymaker" → "Way Maker", "Holy Spirit" → "Holy Spirit, living breath")
- Songs with `excluded = 1` must never be suggested (check `excluded_reason` for why)
- Position numbers: 1=Intro, 2=Pre-sermon 1, 3=Pre-sermon 2, 4=Pre-sermon 3, 5=Outro

### Draft email to vicar
After finalising the set, output a brief email draft explaining the song choices. Format:
```
Hi [Vicar],

Here are the songs for [date] ([theme] / [passage]):

1. [Song]
2. [Song]
3. [Song]
4. [Song]
5. [Song]

Reasoning:
1. [one sentence reason]
2. [one sentence reason]
3. [one sentence reason]
4. [one sentence reason]
5. [one sentence reason]

Let me know if you'd like any changes.

Ben
```
Keep reasoning to ~10 words per song. Focus on thematic connection to the passage.

### Adding new music files
When user downloads from SongSelect:
- ChordPro `.txt` files go in `data/chordpro/`
- Lead sheet PDFs go in `data/sheets/`
- Update the DB: `UPDATE songs SET chordpro_file='filename.txt', sheet_pdf='filename.pdf', songselect_url='https://...', default_key='C' WHERE id=N`

## Project conventions

- No semicolons in TypeScript
- Use single quotes
- Prefer `const` over `let`
- Keep files small and focused
- Database lives at `data/selectsong.db`
- ChordPro files stored in `data/chordpro/`
- Secrets in `secrets/` (gitignored)
