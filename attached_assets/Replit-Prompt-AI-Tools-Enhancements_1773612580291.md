# AI Tools Enhancements — Replit Build Prompt

> **Date:** 2026-03-15
> **What this covers:** Admin-editable prompts, Script Review redesign, conversation saving, downloads, usage tracking
> **Companion spec:** `docs/superpowers/specs/2026-03-15-ai-tools-enhancements-design.md`

---

## Prompt 1 of 2: Foundation — Editable Prompts, Script Review Move, Conversation Saving

### Paste this into Replit Agent:

```
We need to make several changes to the AI Tools system. This is Part 1 of 2.

=== CHANGE 1: ADMIN-EDITABLE PROMPTS ON EACH TOOL PAGE ===

Each AI tool page needs a collapsible "Edit System Prompt" section that is ONLY visible to admin users. Members must never see this.

HOW IT WORKS:

1. Refactor /api/settings/route.ts to be generic key-based instead of hardcoded to "audit_prompt":
   - GET /api/settings?key=prompt_avatar_architect → returns { value: "..." } from AppSetting table, or the hardcoded default if no row exists
   - PATCH /api/settings → accepts { key: "prompt_avatar_architect", value: "..." } and upserts to AppSetting
   - DELETE /api/settings?key=prompt_avatar_architect → deletes the row (resets to default)
   - All endpoints remain admin-only
   - Keep backward compatibility: the existing audit_prompt key must still work

2. Store each tool's prompt in AppSetting with these keys:
   - prompt_avatar_architect
   - prompt_title_creator
   - prompt_title_thumbnail_analyzer
   - prompt_arc_script_builder
   - prompt_script_review

3. Add a collapsible prompt editor component (reusable across all tool pages):
   - A toggle button/chevron labelled "Edit System Prompt" at the top of each tool page
   - Collapsed by default
   - When expanded: large text area (at least 20 rows) showing the current prompt, a "Save" button, and a "Reset to Default" button
   - Below the text area: a legend explaining the available dynamic placeholders for that specific tool
   - On save: PATCH to /api/settings with the tool's key
   - On reset: DELETE to /api/settings for that key, then reload the default
   - Show a success toast on save/reset
   - ADMIN ONLY — check the user's role before rendering. Members must never see this panel.

4. Each tool's API route must check AppSetting first, fall back to the hardcoded default:
   - On each API call, query: SELECT value FROM AppSetting WHERE key = 'prompt_[tool_name]'
   - If found, use that value as the system prompt template
   - If not found, use the existing hardcoded constant
   - Dynamic context (avatar, themes, etc.) is still injected at runtime — the admin edits the template, not the final prompt

5. Dynamic placeholder legend per tool (show only the relevant ones):

   Avatar Architect: No placeholders (the conversation IS the context)

   Title Creator:
   - {{MEMBER_AVATAR}} — The member's saved avatar profile (JSON)
   - {{CONTENT_THEMES}} — The member's content themes (JSON array)
   - {{PAST_TITLES}} — Up to 10 titles from the member's most recent baseline audit

   Title & Thumbnail Analyser:
   - {{MEMBER_AVATAR}} — The member's saved avatar profile (JSON)
   - {{BASELINE_SCORES}} — The member's baseline audit scores (JSON)

   ARC Script Builder:
   - {{MEMBER_AVATAR}} — The member's saved avatar profile (JSON)
   - {{CONTENT_THEMES}} — The member's content themes (JSON array)
   - {{BASELINE_SCORES}} — The member's baseline audit scores (JSON)

   Script Review:
   - {{MEMBER_AVATAR}} — The member's saved avatar profile (JSON)
   - {{BASELINE_SCORES}} — The member's baseline audit scores (JSON)

   In each tool's API route, replace these placeholder strings in the prompt template with the actual data before sending to Claude.


=== CHANGE 2: MOVE SCRIPT REVIEW INTO AI TOOLS HUB ===

1. Remove Script Review from the sidebar navigation on BOTH admin and member sides:
   - In src/components/Sidebar.tsx, remove the Script Review entry from adminLinks array (line 40: { href: "/admin/script-review", label: "Script Review", icon: PencilSquareIcon })
   - Script Review does NOT appear in memberLinks (it's already absent there), but double-check

2. Move the Script Review pages to new routes under ai-tools:
   - /admin/script-review → /admin/ai-tools/script-review
   - /member/script-review → /member/ai-tools/script-review
   - Create redirect pages at the old routes that redirect to the new ones (Next.js redirect)

3. Update the AI Tools Hub (src/components/ai-tools/AIToolsHub.tsx):
   - The Script Review card already exists (line 86-94), but its href currently points to the old route via: basePath.replace("/ai-tools", "") + "/script-review"
   - Change this to point to: basePath + "/script-review" (so it stays under /admin/ai-tools/script-review or /member/ai-tools/script-review)
   - Update the description from "scored on all 16 Attraction principles" to "scored on 15 Attraction principles with visual suggestions"


=== CHANGE 3: CONVERSATION SAVING (30-DAY RETENTION) ===

1. Add a new Prisma enum and model:

   enum AIToolType {
     avatar_architect
     title_creator
     title_thumbnail_analyzer
     arc_script_builder
     script_review
   }

   model AIToolConversation {
     id            String     @id @default(uuid())
     userId        String
     user          User       @relation(fields: [userId], references: [id])
     toolType      AIToolType
     title         String
     messages      Json       // Array of { role: "user"|"assistant", content: string, timestamp: string }
     metadata      Json?      // Optional: scores, saved outputs, etc.
     downloadCount Int        @default(0)
     createdAt     DateTime   @default(now())
     updatedAt     DateTime   @updatedAt
   }

   Add the relation to the User model: aiToolConversations AIToolConversation[]

   Run prisma migrate after adding this.

2. Create CRUD API routes:

   POST /api/ai-tools/conversations
   - Creates a new conversation record
   - Body: { toolType, title, messages, metadata? }
   - Returns: { id, ...conversation }

   GET /api/ai-tools/conversations?toolType=script_review
   - Lists conversations for the current user, filtered by toolType
   - Ordered by updatedAt desc
   - Returns: { conversations: [...] }

   PATCH /api/ai-tools/conversations/[id]
   - Updates messages array (appends new messages) and metadata
   - Body: { messages, metadata? }
   - Only the conversation owner (or admin) can update

   GET /api/ai-tools/conversations/[id]
   - Returns full conversation
   - Only the conversation owner (or admin) can view

   DELETE /api/ai-tools/conversations/[id]
   - Deletes a conversation
   - Only the conversation owner (or admin) can delete

3. Auto-purge on every conversation creation:
   - In the POST handler, after creating the conversation, run:
     DELETE FROM AIToolConversation WHERE createdAt < NOW() - INTERVAL '30 days'
   - This keeps the table clean without needing a cron scheduler
   - Index the createdAt column for fast deletes

4. Each tool's API route should save to AIToolConversation:
   - After getting a response from Claude, save/update the conversation record
   - Single-turn tools (Title Creator, Title & Thumbnail Analyser) create one record per use
   - Multi-turn tools (Avatar Architect, ARC Script Builder, Script Review) create on first message, update on subsequent messages
   - The frontend passes a conversationId with each request (null on first message = create new, non-null = update existing)

5. Add a "Recent Conversations" panel to each tool page:
   - Below the prompt editor (admin) or at the top (member), show a collapsible list of recent conversations for that tool
   - Show: title, date, message count
   - Click to load/view the full conversation
   - Maximum 20 shown (the rest are accessible but not listed)

6. Auto-generate conversation titles from first input:
   - Avatar Architect: "Avatar Session — " + first 50 chars of member's first message
   - Title Creator: The topic/keyword entered
   - Title & Thumbnail Analyser: The video title being analysed
   - ARC Script Builder: The video title/topic from step 1
   - Script Review: The video title submitted with the script

IMPORTANT: The AIToolConversation table is a SESSION LOG with 30-day retention. It is SEPARATE from the existing "Save to Profile" functionality (SavedScript, SavedTitle, ScriptReview models). Those permanent saves still work as before — they are user-initiated and have no expiry. The conversation log is automatic.


=== HOW TO TEST PART 1 ===

- [ ] Admin can expand/collapse prompt editor on each tool page
- [ ] Members cannot see the prompt editor
- [ ] Editing and saving a prompt works (check AppSetting table)
- [ ] Resetting to default works (deletes the AppSetting row)
- [ ] Each tool uses the saved prompt when one exists, falls back to default
- [ ] Placeholder legend shows the correct placeholders per tool
- [ ] Script Review is gone from the sidebar (both admin and member)
- [ ] Script Review card in AI Tools hub links to /admin/ai-tools/script-review (or /member/...)
- [ ] Old /admin/script-review URL redirects to new location
- [ ] AIToolConversation table exists after migration
- [ ] Conversations are created when using any tool
- [ ] Recent Conversations panel shows on each tool page
- [ ] Conversations older than 30 days are cleaned up on new conversation creation
```

