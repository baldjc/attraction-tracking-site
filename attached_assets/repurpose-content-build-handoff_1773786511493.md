# Build: Repurpose Content AI Tool

Build a new AI tool called "Repurpose Content" under the AI Tools section. This tool takes a video transcript + title and generates a newsletter and LinkedIn article simultaneously. Here is the complete implementation plan with all code. Follow it task by task.

**Spec document for reference:** `docs/superpowers/specs/2026-03-17-repurpose-content-ai-design.md`
**Full plan document for reference:** `docs/superpowers/plans/2026-03-17-repurpose-content-ai.md`

---

## Overview

- One new page at `/member/ai-tools/repurpose-content`
- First-time setup form (4 fields saved to User model)
- Member pastes transcript + title, checks Newsletter and/or LinkedIn Article, hits Generate
- Both tools fire in parallel via separate API routes
- Results display in tabs, editable in-page, auto-saved to DB
- Saved outputs viewable for 30 days
- Inline link library manager for LinkedIn articles

## Files to Create/Modify

| File | Action |
|------|--------|
| `prisma/schema.prisma` | Modify — add RepurposedContent model + User fields |
| `src/app/api/ai-tools/repurpose-profile/route.ts` | Create |
| `src/app/api/ai-tools/repurpose-newsletter/route.ts` | Create |
| `src/app/api/ai-tools/repurpose-linkedin/route.ts` | Create |
| `src/app/api/ai-tools/repurposed-content/route.ts` | Create |
| `src/app/member/ai-tools/repurpose-content/page.tsx` | Create |
| `src/components/ai-tools/AIToolsHub.tsx` | Modify — add tool card |

---

## Task 1: Database Schema Changes

Add this model to `prisma/schema.prisma`:

```prisma
model RepurposedContent {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  videoTitle   String
  toolType     String
  output       Json
  editedOutput String?
  createdAt    DateTime @default(now())

  @@index([userId, toolType, createdAt])
  @@map("repurposed_content")
}
```

Add these fields to the `User` model:

```prisma
repurposeName     String?
repurposeBusiness String?
repurposeListSize String?
repurposeVoice    String?
savedLinks        Json?
repurposedContent RepurposedContent[]
```

Then run: `npx prisma migrate dev --name add_repurpose_content`

---

## Task 2: Repurpose Profile API Route

Create `src/app/api/ai-tools/repurpose-profile/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      repurposeName: true,
      repurposeBusiness: true,
      repurposeListSize: true,
      repurposeVoice: true,
      savedLinks: true,
    },
  });

  return NextResponse.json({
    profile: {
      name: dbUser?.repurposeName ?? "",
      business: dbUser?.repurposeBusiness ?? "",
      listSize: dbUser?.repurposeListSize ?? "",
      voice: dbUser?.repurposeVoice ?? "",
    },
    savedLinks: dbUser?.savedLinks ?? [],
    isSetup: !!(dbUser?.repurposeName && dbUser?.repurposeBusiness && dbUser?.repurposeVoice),
  });
}

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, business, listSize, voice, savedLinks } = await req.json();

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.repurposeName = name;
  if (business !== undefined) data.repurposeBusiness = business;
  if (listSize !== undefined) data.repurposeListSize = listSize;
  if (voice !== undefined) data.repurposeVoice = voice;
  if (savedLinks !== undefined) data.savedLinks = savedLinks;

  await prisma.user.update({
    where: { id: user.id },
    data,
  });

  return NextResponse.json({ saved: true });
}
```

---

## Task 3: Newsletter API Route

Create `src/app/api/ai-tools/repurpose-newsletter/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const VOICE_MAP: Record<string, string> = {
  direct: "Direct, data-grounded, conversational. Not salesy. No fluff. Confident but not arrogant. Speak plainly and respect the reader's intelligence.",
  warm: "Warm, encouraging, and personal. Like a trusted friend sharing advice. Approachable but still credible. Use 'you' and 'we' naturally.",
  authoritative: "Authoritative and expert. Lead with confidence and credibility. Back claims with experience. Professional but not stuffy.",
};

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transcript, title } = await req.json();
  if (!transcript || !title) {
    return NextResponse.json({ error: "Missing transcript or title" }, { status: 400 });
  }
  if (transcript.length > 50000) {
    return NextResponse.json({ error: "Transcript exceeds 50,000 character limit" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      avatarProfile: true,
      repurposeName: true,
      repurposeBusiness: true,
      repurposeListSize: true,
      repurposeVoice: true,
    },
  });

  const memberName = dbUser?.repurposeName || "the author";
  const businessName = dbUser?.repurposeBusiness || "the business";
  const listSize = dbUser?.repurposeListSize || "";
  const voiceStyle = VOICE_MAP[dbUser?.repurposeVoice || "direct"] || VOICE_MAP.direct;
  const avatarText = dbUser?.avatarProfile ? JSON.stringify(dbUser.avatarProfile) : "No avatar saved";

  const systemPrompt = `You are an email copywriter for ${businessName}. When given a video transcript, you write a single email newsletter that goes to the subscriber list${listSize ? ` of ${listSize}+ subscribers` : ""}.

