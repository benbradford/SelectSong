# Architecture & Key Decisions

## Overview

SelectSong is a local-first tool that combines conversational AI (Claude Code) with a lightweight web app. The AI handles the creative/analytical work (song selection), while the web app handles the visual/interactive work (viewing, reordering, transposing, printing).

## Key Architectural Decisions

### 1. Conversational AI over traditional UI for song selection

**Decision**: Song suggestions happen in Claude Code conversations, not through a web form.

**Why**: Selecting worship songs requires nuanced reasoning — understanding theology, matching themes to lyrics, balancing energy flow, considering recency. A conversation allows natural iteration ("swap the intro", "something more upbeat", "we did that recently"). A form with dropdowns could never capture this.

**Trade-off**: Requires Claude Code CLI to be installed. Accepted because the user is always in the terminal anyway.

### 2. SQLite (local file) over a hosted database

**Decision**: All data lives in a single `data/selectsong.db` file.

**Why**: Single user, local tool, zero infrastructure. No accounts, no network dependency, no costs. The database is regenerable from CSV seeds, and syncs from Google Sheets for fresh data.

**Trade-off**: Can't access from multiple devices simultaneously. If that's needed later, migrate to Turso (hosted SQLite-compatible) with minimal code changes.

### 3. Google Sheets as the source of truth for song/ledger data

**Decision**: The church's existing Google Sheets remain the primary data store. SQLite is a local cache that syncs from them.

**Why**: The sheets are shared with the worship team and maintained by multiple people. Duplicating data entry would cause drift. A one-way sync (`npm run sync`) keeps the local DB fresh without disrupting the team's workflow.

**Trade-off**: Requires a Google service account. The songlist sheet needs the owner to share access.

### 4. Song name aliases for fuzzy matching

**Decision**: A `song_aliases` table maps variant names between the ledger and songlist.

**Why**: The ledger uses different names than the songlist (e.g. "Waymaker" vs "Way Maker", "Holy Spirit" vs "Holy Spirit, living breath"). Rather than complex fuzzy matching algorithms, explicit aliases are reliable and maintainable.

**Trade-off**: New mismatches need manual alias additions. But they're rare and easy to spot (songs showing "never played" when they clearly have been).

### 5. ChordPro format for chord sheets

**Decision**: Store chord/lyric data as ChordPro text files, render to styled HTML on the fly.

**Why**: ChordPro is the standard format SongSelect exports. Storing it as text means we can transpose keys programmatically, render in any style, and print cleanly. PDFs are static and can't be transposed.

**Trade-off**: Both formats are kept — ChordPro for musicians who need key changes, PDF lead sheets for singers who want the original layout.

### 6. HTML rendering with CSS for print layout (not PDF generation)

**Decision**: Chord sheets render as styled HTML with `@media print` CSS, not server-generated PDFs.

**Why**: Allows real-time font/size adjustment, clickable page breaks, and instant preview. Browser print gives consistent results without heavy dependencies (wkhtmltopdf, puppeteer, etc.).

**Trade-off**: Page break positioning requires user interaction rather than perfect automatic pagination. Solved with click-to-add page breaks and auto-sizing.

### 7. Excluded songs via database flag (not deletion)

**Decision**: Songs from excluded publishers (Hillsong, Bethel) are flagged with `excluded = 1` and `excluded_reason`, not removed.

**Why**: The exclusion policy may change. Keeping them in the DB with a flag means they're instantly recoverable. The query layer filters them out.

### 8. Express + vanilla JS (no framework)

**Decision**: Plain Express server, vanilla HTML/CSS/JS frontend. No React, no build step for frontend.

**Why**: The UI is simple (5 pages, minimal interactivity beyond drag-and-drop). A framework would add complexity, build tooling, and bundle size for no benefit. Any future Claude session can understand and modify the code without framework knowledge.

**Trade-off**: No component reuse, no reactive state. Acceptable for this scale.

### 9. Plan saved via CLI script (not web UI)

**Decision**: After agreeing on songs in conversation, Claude calls `npx tsx src/scripts/save-plan.ts` to persist the plan.

**Why**: The plan is the output of a conversation. Claude already has all the data (song IDs, positions, keys) in context. A CLI script is the simplest bridge between the conversation and the database. No need for the user to re-enter data in a form.

### 10. Separate `planned_services` table (not reusing `service_entries`)

**Decision**: Planned services have their own tables, distinct from the historical ledger.

**Why**: The ledger is a historical record synced from Google Sheets. Plans are forward-looking and editable (reorder, change keys). Mixing them would complicate the sync logic and risk overwriting plans with stale ledger data.

## Data Flow

```
Google Sheets (songlist + ledger)
        │
        ▼  npm run sync
   SQLite DB (songs, service_entries, song_aliases)
        │
        ▼  Claude Code queries DB
   Song suggestions (conversational)
        │
        ▼  save-plan.ts
   planned_services + planned_service_songs
        │
        ▼  Express API
   Web app (plan.html) → view, reorder, transpose, print
```

## Security & Privacy Notes

- No data leaves the local machine (except Google Sheets API calls for sync)
- Service account key stored in `secrets/` (gitignored)
- `.env` file with credentials is gitignored
- The web app runs on localhost only — no authentication needed
- Song lyrics/chords are CCLI-licensed content stored locally
