# Resources & Knowledge Base — Replit Build Prompts

Send these 3 prompts to Replit Agent in order. Each one builds on the previous.

---

## Prompt 1: Database + Admin — Course Lessons + Fathom Ingestion

Build the Resources & Knowledge Base foundation: database models, admin interface for course lessons, and Fathom API integration for Q&A call ingestion.

### Database Models (Prisma)

Add these 4 new models:

**CourseLesson**
```
id            String   @id @default(uuid())
title         String                          // e.g., "Connection Language"
lessonNumber  String                          // e.g., "2.2"
sessionNumber Int                             // 1-4
skoolUrl      String   @default("")           // Direct URL to lesson on Skool
fullTranscript Text                           // Complete lesson transcript
principles    String[]                        // e.g., ["Connection Language", "Grade 5 Language"]
createdAt     DateTime @default(now())
```

**QACall**
```
id              String   @id @default(uuid())
fathomId        String   @unique              // Fathom's call ID (deduplication)
title           String                        // Call title from Fathom
callDate        DateTime                      // When the call occurred
fathomShareUrl  String                        // Base share URL for embedding
fullTranscript  Text                          // Complete call transcript
status          String   @default("pending_review")  // pending_review / processed / failed
errorMessage    String?                       // Error details if processing failed
createdAt       DateTime @default(now())
```

**KnowledgeBaseEntry**
```
id                String   @id @default(uuid())
sourceType        String                      // "course_lesson" or "qa_call"
sourceId          String                      // FK to CourseLesson or QACall
principles        String[]                    // Attraction principle names (must match the keys used in audit scores JSON)
subTopic          String   @default("")       // e.g., "Lead Magnets > Discovery calls aren't lead magnets"
summary           String                      // 1-2 sentence description
searchableText    String                      // Full transcript chunk for search
timestampStart    Int?                        // Start time in seconds
timestampEnd      Int?                        // End time in seconds
memberId          String?                     // FK to User — only for Q&A moments where a specific member was coached
isGeneralTeaching Boolean  @default(true)     // true if general teaching, not member-specific
status            String   @default("pending") // pending / approved / rejected
createdAt         DateTime @default(now())
updatedAt         DateTime @updatedAt
```

Add relation: `member User? @relation(fields: [memberId], references: [id], onDelete: SetNull)`

**SavedItem**
```
id                    String   @id @default(uuid())
userId                String                  // FK to User
knowledgeBaseEntryId  String                  // FK to KnowledgeBaseEntry
savedAt               DateTime @default(now())

@@unique([userId, knowledgeBaseEntryId])
```

Add relations to User model:
- `savedItems SavedItem[]`
- When a User is deleted, cascade delete their SavedItems

Add full-text search index on KnowledgeBaseEntry for fields: `searchableText`, `summary`, `subTopic`. Do NOT index the `fullTranscript` fields on QACall or CourseLesson.

### AppSetting Entries

Store these in the existing AppSetting table:
- `fathom_api_key` — Fathom API key (admin enters this)
- `fathom_recording_email` — email to filter recordings by
- `fathom_last_pull_date` — timestamp of last successful auto-pull
- `fathom_last_pull_status` — "success" or "failed"
- `fathom_title_filter` — string to match in call titles, default "Q&A"

### Admin: Course Lessons Page

New admin page at `/admin/resources/lessons`:

- List all course lessons in a table: lesson number, title, Skool URL (truncated), principle tags (badges), segment count
- **Add Lesson** button → modal with fields: title, lesson number (string), session number (1-4), Skool URL, principles (multi-select from the 16 Attraction principles), transcript (large textarea)
- On save: store the CourseLesson, then send the transcript to Claude API to process into segments
- Claude prompt for segmentation: "You are processing a teaching transcript for the Attraction by Video course. Break this transcript into meaningful teaching segments (3-10 segments per lesson). For each segment return JSON: `{ subTopic: string, principles: string[], summary: string (1-2 sentences), timestampStart: number (approximate seconds), timestampEnd: number (approximate seconds), searchableText: string (the transcript chunk) }`. The 16 Attraction principles are: Avatar Clarity, Themes Over Topics, Lead Magnet System, ARC Attention, ARC Revelation, ARC Connection, Approve the Click, Connection Language, Curiosity Bridges, Story Proof, Show Don't Tell, Values Peppering, Title Frameworks, Grade 5 Language, Consistency, Binge Architecture."
- Create KnowledgeBaseEntry records from Claude's response with `status: "approved"` (course content auto-approved), `sourceType: "course_lesson"`, `sourceId` pointing to the CourseLesson
- **Edit** button on each lesson row → same modal, pre-filled. "Re-process Transcript" button re-runs Claude segmentation (deletes old segments, creates new ones)
- **Pre-populate** the lessons list on first load with this seed data (no Skool URLs yet — admin adds those later):

