# SelectSong

A worship song selection tool for planning Sunday services. Uses Claude Code conversationally to suggest songs based on a theme and bible passage, then presents the plan on a local web app for viewing chord sheets, changing keys, and printing.

## Setup

### Prerequisites

- Node.js 20+
- [Claude Code](https://claude.ai/claude-code) CLI

### Install

```bash
git clone <this repo>
cd selectsong
npm install
```

### Seed the database (first time only)

```bash
npm run db:seed
```

This imports `songlist.csv` and `ledger.csv` into a local SQLite database.

### Google Sheets sync (optional)

To pull the latest service ledger from Google Sheets:

1. Create a Google Cloud project at console.cloud.google.com
2. Enable the **Google Sheets API**
3. Create a **Service Account** (IAM & Admin → Service Accounts → Create)
4. Go into the service account → Keys tab → Add Key → Create new key → JSON
5. Save the JSON file to `secrets/google-service-account.json`
6. Share both Google Sheets with the service account email (found in the JSON file under `client_email`)
7. Copy `.env.example` to `.env` (spreadsheet IDs are pre-filled)

Then run:
```bash
npm run sync
```

## Usage

### Planning a service

1. Open Claude Code in this project directory
2. Tell it the date, theme, and bible passage (e.g. "Plan songs for June 1st, theme is God's faithfulness, passage is Lamentations 3:22-33")
3. Claude will suggest songs with ratings and positions — discuss and iterate
4. Once agreed, Claude saves the plan and tells you which songs need music files downloaded
5. Download any missing chord sheets from [SongSelect](https://songselect.ccli.com) and import them (see below)
6. Run the web app and open the Plan page to view, reorder, change keys, and print

### Adding music files

Download ChordPro (.txt) and lead sheet (.pdf) files from SongSelect, then either:

**Option A — Downloads folder (recommended):**
```bash
# Drop files into the downloads/ folder, then run:
npm run import
```
Files are automatically matched to songs by name, moved to the correct location, and linked in the database.

**Option B — Upload via web app:**

On the Plan page, songs missing music files show a green "Upload" button. Click it and select the file(s) directly.

### Running the web app

```bash
npm run dev
```

Open http://localhost:3000 (or whatever `PORT` is set to in `.env`)

Pages:
- **Songs** — browse the full catalogue with play history
- **Recent Services** — see what was played recently
- **Chord Sheets** — view/transpose any ChordPro file
- **Plan** — view the current service plan, drag to reorder, change keys, print chord sheets

### Printing chord sheets

From the Plan page, click "Chords" on any song to preview it. You can:
- Change the font and size
- Click between sections to add page breaks
- Auto-size fills the page optimally based on your page breaks
- Click "Print Chords" for a clean printable version

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed architectural decisions and rationale.

## Project structure

```
data/
  selectsong.db      — SQLite database (gitignored, regenerate with npm run db:seed)
  chordpro/          — ChordPro (.txt) files from SongSelect
  sheets/            — PDF lead sheets from SongSelect
public/              — Frontend HTML/CSS/JS
src/
  chordpro/          — ChordPro parser and HTML renderer
  db/                — Database schema
  routes/            — Express API routes
  scripts/           — CLI scripts (seed, sync, save-plan)
  services/          — Business logic (suggestions, sheets sync)
secrets/             — Google service account key (gitignored)
```