## AUDIENCE
The audience is defined by this avatar profile. These are people who already know and trust ${memberName} from their content. They're not cold — they're warm. Write like ${memberName} is writing to someone who has already watched their videos.

AVATAR:
${avatarText}

## VOICE
${voiceStyle}

## RULES — FOLLOW EXACTLY

Every email must include:
1. A subject line that creates a knowledge gap or leads with a counterintuitive insight
2. A preview text line (separate from the subject, 60-80 characters) that adds intrigue or completes a thought
3. An opening line that names what the reader is already thinking or feeling
4. One central insight from the transcript — not a summary, a revelation
5. Can include one small section of up to 3 bullet points max, but short thoughts only
6. One URL placeholder: [INSERT URL]
7. A P.S. line that functions as a second hook for skimmers
8. Sign off personally as ${memberName}, not a team signature
9. Total length: 150-250 words maximum in the body

## NEVER DO
- Multiple CTAs
- Bullet-heavy formatting that reads like a report
- Generic openings like "Hi [Name], here's your market update"
- Vague subject lines that describe content rather than create curiosity
- Never use dashes of any kind — including em dashes, en dashes, or hyphens used as pauses. Rewrite any sentence that relies on a dash for rhythm or structure on a new line.

## PROCESS
Extract the single most surprising or counterintuitive insight from the transcript. Build the email around that one idea. Everything else in the transcript is supporting context — not content to summarise.

## CANADIAN SPELLING
Always use Canadian spelling (colour, neighbourhood, analyse, etc.)

