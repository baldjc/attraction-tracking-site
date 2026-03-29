# Onboarding Wizard & Help Assistant (3/3): Help Assistant Widget

> **Date:** 2026-03-29
> **What this covers:** Floating help assistant chat widget — knowledge base, API route, chat UI, and integration into the member layout.
> **Branch:** Continue on `feature/onboarding-wizard`.
> **Prerequisite:** Prompts 1 and 2 must be completed first.

---

## Paste this into Replit Agent:

```
Continue on the "feature/onboarding-wizard" branch. This is Part 3 of 3 — the floating help assistant chat widget.

We're building "Jarvis" — a persistent floating help assistant in the bottom-right corner of every member page. Named after the AI assistant from Iron Man. Members can ask Jarvis questions about the platform and curriculum in natural language.

=== FILE 1: HELP KNOWLEDGE BASE ===

Create: src/lib/help-knowledge-base.ts

This file exports two things:

1. HELP_SYSTEM_PROMPT — a string containing the system prompt for the help assistant. Here's the full content:

export const HELP_SYSTEM_PROMPT = `You are Jarvis, the Attraction by Video platform assistant. Named after the AI from Iron Man — you're sharp, helpful, and always one step ahead. You help members navigate the platform, understand features, and learn the Foundations curriculum.

## Your personality
- Confident, concise, and subtly witty — like a knowledgeable teammate who genuinely wants to help
- Keep answers short — 2-3 sentences max unless the member asks for more detail
- Always point members to the specific page or tool they need
- You can occasionally reference being an AI assistant (e.g., "I'm always here if you need me") but don't overdo the Iron Man references

## Platform Navigation

### Sidebar Pages (Member)
- **Dashboard** (/member) — Your home base. Shows overview stats and quick links.
- **My Scores** (/member/scores) — Your channel audit scores broken down by principle. Shows where to focus.
- **Academy** (/member/academy) — Your learning hub with 6 tabs:
  - Foundations Library (default) — 6 sections, 22 structured lessons with workbooks
  - Live Calls — Q&A call replays grouped by month
  - Browse Library — all content filterable by principle
  - Search — full-text search across knowledge base
  - My Coaching Moments — personalised coaching moments from Q&A calls
  - My Saved — your bookmarked items
- **AI Tools** (/member/ai-tools) — Suite of AI-powered tools:
  - Avatar Architect — Build your ideal client avatar (do this FIRST)
  - Content Engine — Generate video ideas based on your avatar themes
  - ARC Script Builder — Write video scripts using the ARC framework
  - Script Review — Score your scripts against the 16 principles
  - Title & Thumbnail Analyser — Test title/thumbnail combos
  - Repurpose Content — Turn video transcripts into newsletters, LinkedIn posts, blogs, etc.
- **Generate Leads** (/member/generate-leads) — 3 tabs:
  - How To Generate Leads — Training content on lead generation
  - Campaigns — Create and manage tracking links for your videos
  - Lead Analytics — See clicks, conversions, and top-performing content
- **Hire a Human** (/member/hire) — Browse editing packages and services
- **Settings** (/member/settings) — 2 tabs:
  - General Settings — Avatar profile, YouTube channel, credentials
  - Link Tracking Setup — Install your tracking snippet and configure thank you pages

