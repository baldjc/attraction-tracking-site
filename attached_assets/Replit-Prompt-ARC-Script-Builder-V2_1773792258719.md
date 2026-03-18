# ARC Script Builder V2 — Complete Rewrite

> **Date:** 2026-03-17
> **What this covers:** Complete replacement of the ARC Script Builder — new API, new UI, new prompt system. This is not a patch on the old wizard. Rip it out and build this instead.
> **Replaces:** The existing 6-step wizard in `ArcScriptBuilderTool.tsx` and `api/ai-tools/arc-script-builder/route.ts`

---

## Context for Replit

The current ARC Script Builder is a 6-step wizard where each step makes an isolated API call to Claude. The problem: Claude at Step 4 has no memory of the reasoning behind Steps 1-3. It's assembling parts, not thinking through a unified document.

We're replacing it with a **two-phase system**: an Upload Phase (gather inputs + summarise research) and a Chat Phase (walk through sections conversationally with Claude holding full context throughout). The chat model means Claude has cumulative context — every decision builds on everything before it.

There are also 4 critical prompt-level fixes that change HOW Claude reasons about scripts, not just the UI flow.

---

## Prompt 1 of 4: Database, Cost Cap, File Upload

### Paste this into Replit Agent:

```
We're completely replacing the ARC Script Builder. This is Part 1 of 4 — database changes, cost cap system, and file upload infrastructure.

=== CHANGE 1: ADD AIToolUsage TABLE ===

Add a new Prisma model for tracking AI tool API costs:

model AIToolUsage {
  id              String   @id @default(uuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  toolType        String
  inputTokens     Int
  outputTokens    Int
  costUsd         Decimal  @db.Decimal(10, 6)
  conversationId  String?
  createdAt       DateTime @default(now())

  @@index([userId])
  @@index([createdAt])
  @@map("ai_tool_usage")
}

Also add to the User model:
- aiToolsMonthlyCapOverride  Decimal? @db.Decimal(10, 2)
- aiToolUsage AIToolUsage[] (relation)

Run prisma migrate after adding this.


=== CHANGE 2: COST CAP UTILITY ===

Create src/lib/ai-tool-cost.ts with these exports:

1. calculateCost(inputTokens: number, outputTokens: number): Decimal
   - Uses Sonnet pricing: $3/M input, $12/M output
   - Returns Decimal for precision

2. getMonthlyUsage(userId: string): Promise<{ totalCost, cap, remaining, percentUsed, breakdown }>
   - Aggregates AIToolUsage for the current calendar month
   - Gets the cap from: user's aiToolsMonthlyCapOverride → AppSetting "ai_tools_monthly_cap" → default $15.00
   - If no AppSetting row exists for "ai_tools_monthly_cap", create one with value "15.00" (ensures admin can always find and edit it)
   - Admin users (role === "admin") are exempt — returns 999999 remaining
   - breakdown is an object mapping toolType → total cost

3. checkCostCap(userId: string): Promise<{ allowed, percentUsed, resetsAt }>
   - Returns allowed: false if remaining <= 0
   - resetsAt is the 1st of next month as YYYY-MM-DD

4. logUsage(userId, toolType, inputTokens, outputTokens, conversationId?): Promise<void>
   - Creates an AIToolUsage record with the calculated cost


=== CHANGE 3: USAGE API ENDPOINTS ===

1. GET /api/ai-tools/usage/me
   - Auth: any logged-in user
   - Returns: { totalCost, cap, remaining, percentUsed, breakdown (by tool), resetsAt }
   - Uses getMonthlyUsage()

2. GET /api/ai-tools/usage
   - Auth: admin only
   - Returns: { memberUsage (array of per-user objects with name, email, role, tools breakdown, total), toolBreakdown (per-tool: uses count, uniqueMembers count, lastUsed), totalCost }
   - Queries AIToolUsage for current month, aggregates by user and by tool


=== CHANGE 4: TEXT EXTRACTION UTILITY ===

Create src/lib/text-extractor.ts:

export async function extractText(buffer: Buffer, filename: string): Promise<string>

- PDF: use pdf-parse package. If no text extracted (scanned PDF), throw Error("SCANNED_PDF:filename")
- DOCX: use mammoth package (.extractRawText)
- TXT/MD: buffer.toString("utf-8")
- Other: throw Error("UNSUPPORTED_FORMAT:filename")

Install: npm install pdf-parse mammoth


=== CHANGE 5: FILE UPLOAD ENDPOINT ===

Create POST /api/ai-tools/arc-script-builder/upload

- Auth: resolveUserFromSession()
- Accepts multipart FormData with "files" field (multiple files)
- Validates: max 3 files, max 10MB each, allowed extensions: pdf, docx, txt, md
- For each file: reads into Buffer (in memory, no disk), calls extractText()
- Returns: { results: [{ filename, text?, error? }] }

Error messages:
- Scanned PDF: "This PDF appears to be a scanned image. Try copying and pasting the content instead."
- Unreadable: "Couldn't read this file. Try pasting the text directly instead."
- Too large: "File exceeds 10MB limit"
- Wrong type: "Unsupported file type: .xxx"

Files are processed entirely in memory — no disk writes (important for Replit).


=== HOW TO TEST PART 1 ===

- [ ] AIToolUsage table exists after migration
- [ ] User model has aiToolsMonthlyCapOverride field
- [ ] GET /api/ai-tools/usage/me returns usage data (should be all zeros initially)
- [ ] GET /api/ai-tools/usage returns admin data (admin only)
- [ ] POST /api/ai-tools/arc-script-builder/upload accepts files and returns extracted text
- [ ] Upload rejects files over 10MB, wrong types, more than 3 files
- [ ] PDF, DOCX, TXT, and MD files all extract correctly
```

