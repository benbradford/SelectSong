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
npm run dev          # start dev server (default port 3000, override with PORT env var)
npm run db:seed      # import songlist.csv and ledger.csv into SQLite
npm run db:migrate   # run Drizzle migrations
npm run sync         # pull latest data from Google Sheets into SQLite
```

Entry point is `src/server.ts` (not `src/index.ts`).

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
2. **Get all song candidates** with recency data (includes planned services as "recently played"):
   ```bash
   npx tsx src/scripts/get-candidates.ts 2026-05-31
   ```
   Pass the target date as an argument. This outputs all songs sorted by days since last played, including any already-planned services that haven't hit the ledger yet.
3. **Consider**: thematic fit, recency (prefer 6+ weeks since last played), hymn balance (1-2 per set), energy flow. Ask the user what they played today/recently if the ledger may not be up-to-date yet, so you don't suggest songs they just did.
4. **Present** ~5 recommendations + alternatives with ratings, positions, rationale
5. **After agreement**, save the plan **once** (wait until the full set is confirmed — main songs, communion, and pre-service — before calling save-plan). Each call creates a new row, so avoid saving multiple times during iteration:
   ```bash
   npx tsx src/scripts/save-plan.ts --date YYYY-MM-DD --theme "..." --passage "..." --leader "..." --songs '[{"songId":N,"position":1,"key":"C","notes":"Thematic justification for this song"},...]'
   ```
   The `notes` field is required for main set songs (positions 1-5) — it contains a short justification explaining why this song fits the theme/passage. Without it the plan.html UI shows empty justification fields.
   If you've already saved and need to update, use the PATCH endpoint instead:
   ```bash
   curl -X PATCH http://localhost:4000/api/plan/{id}/songs -H 'Content-Type: application/json' -d '{"songs":[...]}'
   ```
6. **Include justification notes** in the `notes` field for each main set song (positions 1-5) when saving/patching — these show in the plan.html UI
7. **Report** which songs lack chordpro/PDF files — user will download from SongSelect
7. User views the plan at `http://localhost:{PORT}/plan.html` (default port 3000)

### Song matching notes
- The `song_aliases` table maps ledger names to songlist names (e.g. "Waymaker" → "Way Maker", "Holy Spirit" → "Holy Spirit, living breath")
- Songs with `excluded = 1` must never be suggested (check `excluded_reason` for why)
- Position numbers: 0=Pre-service, 1+ for main set (1=Song 1, 2=Song 2, etc.), 1000+ for communion (1000=Communion 1, 1001=Communion 2, etc.)

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
User places SongSelect downloads in the project's `downloads/` directory. When processing:
- Copy ChordPro `.txt` files to `data/chordpro/`
- Copy lead sheet PDFs to `data/sheets/`
- Update the DB: `UPDATE songs SET chordpro_file='filename.txt', sheet_pdf='filename.pdf', songselect_url='https://...', default_key='C' WHERE id=N`

## Print layout system

The print system lives in `public/js/chord-layout.js` and is used by both the Chord Sheets page (`chordpro.html`) and the Plan page (`plan.html`).

### How printing works
Clicking Print opens a **live preview window** with controls (font size slider, 2-up toggle, landscape toggle, Print button). The optimizer picks a starting layout, but the user can override everything before printing.

### Layout optimizer heuristics (in `optimizeForPrint`)
1. **Prefer landscape 2-up** if chord lines fit columns without overflow (maximizes page space)
2. **Fall back to portrait single-column** if chord lines are too wide for 2-up columns
3. **Font size**: finds the largest that fits vertically, then steps down until no horizontal overflow
4. **CCLI footer is stripped** from print output (saves significant vertical space)
5. **Overflow detection**: temporarily sets `white-space: nowrap` on chord lines and checks `scrollWidth > parentWidth`

### Key constraints for chord sheet layout
- Chord lines use `white-space: nowrap` — they CANNOT wrap (wrapping causes chords to overlap lyrics below due to `position: absolute` on `.cp-chord`)
- Print page dimensions are estimates and will never perfectly match every browser/printer combo — that's why we give the user a live preview with manual override
- Don't try to guess exact pixel dimensions for print — Chrome's print rendering varies. Provide reasonable defaults and let the user adjust
- The measurement container must be attached to the DOM (not just `createElement`) or `getBoundingClientRect()` returns zeros
- Print spacing uses tighter values than screen: `line-height: 1.3`, `padding-top: 1.1em` on `.cp-line`

### Architecture
- `chord-layout.js` — shared layout logic (IIFE exposing `ChordLayout` global). Used by both pages and the PDF export
- `chordpro.js` — Chord Sheets page controller (song selection, transpose, print)
- `plan.js` — Plan page controller (includes chord viewer with per-song display prefs, manual page breaks, source editor)
- `chordpro.css` — all chord sheet styling including `@media print` rules

### Common pitfalls (lessons from this session)
- `autoFitTwoCol` must measure total height including the header, not just rows
- The 2-col split puts header elements (title/artist/key) above both columns — don't include them in the content split
- When testing overflow, chord-only lines (`.cp-line` with `.cp-chord` children) are what matter — CCLI text lines without chords can safely clip
- `applyTwoCol` returns `false` if content is too short to split — check this before measuring

## Project conventions

- No semicolons in TypeScript
- Use single quotes
- Prefer `const` over `let`
- Keep files small and focused
- Database lives at `data/selectsong.db`
- ChordPro files stored in `data/chordpro/`
- Lead sheet PDFs stored in `data/sheets/`
- Secrets in `secrets/` (gitignored)
- The `downloads/` directory is a staging area for new SongSelect files before they're copied to `data/`
