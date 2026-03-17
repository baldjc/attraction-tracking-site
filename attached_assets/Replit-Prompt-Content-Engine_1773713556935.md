# Content Engine — Design Spec

**Date:** 2026-03-16
**Platform:** Attraction Tracking Site (Replit)
**Replaces:** Title Creator
**Status:** Approved design, pending implementation

---

## Overview

The Content Engine is an AI-powered video idea generator built into the Attraction Tracking Site. It replaces the existing Title Creator with a deeper, theme-organized tool that generates video ideas with talking points — modelled on the Jordan & Sarah content system built for CREG.

Members get video ideas organized by their avatar's content themes, each with a keyword-stacked title, 3-5 talking points in their avatar's language, the framework used, and a note explaining why the idea connects to their audience. Ideas are saved to a per-theme library and the member can return anytime for more.

---

## Prerequisites

- **Avatar + themes required.** The Content Engine is gated behind a completed Avatar Architect profile. If no avatar exists, the tool displays a message linking to Avatar Architect.
- **One-time niche setup.** On first visit (after avatar exists), the member selects their niche and, if applicable, their city. This is changeable anytime via a settings icon on the dashboard.

---

## User Flow

### First Visit (One-Time Setup)

1. Member clicks "Content Engine" on AI Tools hub
2. If no avatar → gated message: "Build your avatar first" with link to Avatar Architect
3. If avatar exists but no niche set → niche setup form:
   - **Niche:** Real Estate, Financial Planning, Other (dropdown)
   - **City/Market:** free text field, shown if niche is Real Estate (e.g., "Calgary", "Houston")
   - Brief copy: "This helps us optimize your video titles for search in your market."
   - Save → niche and city stored on user profile
4. Theme dashboard loads

**Niche detection:** The Content Engine page fetches the user profile on mount (extending the existing `/api/member/avatar` GET endpoint to also return `niche` and `city`). If `niche` is null, show the setup form. Otherwise, load the dashboard.

### Theme Dashboard (Home Screen)

The member's chosen content themes (from Avatar Architect) displayed as cards in a grid.