---

## Prompt 2 of 4: API Rewrite — The Critical Prompt System

### Paste this into Replit Agent AFTER Prompt 1 is tested and working:

```
This is Part 2 of the ARC Script Builder rewrite. Part 1 (database, cost cap, file upload) should already be working.

=== CHANGE 6: COMPLETELY REWRITE THE ARC SCRIPT BUILDER API ===

Delete the existing code in src/app/api/ai-tools/arc-script-builder/route.ts and replace it entirely.

The new API supports two modes: "summarize" and "chat".

--- MODE 1: step === "summarize" ---

Accepts: { step: "summarize", researchText: string, title: string, talkingPoints?: string }

Sends all research text to Claude with a prompt to summarize into a structured brief (~1,500-2,000 tokens). The summary prompt should extract:
- Key facts, stats, data points
- Main arguments and unique angles
- Client pain points and emotional triggers
- Story angles (client stories, personal experiences, metaphors)
- Credibility data (numbers, track record, experience)
- Notable quotes or phrasings
- What the avatar likely hears from OTHER sources (conventional wisdom)

Checks cost cap first — returns 429 with { error: "monthly_cap_reached", resetsAt } if exceeded.
Logs usage via logUsage() from ai-tool-cost.ts.
Returns: { summary: string, usage: { inputTokens, outputTokens } }

--- MODE 2: step === "chat" ---

Accepts: { step: "chat", messages: Array<{ role, content, researchSummary? }> }

The first message in the array may have a researchSummary field — extract it and inject into the system prompt as {{RESEARCH_SUMMARY}}. Strip researchSummary from messages before sending to Claude.

Uses STREAMING: client.messages.stream() instead of client.messages.create()

Returns a Server-Sent Events stream (text/event-stream):
- data: {"type":"text","text":"..."} for each text chunk
- data: {"type":"done","sectionData":{...},"costCapWarning":null} when complete

After stream completes, log usage and check cost cap percentage. If cost cap > 75%, include a costCapWarning in the done event.
Checks cost cap before processing — returns 429 if exceeded.

--- AVATAR DATA EXTRACTION (CRITICAL) ---

This is one of the most important changes. The current code does this:

const avatarText = dbUser?.avatarProfile ? JSON.stringify(dbUser.avatarProfile) : "No avatar saved";

That sends Claude a JSON blob. Wrong. The avatarProfile is a JSON object that contains a "full_document" field — that field holds the complete narrative avatar document (internal monologue, emotional landscape, fears, motivations, etc.). Claude needs to read THAT, not a JSON blob.

Replace the avatar extraction with:

const avatarProfile = dbUser?.avatarProfile as any;
let avatarText: string;
if (avatarProfile?.full_document) {
  avatarText = avatarProfile.full_document;
} else if (avatarProfile) {
  // Fallback for older/simpler avatar data
  avatarText = JSON.stringify(avatarProfile, null, 2);
} else {
  avatarText = "No avatar saved. Recommend the member build their avatar first using the Avatar Architect. Write to a general audience but note this in the Research & Strategy section.";
}

Do the same for contentThemes — extract the array and format as a readable list, not JSON.

--- THE SYSTEM PROMPT ---

This is the full system prompt for chat mode. Read it carefully — the FRAMING of these instructions matters as much as the content. This prompt turns Claude from a template-filler into a reasoning partner.

Check AppSetting "prompt_arc_script_builder" first; fall back to the hardcoded default below. Use claude-sonnet-4-20250514 for both modes. max_tokens: 2048 for summarize, 4096 for chat.

Here is the complete system prompt (store this as the default):

---BEGIN SYSTEM PROMPT---

You are the ARC Script Builder — a senior content strategist who helps real estate YouTubers build authentic, client-attracting video scripts using the ARC Method (Attention, Revelation, Connection).

You are NOT a template filler. You are a reasoning partner. Your job is to think THROUGH the ARC framework using the member's inputs as raw material — not to mechanically populate sections. If a different structure serves the viewer better than what the member provided, say so and explain why.

=== YOUR CLIENT AVATAR — HARD CONSTRAINT ===

This is who you are writing to. Every tone decision, word choice, and emotional beat must be calibrated to this specific person. Do not write to a generic audience. If this avatar has anxiety phases, write to the phase that matches this video's topic. If it has an internal monologue, use the language and concerns from that monologue.

{{MEMBER_AVATAR}}

Content Themes: {{CONTENT_THEMES}}
Baseline Audit Scores: {{BASELINE_SCORES}}

=== PRODUCTION REQUIREMENTS — ACTIVE DURING GENERATION, NOT AFTER ===

These are not review criteria. These are constraints you must satisfy DURING generation. You may not complete any section that violates these requirements. Do not approximate. Do not "mostly" satisfy them. Every requirement must be met or you must flag what's preventing it.

1. Opening is ~20-25 seconds (Intro Pattern + Lead Magnet + Expertise Bridge)
2. Intro pattern comes FIRST — no preamble, no throat-clearing
3. Expertise bridge comes AFTER lead magnet — layers credibility into first insight
4. Lead magnet mentioned exactly 3 times (opening, ~2/3 through, closing)
5. Each insight follows the Value Loop (What → Why → When → Story Proof → What This Means For You)
6. No "how to implement" — that belongs in the consultation or lead magnet
7. 4-5 connection phrases written as spoken dialogue, distributed throughout (not clustered)
8. 2-3 values/interests peppered in casually at natural moments
9. Curiosity bridges between every section (And → But → Therefore)
10. Grade 5 reading level — simple words, short sentences, every sentence increases understanding
11. ONE client story threaded through the script — not a different story per section. If no story is provided, ask for one before proceeding to insights.
12. Visual production cues inline where relevant
13. Canadian spelling throughout (colour, neighbourhood, analyse, centre)
14. Never use the avatar's name in script output — only "you," "your," "families like yours"

=== THE ARC METHOD ===

ARC = Attention, Revelation, Connection.

**A — Attention (Opening, ~20-25 seconds):**
1. Intro Pattern (~8-10 sec) — the primary hook. Must "approve the click" — first words confirm the viewer made the right choice clicking.
2. Lead Magnet (~4-5 sec) — one line, not a pitch: "I've put together a free [resource] that [benefit] — link's in the description."
3. Expertise Bridge (~3-5 sec) — layers credibility INTO the transition to the first insight. Not a standalone brag.
4. Transition (~2 sec) — "Here's what you need to know..."

**R — Revelation (Insights via Value Loop):**
Each insight follows:
- WHAT — the principle or factor most people miss
- WHY — the underlying psychology
- WHEN — the specific circumstances where this becomes critical
- STORY PROOF — 30-60 second example (must use the SAME story thread, different angle each time)
- WHAT THIS MEANS FOR YOU — connect to the viewer's situation (NOT how to implement)

Order: second-best insight first, best insight last.

**C — Connection (Woven Throughout, Not a Section):**
- 4-5 connection phrases distributed throughout
- 2-3 values/interests peppered in at natural points
- Lead magnet mentioned 3 times total
- Curiosity bridges between sections (And → But → Therefore)

=== INTRO PATTERNS ===

4 types. Recommend ONE based on the title's energy — don't just list all 4:

CONTRADICTION — Start with the opposite of what they expect. Validate first, then sharp pivot.
5 sub-patterns:
1. Validation Pivot: "It makes sense that [logical behaviour]... But here's the problem — [why it backfires]"
2. Universal Flip: "Everyone thinks [common belief]. The opposite is actually true — [contradiction]"
3. Logic Trap: "The more you [logical action], the worse [problem] gets. Here's why..."
4. Obvious Wrong: "Most people [obvious approach]. That's exactly backwards — [real solution]"
5. Smart People Mistake: "Smart [avatar type] always [logical behaviour]. That's the trap — [why it fails]"

CONFIRMATION — Validate their feeling, reinforce the title promise. Use when title makes a clear promise.
EMPATHY — Show you've been there. Use when audience is stressed or torn.
STAKES — Make clear what's at risk. Use when there's a real cost to conventional approach.

=== EXPERTISE BRIDGES ===

Come AFTER lead magnet, transition INTO first insight:
- Authority: "After helping [X families] [do the thing], the first thing I always tell them is..."
- Revelation: "What most [experts] won't tell you — and I can say this after [credibility proof] — is..."
- Pattern: "I've seen this play out [X times], and here's what happens every time..."

=== CONNECTION LANGUAGE ===

Write these INTO the script as spoken dialogue. Not as notes.

Trust: "Here's what I know works..." / "In my experience with [X clients]..." / "What I've learned is..."
Validation: "I'm glad you're here" / "It makes sense that you'd think..." / "You're not alone in feeling this way"
Tribe: "People like us..." / "For families in your situation..." / "What I tell my clients in the same spot..."
Emotional: "It seems like you..." / "I've got you" / "Notice how this feels different..."

=== CURIOSITY BRIDGES ===

And → But → Therefore between every section:
- "And that's just the beginning..."
- "But here's what's even more important..."
- "Now, this is powerful on its own, but combined with the next piece..."

=== RESEARCH SUMMARY ===
{{RESEARCH_SUMMARY}}

=== YOUR PROCESS ===

Walk through these sections in order, one at a time. Present your work, wait for the member to approve or adjust before moving on. You are having a conversation, not filling out a form.

**1. RESEARCH & STRATEGY** (this is the most important section — get this right and everything else follows)

Present the research summary. Then do THREE things the old tool never did:

a) GAP CHECK — Flag if any of these are missing:
   - At least one stat or data point
   - At least one client story or personal experience
   - Awareness of what the avatar hears from other sources (conventional wisdom)
   - Enough talking points for the planned number of insights
   - Check for even-numbered listicles and suggest odd numbers (3, 5, 7, 9)

b) STRUCTURAL MAPPING — Read the talking points and propose an architecture:
   - What is the emotional throughline connecting these points?
   - Should these be structured as traps→solutions, steps, comparisons, questions, or something else? (Do NOT just use the order the member gave you — find the pattern.)
   - Which intro pattern best matches the title's energy? Recommend ONE with reasoning. Don't list all 4.
   - If the talking points would work better reorganised, say so and explain why.

c) STORY IDENTIFICATION — Ask: "What's ONE client story or personal experience that connects to this topic? I'll thread it through the entire script." Get this before generating any content. If the research already contains a story, propose using it.

Present this as: "Here's what I'm working with, here's how I'd structure this video, and here's what I still need from you." Wait for approval.

**2. OPENING (~20-25 sec)**

Generate 2-3 opening options. Based on your structural mapping, LEAD with your recommended intro pattern and explain why it fits this title's energy. Include the other options but make your recommendation clear.

Write word-for-word scripts, not templates. Each must approve the click.

**3. CREDIBILITY**

Draft credibility lines using the member's credentials from their avatar profile. Pull these SILENTLY — don't ask the member to re-enter credentials that are already in their avatar. Note what you pulled and where you'd place each line.

**4. INSIGHTS (VALUE LOOPS)**

Generate the insight content following the architecture you proposed in Step 1. For each insight:
- WHAT → WHY → WHEN → STORY (using the single threaded story) → WHAT THIS MEANS FOR YOU
- Add curiosity bridge to the next section

Remember: the structure you proposed might not match the member's original order. That's fine — you explained why in Step 1 and they approved it.

**5. CLOSING**

Draft closing with:
- Lead magnet mention #3
- Connection phrases
- Values placement
- If the member provided their next video title, create a specific open loop

**6. LEAD MAGNET BRAINSTORM**

Generate 2-3 lead magnet ideas using this principle: "Marketing is the continuation of the thought the client is having, and the lead magnet shows up as that continuation of thought."

Must be specific to THIS video's topic and avatar. Not generic. Not a "free consultation."

**7. FINAL SCRIPT**

Assemble everything into a single filmable monologue. This means:
- INVISIBLE structure — no WHAT/WHY/WHEN labels visible
- Narrative arc — insights build on each other like a 3-act story
- Conversational voice — contractions, fragments, rhetorical questions
- At least one analogy per major section
- The single client story threaded throughout
- Lead magnet mentioned organically 3 times
- Specific curiosity bridges between sections
- Visual production cues inline [SHOW: description]
- Target length: 2,500-4,000 words

Then run the production requirements checklist (pass/fail for each of the 14 items above).

Then provide a retention analysis: 3-5 moments where viewers might drop off, with approximate timestamps and specific fixes.

=== SECTION TRACKING ===

Each AI message must end with:
<SECTION_DATA>
{"currentSection": "research_strategy|opening|credibility|insights|closing|lead_magnets|final_script", "sectionApproved": true|false}
</SECTION_DATA>

When a section is approved, set currentSection to the NEXT section being moved to. sectionApproved: true means the previous section was just approved.

---END SYSTEM PROMPT---


=== HOW TO TEST PART 2 ===

- [ ] POST /api/ai-tools/arc-script-builder with step "summarize" returns a structured research summary
- [ ] POST with step "chat" returns a streaming SSE response
- [ ] The avatar's full_document text (not JSON) appears in Claude's context
- [ ] Cost cap check blocks requests when limit is reached (returns 429)
- [ ] Usage is logged to AIToolUsage on every API call
- [ ] AppSetting "prompt_arc_script_builder" is checked first, falls back to hardcoded default
```

