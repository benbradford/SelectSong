# ChurchSuite Integration

## Goal

Pull upcoming service data (dates, themes, bible passages, rota assignments) from ChurchSuite so the Suggest page can auto-populate instead of requiring manual entry.

## API Overview

ChurchSuite has two API versions:

- **v1 API** — documented at https://github.com/ChurchSuite/churchsuite-api (partially)
- **v2 API** — undocumented but confirmed working via the open-source project https://github.com/hussra/churchsuite-plan-viewer

The v2 Planning API is what we need.

## Instance

- URL: `stjohnsfolkestone.churchsuite.com`
- Account name: `stjohnsfolkestone`

## Authentication

**v2 API uses OAuth2 client credentials:**

1. Token endpoint: `POST https://login.churchsuite.com/oauth2/token`
2. Auth: HTTP Basic with `client_id:client_secret`
3. Body: `{"grant_type": "client_credentials", "scope": "full_access"}`
4. Returns a Bearer token for `Authorization: Bearer {token}` header

**To get credentials:** Ask your ChurchSuite admin to check admin settings under API/Integrations, or contact support@churchsuite.com.

## Relevant Endpoints

| Endpoint | Returns |
|---|---|
| `GET /v2/planning/plans?starts_after=YYYY-MM-DD` | List of upcoming service plans (date, time, name, status) |
| `GET /v2/planning/plans/{id}` | Single plan detail |
| `GET /v2/planning/plan_items?plan_ids[]={id}` | Plan items: songs, readings, headings, people assignments |
| `GET /v2/planning/songs/{id}` | Song metadata |
| `GET /v2/planning/song_arrangements/{id}` | Song arrangement with chart data |
| `GET /v1/my/rotas` | Personal rota assignments (undocumented but confirmed to exist) |

## Data Available Per Plan Item

- `item.name` — item name
- `item.type` — e.g. "song", "heading", "video"
- `item.people[]` — assigned people with `first_name`, `last_name`
- `item.question_responses[]` — structured responses including bible passage data with `response_type: 'bible'`, containing `book` (abbreviation) and `reference`
- `item.notes[]` — notes
- `item.date_time` — timing

Theme is typically in the plan `name` or a heading item. Bible passages are in `question_responses`.

## Implementation Plan

### Step 1: Get credentials

Ask ChurchSuite admin for OAuth2 client_id and client_secret. Store in `.env`:
```
CHURCHSUITE_CLIENT_ID=...
CHURCHSUITE_CLIENT_SECRET=...
CHURCHSUITE_ACCOUNT=stjohnsfolkestone
```

### Step 2: Build the service

Create `src/services/churchsuite.ts`:
- `getToken()` — OAuth2 client credentials flow
- `getUpcomingPlans()` — fetch plans starting after today
- `getPlanDetails(planId)` — fetch items for a plan, extract passage and theme
- `getMyServices()` — filter plans where user is assigned (check people[] fields)

### Step 3: Add API route

Create `GET /api/churchsuite/upcoming` that returns:
```json
[
  {
    "id": "...",
    "date": "2026-06-01",
    "theme": "Grace and Forgiveness",
    "passage": "Ephesians 2:1-10",
    "myRole": "Worship Leader"
  }
]
```

### Step 4: Update the Suggest page

Replace (or supplement) the manual form with a list of upcoming services from ChurchSuite. Click one to start planning with date/theme/passage pre-filled.

### Step 5: Optional — sync rota to know which services are "mine"

The `/v1/my/rotas` or plan items `people[]` field can identify which services the user is assigned to, so only those show up.

## Reference Implementation

The `churchsuite-plan-viewer` project (https://github.com/hussra/churchsuite-plan-viewer) is a working example of the v2 Planning API. It's a React app that displays plans and their items — good reference for data shapes and auth flow.

## Notes

- The v2 API is not officially documented by ChurchSuite — it may change
- The GitHub docs (v1) state they are "in flux"
- Token refresh will be needed (tokens expire — cache and refresh as needed)