**Each theme card includes:**
- AI-assigned emoji and colour (generated during Avatar Architect, stored with themes)
- Theme name
- Core stress quote (from avatar, in the avatar's voice)
- Saved idea count badge
- "Generate Ideas" button (batch mode)
- "Go Deeper" button (chat mode)

**Dashboard-level controls:**
- "Generate All" button — batch-generates across all themes at once
- Settings icon — opens niche/city editor as a modal (reuses NicheSetup component)

**Each card uses accordion-style inline expansion** to show two sections:
- **Generated Ideas** — latest batch, unsaved
- **Saved Ideas** — the member's growing library for that theme (paginated, 20 per page)

**Graceful degradation for old-format themes:** If a member's `contentThemes` is an array of strings (pre-Content Engine format), the dashboard renders theme cards without emoji, colour, or core stress quote. A banner prompts them to re-run Avatar Architect to get the full experience, but the tool remains functional — batch and chat generation still work using the theme name alone.

**Imported Titles section:** If the member has migrated SavedTitle records (theme = "Imported"), a separate "Imported Titles" card appears at the bottom of the grid, styled distinctly (grey, no emoji) with a note: "These titles were saved from the old Title Creator. You can keep them here or delete ones you no longer need."

### Batch Generation

1. Member clicks "Generate Ideas" on a theme card (or "Generate All")
2. **Single-theme:** one API call, generates ~5 ideas for that theme
3. **Generate All:** fires parallel API calls (one per theme) to stay within token limits — each call generates ~5 ideas for one theme
4. Results appear within the expanded theme card(s)
5. Each idea displayed as a structured card (see Idea Card below)
6. Member saves ideas they like → moves to Saved Ideas section
7. "Generate More" button for additional batches
8. AI avoids repeating already-saved ideas

**Token budget:** Each per-theme batch call uses `max_tokens: 4096` (sufficient for 5 ideas with talking points). "Generate All" parallelizes these calls rather than making a single large call, keeping each response well within limits.

### Chat Mode ("Go Deeper")

1. Member clicks "Go Deeper" on a theme card
2. The dashboard view is replaced by a chat interface scoped to that theme (same page, state-managed — not a separate route). This preserves conversation state without needing URL navigation.
3. Member can:
   - Ask for ideas about specific topics
   - Request variations on a title
   - Explore stress angles
   - Ask for more ideas within the theme
4. AI has full context: avatar, theme, keyword kit, city, saved ideas
5. Generated ideas are embedded in the AI response using `<IDEA_DATA>` tags (matching the Avatar Architect's `<AVATAR_DATA>` pattern). The frontend parses these tags to render structured idea cards within the chat flow.
6. Save button on each idea card
7. Back button returns to theme dashboard

**Conversation persistence:** Chat conversations are **ephemeral** — they exist in client-side state only and are lost on page refresh or navigation. This matches the current Avatar Architect behaviour. When the platform's planned `AIToolConversation` model with 30-day retention is built, Content Engine chat sessions can be persisted using that shared model.

### Idea Card (Output Format)

Each generated idea displays:

| Element | Display |
|---------|---------|
| **Title** | Prominent, large text — the keyword-stacked video title |
| **Talking Points** | Numbered list of 3-5 points in the avatar's language |
| **Framework Badge** | Small label (e.g., "99% Regret", "Do NOT", "REALITY") |
| **Why This Works** | Subtle note underneath connecting the idea to the avatar's emotional landscape |
| **Save Button** | Star or bookmark icon — saves to the theme's library |

---

## Data Model

### User Table — New Fields

```
niche: String?          // "real_estate", "financial_planning", "other"
city: String?           // Free text, e.g., "Calgary" — used in keyword stacking
```

### Content Themes — Enhanced Structure

The existing `contentThemes` JSON array on User is enhanced. Each theme becomes an object:

```json
[
  {
    "name": "Loss of Control",
    "coreStress": "Life is already full, and this process threatens to take over.",
    "emoji": "🌊",
    "colour": "#3B82F6"
  },
  {
    "name": "Hidden Costs",
    "coreStress": "What will this actually cost us — money, time, energy, sanity?",
    "emoji": "💰",
    "colour": "#F59E0B"
  }
]
```

This is generated by the Avatar Architect during theme selection and saved to the user profile. The emoji and colour are AI-assigned from a predefined palette to avoid clashing.

**Avatar Architect `<AVATAR_DATA>` format change:** The `content_themes` field in the Avatar Architect's `<AVATAR_DATA>` JSON output must change from `string[]` to `object[]` with `name`, `coreStress`, `emoji`, and `colour` fields. This is a breaking change to the avatar save flow — the avatar save API must be updated to accept both formats during the transition period.

### New Model: SavedIdea (Replaces SavedTitle)

```prisma
model SavedIdea {
  id            String   @id @default(uuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  theme         String                    // Which content theme this belongs to
  title         String                    // The video title
  talkingPoints Json                      // Array of 3-5 strings
  framework     String?                   // Framework pattern used (e.g., "99% Regret")
  whyItWorks    String?                   // Connection to avatar
  source        String   @default("batch") // "batch", "chat", or "legacy"
  createdAt     DateTime @default(now())

  @@index([userId])
  @@index([userId, theme])
  @@map("saved_ideas")
}
```

### Migration: SavedTitle → SavedIdea

- Existing SavedTitle records migrated to SavedIdea
- `title` → `title`
- `framework` → `framework`
- `topic` → `theme`: set to `"Imported"` for all records (the old `topic` field is free-text user input that will almost never match a theme name exactly)
- `talkingPoints` → `[]` (empty, since old titles didn't have them)
- `whyItWorks` → `null`
- `source` → `"legacy"`
- Imported titles appear in the "Imported Titles" section on the dashboard (see Theme Dashboard above)

---

## AI System Prompts

### Batch Prompt (Single-Turn)

**Context injected:**
- Full avatar profile (JSON)
- Member's content themes with core stresses
- Keyword starter kit for their niche
- Member's city (for title localization)
- List of already-saved idea titles (to avoid repeats)

**Instructions (summary):**
- Generate 5 video ideas for the specified theme
- Each idea must use a proven high-hook-score framework (99%, Do NOT, REALITY, Signs, What Nobody Tells You, STOP, etc.) — pick the best framework for each stress angle, don't force-fit
- Keyword stacking: aim for 2-4 high-performing keywords per title, include city naturally
- Broad appeal: multiple viewer types should want to click
- Talking points: 3-5 short bullet points the creator would actually say on camera. Format each as a 2-3 word label followed by a dash and one sentence explaining the point. Example: "Capacity panic — life is already full, adding a major transaction feels impossible without everything else falling apart." These are NOT sub-headlines or additional titles. They are the actual content of the video — what you'd say to the viewer.
- "Why this works": one line connecting the idea to the avatar's emotional landscape
- Do not repeat any title from the saved ideas list
- Output: strict JSON, no markdown wrapping

**Output format:**
```json
{
  "theme": "Loss of Control",
  "ideas": [
    {
      "title": "Do NOT Buy a Home in Calgary Until You Watch This",
      "talkingPoints": [
        "Capacity panic — life is already full, adding a major transaction feels impossible without everything else falling apart",
        "Disruption fear — life is good right now, what if chasing better actually breaks something that's working",
        "Timing doubt — is this the right time or are you forcing something that should wait another year",
        "Permission guilt — you already have a nice home, do you actually need this or are you just being greedy",
        "Partner misalignment — you think you're on the same page but you haven't actually had the real conversation yet"
      ],
      "framework": "Do NOT [Activity] Until You Watch This",
      "whyItWorks": "Speaks directly to the fear that this process will take over a life they've carefully built — the title creates urgency while the content validates their hesitation."
    }
  ],
  "followUp": "Want me to go deeper on any of these?"
}
```

### Chat Prompt (Multi-Turn)

Same context injection as batch, plus:
- The specific theme the conversation is scoped to
- Full conversation history
- More flexible instructions — can generate ideas, refine titles, explore angles
- When generating ideas, embed them in `<IDEA_DATA>` tags containing the same JSON structure as batch (so the frontend can parse and render idea cards within the chat)
- Conversational text outside of `<IDEA_DATA>` tags renders as normal chat messages

**Example chat response:**
```
Here are 3 ideas focused on the timing anxiety your avatar feels:

<IDEA_DATA>
{"title": "...", "talkingPoints": [...], "framework": "...", "whyItWorks": "..."}
</IDEA_DATA>

<IDEA_DATA>
{"title": "...", "talkingPoints": [...], "framework": "...", "whyItWorks": "..."}
</IDEA_DATA>

<IDEA_DATA>
{"title": "...", "talkingPoints": [...], "framework": "...", "whyItWorks": "..."}
</IDEA_DATA>

The timing angle is powerful because your avatar is already overwhelmed — want me to explore more angles within this theme?
```

### Keyword Starter Kits

**Real Estate:**
| Keyword | Priority |
|---------|----------|
| "do not" | Critical |
| "not buy" | Critical |
| "home in [CITY]" | Critical |
| "should you" | High |
| "can you" | High |
| "in [CITY]" | High |
| "[CITY] real" | High |
| "best neighbourhoods" | High |
| "a home" | Good |
| "buy a" | Good |
| "buying a" | Good |
| "market update" | Good |

**Financial Planning:**
| Keyword | Priority |
|---------|----------|
| "to get" | Critical |
| "than you" | Critical |
| "net worth" | Critical |
| "the best" | Critical |
| "should you" | High |
| "how much" | High |
| "by age" | High |
| "in [YEAR]" | High |
| "how to" | High |
| "you must" | High |

**Other:** Prompt asks the AI to identify 10-12 high-performing keywords for the member's niche based on YouTube search patterns.

### Framework Library (Injected Into All Prompts)

The proven patterns with hook scores, embedded in the system prompt:

- "Do NOT [Activity] Until You Watch This"
- "99% of [Audience] Regret Doing This"
- "The REALITY of [Activity] in [Current Year]"
- "[Number] Signs [Situation]"
- "What Nobody Tells You About [Activity]"
- "STOP [Activity] Before You Make This Mistake"
- "[Entity] Just Shifted — Here's What It Means"
- "If You [Situation], Watch This"
- "The Biggest Mistake [Audience] Make Right Now"
- "99% of [Audience] Don't Know This"
- "Is It Still Worth [Activity] in [Current Year]?"

---

## Frontend Components

### AI Tools Hub Change

Replace Title Creator card (both member and admin views):

| Field | Old (Title Creator) | New (Content Engine) |
|-------|--------------------|--------------------|
| **Name** | Title Creator | Content Engine |
| **Icon** | ✏️ pen | New icon (TBD — rocket, lightbulb, or brain) |
| **Description** | Generate proven, high-converting title options for your next video | Generate video ideas with titles, talking points, and strategy — organized by your content themes |
| **Status line** | Using avatar: [name] | Using avatar: [name] · [X] saved ideas |

### New Page: `/member/ai-tools/content-engine/page.tsx`

**State 1 — Gated (no avatar):**
- Clean message: "Your Content Engine needs an avatar to work. Build yours now."
- Button linking to Avatar Architect

**State 2 — Niche Setup (no niche saved):**
- Form: niche dropdown + conditional city field
- Save button
- Brief explanation copy

**State 3 — Theme Dashboard:**
- Settings icon (top right) — opens niche/city editor as modal
- Theme cards in responsive grid
- "Generate All" button
- Each card expandable (accordion) to show generated + saved ideas
- Each card has emoji, colour accent, theme name, stress quote, saved count badge

**State 4 — Chat Mode (replaces dashboard in-page):**
- Chat interface scoped to selected theme
- Theme name + emoji displayed in header
- Back button returns to State 3 (dashboard)
- Message history + input field
- Idea cards rendered inline from `<IDEA_DATA>` tags

### New Components

- `ThemeDashboard.tsx` — the main dashboard grid
- `ThemeCard.tsx` — individual theme card with accordion expand/collapse
- `IdeaCard.tsx` — single idea display (title, points, framework, why, save)
- `ContentEngineChat.tsx` — chat interface for "Go Deeper" mode
- `NicheSetup.tsx` — one-time setup form (reusable as settings modal)

### Retire

- `/member/ai-tools/title-creator/page.tsx` — remove page
- `/admin/ai-tools/title-creator/page.tsx` — remove admin page (if exists)
- `/api/ai-tools/title-creator/route.ts` — remove API route (after migration)
- `/api/ai-tools/save-title/route.ts` — remove API route (after migration)
- `/api/ai-tools/saved-titles/route.ts` — remove GET route (after migration)

---

## API Routes

### New Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/ai-tools/content-engine/batch` | POST | Generate batch of ideas for one theme (called in parallel for "Generate All") |
| `/api/ai-tools/content-engine/chat` | POST | Multi-turn chat within a theme |
| `/api/ai-tools/content-engine/save-idea` | POST | Save an idea to the member's library |
| `/api/ai-tools/content-engine/saved-ideas` | GET | Fetch saved ideas, filtered by theme. Supports `?theme=X&page=1&limit=20` |
| `/api/ai-tools/content-engine/delete-idea` | DELETE | Remove a saved idea |
| `/api/member/niche` | PUT | Save/update niche and city |

### Updated Routes

| Route | Change |
|-------|--------|
| `/api/member/avatar` (GET) | Extend response to include `niche` and `city` fields |

### Retired Routes

| Route | Action |
|-------|--------|
| `/api/ai-tools/title-creator` | Remove after migration |
| `/api/ai-tools/save-title` | Remove after migration |
| `/api/ai-tools/saved-titles` | Remove after migration |

---

## Avatar Architect Update

The Avatar Architect's theme output needs to be enhanced to include emoji, colour, and core stress per theme. This means:

1. Update the Avatar Architect system prompt to instruct the AI to assign an emoji and colour (from the predefined palette) to each theme, and include the core stress quote
2. Update the `<AVATAR_DATA>` JSON format: change `content_themes` from `string[]` to `object[]` with `{ name, coreStress, emoji, colour }` per theme
3. Update the avatar save API (`PUT /api/member/avatar`) to accept both old (`string[]`) and new (`object[]`) theme formats during transition
4. Content Engine gracefully degrades for old-format themes: renders without emoji/colour/stress quote, shows a banner suggesting re-running Avatar Architect

**Predefined colour palette** (to avoid clashing):
```
["#3B82F6", "#F59E0B", "#EF4444", "#10B981", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"]
```
Blue, Amber, Red, Green, Purple, Pink, Cyan, Orange — up to 8 themes supported. If themes exceed 8, colours cycle from the beginning of the palette.

---

## Migration Plan

1. Add `niche` and `city` fields to User table
2. Create SavedIdea model with proper indexes and cascade delete
3. Migrate existing SavedTitle records → SavedIdea (all as theme: "Imported", source: "legacy")
4. Update contentThemes handling to support both `string[]` and `object[]` formats
5. Update Avatar Architect prompt and `<AVATAR_DATA>` format for enhanced themes
6. Update avatar save API to accept both theme formats
7. Extend `/api/member/avatar` GET to return `niche` and `city`
8. Build Content Engine pages, components, and API routes
9. Update AI Tools Hub (member + admin) to show Content Engine instead of Title Creator
10. Remove Title Creator pages, routes, and related endpoints
11. Drop SavedTitle model (after confirming migration is complete)

---

## Future Considerations

- **Content Planner integration:** SavedIdea model is portable. A future Content Planner tool could pull from saved ideas and let members schedule/plan their content calendar.
- **Keyword kit evolution:** If baseline audit data becomes richer, keyword kits could be supplemented with channel-specific performance data.
- **Usage tracking:** When the `AIToolUsage` cost-tracking model is built, Content Engine calls should be tracked for the per-member monthly cap.
- **Source enum:** Consider migrating the `source` field from free-text String to a Prisma enum (`BATCH`, `CHAT`, `LEGACY`) in a future schema cleanup pass.