---

## Prompt 3 of 4: UI Components

### Paste this into Replit Agent AFTER Prompt 2 is tested and working:

```
This is Part 3 of the ARC Script Builder rewrite. Parts 1-2 should already be working.

=== CHANGE 7: PROGRESS BAR COMPONENT ===

Create src/components/ai-tools/ArcProgressBar.tsx

A horizontal progress bar showing 7 ARC sections:
Research & Strategy → Opening → Credibility → Insights → Closing → Lead Magnets → Final Script

Props: { currentSection: string, completedSections: string[], onSectionClick: (section) => void }

- Current section: highlighted blue (#3dc3ff), bold label
- Completed sections: lighter blue, clickable (cursor-pointer, hover effect)
- Future sections: grey (#1e2a38/10)
- Each section is a rounded progress bar segment with a tiny label underneath
- Match the existing site design system (white cards, border-[#1e2a38]/10, rounded-2xl)

Export the SECTIONS array: [{ key: "research_strategy", label: "Research & Strategy" }, { key: "opening", label: "Opening" }, { key: "credibility", label: "Credibility" }, { key: "insights", label: "Insights" }, { key: "closing", label: "Closing" }, { key: "lead_magnets", label: "Lead Magnets" }, { key: "final_script", label: "Final Script" }]


=== CHANGE 8: UPLOAD PHASE COMPONENT ===

Create src/components/ai-tools/ArcScriptUploadPhase.tsx

This is the first screen the member sees when opening ARC Script Builder.

Layout (top to bottom):
1. Title input — "What's your video title?" (required)
2. Talking points textarea — "Key talking points" (optional but encouraged, with helper text: "List the main points you want to cover. Don't worry about order — the AI will propose the best structure.")
3. File upload zone — drag-and-drop area with DocumentArrowUpIcon
   - Shows "Drag and drop files here, or click to browse"
   - Accepts: PDF, DOCX, TXT, MD. Max 3 files, 10MB each.
   - After upload: show file name + size with X button to remove
   - Hidden file input triggered by click
4. Research notes textarea (8 rows) — "Paste your research notes"
5. Client story textarea (4 rows) — "A client story or personal experience related to this topic (optional but recommended — this gets woven through the whole script)"
6. Error area (if any)
7. "Start Building →" button — disabled until title + some research (files or pasted text or talking points)

On "Start Building":
1. Upload files to /api/ai-tools/arc-script-builder/upload (if any files)
2. Combine extracted text + pasted notes
3. Send to /api/ai-tools/arc-script-builder with step: "summarize"
4. If 429 (cap reached), show error message
5. If success, call onStartBuilding({ title, talkingPoints, researchSummary, clientStory })

Props: { onStartBuilding: (data: { title, talkingPoints, researchSummary, clientStory }) => void }

Style: follow existing Attraction Tracking Site design system — white cards with border-[#1e2a38]/10, rounded-2xl, #3dc3ff accent colour, #1e2a38 text.


=== CHANGE 9: CHAT PHASE COMPONENT ===

Create src/components/ai-tools/ArcScriptChatPhase.tsx

This is the chat interface shown after the upload phase completes. It follows the EXACT same chat pattern as the Avatar Architect (src/app/member/ai-tools/avatar-architect/page.tsx) — same message bubbles, same input area, same scroll behaviour.

Key differences from Avatar Architect:
1. Progress bar at top (ArcProgressBar component)
2. Inline approval card when clicking a completed section (expandable/collapsible card showing approved text)
3. STREAMING responses — uses EventSource/ReadableStream reader instead of awaiting JSON:
   - Buffer incoming SSE chunks (split on \n\n to handle chunk boundaries)
   - Update the last assistant message incrementally as text arrives
   - After "done" event, process sectionData and costCapWarning
4. Cost cap warning banners (amber at 75%, red at 90%, locked at 100%)
5. Turn limit: 20 turns (user + assistant combined). After 20, show limit message.
6. Final script actions: Copy, Save, Build Another Script buttons (shown when currentSection === "final_script" and sectionApproved === true)

Props: { initialData: { title, talkingPoints, researchSummary, clientStory }, onReset: () => void }

On mount: automatically sends the first message to the chat API with the title, talking points, client story, and research summary. The first user message should include ALL of these so Claude has full context from the start. The researchSummary goes in the message's researchSummary field (which the API injects into the system prompt).

Section tracking:
- Parse <SECTION_DATA> from AI responses (strip it from display text)
- When sectionApproved is true, mark the previous section as complete
- Store a snippet of the approved content for each section (for the inline approval card)

Save script: POST to /api/ai-tools/save-script with the same scriptOutline JSON shape as current (opening, credibility, lead_magnet_1, insights array, etc). Assemble from the final script section content.


=== HOW TO TEST PART 3 ===

- [ ] Progress bar renders all 7 sections with correct styling
- [ ] Clicking completed section shows inline card with approved content
- [ ] Upload phase shows all input fields correctly
- [ ] File upload drag-and-drop works, shows file names, X to remove
- [ ] "Start Building" triggers file upload → summarize → transition to chat
- [ ] Chat messages stream in real-time (not all at once)
- [ ] Progress bar advances as sections are approved
- [ ] Cost cap warning banners appear at correct thresholds
- [ ] 20 turn limit works
- [ ] Copy, Save, Build Another buttons appear after final script is approved
```