Return ONLY valid JSON in this exact structure:
{
  "subject_line": "the email subject line",
  "preview_text": "60-80 character preview text",
  "body": "the full email body (150-250 words, no dashes of any kind)",
  "ps_line": "P.S. line as a second hook",
  "sign_off": "${memberName}"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: `Video Title: "${title}"\n\nTranscript:\n${transcript}\n\nWrite the newsletter email as JSON.` }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  try {
    const parsed = JSON.parse(extracted);

    const saved = await prisma.repurposedContent.create({
      data: {
        userId: user.id,
        videoTitle: title,
        toolType: "newsletter",
        output: parsed,
      },
    });

    return NextResponse.json({ result: parsed, id: saved.id });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
```

---

## Task 4: LinkedIn Article API Route

Create `src/app/api/ai-tools/repurpose-linkedin/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

const VOICE_MAP: Record<string, string> = {
  direct: "Direct, data-grounded, conversational. Not salesy. No fluff. Confident but not arrogant. Speak plainly and respect the reader's intelligence.",
  warm: "Warm, encouraging, and personal. Like a trusted friend sharing advice. Approachable but still credible. Use 'you' and 'we' naturally.",
  authoritative: "Authoritative and expert. Lead with confidence and credibility. Back claims with experience. Professional but not stuffy.",
};

export async function POST(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { transcript, title, selectedLinks, oneOffLinks } = await req.json();
  if (!transcript || !title) {
    return NextResponse.json({ error: "Missing transcript or title" }, { status: 400 });
  }
  if (transcript.length > 50000) {
    return NextResponse.json({ error: "Transcript exceeds 50,000 character limit" }, { status: 400 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      avatarProfile: true,
      repurposeName: true,
      repurposeBusiness: true,
      repurposeVoice: true,
    },
  });

  const memberName = dbUser?.repurposeName || "the author";
  const businessName = dbUser?.repurposeBusiness || "the business";
  const voiceStyle = VOICE_MAP[dbUser?.repurposeVoice || "direct"] || VOICE_MAP.direct;
  const avatarText = dbUser?.avatarProfile ? JSON.stringify(dbUser.avatarProfile) : "No avatar saved";

  const allLinks = [
    ...(selectedLinks || []),
    ...(oneOffLinks || []),
  ];
  const linksText = allLinks.length > 0
    ? allLinks.map((l: { label: string; url: string }) => `- ${l.label}: ${l.url}`).join("\n")
    : "No links provided — do not include any clickable links in the article.";

  const systemPrompt = `You are a content strategist transforming video transcripts into engaging LinkedIn articles for ${memberName} and ${businessName}. Your articles educate the member's target audience while positioning ${memberName} as a trusted expert.

ALWAYS use Canadian spelling (colour, neighbourhood, analyse, favour, centre, etc.)

## MEMBER'S AVATAR
${avatarText}

## VOICE
${voiceStyle}

## AVAILABLE LINKS (use maximum 5 in the article, choose strategically)
${linksText}

## ARTICLE STRUCTURE

Use the video title as the article headline. Write 2,500-3,000 words following this structure:

1. **BYLINE** — "${memberName}, ${businessName}"

2. **EXECUTIVE SUMMARY** (250-400 words)
   - Conversational hook acknowledging reader's situation
   - 2-3 data points from the transcript (if available)
   - The uncomfortable truth about their current approach
   - "Here's what we're covering:" bullet list (4 items)
   - Reading time note
   - Bottom line: one sentence summarising the article's promise

3. **THE PROBLEM** (150-200 words)
   - Name the problem with a compelling header
   - 3-4 specific pain points with context from the transcript
   - End with the cost/consequence of inaction

4. **THE NUMBERS** (200-250 words)
   - Present quantitative case for change using data from transcript
   - Add context — what each number really means
   - Show progression: current situation → opportunity cost → better path

5. **WHAT ACTUALLY WORKS** (300-400 words)
   - Introduce the counterintuitive solution from the transcript
   - Explain WHY it works
   - Reference psychological principles where relevant

6. **THE FRAMEWORK** (500-700 words)
   - Step-by-step process extracted from the transcript
   - Each step: what to do, why it matters, common mistake vs better approach
   - Reference relevant links from the available links list where they add value

7. **FAQ** (5-7 questions)
   - Address real objections from the transcript
   - Each answer: acknowledge with personality → honest insight → caveat → action step
   - Include one link to contact/booking page in the most important FAQ answer

8. **RESOURCES** (brief section)
   - List only 2-3 most relevant links from the available links
   - One line description each
   - Do NOT list all available links

9. **CALL TO ACTION**
   - "Here's What To Do Next"
   - This week challenge (one specific action)
   - Professional CTA with link

10. **DISCLAIMER** — Standard disclaimer about individual results varying

## CRITICAL RULES
- Maximum 5 clickable links total in the entire article
- Never fabricate case studies, statistics, or examples not in the transcript
- If data is mentioned in the transcript, cite it. If not available, don't make it up.
- No real estate cliches or hype
- Education over sales, strategy over pressure
- Use parenthetical asides naturally: "(trust me, I've seen this dozens of times)"
- Bold for key concepts, italics for emphasis
- 3-5 sentence paragraphs maximum
- REALTOR® and MLS® properly marked with ® when applicable

Return ONLY valid JSON in this exact structure:
{
  "full_article": "the complete formatted article as a single markdown string with all sections",
  "reading_time": "X minutes"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: `Video Title (use as article headline): "${title}"\n\nTranscript:\n${transcript}\n\nWrite the full LinkedIn article as JSON.` }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const extracted = cleaned.match(/\{[\s\S]*\}/)?.[0] ?? "{}";

  try {
    const parsed = JSON.parse(extracted);

    const saved = await prisma.repurposedContent.create({
      data: {
        userId: user.id,
        videoTitle: title,
        toolType: "linkedin",
        output: parsed,
      },
    });

    return NextResponse.json({ result: parsed, id: saved.id });
  } catch {
    return NextResponse.json({ error: "Failed to parse response", raw: rawText }, { status: 500 });
  }
}
```

---

## Task 5: Saved Outputs API Route

Create `src/app/api/ai-tools/repurposed-content/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSession } from "@/lib/session-utils";
import prisma from "@/lib/prisma";

export async function GET() {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const outputs = await prisma.repurposedContent.findMany({
    where: {
      userId: user.id,
      createdAt: { gte: thirtyDaysAgo },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      videoTitle: true,
      toolType: true,
      output: true,
      editedOutput: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ outputs });
}

export async function PATCH(req: NextRequest) {
  const user = await resolveUserFromSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, editedOutput } = await req.json();
  if (!id || editedOutput === undefined) {
    return NextResponse.json({ error: "Missing id or editedOutput" }, { status: 400 });
  }

  const record = await prisma.repurposedContent.findFirst({
    where: { id, userId: user.id },
  });
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.repurposedContent.update({
    where: { id },
    data: { editedOutput },
  });

  return NextResponse.json({ saved: true });
}
```

---

## Task 6: Frontend Page

Create `src/app/member/ai-tools/repurpose-content/page.tsx` — this is the COMPLETE file, paste it exactly:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";

interface RepurposeProfile {
  name: string;
  business: string;
  listSize: string;
  voice: string;
}

interface SavedLink {
  label: string;
  url: string;
}

interface NewsletterResult {
  subject_line: string;
  preview_text: string;
  body: string;
  ps_line: string;
  sign_off: string;
}

interface LinkedInResult {
  full_article: string;
  reading_time: string;
}

interface PastOutput {
  id: string;
  videoTitle: string;
  toolType: string;
  output: NewsletterResult | LinkedInResult;
  editedOutput: string | null;
  createdAt: string;
}

export default function RepurposeContentPage() {
  const [profile, setProfile] = useState<RepurposeProfile>({ name: "", business: "", listSize: "", voice: "" });
  const [savedLinks, setSavedLinks] = useState<SavedLink[]>([]);
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [generateNewsletter, setGenerateNewsletter] = useState(true);
  const [generateLinkedIn, setGenerateLinkedIn] = useState(true);
  const [selectedLinkIndexes, setSelectedLinkIndexes] = useState<number[]>([]);
  const [oneOffLinks, setOneOffLinks] = useState<SavedLink[]>([]);
  const [showLinkManager, setShowLinkManager] = useState(false);

  const [loading, setLoading] = useState(false);
  const [newsletterResult, setNewsletterResult] = useState<NewsletterResult | null>(null);
  const [newsletterRecordId, setNewsletterRecordId] = useState<string | null>(null);
  const [linkedInResult, setLinkedInResult] = useState<LinkedInResult | null>(null);
  const [linkedInRecordId, setLinkedInRecordId] = useState<string | null>(null);
  const [newsletterError, setNewsletterError] = useState("");
  const [linkedInError, setLinkedInError] = useState("");
  const [activeTab, setActiveTab] = useState<"newsletter" | "linkedin">("newsletter");

  const [editedNewsletter, setEditedNewsletter] = useState("");
  const [editedLinkedIn, setEditedLinkedIn] = useState("");

  const [pastOutputs, setPastOutputs] = useState<PastOutput[]>([]);
  const [showPastOutputs, setShowPastOutputs] = useState(false);
  const [expandedOutputId, setExpandedOutputId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ai-tools/repurpose-profile")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data.profile);
        setSavedLinks(data.savedLinks || []);
        setIsSetup(data.isSetup);
      });
  }, []);

  const loadPastOutputs = useCallback(() => {
    fetch("/api/ai-tools/repurposed-content")
      .then((r) => r.json())
      .then((data) => setPastOutputs(data.outputs || []));
  }, []);

  useEffect(() => { loadPastOutputs(); }, [loadPastOutputs]);

  async function saveProfile() {
    setSavingProfile(true);
    await fetch("/api/ai-tools/repurpose-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profile }),
    });
    setIsSetup(true);
    setSavingProfile(false);
  }

  async function saveLinks(links: SavedLink[]) {
    setSavedLinks(links);
    await fetch("/api/ai-tools/repurpose-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savedLinks: links }),
    });
  }

  async function saveEdit(id: string, editedOutput: string) {
    await fetch("/api/ai-tools/repurposed-content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, editedOutput }),
    });
  }

  async function generate() {
    if (!title.trim() || !transcript.trim()) return;
    if (!generateNewsletter && !generateLinkedIn) return;

    setLoading(true);
    setNewsletterResult(null);
    setLinkedInResult(null);
    setNewsletterError("");
    setLinkedInError("");
    setNewsletterRecordId(null);
    setLinkedInRecordId(null);

    const promises: Promise<void>[] = [];

    if (generateNewsletter) {
      promises.push(
        fetch("/api/ai-tools/repurpose-newsletter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, title }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setNewsletterResult(data.result);
              setNewsletterRecordId(data.id);
              const nl = data.result;
              setEditedNewsletter(
                `Subject: ${nl.subject_line}\nPreview: ${nl.preview_text}\n\n${nl.body}\n\nP.S. ${nl.ps_line}\n\n${nl.sign_off}`
              );
              setActiveTab("newsletter");
            } else {
              setNewsletterError(data.error || "Newsletter generation failed");
            }
          })
          .catch(() => setNewsletterError("Newsletter generation failed"))
      );
    }

    if (generateLinkedIn) {
      const linksForApi = selectedLinkIndexes.map((i) => savedLinks[i]).filter(Boolean);
      promises.push(
        fetch("/api/ai-tools/repurpose-linkedin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript,
            title,
            selectedLinks: linksForApi,
            oneOffLinks: oneOffLinks.filter((l) => l.label && l.url),
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.result) {
              setLinkedInResult(data.result);
              setLinkedInRecordId(data.id);
              setEditedLinkedIn(data.result.full_article);
              if (!generateNewsletter) setActiveTab("linkedin");
            } else {
              setLinkedInError(data.error || "LinkedIn article generation failed");
            }
          })
          .catch(() => setLinkedInError("LinkedIn article generation failed"))
      );
    }

    await Promise.allSettled(promises);
    setLoading(false);
    loadPastOutputs();
  }

  async function retryNewsletter() {
    setNewsletterError("");
    setLoading(true);
    try {
      const res = await fetch("/api/ai-tools/repurpose-newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, title }),
      });
      const data = await res.json();
      if (data.result) {
        setNewsletterResult(data.result);
        setNewsletterRecordId(data.id);
        const nl = data.result;
        setEditedNewsletter(
          `Subject: ${nl.subject_line}\nPreview: ${nl.preview_text}\n\n${nl.body}\n\nP.S. ${nl.ps_line}\n\n${nl.sign_off}`
        );
      } else {
        setNewsletterError(data.error || "Retry failed");
      }
    } catch {
      setNewsletterError("Retry failed");
    }
    setLoading(false);
  }

  async function retryLinkedIn() {
    setLinkedInError("");
    setLoading(true);
    try {
      const linksForApi = selectedLinkIndexes.map((i) => savedLinks[i]).filter(Boolean);
      const res = await fetch("/api/ai-tools/repurpose-linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          title,
          selectedLinks: linksForApi,
          oneOffLinks: oneOffLinks.filter((l) => l.label && l.url),
        }),
      });
      const data = await res.json();
      if (data.result) {
        setLinkedInResult(data.result);
        setLinkedInRecordId(data.id);
        setEditedLinkedIn(data.result.full_article);
      } else {
        setLinkedInError(data.error || "Retry failed");
      }
    } catch {
      setLinkedInError("Retry failed");
    }
    setLoading(false);
  }

  function reset() {
    setTitle("");
    setTranscript("");
    setNewsletterResult(null);
    setLinkedInResult(null);
    setNewsletterError("");
    setLinkedInError("");
    setEditedNewsletter("");
    setEditedLinkedIn("");
    setNewsletterRecordId(null);
    setLinkedInRecordId(null);
    setSelectedLinkIndexes([]);
    setOneOffLinks([]);
  }

  const hasResults = newsletterResult || linkedInResult || newsletterError || linkedInError;
  const transcriptLength = transcript.length;
  const overLimit = transcriptLength > 50000;

  if (isSetup === null) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[#1e2a38]">Repurpose Content</h1>
          <p className="text-[#1e2a38]/60 mt-1">Turn your video transcript into a newsletter and LinkedIn article</p>
        </div>
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6 text-center text-[#1e2a38]/40">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#1e2a38]">Repurpose Content</h1>
        <p className="text-[#1e2a38]/60 mt-1">Turn your video transcript into a newsletter and LinkedIn article</p>
      </div>

      {!isSetup && (
        <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
          <h2 className="font-semibold text-[#1e2a38] mb-4">Quick Setup</h2>
          <p className="text-sm text-[#1e2a38]/60 mb-5">We need a few details to personalise your outputs. You only need to do this once.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1">Your Name</label>
              <input type="text" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} placeholder="e.g. Jared Chamberlain" className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1">Business Name</label>
              <input type="text" value={profile.business} onChange={(e) => setProfile({ ...profile, business: e.target.value })} placeholder="e.g. Chamberlain Real Estate Group" className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1">Email List Size <span className="font-normal text-[#1e2a38]/40">(optional)</span></label>
              <input type="text" value={profile.listSize} onChange={(e) => setProfile({ ...profile, listSize: e.target.value })} placeholder="e.g. 5,000" className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff]" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a38] mb-1">Voice Style</label>
              <select value={profile.voice} onChange={(e) => setProfile({ ...profile, voice: e.target.value })} className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff]">
                <option value="">Select a voice style...</option>
                <option value="direct">Direct & Data-Driven</option>
                <option value="warm">Warm & Conversational</option>
                <option value="authoritative">Authoritative & Educational</option>
              </select>
            </div>
            <button onClick={saveProfile} disabled={savingProfile || !profile.name || !profile.business || !profile.voice} className="w-full bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors">
              {savingProfile ? "Saving..." : "Save & Continue"}
            </button>
          </div>
        </div>
      )}

      {isSetup && !hasResults && (
        <div className="space-y-5">
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Video Title</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Paste your video title here..." className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] transition-colors" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-2">
                  Transcript
                  <span className={`font-normal ml-2 ${overLimit ? "text-red-500" : "text-[#1e2a38]/40"}`}>
                    {transcriptLength.toLocaleString()}/50,000
                  </span>
                </label>
                <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste your video transcript here..." rows={10} className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] placeholder-[#1e2a38]/30 focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1e2a38] mb-2">Generate</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={generateNewsletter} onChange={(e) => setGenerateNewsletter(e.target.checked)} className="w-4 h-4 rounded border-[#1e2a38]/20 text-[#3dc3ff] focus:ring-[#3dc3ff]" />
                    <span className="text-sm text-[#1e2a38]">Newsletter</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={generateLinkedIn} onChange={(e) => setGenerateLinkedIn(e.target.checked)} className="w-4 h-4 rounded border-[#1e2a38]/20 text-[#3dc3ff] focus:ring-[#3dc3ff]" />
                    <span className="text-sm text-[#1e2a38]">LinkedIn Article</span>
                  </label>
                </div>
              </div>

              {generateLinkedIn && (
                <div className="border-t border-[#1e2a38]/10 pt-5">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-[#1e2a38]">Links for Article</label>
                    <button onClick={() => setShowLinkManager(!showLinkManager)} className="text-xs text-[#3dc3ff] hover:underline">
                      {showLinkManager ? "Done" : "Manage Saved Links"}
                    </button>
                  </div>

                  {showLinkManager && (
                    <div className="bg-[#f1f1ef] rounded-xl p-4 mb-4 space-y-2">
                      {savedLinks.map((link, i) => (
                        <div key={i} className="flex gap-2">
                          <input type="text" value={link.label} onChange={(e) => { const updated = [...savedLinks]; updated[i] = { ...updated[i], label: e.target.value }; setSavedLinks(updated); }} placeholder="Label" className="flex-1 border border-[#1e2a38]/20 rounded-lg px-3 py-2 text-sm" />
                          <input type="text" value={link.url} onChange={(e) => { const updated = [...savedLinks]; updated[i] = { ...updated[i], url: e.target.value }; setSavedLinks(updated); }} placeholder="URL" className="flex-1 border border-[#1e2a38]/20 rounded-lg px-3 py-2 text-sm" />
                          <button onClick={() => setSavedLinks(savedLinks.filter((_, j) => j !== i))} className="text-red-500 text-sm px-2">Remove</button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <button onClick={() => setSavedLinks([...savedLinks, { label: "", url: "" }])} className="text-sm text-[#3dc3ff] hover:underline">+ Add Link</button>
                        <button onClick={() => saveLinks(savedLinks.filter((l) => l.label && l.url))} className="text-sm bg-[#3dc3ff] text-white px-3 py-1 rounded-lg hover:bg-[#3dc3ff]/90">Save Links</button>
                      </div>
                    </div>
                  )}

                  {savedLinks.length > 0 && !showLinkManager && (
                    <div className="space-y-1.5 mb-3">
                      {savedLinks.map((link, i) => (
                        <label key={i} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={selectedLinkIndexes.includes(i)} onChange={(e) => setSelectedLinkIndexes(e.target.checked ? [...selectedLinkIndexes, i] : selectedLinkIndexes.filter((idx) => idx !== i))} className="w-4 h-4 rounded border-[#1e2a38]/20 text-[#3dc3ff] focus:ring-[#3dc3ff]" />
                          <span className="text-sm text-[#1e2a38]">{link.label}</span>
                          <span className="text-xs text-[#1e2a38]/40">{link.url}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <div className="mt-3">
                    <p className="text-xs text-[#1e2a38]/40 mb-2">Add links for this article only:</p>
                    {oneOffLinks.map((link, i) => (
                      <div key={i} className="flex gap-2 mb-2">
                        <input type="text" value={link.label} onChange={(e) => { const updated = [...oneOffLinks]; updated[i] = { ...updated[i], label: e.target.value }; setOneOffLinks(updated); }} placeholder="Label" className="flex-1 border border-[#1e2a38]/20 rounded-lg px-3 py-2 text-sm" />
                        <input type="text" value={link.url} onChange={(e) => { const updated = [...oneOffLinks]; updated[i] = { ...updated[i], url: e.target.value }; setOneOffLinks(updated); }} placeholder="URL" className="flex-1 border border-[#1e2a38]/20 rounded-lg px-3 py-2 text-sm" />
                        <button onClick={() => setOneOffLinks(oneOffLinks.filter((_, j) => j !== i))} className="text-red-500 text-sm px-2">Remove</button>
                      </div>
                    ))}
                    <button onClick={() => setOneOffLinks([...oneOffLinks, { label: "", url: "" }])} className="text-xs text-[#3dc3ff] hover:underline">+ Add one-off link</button>
                  </div>
                </div>
              )}

              <button onClick={generate} disabled={loading || !title.trim() || !transcript.trim() || overLimit || (!generateNewsletter && !generateLinkedIn)} className="w-full bg-[#3dc3ff] text-white py-3 rounded-xl font-semibold hover:bg-[#3dc3ff]/90 disabled:opacity-50 transition-colors">
                {loading ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>

          {pastOutputs.length > 0 && (
            <div className="bg-white border border-[#1e2a38]/10 rounded-2xl p-6">
              <button onClick={() => setShowPastOutputs(!showPastOutputs)} className="flex items-center justify-between w-full">
                <h2 className="font-semibold text-[#1e2a38]">Past Outputs ({pastOutputs.length})</h2>
                <span className="text-[#1e2a38]/40 text-sm">{showPastOutputs ? "Hide" : "Show"}</span>
              </button>
              {showPastOutputs && (
                <div className="mt-4 space-y-2">
                  {pastOutputs.map((output) => (
                    <div key={output.id} className="border border-[#1e2a38]/10 rounded-xl">
                      <button onClick={() => setExpandedOutputId(expandedOutputId === output.id ? null : output.id)} className="w-full flex items-center justify-between px-4 py-3 text-left">
                        <div>
                          <span className="text-sm font-medium text-[#1e2a38]">{output.videoTitle}</span>
                          <span className="text-xs text-[#1e2a38]/40 ml-2">
                            {output.toolType === "newsletter" ? "Newsletter" : "LinkedIn"} — {new Date(output.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <span className="text-[#1e2a38]/30 text-xs">{expandedOutputId === output.id ? "Collapse" : "Expand"}</span>
                      </button>
                      {expandedOutputId === output.id && (
                        <div className="px-4 pb-4">
                          <pre className="bg-[#f1f1ef] rounded-lg p-4 text-sm text-[#1e2a38] whitespace-pre-wrap overflow-auto max-h-96">
                            {output.editedOutput || (output.toolType === "newsletter"
                              ? (() => { const nl = output.output as NewsletterResult; return `Subject: ${nl.subject_line}\nPreview: ${nl.preview_text}\n\n${nl.body}\n\nP.S. ${nl.ps_line}\n\n${nl.sign_off}`; })()
                              : (output.output as LinkedInResult).full_article)}
                          </pre>
                          <button onClick={() => { const text = output.editedOutput || (output.toolType === "newsletter" ? (() => { const nl = output.output as NewsletterResult; return `Subject: ${nl.subject_line}\nPreview: ${nl.preview_text}\n\n${nl.body}\n\nP.S. ${nl.ps_line}\n\n${nl.sign_off}`; })() : (output.output as LinkedInResult).full_article); navigator.clipboard.writeText(text); }} className="mt-2 text-xs text-[#3dc3ff] hover:underline">
                            Copy to clipboard
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hasResults && (
        <div className="space-y-5">
          <div className="bg-white border border-[#1e2a38]/10 rounded-2xl overflow-hidden">
            <div className="flex border-b border-[#1e2a38]/10">
              {generateNewsletter && (
                <button onClick={() => setActiveTab("newsletter")} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === "newsletter" ? "text-[#3dc3ff] border-b-2 border-[#3dc3ff]" : "text-[#1e2a38]/40 hover:text-[#1e2a38]/60"}`}>
                  Newsletter
                </button>
              )}
              {generateLinkedIn && (
                <button onClick={() => setActiveTab("linkedin")} className={`flex-1 py-3 text-sm font-semibold transition-colors ${activeTab === "linkedin" ? "text-[#3dc3ff] border-b-2 border-[#3dc3ff]" : "text-[#1e2a38]/40 hover:text-[#1e2a38]/60"}`}>
                  LinkedIn Article {linkedInResult?.reading_time ? `(${linkedInResult.reading_time})` : ""}
                </button>
              )}
            </div>

            <div className="p-6">
              {activeTab === "newsletter" && (
                <>
                  {loading && !newsletterResult && !newsletterError && (
                    <div className="text-center py-12 text-[#1e2a38]/40">Generating newsletter...</div>
                  )}
                  {newsletterError && (
                    <div className="text-center py-12">
                      <p className="text-red-500 text-sm mb-3">{newsletterError}</p>
                      <button onClick={retryNewsletter} disabled={loading} className="text-sm text-[#3dc3ff] hover:underline">Retry Newsletter</button>
                    </div>
                  )}
                  {newsletterResult && (
                    <div className="space-y-4">
                      <textarea value={editedNewsletter} onChange={(e) => setEditedNewsletter(e.target.value)} rows={16} className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y font-mono" />
                      <div className="flex gap-2">
                        <button onClick={() => navigator.clipboard.writeText(editedNewsletter)} className="border border-[#1e2a38]/20 text-[#1e2a38] px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#1e2a38]/5">Copy</button>
                        <button onClick={() => { if (newsletterRecordId) saveEdit(newsletterRecordId, editedNewsletter); }} className="bg-[#3dc3ff] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90">Save Changes</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === "linkedin" && (
                <>
                  {loading && !linkedInResult && !linkedInError && (
                    <div className="text-center py-12 text-[#1e2a38]/40">Generating LinkedIn article...</div>
                  )}
                  {linkedInError && (
                    <div className="text-center py-12">
                      <p className="text-red-500 text-sm mb-3">{linkedInError}</p>
                      <button onClick={retryLinkedIn} disabled={loading} className="text-sm text-[#3dc3ff] hover:underline">Retry LinkedIn Article</button>
                    </div>
                  )}
                  {linkedInResult && (
                    <div className="space-y-4">
                      <textarea value={editedLinkedIn} onChange={(e) => setEditedLinkedIn(e.target.value)} rows={30} className="w-full border border-[#1e2a38]/20 rounded-xl px-4 py-3 text-sm text-[#1e2a38] focus:outline-none focus:border-[#3dc3ff] transition-colors resize-y font-mono" />
                      <div className="flex gap-2">
                        <button onClick={() => navigator.clipboard.writeText(editedLinkedIn)} className="border border-[#1e2a38]/20 text-[#1e2a38] px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#1e2a38]/5">Copy</button>
                        <button onClick={() => { if (linkedInRecordId) saveEdit(linkedInRecordId, editedLinkedIn); }} className="bg-[#3dc3ff] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#3dc3ff]/90">Save Changes</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <button onClick={reset} className="w-full border border-[#1e2a38]/20 text-[#1e2a38] py-3 rounded-xl font-semibold hover:bg-[#1e2a38]/5 transition-colors">
            Generate Another
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## Task 7: Register in AIToolsHub

Modify `src/components/ai-tools/AIToolsHub.tsx` — add this to the `tools` array (after existing tools):

```typescript
{
  href: `${basePath}/repurpose-content`,
  icon: "♻️",
  title: "Repurpose Content",
  description: "Turn your video transcript into a newsletter and LinkedIn article",
  extra: null,
  badge: "blue" as const,
},
```

Match the exact shape of the other objects in the array — if they have additional fields, include those too.

---

## Task 8: Test

1. Run `npm run dev`
2. Navigate to `/member/ai-tools` — verify the Repurpose Content card appears
3. Click into it — should show the setup form
4. Fill in setup (name, business, voice) — should save and show the input form
5. Add 2-3 saved links via "Manage Saved Links"
6. Paste a test transcript + title, check both boxes, select some links, generate
7. Both tabs should populate — newsletter and LinkedIn article
8. Edit the newsletter text, click Save Changes
9. Click "Generate Another", check Past Outputs section — verify edited version appears