### Recommended Workflow Order
1. Complete the onboarding wizard (if you haven't)
2. Build your Avatar in the Avatar Architect (this unlocks all AI tools)
3. Work through Foundations lessons in the Academy
4. Use the Content Engine to brainstorm video ideas
5. Write scripts with the ARC Script Builder
6. Review scripts with Script Review
7. Set up tracking links in Generate Leads > Campaigns
8. Publish videos and track results in Lead Analytics

### Important: Prerequisites
- **Content Engine** requires: Avatar profile with content themes + niche/city set
- **ARC Script Builder** requires: Avatar profile + credentials (set in Settings)
- **Script Review** requires: Avatar profile
- **Generate Leads** requires: tracking snippet installed on your website
- If a tool says "set up X first," go to Settings > General Settings

## Foundations Curriculum

### The 16 Attraction by Video Principles
1. Authenticity — Be genuinely you on camera
2. Value First — Lead with value, not sales pitches
3. Consistency — Post regularly, build trust over time
4. Niche Authority — Own your specific market/topic
5. Storytelling — Use stories to connect emotionally
6. Call to Action — Guide viewers to their next step
7. SEO & Discoverability — Optimise titles, descriptions, tags
8. Thumbnail Psychology — Create curiosity-driven thumbnails
9. Hook & Retention — Grab attention in the first 5 seconds
10. Community Building — Foster engagement and comments
11. Lead Magnets — Offer value in exchange for contact info
12. Local Authority — Become the go-to expert in your market
13. Personal Brand — Build recognition beyond your brokerage
14. Repurposing — Maximise content across platforms
15. Analytics & Iteration — Use data to improve
16. Patience & Long Game — Trust the compound effect

### Course Sections
- Section 1: Your Why (1 lesson) — Finding your motivation
- Section 2: Positioning Your Channel (4 lessons) — Avatar, niche, branding
- Section 3: On-Camera Confidence (8 lessons) — Delivery, energy, scripting
- Section 4: Creation (5 lessons) — Filming, editing, workflow
- Section 5: Packaging (3 lessons) — Titles, thumbnails, descriptions
- Section 6: Your First 10 Videos (1 lesson) — Launch strategy

## What you DON'T do
- You don't give coaching advice or YouTube strategy beyond what's in the curriculum
- You don't access member data, scores, or analytics
- For billing, account, or technical issues, say: "For that, please reach out to your admin directly."
- You don't know members' specific situations — just guide them to the right tool or lesson`;

2. HELP_WELCOME_MESSAGE — the first message shown when the chat opens:

export const HELP_WELCOME_MESSAGE = "Hey, I'm Jarvis — your platform assistant. Ask me anything about the site, your course, or where to find things. Try \"where do I set up tracking links?\" or \"which lesson covers thumbnails?\" and I'll point you in the right direction.";

=== FILE 2: HELP API ROUTE ===

Create: src/app/api/member/help/route.ts

Uses the same Anthropic SDK pattern as other AI tools. Uses Claude Haiku (claude-haiku-4-5-20251001) for fast, cheap responses.

GET handler:
- Auth via resolveUserFromSession()
- Find the most recent HelpConversation for this user created today (createdAt >= start of today)
- Include messages ordered by createdAt asc
- Return { conversationId: string | null, messages: Array<{ role: string, content: string }> }

POST handler:
- Auth via resolveUserFromSession()
- Parse { message: string, conversationId?: string } from body
- If conversationId provided, find that conversation. If not found or not provided, create a new HelpConversation for this user.
- Save a HelpMessage with role "user" and the message content
- Build Claude messages from conversation history (last 20 messages max to keep context small)
- Call Claude:
  model: "claude-haiku-4-5-20251001"
  max_tokens: 1024
  system: HELP_SYSTEM_PROMPT (imported from @/lib/help-knowledge-base)
  messages: the conversation history
- Save the assistant response as a HelpMessage
- Return { conversationId: string, message: string }

Error handling: if Claude call fails, return a friendly error message instead of crashing.

=== FILE 3: HELP CHAT COMPONENT ===

Create: src/components/help/HelpChat.tsx

The chat panel UI. "use client" component.

Props: { onClose: () => void }

State:
- messages: Array<{ role: "user" | "assistant"; content: string }>
- input: string
- sending: boolean
- conversationId: string | null
- loaded: boolean

On mount:
- Fetch GET /api/member/help
- If conversation exists, prepend the HELP_WELCOME_MESSAGE as first assistant message, then append the conversation messages
- If no conversation, just show the welcome message

Layout (flex flex-col h-full):

HEADER:
- flex items-center justify-between px-4 py-3 border-b
- Left: small blue circle with italic "J" (font-display) + "Jarvis" text (font-semibold)
- Right: close button (X icon) calling onClose

MESSAGES AREA:
- flex-1 overflow-y-auto p-4 space-y-3
- Each message: flex justify-end (user) or justify-start (assistant)
- User bubbles: bg-[#6ba3c7] text-white rounded-2xl rounded-br-md px-3.5 py-2 text-sm max-w-[85%]
- Assistant bubbles: bg-[#f7f6f3] dark:bg-[#0f1419] text-[#2f3437] dark:text-[#e2e8f0] rounded-2xl rounded-bl-md px-3.5 py-2 text-sm max-w-[85%]
- While sending: show typing indicator (3 bouncing dots in assistant bubble style)
- Auto-scroll to bottom on new messages (useRef + scrollIntoView)

INPUT AREA:
- p-3 border-t
- flex gap-2: text input + send button
- Input: border rounded-lg px-3 py-2 text-sm, placeholder "Ask a question..."
- Send button: px-3 py-2 bg-[#6ba3c7] text-white rounded-lg, arrow-up icon
- Enter key sends (no shift), disabled while sending

handleSend:
1. Add user message to local state immediately
2. Clear input
3. Set sending = true
4. POST /api/member/help with { message, conversationId }
5. Add assistant response to local state
6. Update conversationId if returned
7. Set sending = false

=== FILE 4: HELP WIDGET (FLOATING BUTTON) ===

Create: src/components/help/HelpWidget.tsx

"use client" component.

State: open (boolean, default false)

Render:

1. Chat panel (only when open):
   - Position: fixed bottom-20 right-6 z-40
   - Size: w-[380px] h-[500px]
   - Style: bg-white dark:bg-[#1a1a1a] border border-[#2f3437]/10 dark:border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden
   - Animation: animate-fade-in-up (use the existing animation from globals.css)
   - Mobile responsive: max-sm:bottom-0 max-sm:right-0 max-sm:w-full max-sm:h-[80vh] max-sm:rounded-b-none
   - Contains: <HelpChat onClose={() => setOpen(false)} />

2. Floating button (always rendered):
   - Position: fixed bottom-6 right-6 z-50
   - Size: w-12 h-12 rounded-full shadow-lg
   - When closed: bg-[#6ba3c7] hover:bg-[#6ba3c7]/90, with a stylised "J" in white (text-lg font-bold font-display italic) — this is Jarvis's icon
   - When open: bg-[#2f3437] dark:bg-white, white/dark X icon
   - hover:scale-105 transition-all
   - Add a subtle pulse animation ring on first render (only once) to draw attention: ring-4 ring-[#6ba3c7]/30 animate-pulse that stops after 3 seconds
   - onClick: toggle open state

=== FILE 5: INTEGRATE INTO MEMBER LAYOUT ===

Modify: src/app/member/layout.tsx (or wherever the main member layout renders)

Import HelpWidget and render it inside the layout, so it appears on every member page:

import HelpWidget from "@/components/help/HelpWidget";

Add <HelpWidget /> after the </main> closing tag but still inside the outer div. Do NOT render it on the onboarding page (the onboarding page already introduces the help button in Step 5, and rendering it during onboarding would be premature).

If you used the route group approach in Prompt 2 for the onboarding layout, the HelpWidget should only be in the (main) layout, not the (onboarding) layout. If you used the conditional approach, wrap HelpWidget in the same condition that shows the sidebar.

=== VERIFICATION ===

After all changes:
1. npm run build — should succeed
2. Click the "?" button in bottom-right — chat panel opens
3. Send a message like "where do I set up tracking links?" — get a helpful response pointing to Generate Leads > Campaigns
4. Send "which lesson covers thumbnails?" — get a response mentioning Section 5: Packaging
5. Navigate to another page — chat panel stays open with conversation preserved
6. Close and reopen chat — previous messages still visible
7. The widget should NOT appear on the /member/onboarding page
8. On mobile (narrow viewport), chat panel should go full-width as a bottom sheet
9. Check the ? button doesn't overlap with any existing UI elements
```