---

## Prompt 4 of 4: Main Component Rewrite & Integration

### Paste this into Replit Agent AFTER Prompt 3 is tested and working:

```
This is Part 4 of the ARC Script Builder rewrite. Parts 1-3 should already be working.

=== CHANGE 10: REWRITE MAIN ARC SCRIPT BUILDER COMPONENT ===

Completely rewrite src/components/ai-tools/ArcScriptBuilderTool.tsx to be a simple two-phase wrapper:

- Props: { basePath: string } (same as before — no change to page wrappers)
- State: phase ("upload" | "chat"), uploadData (title + talkingPoints + researchSummary + clientStory)
- On mount: fetch /api/ai-tools/usage/me to check usage. Show banners at 50% (blue info), 75% (amber warning), 100% (red locked — hide upload form)
- Upload phase: render ArcScriptUploadPhase inside a white card
- Chat phase: render ArcScriptChatPhase with the upload data
- Back arrow link to basePath (AI Tools hub)
- Header: "ARC Script Builder" with subtitle that changes by phase ("Upload your research" vs "Building your script")

Delete ALL the old wizard code — the old STEPS array, ProgressBar function, all the step-specific state variables, the 6 step UI blocks. None of it is reused.


=== CHANGE 11: MY USAGE SECTION ON AI TOOLS HUB ===

Add a "My AI Tools Usage" section to the AI Tools Hub (src/components/ai-tools/AIToolsHub.tsx).

This section appears after the page title and before the tool cards grid:

1. Fetch /api/ai-tools/usage/me on mount
2. If percentUsed >= 50, show a banner (blue/amber/red based on threshold)
3. Always show a "My Usage" card:
   - Progress bar: current spend vs cap ($X.XX used / $XX.XX limit)
   - Bar colour: blue < 75%, amber 75-90%, red > 90%
   - Below the bar: tool breakdown (tool name → cost, one line per tool that has usage)
   - Bottom: "Resets {resetsAt}"

Only show the card if there's any usage data (percentUsed > 0). Otherwise, don't clutter the page.


=== HOW TO TEST PART 4 ===

- [ ] ARC Script Builder page shows upload phase (not old wizard) for both admin and member
- [ ] Back arrow links to AI Tools hub
- [ ] Usage banner shows at appropriate thresholds (50%, 75%, 90%, 100%)
- [ ] At 100%, upload form is hidden and locked message shows
- [ ] AI Tools Hub shows "My Usage" card with progress bar and tool breakdown
- [ ] Usage card only shows when there's actual usage
- [ ] Admin can edit the cap value in AppSetting

=== FULL END-TO-END TEST ===

Run through the complete flow:

1. Open ARC Script Builder as a member
2. Enter a title: "I Tested 12 Calgary Home Buying Strategies. These 4 Actually Work."
3. Enter talking points: "analysis paralysis, timing the market, relying on online valuations, skipping pre-approval, neighbourhood research, inspection negotiation, offer strategy, closing timeline management"
4. Paste or upload some research text
5. Add a client story in the story field
6. Click "Start Building" — research gets summarised
7. Chat opens at "Research & Strategy" — Claude should:
   - Present the research summary
   - Flag any gaps
   - Propose a STRUCTURAL ARCHITECTURE (e.g., "these 8 points are actually 4 traps and 4 strategies — let's structure it as 'what goes wrong' leading to 'what actually works'")
   - Recommend a specific intro pattern with reasoning (probably Stakes for this title)
   - Ask for the client story if not provided
8. Approve the strategy → progress bar advances to Opening
9. Claude generates 2-3 opening options, leads with recommendation
10. Approve → Credibility → Claude pulls credentials from avatar silently
11. Approve → Insights → Claude follows the approved architecture
12. Approve → Closing → Lead Magnets → Final Script
13. Final script should be a 2,500-4,000 word filmable monologue with invisible structure
14. Checklist passes all 14 items
15. Retention analysis identifies 3-5 drop-off points with fixes
16. Copy, Save, and Build Another buttons all work

The key thing to verify: does the Research & Strategy step actually PROPOSE A STRUCTURE rather than just summarising? That's the single biggest quality improvement. If Claude just lists the research and moves on without proposing how to organise the video, the system prompt needs to be strengthened.
```

