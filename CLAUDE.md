# SelectSong

Worship song selection tool for planning Sunday services.

## What this project does

Given a theme and bible passage, suggests 5 songs from the church's approved song list, with suitability ratings and set placement recommendations.

**Set structure**: Intro (engaging) → 3 pre-sermon (mix of introspective/uplifting) → Outro (big send-off). Aim for 1-2 hymns per set.

## Tech stack

- TypeScript (strict mode)
- SQLite via better-sqlite3 + Drizzle ORM
- Express backend serving HTML pages
- ChordPro parser/transposer for musician chord sheets
- Claude API for theme-based song suggestions

## Commands

```bash
npm install          # install deps
npm run dev          # start dev server (port 3000)
npm run db:seed      # import songlist.csv and ledger.csv into SQLite
npm run db:migrate   # run Drizzle migrations
```

## Data sources

- `songlist.csv` — approved song catalogue (exported from Google Sheets)
- `ledger.csv` — historical service log (exported from Google Sheets)
- Google Sheets links (for future live sync):
  - Songlist: https://docs.google.com/spreadsheets/d/1K0W2FiU_85snsRfprY9dLxwdYw5p0uSHRTzcvYSUBNo/edit
  - Ledger: https://docs.google.com/spreadsheets/d/1OUeQNTI97HAa9ZRyWHtDuGQA4JBPYIjxVUssY1K_fdQ/edit

## Song selection workflow (conversational in Claude Code)

User provides: theme + bible passage
Claude responds with: ~10 candidate songs, each with:
- Suitability rating (1-10)
- Recommended set position (intro / pre-sermon 1-3 / outro)
- Rationale (brief)
- Days since last played
- Whether it's a hymn or modern

## Project conventions

- No semicolons in TypeScript
- Use single quotes
- Prefer `const` over `let`
- Keep files small and focused
- Database lives at `data/selectsong.db`
- ChordPro files stored in `data/chordpro/`