| Lesson # | Title | Session | Principles |
|----------|-------|---------|------------|
| 1.1 | What Do You Want? | 1 | Avatar Clarity |
| 1.2 | Who Do You Want | 1 | Avatar Clarity |
| 1.3 | Finding Your Themes | 1 | Themes Over Topics, Binge Architecture |
| 1.4 | The Client Journey & Building Trust | 1 | Lead Magnet System |
| 2.1 | Finding Your Authentic Self on Camera | 2 | Values Peppering |
| 2.2 | Connection Language | 2 | Connection Language, Grade 5 Language |
| 2.3 | 80% Rule Just Publish It | 2 | Consistency |
| 2.4 | Content Prep & Batch Shooting | 2 | Consistency |
| 2.5 | Content Frameworks PSL & ARC | 2 | ARC Attention, ARC Revelation, ARC Connection, Curiosity Bridges, Story Proof |
| 2.6 | How to Present on Camera | 2 | Connection Language |
| 2.7 | Practical Tips for Shooting | 2 | Show Don't Tell |
| 2.8 | Get in Your Reps - Homework | 2 | Consistency |
| 3.1 | How to do YouTube Research | 3 | Themes Over Topics |
| 3.2 | Using the Scripting ARC Method Custom GPT | 3 | ARC Attention, ARC Revelation, ARC Connection |
| 3.3 | Studio Setup | 3 | Show Don't Tell |
| 3.4 | Your First Two Videos | 3 | Consistency |
| 4.1 | Packaging Principle & Building Tension | 4 | Title Frameworks, Approve the Click |
| 4.2 | Creating Titles | 4 | Title Frameworks |
| 4.3 | Building a Thumbnail | 4 | Approve the Click |
| 4.4 | Special Invitation | 4 | Lead Magnet System |

### Admin: Fathom Ingestion Page

New admin page at `/admin/resources/qa-calls`:

**Settings section (collapsible):**
- Fathom API Key input (password field, saved to AppSetting)
- Recording email input (saved to AppSetting)
- Title filter input (default "Q&A", saved to AppSetting)

**Pull from Fathom button:**
- Calls `GET https://api.fathom.ai/external/v1/meetings` with query params:
  - `include_transcript=true`
  - Filter by title containing the `fathom_title_filter` value
  - Filter by `recorded_by` matching the `fathom_recording_email` value
- Shows results in a modal/drawer: list of calls with title, date, duration
- Already-imported calls (matched by fathomId) are greyed out with "Already imported" label
- Checkboxes on non-imported calls, "Import Selected" button
- On import: for each selected call, create QACall record, then send transcript to Claude for moment extraction

**Claude prompt for Q&A moment extraction:**
"You are processing a Q&A coaching call transcript from Attraction by Video. Extract distinct coaching moments and general teaching segments. For each moment return JSON: `{ subTopic: string, principles: string[], summary: string (1-2 sentences), timestampStart: number (seconds), timestampEnd: number (seconds), searchableText: string (transcript chunk), memberName: string or null (the member being coached, null if general teaching), isGeneralTeaching: boolean }`. The 16 Attraction principles are: Avatar Clarity, Themes Over Topics, Lead Magnet System, ARC Attention, ARC Revelation, ARC Connection, Approve the Click, Connection Language, Curiosity Bridges, Story Proof, Show Don't Tell, Values Peppering, Title Frameworks, Grade 5 Language, Consistency, Binge Architecture. IMPORTANT: A moment may cover topics not directly mapped to these 16 principles (e.g., lead magnets implementation details, YouTube algorithm tips). Still extract these — tag with the closest principle(s) AND include a descriptive subTopic so they are searchable."

- After Claude responds, fuzzy-match `memberName` to existing Users (by first name, last name, or display name). If no confident match, set `memberId` to null and flag the moment in the review queue as "Unknown member: [name]"
- Create KnowledgeBaseEntry records with `status: "pending"`, `sourceType: "qa_call"`
- Update QACall status to "processed"
- On failure: set QACall status to "failed", store error in `errorMessage`

**Q&A Calls list:**
- Table: title, date, status badge (processed/pending_review/failed), moment count
- Failed calls show error message + "Retry" button
- Click a call to expand and see its extracted moments

**Review Queue section:**
- List of all KnowledgeBaseEntry records with `status: "pending"`
- Each shows: summary, principle tags (editable), sub-topic (editable), member assignment (dropdown of all members + "Unknown" + "General teaching"), timestamp
- Actions per entry: Approve / Reject / Edit
- "Approve All" bulk button for efficiency
- Approved entries become visible to members

