import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const songs = sqliteTable('songs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  author: text('author'),
  copyright: text('copyright'),
  isHymn: integer('is_hymn', { mode: 'boolean' }).notNull().default(false),
  isSong: integer('is_song', { mode: 'boolean' }).notNull().default(false),
  isATN: integer('is_atn', { mode: 'boolean' }).notNull().default(false),
  recentlyAdded: integer('recently_added', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  firstLine: text('first_line'),
  themes: text('themes'),
  defaultKey: text('default_key'),
  chordproFile: text('chordpro_file'),
  excluded: integer('excluded', { mode: 'boolean' }).notNull().default(false),
  excludedReason: text('excluded_reason'),
  sheetPdf: text('sheet_pdf'),
  songselectUrl: text('songselect_url'),
})

export const serviceEntries = sqliteTable('service_entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  songName: text('song_name').notNull(),
  firstLine: text('first_line'),
  musicLeader: text('music_leader'),
  ccliRef: text('ccli_ref'),
  songId: integer('song_id').references(() => songs.id),
  position: integer('position'),
})

export const services = sqliteTable('services', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(),
  theme: text('theme'),
  biblePassage: text('bible_passage'),
  musicLeader: text('music_leader'),
  notes: text('notes'),
})
