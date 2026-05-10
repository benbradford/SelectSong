import Anthropic from '@anthropic-ai/sdk'
import { getSongCandidates, formatCandidatesForPrompt } from './suggestions.js'

const SYSTEM_PROMPT = `You are a worship song selection assistant. You help worship leaders choose songs for Sunday services.

Given a theme and bible passage, you select songs from the provided catalogue that fit thematically. You must ONLY suggest songs from the catalogue provided — never suggest songs not on the list.

Set structure:
- Intro (1 song): Engaging, draws people in
- Pre-sermon (3 songs): Mix of introspective and uplifting. At least 1 hymn in the set overall.
- Outro (1 song): Big, anthemic send-off

Selection criteria:
- Thematic fit with the passage and theme (most important)
- Recency: prefer songs not played in the last 4-6 weeks. Flag if a song was played very recently.
- Variety: aim for 1-2 hymns, rest modern
- Energy flow: build appropriately through the set

Respond with a JSON object matching this structure:
{
  "recommendations": [
    {
      "position": "intro" | "pre-sermon-1" | "pre-sermon-2" | "pre-sermon-3" | "outro",
      "songName": "exact name from catalogue",
      "rating": 1-10,
      "rationale": "brief explanation"
    }
  ],
  "alternatives": [
    {
      "songName": "exact name from catalogue",
      "rating": 1-10,
      "bestAs": "position suggestion",
      "rationale": "brief explanation"
    }
  ]
}`

export interface SongRecommendation {
  position: string
  songName: string
  rating: number
  rationale: string
}

export interface SongAlternative {
  songName: string
  rating: number
  bestAs: string
  rationale: string
}

export interface SuggestionResult {
  recommendations: SongRecommendation[]
  alternatives: SongAlternative[]
}

export async function suggestSongs(theme: string, passage: string): Promise<SuggestionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

  const client = new Anthropic({ apiKey })
  const candidates = getSongCandidates()
  const catalogueText = formatCandidatesForPrompt(candidates)

  const today = new Date().toISOString().slice(0, 10)

  const userPrompt = `Today's date: ${today}

Theme: ${theme}
Bible passage: ${passage}

Song catalogue (with recency info):
${catalogueText}

Please select 5 songs for this service and provide 3-5 alternatives.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Failed to parse suggestion response')

  return JSON.parse(jsonMatch[0]) as SuggestionResult
}