**Auto-pull schedule:**
- Create a cron job or scheduled task: every Thursday at 8 PM (server timezone), run the same Fathom pull logic automatically
- Only pull calls with `created_after` = `fathom_last_pull_date` from AppSetting
- After successful pull, update `fathom_last_pull_date` and `fathom_last_pull_status` in AppSetting
- Extracted moments still go to the review queue (not auto-approved)

### Admin Sidebar

Add "Resources" section to admin sidebar with sub-items:
- Course Lessons
- Q&A Calls (show badge count for pending review items)

---

## Prompt 2: Member-Facing Resources Page + Bookmarking

Build the member-facing Resources library page with search, browse, and bookmarking.

### Resources Page

New page at `/resources` (accessible to both admin and foundations_member roles). Add "Resources" to the member sidebar navigation.

**Search bar at the top of the page:**
- Full-text search input
- Searches across KnowledgeBaseEntry fields: `searchableText`, `summary`, `subTopic`
- Only returns entries with `status: "approved"`
- Results displayed as cards (see card format below)
- Cursor-based pagination, 20 items per page, "Load more" button

**Filters (beside or below search bar):**
- Principle filter: multi-select dropdown with all 16 Attraction principles
- Source type: "All" / "Course Lessons" / "Q&A Calls" toggle or dropdown
- Date range: start/end date pickers (applies to Q&A calls only based on parent QACall.callDate)

**Three tabs below search/filters:**

**1. Browse (default tab)**
- Shows 16 principle cards in a grid
- Each card shows: principle name, the member's current score for that principle (pull from their latest audit's scores JSON — show "No score yet" if no audit exists)
- Colour the score: red (0-3), amber (4-6), green (7-10)
- Click a principle card → expands or navigates to show all resources for that principle
- Resources grouped: Course Lesson segments first (ordered by lesson number), then Q&A Moments (newest call date first)
- Each resource shown as a card (see card format below)

**2. My Coaching Moments tab**
- Query: all KnowledgeBaseEntry where `memberId` = current user AND `status` = "approved"
- Ordered by newest first (based on parent QACall.callDate)
- Show as cards
- If empty: "No coaching moments tagged to you yet. As you participate in Q&A calls, your personal coaching moments will appear here."

**3. My Saved tab**
- Query: all SavedItem for current user, joined with KnowledgeBaseEntry
- Ordered by `savedAt` descending
- Show as cards with unsave button
- If empty: "You haven't saved any resources yet. Use the bookmark icon on any resource to save it for later."

### Resource Card Format

Each resource card shows:
- **Source badge**: "Course Lesson" (blue) or "Q&A Call" (purple)
- **Summary** text (1-2 sentences)
- **Sub-topic** label (smaller, muted text)
- **Principle tags** as small badges
- **Date** (for Q&A calls: the call date; for lessons: omit)
- **Member reference** (Q&A moments only):
  - If `memberId` matches viewing user: "You were coached on this"
  - If `memberId` is set but not the viewing user: "A member was coached on this"
  - If `isGeneralTeaching`: no member reference shown
- **Action button**:
  - Q&A moments: "Play" button → opens Fathom embed inline (see Fathom embed below)
  - Course lesson segments: "Watch on Skool" link → opens parent CourseLesson.skoolUrl in new tab (`target="_blank"`)
- **Bookmark icon**: toggle save/unsave. Filled icon if already saved, outline if not. Calls POST/DELETE `/api/resources/saved-items`

### Fathom Embed (Q&A Moments)

When a member clicks "Play" on a Q&A moment:
- Expand the card (or open a modal) to show an iframe: `<iframe src="{QACall.fathomShareUrl}?t={KnowledgeBaseEntry.timestampStart}" width="100%" height="400" frameborder="0" allowfullscreen></iframe>`
- If iframe embedding doesn't work with Fathom's share URLs, fall back to opening `{QACall.fathomShareUrl}?t={timestampStart}` in a new tab
- Show the moment's full summary text alongside the player

### API Routes

**GET /api/resources/search**
- Query params: `q` (search text), `principles[]`, `sourceType`, `dateFrom`, `dateTo`, `cursor`, `limit` (default 20)
- Returns: KnowledgeBaseEntry records (approved only) with joined source data (CourseLesson or QACall), plus SavedItem status for the current user
- Privacy: replace `memberId` with anonymised flag unless it matches the requesting user

**GET /api/resources/browse/:principle**
- Returns all approved entries for a given principle, grouped by source type
- Includes member's score for that principle from latest audit

**GET /api/resources/my-coaching-moments**
- Returns entries where `memberId` = current user, ordered by call date desc
- Cursor-based pagination

**GET /api/resources/my-saved**
- Returns user's saved items with full entry data, ordered by savedAt desc

**POST /api/resources/saved-items**
- Body: `{ knowledgeBaseEntryId: string }`
- Creates SavedItem (unique constraint prevents duplicates)