---

## What Changed From the Previous Redesign Document

This document replaces `Replit-Prompt-ARC-Script-Builder-Redesign.md`. Here's what's different and why:

1. **Avatar data extraction** — Previous version used `{{MEMBER_AVATAR}}` as a placeholder but didn't specify HOW to extract it. This version specifies: pull `full_document` from `avatarProfile`, not `JSON.stringify`. This is critical — it's the difference between Claude reading a character study vs a data blob.

2. **Structural mapping pre-step** — Previous version's "Research Summary" section just summarised research and flagged gaps. This version adds structural mapping: Claude analyses the emotional throughline, proposes a content architecture, recommends a specific intro pattern, and gets approval before generating ANY content. This is the single biggest quality improvement.

3. **Checklist positioning** — Previous version had the checklist at the end. This version puts it at the TOP of the system prompt as "Production Requirements" with the framing "You may not complete any section that violates these requirements." The framing matters — review criteria invite approximation, production requirements don't.

4. **Permission to restructure** — Previous version treated talking points as the outline. This version explicitly tells Claude: "If a different structure serves the viewer better, say so and explain why. The member's talking points are ingredients, not an outline."

5. **Single story thread** — Previous version mentioned "one story threaded through" as a rule but didn't solve the problem. This version adds a dedicated story identification step in Research & Strategy, getting the single story locked in BEFORE any content generation.

6. **Client story input field** — Added to the upload phase so members can provide their story upfront rather than Claude having to ask for it mid-flow.

7. **Section count** — Changed from "research_summary" to "research_strategy" to reflect the expanded role of the first section.
