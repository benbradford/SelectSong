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

## Song selection workflow

Two modes:
1. **Conversational** (in Claude Code) — user provides theme + passage, Claude queries DB directly and produces recommendations
2. **Web UI** — POST to /api/suggest from the suggest.html page (requires ANTHROPIC_API_KEY)

## Project conventions

- No semicolons in TypeScript
- Use single quotes
- Prefer `const` over `let`
- Keep files small and focused
- Database lives at `data/selectsong.db`
- ChordPro files stored in `data/chordpro/`
- Secrets in `secrets/` (gitignored)