**DELETE /api/resources/saved-items/:knowledgeBaseEntryId**
- Removes the SavedItem for current user + that entry

---

## Prompt 3: Audit Report & AI Tool Resource Recommendations

Integrate Knowledge Base recommendations into audit reports and AI tools (Title & Thumbnail Analyzer, Script Review).

### Audit Report Enhancement

**Modify the audit pipeline** to add a resource recommendation step after scoring:

After the audit scoring is complete and the report is generated, add a **second Claude API call** that generates resource recommendations for weak principles:

1. Query all approved KnowledgeBaseEntry records where any of the `principles` match the audit's weak principles (score < 7)
2. For each weak principle, collect matching entries and build a context block: `{ principle, memberScore, auditFinding (from the audit's gap description), matchingResources: [{ summary, subTopic, sourceType, timestampStart, sourceTitle }] }`
3. Also check if any matching entries have `memberId` = the audited member (personal coaching moments)
4. Send to Claude with this prompt:

"You are generating personalised resource recommendations for a member's audit report. For each weak principle below, write a tailored 1-2 sentence recommendation that connects their specific weakness (from the audit finding) to the most relevant resource. Reference specific sections or concepts from the resource, not just the title. Then select the top 2-3 most relevant resources to display.

For each principle, return JSON:
```json
{
  "principle": "string",
  "recommendation": "string (1-2 sentences, specific and actionable)",
  "resources": [
    {
      "entryId": "string (KnowledgeBaseEntry ID)",
      "displayText": "string (what to show the member, e.g., 'Jan 16 Q&A at 23:15 — a member was coached on replacing jargon in video openings')"
    }
  ]
}
```

Prioritise the member's own coaching moments first, then general teaching moments and course lesson segments. If no resources match a principle well, return an empty resources array for that principle."

5. Store the recommendations as JSON on the Audit record (new field `resourceRecommendations Json?`)

**Modify the audit report UI** (for all report types: baseline, monthly, single video):

**Learning Path section:**
- Each principle row that has resource recommendations gets an expandable "Resources" section
- Shows the tailored recommendation sentence
- Below it: resource cards (compact version — source badge, display text, play/link button, bookmark icon)
- Q&A moments: play button opens Fathom embed inline
- Course lessons: link opens Skool in new tab
- Privacy: if a resource's `memberId` matches the viewing member, show "You were coached on this" — otherwise show the anonymised `displayText` from Claude

**Three Biggest Gaps section:**
- Same treatment: expandable "Resources" under each gap
- Uses the same `resourceRecommendations` data, filtered to the 3 gap principles

### Title & Thumbnail Analyzer Enhancement

Modify the Title & Thumbnail Analyzer's Claude prompt to include resource recommendations:

After the existing analysis, add this instruction block to the system prompt:

"RESOURCE RECOMMENDATIONS: When you score a principle below 7, include a resource recommendation. You will be provided with a `<RESOURCES>` block containing relevant Knowledge Base entries for each principle. For principles scoring below 7, select the single most relevant resource and write a tailored recommendation sentence connecting the member's specific issue to that resource. Format as:

📚 **Learn more:** [your tailored recommendation sentence]
- [Source badge] [display text with timestamp] [Skool link or Fathom timestamp link]

Only include resources for principles below 7. Do not include resources for strengths."

Before calling the Claude API for analysis:
1. Query approved KnowledgeBaseEntry records for all 16 principles
2. Group by principle, include: summary, subTopic, sourceType, source title, timestampStart
3. Check for entries where `memberId` matches the member using the tool
4. Inject as a `<RESOURCES>` block in the prompt

The UI should render the resource links as clickable:
- Q&A moments: play button (Fathom embed) or link to `{fathomShareUrl}?t={timestampStart}`
- Course lessons: link to Skool URL (new tab)
- Bookmark icon on each

### Script Review Enhancement

Same approach as Title & Thumbnail Analyzer:

Add the resource recommendation instruction block to the Script Review's Claude prompt. Same `<RESOURCES>` block injection. Same rendering in the UI.

Key difference: resources appear **inline with each piece of feedback**, not in a separate section. When the AI critiques a specific aspect of the script, the resource recommendation follows immediately after that critique.

### API Changes

**POST /api/audits/run** (or wherever audits are triggered):
- After scoring, run the resource recommendation step
- Store results in `resourceRecommendations` field on Audit model

**GET /api/audits/:id** (audit report data):
- Include `resourceRecommendations` in response
- Apply privacy logic: check each resource's `memberId` against the requesting user

**Prisma schema change:**
- Add to Audit model: `resourceRecommendations Json?`

**AI tool API routes** (Title & Thumbnail Analyzer, Script Review):
- Before calling Claude, query KnowledgeBaseEntry for relevant resources
- Inject into prompt
- Parse resource references from Claude's response and render as interactive links in the UI