---

## Prompt 2 of 2: Script Review Redesign, Downloads, Usage Tracking

### Paste this into Replit Agent AFTER Prompt 1 is tested and working:

```
This is Part 2 of the AI Tools enhancements. Part 1 (editable prompts, Script Review move, conversation saving) should already be working.

=== CHANGE 4: SCRIPT REVIEW REDESIGN ===

Three major changes to how Script Review works:

A) SHOW DON'T TELL → VISUAL SUGGESTIONS (NOT SCORED)

Remove "show_dont_tell" from the scored principles in the Script Review prompt. Currently it scores 0-10 based on verbal cues. Instead, add a "Visual Suggestions" section to the output.

In the Script Review system prompt, replace the show_dont_tell scoring section with:

After scoring the 15 principles above, add a "visual_suggestions" section. Read through the script and suggest 3-5 specific moments where visual elements would enhance the content. For each suggestion, describe what to show and why it helps the viewer.

The JSON output should include:
"visual_suggestions": [
  {
    "moment": "When discussing [specific part of script]",
    "suggestion": "What to show on screen",
    "why": "Why this visual helps the viewer"
  }
]

In the Script Review UI:
- Remove Show Don't Tell from the scorecard table
- Add a "Visual Suggestions" section after the scorecard — styled as a blue-bordered card with a camera/film icon
- Each suggestion shown as a row with the moment, what to show, and why
- The weighted score calculation should use the same formula as audits (calculateWeightedScores from audit-engine.ts) — divisor stays at 27, show_dont_tell is excluded (it was already 0x weight)
- Consistency defaults to 5 (same as now)

B) MULTI-TURN CONVERSATION FLOW

Convert Script Review from a single request/response into a multi-turn coaching conversation (similar to how Avatar Architect already works).

The flow:
1. Member pastes their title + script text (same form as now)
2. AI responds with the full score analysis (scorecard, what's working, diagnosis, visual suggestions)
3. AI then asks: "Would you like me to rewrite the sections that need work? I can either rework your exact lines in your voice, or write fresh alternatives you can adapt. Which would you prefer?"
4. Member picks their preference
5. AI delivers rewrites for the weakest 3 sections using ARC Method principles:
   - Hooks and value loops (same approach as the ARC Script Builder)
   - Curiosity bridges
   - Connection phrases tailored to the member's avatar
   - Lead magnet mentions woven naturally
6. Member can continue the conversation — ask follow-ups, request more rewrites, refine specific sections

IMPLEMENTATION:
- Rebuild the Script Review UI as a chat interface (like Avatar Architect's chat UI)
- The first "message" is the script submission (show the title + a truncated preview of the script in the chat)
- The first AI response is the full analysis (render the scorecard, visual suggestions, etc. inline in the chat — same rich formatting as now, just inside a chat bubble)
- After the analysis, show the rewrite preference question as part of the AI's message
- Subsequent messages are plain chat (user types, AI responds with rewrites)
- Maximum 15 turns per conversation (user + assistant combined). After 15, show: "This conversation has reached its limit. Start a new Script Review to continue working on this script."

API CHANGES:
- The /api/script-review route should accept a messages array (conversation history) instead of just scriptText + title
- On the first call (no messages history), run the scoring analysis
- On subsequent calls, continue the conversation with the full history
- Pass the conversationId so messages are saved to AIToolConversation
- Use claude-sonnet-4-20250514, max_tokens: 8000

The system prompt should include BOTH:
1. The scoring rubric (15 principles, visual suggestions)
2. ARC Method rewriting instructions — when the member asks for rewrites, use the same writing philosophy as the ARC Script Builder:
   - 4 intro patterns (Contradiction, Confirmation, Empathy, Stakes)
   - Value Loop format (What → Why → When → Story Proof → What This Means)
   - Curiosity bridge techniques (And → But → Therefore, plus broader forward-pulling sentences)
   - Connection phrase distribution
   - Natural lead magnet placement

C) AVATAR INTEGRATION

- Script Review now pulls the member's saved avatar profile from the database (same pattern as Title Creator and ARC Script Builder already do)
- Inject the avatar into the system prompt so both the scoring AND the rewrites are personalised to the member's specific avatar
- If no avatar is saved, the tool still works but adds a note in the first response: "I notice you haven't built your avatar yet. Your rewrites will be more targeted if you run through the Avatar Architect first."
- When rewriting, use the avatar's language, concerns, and emotional triggers to make the script speak directly to that person


=== CHANGE 5: MEMBER DOWNLOADS ===

Members (and admins) can download any saved conversation from the AIToolConversation table as a formatted markdown file.

1. Create API route: GET /api/ai-tools/conversations/[id]/download
   - Check that the requesting user owns the conversation (or is admin)
   - Increment the downloadCount field on the conversation
   - Generate a formatted markdown file with:
     - Header: tool name, date, member name
     - Full conversation (all messages, formatted with role labels)
     - Any scores formatted as markdown tables
     - Visual suggestions (for Script Review) as a bulleted list
   - Return as a file download with Content-Disposition header
   - Filename format: {tool-name}_{title-slug}_{date}.md
     Example: script-review_how-to-buy-your-first-home_2026-03-15.md

2. Add a download button (⬇ icon) on:
   - Each conversation in the "Recent Conversations" panel
   - The conversation view when viewing a full conversation
   - Style: small icon button, tooltip "Download conversation"


=== CHANGE 6: ADMIN USAGE TRACKING ===

Add an "AI Tools Usage" section. This can be either:
- A new section on the admin dashboard (/admin), OR
- A sub-page at /admin/ai-tools/usage accessible from the AI Tools hub

All data comes from querying AIToolConversation. No separate tracking table needed.

SUMMARY CARDS (top row):
- Total Conversations (last 30 days) — count of all AIToolConversation records
- Most Popular Tool — tool with the highest conversation count
- Most Active Member — member with the most conversations (exclude admin)
- Downloads This Month — sum of downloadCount across all conversations

TOOL BREAKDOWN TABLE:
| Tool | Uses (30d) | Unique Members | Last Used |
Show all 5 tools. "Uses" = conversation count. "Unique Members" = distinct userId count. "Last Used" = most recent createdAt.

MEMBER ACTIVITY TABLE:
| Member | Avatar Architect | Title Creator | Analyser | Script Builder | Script Review | Downloads |
One row per member. Each cell = conversation count for that tool. Downloads = sum of downloadCount.
Admin conversations should be included but labelled with an "Admin" badge and excluded from the member activity counts.

RECENT ACTIVITY FEED:
- Last 20 conversations across all tools
- Show: member name, tool name, conversation title, timestamp
- Admin can click to view the conversation (read-only)


=== HOW TO TEST PART 2 ===

- [ ] Script Review no longer shows Show Don't Tell in the scorecard
- [ ] Visual Suggestions section appears with 3-5 specific suggestions
- [ ] Script Review is now a chat interface (not a form + results page)
- [ ] After scoring, AI asks about rewrite preference
- [ ] Picking "in my voice" or "fresh alternatives" triggers personalised rewrites
- [ ] Rewrites reference the member's avatar (if one exists)
- [ ] No avatar → shows the "build your avatar first" note
- [ ] Conversation limit of 15 turns works
- [ ] Download button appears on conversations
- [ ] Downloaded .md file is well-formatted with scores, messages, and suggestions
- [ ] Admin usage page shows summary cards, tool breakdown, member activity
- [ ] Recent activity feed shows last 20 conversations
- [ ] Admin can click to view any member's conversation (read-only)
```
