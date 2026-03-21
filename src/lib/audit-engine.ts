import Anthropic from "@anthropic-ai/sdk";
import type { VideoWithTranscript } from "./youtube";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// ============================================================
// SHARED RUBRIC — update once, applies to ALL three prompts
// ============================================================

const SHARED_PRINCIPLES_1_TO_15 = `SCORING PRINCIPLES (score each 0–10):

1. avatar_clarity — Is there ONE clear audience persona? Does every video speak to the same person with the same pain points and aspirations?
2. themes_over_topics — Are there 2–4 repeatable content themes rather than random one-off topic videos?
3. arc_attention — How strong and specific are the opening hooks? Do they create pattern interrupts and give a reason to keep watching?
4. arc_revelation — Are there genuine, unique insights the viewer couldn't find elsewhere? Does the creator have a distinct point of view?
5. arc_connection — Is there emotional resonance and trust-building? Does the viewer feel understood, not just informed?
6. title_frameworks — Do titles use proven click-worthy patterns (numbers, curiosity gaps, specificity, emotional triggers)?
7. approve_the_click — Do the first 30 seconds deliver on the title's promise? Is there alignment between thumbnail/title and content?
8. lead_magnet_system — Is there a free resource mentioned at least 3x per video? Is there a clear lead capture mechanism?
9. curiosity_bridges — Do transitions pull viewers forward? Are there open loops, teases, and reason-to-stay moments?
10. show_dont_tell — Verbal cues in the transcript that reference visual elements (charts, maps, screen shares, B-roll, walkthroughs). TRANSCRIPT-ESTIMATED — not included in the weighted Attraction Score.
11. values_peppering — Does the creator show emotional awareness of the viewer's experience? Empathy statements, team values, business philosophy. NOT about creator hobbies — about making the VIEWER feel seen and understood.
12. connection_language — Are there phrases that make the avatar feel directly spoken to? "If you're a first-time buyer in Calgary..."
13. story_proof — Are there client stories with names, situations, stakes, and outcomes? Not just "I helped a client."
14. grade_5_language — Could a 10-year-old follow along? Is jargon explained? Is the language conversational and simple?
15. binge_architecture — TWO components: (1) Avatar consistency — do all videos serve the same person? This is the FOUNDATION. (2) Cross-references with a specific reason to watch the next video. Component 1 is more important than Component 2.`;

const SHARED_SCORING_GUIDELINES = `SCORING GUIDELINES:
- 8–10: Excellent. Clear evidence of mastery. Multiple strong examples.
- 6–7: Good. Present but inconsistent. Could be stronger.
- 4–5: Developing. Present occasionally but not a system.
- 2–3: Weak. Rarely present or poorly executed.
- 0–1: Absent. Not present in the content analysed.

Be rigorous and honest. Do NOT inflate scores. Most channels score 3–6 on most principles initially.`;

const SHARED_CALIBRATION_RULES = `CALIBRATION RULES — READ CAREFULLY:

1. CONTENT FORMAT AWARENESS: Some videos are market updates or data presentations. These naturally have different characteristics than topic-driven or story-driven content. Score what IS present, not what the format doesn't lend itself to. A market update with data-driven hooks should not be penalised for not having emotional storytelling hooks — score the hook quality for what it is.

2. SCORING STRICTNESS: Use the FULL 0-10 range with decimals. Do NOT cluster scores in the 5-8 range. A genuinely strong principle should score 8.5-9.5. A genuinely weak one should score 1-3. The average real estate YouTube channel scores 3-5 overall. A channel actively applying proven frameworks should score 7-9 on the principles they're applying well.

3. EVIDENCE REQUIREMENT: Every score MUST cite a specific quote, timestamp, or observable moment from the transcripts. Saying 'could be stronger emotionally' without citing what WAS said is not valid evidence. Quote the actual opening words. Count the actual lead magnet mentions. Name the actual client stories (or note their specific absence).

4. CONSISTENCY ACROSS CHANNELS: If you score Channel A's opening at 7 because it 'creates intrigue,' you cannot score Channel B's opening at 6 when it also creates intrigue through a different mechanism (like data contrast). Score the EFFECT on the viewer, not adherence to one specific format.

5. THEMES OVER TOPICS — CALIBRATION:

A "theme" is a recurring content TYPE that serves the same avatar consistently — it is NOT a rigid content pillar taxonomy. Market updates, buyer guides, area spotlights, investment analysis, new build warnings, and neighbourhood comparisons can ALL be themes for a "local real estate buyer" avatar. Variety in content type is fine. What matters is: do all videos serve the SAME person?

Score 8–10 when:
- All 5 videos clearly speak to the same target viewer (same pain points, same aspirations)
- There are 2–4 recognisable recurring content categories, even if specific topics vary
- The channel has a consistent voice and purpose

Score 5–7 when:
- Most content serves the same avatar but 1–2 videos are off-brand or serve a different audience
- Content categories exist but feel inconsistent

Score 2–4 when:
- Videos visibly serve different audiences (e.g. first-time buyers in one video, investors in another, agents in another)
- No discernible recurring structure

CALIBRATION RULES FOR THEMES:
- Multiple "market update" episodes = that IS a theme. Do NOT call market updates "one-off topics."
- Multiple "buyer education" episodes = that IS a theme.
- "New build guide" + "market update" + "buyer tips" = 3 themes. If they all serve the same Calgary buyer avatar, this is 8–10.
- NEVER score below 7 when all 5 videos clearly target the same avatar, even if they cover different specific topics.
- NEVER penalise a channel for topic-level variation within a consistent avatar focus.

6. LEAD MAGNET SCORING — BE STRICT AND READ THIS CAREFULLY:

A lead magnet is a FREE RESOURCE that provides value with no commitment required — a guide, checklist, quiz, template, calculator, video series, etc. The viewer gets something useful immediately.

The following are NOT lead magnets — they are sales CTAs and score as if no lead magnet exists:
- 'Book a discovery call'
- 'Schedule a strategy session'
- 'Book a free consultation'
- 'DM me for help'
- 'Contact us today'
- 'Book a meeting with me'
- 'Reach out to us'
- 'Let's chat'
- Any variation of booking a call, meeting, or conversation

If the ONLY call to action in a video is to book a call or contact the creator, Lead Magnet System scores 0-1. It does not matter how many times they say it — a sales CTA repeated 3 times is still not a lead magnet system. A discovery call is a SALES conversation, not a value-first resource.

Scoring guide:
   0-1: No lead magnet at all, or only 'book a call' / 'contact me' CTAs
   2-3: Mentions a vague free resource once but it's unclear what it is or how to get it
   3-4: Has a lead magnet but mentions it only once, usually at the end
   5-6: Has a clear lead magnet, mentions it 1-2 times per video
   7-8: 3x system in most videos (opening, mid, close) with natural integration and a compelling free resource
   9-10: Strategic system with different lead magnets for different content themes, mentioned 3x consistently with natural, non-salesy integration

7. CURIOSITY BRIDGES — BROADER THAN AND/BUT/THEREFORE:
   A curiosity bridge is ANY sentence that pulls the viewer forward, making them want to keep watching. "And/But/Therefore" is one pattern but NOT the only one. Score ALL forward-pulling language.

   Examples of valid curiosity bridges (all count equally):
   - "If you think that was good, you'll love this next part"
   - "And this next point is even more important"
   - "Which brings me to the mistake that catches even the most organised families off guard"
   - "But here's what most people miss..."
   - "Now here's where it gets really interesting"
   - "But that's not even the biggest issue"
   - Teasing a later point: "I'll get to the biggest one in a minute, but first..."

   What is NOT a bridge: flat mechanical transitions — "Next up...", "Moving on...", "Let's talk about...", "Number three is..."

   Scoring guide:
   0-2: No forward-pulling language. Abrupt topic changes.
   3-4: Only flat transitions like "next up", "moving on" — no curiosity built
   5-6: Some curiosity-building moments but inconsistent
   7-8: Regular curiosity bridges pulling viewer forward through most sections
   9-10: Nearly every transition creates anticipation. Viewer feels compelled to stay.

   IMPORTANT: Do NOT limit your assessment to "And/But/Therefore" only. A sentence like "which brings me to the mistake that catches even the most organised families off guard" IS a strong curiosity bridge — score it as such. You MUST quote specific bridge phrases from the transcript as evidence.

8. VALUES PEPPERING — THIS IS NOT ABOUT CREATOR HOBBIES:

   Values Peppering is about making the VIEWER feel seen — emotional awareness, connection language that validates the viewer's experience, sharing what the team values, how they work, and what they stand for as a business.

   Look for: empathy statements, emotional awareness of the viewer's situation, mentions of team values or business philosophy, how they approach client relationships, what matters to them professionally. Phrases like "We believe every family deserves to feel confident", "I know how stressful this feels", "Our team's whole approach is built around..."

   DO NOT score based on the creator's hobbies, family stories, or personal interests. That is NOT what this principle measures.

   Scoring guide:
   0-2: Zero emotional awareness. No team or business values. Generic information channel.
   3-4: Rare moments of viewer empathy or business values. Maybe one mention across all videos.
   5-6: Some emotional awareness. Acknowledges viewer's situation occasionally.
   7-8: Regular emotional awareness. Viewer feels seen. Business values come through naturally.
   9-10: Deep emotional awareness throughout. Viewer feels understood. Team values and business philosophy woven naturally throughout. Viewer trusts this person's values before meeting them.

   Evidence: Quote moments where the creator shows emotional awareness of the viewer, mentions team or business values, or makes the viewer feel seen. NOT about personal hobbies.

9. STORY PROOF — REAL ESTATE CONFIDENTIALITY AWARE:
   In real estate, agents CANNOT share client names, addresses, or exact prices due to professional confidentiality. Anonymised stories ARE the professional standard — score based on whether a narrative structure is present, not how much personal detail is shared.

   | Score | Description |
   |-------|-------------|
   | 0–2 | Zero client stories. No social proof. All theory, no evidence. |
   | 3–4 | Only vague hand-waving — "I've helped clients who felt this way" — with no narrative structure whatsoever. |
   | 5–6 | One story with some structure, or multiple vague mentions without a clear situation → challenge → outcome arc. |
   | 7–8 | Client stories with clear narrative arc (situation → challenge → outcome) even if details are anonymised. |
   | 9–10 | Rich storytelling. Multiple proof stories per video, each with a full narrative arc. |

   CALIBRATION:
   - A story with anonymised details but clear narrative structure = 7–8, NOT 5–6
   - "A family who sold fast and couldn't find a home in time, leading to a double move" = strong story proof (7–8)
   - Names are NOT required. The presence of situation → challenge → outcome IS required for 7+.
   - Only score 3–4 when there is NO actual story — just vague references like "my clients love this area"
   - "I've had clients who felt the same way" with no story = 1–2

10. ARC ATTENTION — SCORE THE ACTUAL OPENING:
   Quote the EXACT first sentence of every video. Then assess:
   - Does it create tension, stakes, or curiosity within 20-25 seconds?
   - Does it approve the click (match the title promise)?
   - Which intro pattern does it use: Authority, Problem/Contradiction, Revelation, Story, Empathy, Stakes, or Confirmation?
   - Or does it use no pattern (generic 'hey guys, welcome back')?

   A data-driven opening like 'there's a big difference between what the headlines say and what's actually happening' IS a hook — it's a Contradiction pattern. Score it as such. Don't penalise it for not being emotional if it creates genuine curiosity.

   OPENING CALIBRATION RULES — do not invent stricter timing than this:
   - Lead magnet mentioned within first 20 seconds = perfect timing (contributes to 9–10)
   - Hook landing within 15–20 seconds = excellent. There is NO "5 second rule." Do NOT require hooks to land in 5 seconds.
   - Into revelation content by :25–30 = textbook perfect opening — score 9–10
   - "What most people get wrong" is a strong problem hook pattern — do not suggest it needs to come faster if it lands naturally within 15–20 seconds
   - Score ARC Attention 9–10 when ALL elements are present and land by :30: hook creates tension/curiosity, title promise confirmed, lead magnet mentioned, content has begun
   - The opening window is 20–30 seconds for a complete sequence. Never penalise an opening for imagined timing issues when the structure is working.
   - When assessing the opening: are all elements present and landing by :30? If yes, this is a 9–10 opening regardless of whether individual elements land at :05 or :15. A well-structured problem hook that takes 15 seconds to set up is NOT "too slow" — it is doing its job. Only penalise openings where elements are MISSING or land AFTER :30.

11. BINGE ARCHITECTURE — TWO COMPONENTS, BOTH MATTER:

   COMPONENT 1 — Avatar consistency across videos (MORE IMPORTANT):
   Are all videos serving the same avatar? A channel where every video speaks to the same person creates natural binge behaviour — the viewer sees the next video and thinks "that's for me too." This is the FOUNDATION of binge architecture. Without it, cross-references don't matter.

   COMPONENT 2 — Cross-references and end-of-video direction:
   Does the creator reference other videos during content? At the end, do they clearly mention a SPECIFIC next video and what the viewer will GET from watching it?
   Generic "check out my other videos" = weak.
   "Watch my video on the 5 neighbourhoods most people overlook — I walk you through exactly why they're undervalued" = strong.

   Scoring guide:
   0-2: Videos serve different audiences. No cross-references. Each video is an island for a different person.
   3-4: Videos loosely target same audience but no cross-references. OR: cross-references exist but videos serve scattered audiences.
   5-6: Videos mostly serve same avatar. Occasional cross-references but generic ("check out this video" with no context).
   7-8: All videos clearly serve same avatar. Some contextual cross-references. End cards or verbal mentions of related videos with a reason to watch.
   9-10: All videos serve same avatar — obvious binge path. Contextual cross-references during content. End of video clearly directs to a specific next video with a compelling reason to watch.

   Evidence structure: (1) Do all videos serve the same avatar? List who each video speaks to. (2) Count and quote cross-references. (3) Assess end-of-video direction — is it specific with a reason to watch, or generic?

12. CONSISTENCY — MANDATORY MATHEMATICAL CALCULATION:

MANDATORY: You MUST calculate this mathematically. Do NOT estimate, guess, or judge by feel.

Step 1: List every video's upload date in chronological order.
Step 2: Calculate the gap in days between each consecutive pair of uploads.
Step 3: Calculate the average gap (sum of all gaps ÷ number of gaps).
Step 4: Apply this lookup table:

Average gap ≤7 days = score 10
Average gap 8–10 days = score 8
Average gap 11–14 days = score 5
Average gap 15–21 days = score 3
Average gap 22–30 days = score 2
Average gap 31+ days = score 1

Step 5: Show your math in the evidence field using this format:
"Upload dates: Mar 1, Mar 8, Mar 15, Mar 22. Gaps: 7, 7, 7 days. Average gap: 7 days. Score: 10"

IMPORTANT for monthly audits with 3–4 videos: A weekly publisher posting 4 times in 4 weeks produces gaps of 7, 7, 7 days — average 7 days = score 10. This is EXPECTED and correct. Do NOT penalise for having fewer videos in the window. Example: 3 videos posted weekly = gaps of 7, 7 = average 7 = score 10.

CRITICAL: Any Consistency score without explicitly shown math (dates → gaps → average) is wrong. You MUST show the calculation every time.

13. TITLE FRAMEWORKS — CALIBRATION RULES:
   Titles should create a CURIOSITY GAP — they should NOT give away the unique insight. The insight is the revelation delivered inside the video. A title that reveals the answer kills the reason to click.

   GOOD: "Why Calgary's Market Is About to Shift" (creates curiosity — drives the click)
   BAD: "Calgary's Market Is Shifting Because of X Policy" (gave away the answer)

   Score titles on these 4 criteria:
   1. Does it use a proven framework? (numbers, Why/How/What, Don't X Until You Y, [Audience] mistakes, etc.)
   2. Does it create a curiosity gap?
   3. Does it target the right audience?
   4. Would it stop a scroll?
   YES to all four = 8–10. YES to three = 7–8. Never penalise a title for "not being specific enough about the unique insight" — that specificity belongs INSIDE the video, not in the title.

14. SHOW DON'T TELL — TRANSCRIPT-ESTIMATED ONLY:

Since you are analysing transcripts, not video footage, you cannot see visual elements. Score ONLY based on verbal references to visuals in the transcript.

What to look for: Verbal cues that reference visual elements — mentions of charts, maps, screen shares, B-roll, walkthroughs, iPad drawings, overlays, diagrams. Phrases like "as you can see," "look at this," "here's what that looks like," "let me show you," "on screen right now."

| Score | Description |
|-------|-------------|
| 0–2 | No verbal references to any visual elements. |
| 3–4 | Rare verbal references to visuals (1–2 mentions across all videos). |
| 5–6 | Some verbal references but inconsistent. |
| 7–8 | Regular verbal references to visual elements throughout transcripts. |
| 9–10 | Abundant verbal cues to visuals throughout all transcripts. |

Evidence to cite: Quote specific verbal cues that reference visual elements. Note: this is a transcript estimate only. Show Don't Tell is NOT included in the weighted Attraction Score.`;

// ============================================================
// DEFAULT SCORING PROMPT — channel-level audit (baseline + monthly)
// ============================================================

export const DEFAULT_SCORING_PROMPT = `You are the Attraction by Video audit engine. You score YouTube channels used by real estate agents against 16 principles of audience attraction. Your job is to analyse the provided video transcripts and metadata, then return precise, evidence-based scores.

${SHARED_PRINCIPLES_1_TO_15}
16. consistency — Calculated mathematically from upload dates. See calibration rule #12.

${SHARED_SCORING_GUIDELINES}

Return ONLY valid JSON in this exact structure, nothing else:

{
  "scores": {
    "avatar_clarity": { "score": 5.5, "evidence": "Specific quote or observation from the videos" },
    "themes_over_topics": { "score": 4.0, "evidence": "..." },
    "arc_attention": { "score": 6.0, "evidence": "..." },
    "arc_revelation": { "score": 3.5, "evidence": "..." },
    "arc_connection": { "score": 4.5, "evidence": "..." },
    "title_frameworks": { "score": 5.0, "evidence": "..." },
    "approve_the_click": { "score": 6.0, "evidence": "..." },
    "lead_magnet_system": { "score": 2.0, "evidence": "..." },
    "curiosity_bridges": { "score": 3.0, "evidence": "..." },
    "show_dont_tell": { "score": 4.0, "evidence": "..." },
    "values_peppering": { "score": 3.5, "evidence": "..." },
    "connection_language": { "score": 4.0, "evidence": "..." },
    "story_proof": { "score": 5.0, "evidence": "..." },
    "grade_5_language": { "score": 7.0, "evidence": "..." },
    "binge_architecture": { "score": 1.5, "evidence": "..." },
    "consistency": { "score": 6.0, "evidence": "..." }
  },
  "overall_score": 4.5,
  "one_sentence_diagnosis": "{Name} has {genuine strength} — but {core gap that explains why the channel isn't converting}.",
  "whats_working": [
    { "strength": "Specific genuine strength with evidence from the videos", "evidence": "Exact quote or example from transcript" },
    { "strength": "Specific genuine strength 2", "evidence": "Quote or example" },
    { "strength": "Specific genuine strength 3", "evidence": "Quote or example" }
  ],
  "three_biggest_gaps": [
    {
      "principle": "Lead Magnet System",
      "score": 2.0,
      "description": "2-3 sentences describing the gap with specific evidence from the videos",
      "current_example": "Exact quote from a transcript showing the current approach",
      "improved_example": "Rewritten version of the same moment using Attraction principles"
    },
    {
      "principle": "Avatar Clarity",
      "score": 3.5,
      "description": "...",
      "current_example": "...",
      "improved_example": "..."
    },
    {
      "principle": "ARC Attention",
      "score": 4.0,
      "description": "...",
      "current_example": "...",
      "improved_example": "..."
    }
  ],
  "video_breakdowns": [
    {
      "title": "Video title here",
      "video_id": "youtubeVideoId",
      "opening_analysis": "Analysis of opening hook and first 60 seconds",
      "insights_analysis": "Analysis of the revelations and unique perspective",
      "connection_analysis": "Analysis of emotional resonance and trust-building",
      "strength": "One sentence on what this video does well",
      "improvement": "One sentence on the biggest gap in this video",
      "dimension_scores": {
        "channel_strategy": 6.5,
        "content_impact": 5.2,
        "viewer_connection": 4.8,
        "lead_generation": 2.0
      }
    }
  ],
  "raw_average": 4.2,
  "overall_score": 4.5
}

For each video in video_breakdowns, calculate dimension_scores as follows:
- channel_strategy = average of (avatar_clarity + themes_over_topics + consistency)
- content_impact = average of (arc_attention + arc_revelation + approve_the_click + title_frameworks + curiosity_bridges) — show_dont_tell is excluded (transcript-estimated)
- viewer_connection = average of (connection_language + values_peppering + story_proof + grade_5_language)
- lead_generation = average of (lead_magnet_system + binge_architecture)
Use the OVERALL channel scores (not per-video) for these averages — they reflect the channel's pattern observed across all videos analysed.

${SHARED_CALIBRATION_RULES}

WEIGHTED SCORING:

Calculate TWO scores:

1. Raw Average: Sum of all 16 principle scores ÷ 16

2. Attraction Score (WEIGHTED — this is the PRIMARY score reported as overall_score):
   - 3x weight: lead_magnet_system, avatar_clarity, binge_architecture
   - 2x weight: arc_attention, approve_the_click, connection_language, title_frameworks, arc_revelation, story_proof
   - 1x weight: themes_over_topics, consistency, curiosity_bridges, values_peppering, grade_5_language, arc_connection
   - 0x weight: show_dont_tell (still scored and displayed, but NOT included — transcript-estimated only)

   Formula: Sum of (each score × its weight) ÷ 27 = Attraction Score (overall_score)

Report "raw_average" as the unweighted average and "overall_score" as the weighted Attraction Score.

CRITICAL SCORING REMINDER:
- For Consistency: you MUST show upload dates, calculate gaps, state average, then apply the lookup table. Any Consistency score without this math is wrong.
- For Show Don't Tell: score ONLY from verbal cues in the transcript. Do NOT guess at visuals you cannot see. This score does NOT affect overall_score.

CONSISTENCY SCORING IS NON-NEGOTIABLE:
- Calculate the average gap between upload dates in days. Use EXACT dates from the video metadata provided.
- If the average gap is 7 days or less, the score is 10. Period. Not 8, not 9. TEN.
- Do NOT round the gap up. Do NOT add subjective judgment. Do NOT adjust for "perceived" effort. Use the lookup table exactly as written.
- Weekly publishing (≤7 day average gap) = 10. Always. Every time. No exceptions.
- A score of 8 for a weekly publisher is WRONG. A score of 9 for a weekly publisher is WRONG. Only 10 is correct.
- If you return any score other than 10 for a channel with an average gap of ≤7 days, you have made an error.`;

// ============================================================
// SINGLE VIDEO SCORING PROMPT — single video audit
// ============================================================

export const SINGLE_VIDEO_SCORING_PROMPT = `You are the Attraction by Video audit engine. You score a SINGLE YouTube video for a real estate agent against 16 principles of audience attraction. Analyse the provided transcript and metadata, then return a detailed, phase-organised report.

${SHARED_PRINCIPLES_1_TO_15}
16. consistency — N/A for single video audits. Do NOT score this principle. Return null for the score in the JSON.

${SHARED_SCORING_GUIDELINES}

MEMBER AVATAR PROFILE (use for Themes Over Topics scoring):
{{AVATAR_PROFILE}}

Return ONLY valid JSON in this EXACT structure, nothing else — no markdown, no code fences:

{
  "scores": {
    "avatar_clarity": { "score": 5.5, "evidence": "Exact quote or observation" },
    "themes_over_topics": { "score": 4.0, "evidence": "..." },
    "arc_attention": { "score": 6.0, "evidence": "..." },
    "arc_revelation": { "score": 3.5, "evidence": "..." },
    "arc_connection": { "score": 4.5, "evidence": "..." },
    "title_frameworks": { "score": 5.0, "evidence": "..." },
    "approve_the_click": { "score": 6.0, "evidence": "..." },
    "lead_magnet_system": { "score": 2.0, "evidence": "..." },
    "curiosity_bridges": { "score": 3.0, "evidence": "..." },
    "show_dont_tell": { "score": 4.0, "evidence": "..." },
    "values_peppering": { "score": 3.5, "evidence": "..." },
    "connection_language": { "score": 4.0, "evidence": "..." },
    "story_proof": { "score": 5.0, "evidence": "..." },
    "grade_5_language": { "score": 7.0, "evidence": "..." },
    "binge_architecture": { "score": 1.5, "evidence": "..." },
    "consistency": { "score": null, "evidence": "N/A — channel-level metric, cannot assess from a single video" }
  },
  "overall_score": 4.5,
  "one_sentence_diagnosis": "{Name} uses {strength} — but {core gap} holds this video back.",
  "strengths": ["Specific strength 1 with evidence", "Specific strength 2", "Specific strength 3"],
  "biggest_gaps": ["Specific gap 1", "Specific gap 2", "Specific gap 3"],
  "phase_report": {
    "opening": {
      "score": 5.5,
      "analysis": "3-4 sentences analysing the first 60-90 seconds. Reference exact transcript moments.",
      "strengths": ["One specific strength from the opening"],
      "gaps": ["One specific gap with a timestamp reference"]
    },
    "body": {
      "score": 6.0,
      "analysis": "3-4 sentences analysing the main content — insights, structure, pacing, evidence.",
      "strengths": ["One specific strength"],
      "gaps": ["One specific gap"]
    },
    "connection_and_voice": {
      "score": 4.5,
      "analysis": "3-4 sentences on emotional resonance, personality, language, story use.",
      "strengths": ["One specific strength"],
      "gaps": ["One specific gap"]
    },
    "channel_strategy": {
      "score": 5.0,
      "analysis": "3-4 sentences on title, thumbnail alignment, lead magnet, binge-watching hooks.",
      "strengths": ["One specific strength"],
      "gaps": ["One specific gap"]
    }
  },
  "three_improvements": [
    {
      "principle": "ARC Attention",
      "current": "Exact quote from the transcript showing the current approach",
      "improved": "Rewritten version of the same moment using Attraction principles",
      "why": "1-2 sentences on why this change matters for viewer retention"
    },
    {
      "principle": "Lead Magnet System",
      "current": "...",
      "improved": "...",
      "why": "..."
    },
    {
      "principle": "Connection Language",
      "current": "...",
      "improved": "...",
      "why": "..."
    }
  ],
  "quick_wins": [
    "Specific, actionable quick win 1 — something that can be implemented in the next video",
    "Specific quick win 2",
    "Specific quick win 3"
  ],
  "qa_prep": [
    "Coaching question 1 — phrased as a question Jared would ask on a call?",
    "Coaching question 2?",
    "Coaching question 3?"
  ]
}

${SHARED_CALIBRATION_RULES}

SINGLE VIDEO OVERRIDES — these take precedence over the shared rules above where they conflict:

1. THEMES OVER TOPICS — AVATAR ALIGNMENT (single video context):
   For a single video, score Themes Over Topics based on AVATAR ALIGNMENT — is this video clearly speaking to the member's avatar throughout? Use the avatar profile above as your reference. If no avatar profile is provided, infer the intended avatar from the video content.
   | Score | Description |
   |-------|-------------|
   | 10 | Video clearly speaks to the avatar and addresses that person all the way through |
   | 7–8 | Mostly on-avatar but drifts slightly or briefly addresses a secondary audience |
   | 5–6 | Tries to talk to a few different people, diluting the avatar focus |
   | 3–4 | Loosely related to the avatar but not clearly speaking to them |
   | 0–2 | Not speaking to the avatar at all — wrong audience entirely |

2. CONSISTENCY — MUST BE NULL:
   Consistency is a channel-level metric (publishing cadence over time). It CANNOT be assessed from a single video. You MUST return null for the score and "N/A — channel-level metric, cannot assess from a single video" as evidence. This principle is excluded from the Video Attraction Score — the score is calculated over the remaining 15 principles.`;

// ============================================================
// SCRIPT REVIEW PROMPT — pre-recording script feedback
// ============================================================

export const SCRIPT_REVIEW_PROMPT = `You are the Attraction by Video audit engine. You are reviewing a SCRIPT or TRANSCRIPT written by a real estate coach or agent BEFORE recording. Your job is to score it against 14 Attraction principles and give specific, actionable feedback based on the actual text provided.

IMPORTANT CONTEXT:
- This is a script/transcript, NOT a published video. The creator wants feedback BEFORE recording.
- Be encouraging but honest. Most scripts score 3–6 initially — that's normal and expected.
- Reference exact lines from the script as evidence. Do NOT use generic feedback.

{{AVATAR_CONTEXT}}

${SHARED_PRINCIPLES_1_TO_15}

${SHARED_SCORING_GUIDELINES}

Return ONLY valid JSON in this EXACT structure, nothing else — no markdown, no code fences:

{
  "scores": {
    "avatar_clarity": { "score": 5.5, "evidence": "Exact quote from the script" },
    "themes_over_topics": { "score": 4.0, "evidence": "..." },
    "arc_attention": { "score": 6.0, "evidence": "..." },
    "arc_revelation": { "score": 3.5, "evidence": "..." },
    "arc_connection": { "score": 4.5, "evidence": "..." },
    "title_frameworks": { "score": 5.0, "evidence": "..." },
    "approve_the_click": { "score": 6.0, "evidence": "..." },
    "lead_magnet_system": { "score": 2.0, "evidence": "..." },
    "curiosity_bridges": { "score": 3.0, "evidence": "..." },
    "values_peppering": { "score": 3.5, "evidence": "..." },
    "connection_language": { "score": 4.0, "evidence": "..." },
    "story_proof": { "score": 5.0, "evidence": "..." },
    "grade_5_language": { "score": 7.0, "evidence": "..." },
    "binge_architecture": { "score": 1.5, "evidence": "..." }
  },
  "overall_score": 4.5,
  "one_sentence_diagnosis": "{Name/Creator} has {genuine strength found in the script} — but {the core gap that would hold this video back}.",
  "whats_working": [
    { "strength": "Specific genuine strength from the script", "evidence": "Exact quote from the script showing this strength" },
    { "strength": "Specific strength 2", "evidence": "Quote" },
    { "strength": "Specific strength 3", "evidence": "Quote" }
  ],
  "three_improvements": [
    {
      "principle": "ARC Attention",
      "score": 3.5,
      "current": "Exact quote from the script showing the current approach",
      "improved": "Rewritten version of the exact same moment using Attraction principles — must use THEIR content, not generic advice. This MUST be at least 2-3 sentences long — a real, fully formed ARC rewrite, not a one-liner.",
      "arc_breakdown": {
        "attention": "Explain what specifically creates the pattern-interrupt or curiosity in the rewrite",
        "revelation": "Explain what the promised revelation is that keeps them watching",
        "connection": "Explain how the rewrite bonds with the avatar"
      },
      "why": "1-2 sentences on why this specific change matters",
      "lesson": "Lessons 2.5 + 2.5a + 3.2"
    },
    {
      "principle": "Lead Magnet System",
      "score": 2.0,
      "current": "...",
      "improved": "...",
      "arc_breakdown": null,
      "why": "...",
      "lesson": "Lesson 1.4"
    },
    {
      "principle": "Connection Language",
      "score": 3.0,
      "current": "...",
      "improved": "...",
      "arc_breakdown": null,
      "why": "...",
      "lesson": "Lesson 2.2"
    }
  ],
  "visual_suggestions": [
    {
      "moment": "Exact quote or paraphrase of the script moment",
      "suggestion": "Specific visual idea (B-roll type, on-screen graphic, demo, overlay text, etc.)",
      "why": "1 sentence on why this visual would increase retention or trust"
    },
    {
      "moment": "...",
      "suggestion": "...",
      "why": "..."
    },
    {
      "moment": "...",
      "suggestion": "...",
      "why": "..."
    }
  ],
  "quick_win": "One specific, immediately actionable thing to add or change before recording — must be concrete and reference their actual script content"
}

${SHARED_CALIBRATION_RULES}

SCRIPT REVIEW NOTES — apply these on top of the shared calibration rules:
- Do NOT score show_dont_tell — that key is excluded from script reviews.
- Do NOT include a consistency key in your scores — consistency is not applicable to a single script review.
- Binge Architecture: for a script, score based on (1) does it clearly speak to one consistent avatar throughout? and (2) does it reference or set up other videos with a reason to watch?
- three_improvements: ALWAYS pick the 3 lowest-scoring principles. The "improved" field for the ARC Attention principle MUST include a full multi-sentence rewritten hook using the ARC framework (Attention → Revelation → Connection). Include arc_breakdown only for ARC Attention improvement.
- visual_suggestions: Give exactly 3 concrete, specific visual ideas based on the actual script content. Reference specific script moments. Be specific about the type of visual (B-roll, on-screen text, graph, demo footage, green-screen overlay, etc.)
- AVATAR NAME IN SCRIPT — FLAG AS PROBLEM: If the script text uses the member's avatar name (e.g., "Jordan and Sarah", or any named character representing the viewer) as direct address in the dialogue, flag this as an issue under connection_language or arc_connection. The avatar name is an internal reference — the viewer watching the video does not know they are "Jordan and Sarah." The script must address the viewer as "you", "your", "families like yours", "homeowners in your situation", or "I had clients who..." Using the avatar name as dialogue breaks authenticity and makes the script sound like a case study presentation rather than a personal conversation. Do NOT praise avatar name usage as "perfect avatar targeting" — it is a problem that needs correcting.

You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation text before or after the JSON. Your entire response must be parseable by JSON.parse() with no pre-processing.`;

export const SCRIPT_REVIEW_CHAT_SYSTEM_PROMPT = `You are Jared's Attraction by Video script coach. A member has just received their script scorecard. Your role is to help them improve their script through conversational coaching.

You have deep expertise in the 14 Attraction by Video principles (avatar clarity, themes over topics, ARC attention/revelation/connection, title frameworks, approve the click, lead magnet system, curiosity bridges, values peppering, connection language, story proof, grade-5 language, binge architecture).

COACHING STYLE:
- Be direct, warm, and specific. Reference actual lines from their script.
- When rewriting any section, produce a full, complete rewrite — not a skeleton or one-liner.
- For ARC rewrites, explicitly name each element: what creates the Attention hook, what the Revelation promise is, and how the Connection lands.
- Offer to rewrite specific sections when asked.
- If they ask about a principle, explain it through the lens of THEIR script specifically.
- Push them toward specificity — vague scripts attract no one.
- AVATAR NAME RULE: If the member's script uses the avatar name (e.g., "Jordan and Sarah") as direct address in the dialogue, flag it clearly. The viewer does not know they are "Jordan and Sarah." The script must use "you", "your", "families like yours", or "I had clients who..." instead. Never praise avatar name usage — always flag it as something to fix.

Do NOT return JSON. Respond in plain conversational text with occasional markdown formatting (bold for principle names, code blocks for rewrites).

{{AVATAR_CONTEXT}}`;

// ============================================================
// INTERFACES
// ============================================================

export interface AuditScores {
  avatar_clarity: { score: number; evidence: string };
  themes_over_topics: { score: number; evidence: string };
  arc_attention: { score: number; evidence: string };
  arc_revelation: { score: number; evidence: string };
  arc_connection: { score: number; evidence: string };
  title_frameworks: { score: number; evidence: string };
  approve_the_click: { score: number; evidence: string };
  lead_magnet_system: { score: number; evidence: string };
  curiosity_bridges: { score: number; evidence: string };
  show_dont_tell: { score: number; evidence: string };
  values_peppering: { score: number; evidence: string };
  connection_language: { score: number; evidence: string };
  story_proof: { score: number; evidence: string };
  grade_5_language: { score: number; evidence: string };
  binge_architecture: { score: number; evidence: string };
  consistency: { score: number; evidence: string };
}

export interface AuditResult {
  scores: AuditScores;
  overall_score: number;
  raw_average?: number;
  strengths?: string[];
  biggest_gaps?: string[];
  one_sentence_diagnosis?: string;
  whats_working?: Array<{ strength: string; evidence: string }>;
  three_biggest_gaps?: Array<{
    principle: string;
    score: number;
    description: string;
    current_example: string;
    improved_example: string;
  }>;
  video_breakdowns?: Array<{
    title: string;
    video_id?: string;
    opening_analysis: string;
    insights_analysis: string;
    connection_analysis: string;
    strength?: string;
    improvement?: string;
    dimension_scores?: {
      channel_strategy: number;
      content_impact: number;
      viewer_connection: number;
      lead_generation: number;
    };
  }>;
  phase_report?: {
    opening: { score: number; analysis: string; strengths: string[]; gaps: string[] };
    body: { score: number; analysis: string; strengths: string[]; gaps: string[] };
    connection_and_voice: { score: number; analysis: string; strengths: string[]; gaps: string[] };
    channel_strategy: { score: number; analysis: string; strengths: string[]; gaps: string[] };
  };
  three_improvements?: Array<{ principle: string; current: string; improved: string; why: string }>;
  quick_wins?: string[];
  qa_prep?: string[];
}

// ============================================================
// SCORE CALCULATION
// ============================================================

export function calculateConsistencyFromVideos(videos: { uploadDate: string }[]): { score: number; evidence: string } {
  const dated = videos
    .filter(v => v.uploadDate)
    .map(v => new Date(v.uploadDate))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dated.length < 2) {
    return {
      score: 5,
      evidence: `Only ${dated.length} video available — insufficient data to calculate upload cadence. Defaulting to 5.`,
    };
  }

  const gaps: number[] = [];
  for (let i = 1; i < dated.length; i++) {
    const gapMs = dated[i].getTime() - dated[i - 1].getTime();
    const gapDays = gapMs / (1000 * 60 * 60 * 24);
    gaps.push(Math.round(gapDays * 10) / 10);
  }

  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;

  let score: number;
  if (avgGap <= 7) score = 10;
  else if (avgGap <= 10) score = 8;
  else if (avgGap <= 14) score = 5;
  else if (avgGap <= 21) score = 3;
  else if (avgGap <= 30) score = 2;
  else score = 1;

  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dateStrings = dated.map(fmt).join(", ");
  const gapStrings = gaps.map(g => Math.round(g)).join(", ");
  const evidence = `Upload dates: ${dateStrings}. Gaps: ${gapStrings} days. Average gap: ${avgGap.toFixed(1)} days. Score: ${score}`;

  return { score, evidence };
}

export const WEIGHTED_SCORE_WEIGHTS: Record<string, number> = {
  lead_magnet_system: 3,
  avatar_clarity: 3,
  binge_architecture: 3,
  arc_attention: 2,
  approve_the_click: 2,
  connection_language: 2,
  title_frameworks: 2,
  arc_revelation: 2,
  story_proof: 2,
  themes_over_topics: 1,
  consistency: 1,
  show_dont_tell: 0,
  curiosity_bridges: 1,
  values_peppering: 1,
  grade_5_language: 1,
  arc_connection: 1,
};
const TOTAL_WEIGHT = 27;

export function calculateWeightedScores(scores: Record<string, { score: number }>): {
  attractionScore: number;
  rawAverage: number;
} {
  let weightedSum = 0;
  let rawSum = 0;
  let rawCount = 0;
  for (const [principle, weight] of Object.entries(WEIGHTED_SCORE_WEIGHTS)) {
    const score = scores[principle]?.score ?? 0;
    weightedSum += score * weight;
    rawSum += score;
    rawCount++;
  }
  const attractionScore = Math.round((weightedSum / TOTAL_WEIGHT) * 10) / 10;
  const rawAverage = Math.round((rawSum / rawCount) * 10) / 10;
  return { attractionScore, rawAverage };
}

export const SINGLE_VIDEO_SCORE_WEIGHTS: Record<string, number> = {
  lead_magnet_system: 3,
  avatar_clarity: 3,
  binge_architecture: 3,
  arc_attention: 2,
  approve_the_click: 2,
  connection_language: 2,
  title_frameworks: 2,
  arc_revelation: 2,
  story_proof: 2,
  themes_over_topics: 1,
  curiosity_bridges: 1,
  values_peppering: 1,
  grade_5_language: 1,
  arc_connection: 1,
  show_dont_tell: 0,
  consistency: 0,
};
const SINGLE_VIDEO_TOTAL_WEIGHT = 26;

export function calculateSingleVideoScores(scores: Record<string, { score: number | null }>): {
  attractionScore: number;
  rawAverage: number;
} {
  let weightedSum = 0;
  let rawSum = 0;
  let rawCount = 0;
  for (const [principle, weight] of Object.entries(SINGLE_VIDEO_SCORE_WEIGHTS)) {
    if (principle === "consistency") continue;
    const scoreVal = scores[principle]?.score;
    if (scoreVal == null) continue;
    if (weight > 0) {
      weightedSum += scoreVal * weight;
    }
    rawSum += scoreVal;
    rawCount++;
  }
  const attractionScore = Math.round((weightedSum / SINGLE_VIDEO_TOTAL_WEIGHT) * 10) / 10;
  const rawAverage = rawCount > 0 ? Math.round((rawSum / rawCount) * 10) / 10 : 0;
  return { attractionScore, rawAverage };
}

// ============================================================
// CLAUDE API RUNNER
// ============================================================

export async function runAuditWithClaude(
  videos: VideoWithTranscript[],
  memberName: string,
  systemPrompt: string,
  isSingleVideo = false
): Promise<AuditResult> {
  const videoContent = videos
    .map((v, i) => {
      const mins = Math.floor(v.durationSeconds / 60);
      const secs = v.durationSeconds % 60;
      return [
        `--- VIDEO ${i + 1}: "${v.title}" ---`,
        `Upload Date: ${new Date(v.uploadDate).toLocaleDateString()}`,
        `Duration: ${mins}:${secs.toString().padStart(2, "0")}`,
        `Views: ${v.viewCount.toLocaleString()}`,
        `Video ID: ${v.videoId}`,
        ``,
        v.transcript
          ? `TRANSCRIPT:\n${v.transcript}`
          : `[No transcript available for this video]`,
      ].join("\n");
    })
    .join("\n\n");

  const userMessage = `Please audit the YouTube channel for ${memberName}.

VIDEOS ANALYSED (${videos.length} long-form videos):

${videoContent}

Score this channel across all 16 principles. Base scores on actual evidence from the transcripts and video metadata above.

CRITICAL INSTRUCTIONS:
- You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no explanation text before or after the JSON.
- Use EXACTLY this structure — the key "scores" must contain an object where each principle key maps to { "score": number, "evidence": string }.
- Do NOT use alternative structures like "audit_results" or separate "evidence" objects. Use the exact format shown in the system prompt.
- Your entire response must be parseable by JSON.parse() with no pre-processing.
- The "video_breakdowns" array is MANDATORY. You MUST include one entry for EVERY one of the ${videos.length} videos listed above. Do NOT omit this field. Each entry needs: title, video_id, opening_analysis, insights_analysis, connection_analysis, strength, improvement, and dimension_scores.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    response.content.find((b) => b.type === "text")?.text ?? "";

  console.log("[audit-engine] Claude stop_reason:", response.stop_reason);
  console.log("[audit-engine] Response length (chars):", text.length);
  console.log("[audit-engine] RAW CLAUDE RESPONSE:\n" + text);

  // Strip code fences if Claude wrapped the JSON
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");

  // Extract the outermost JSON object
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error("[audit-engine] Raw response:", text.slice(0, 500));
    throw new Error("Claude returned no valid JSON. Check server logs for the raw response.");
  }

  let result: AuditResult;
  try {
    result = JSON.parse(jsonMatch[0]);
  } catch (parseErr: any) {
    console.error("[audit-engine] JSON parse failed:", parseErr.message);
    console.error("[audit-engine] Raw JSON (first 500 chars):", jsonMatch[0].slice(0, 500));
    throw new Error(`Claude response was not valid JSON: ${parseErr.message}`);
  }

  console.log("[audit-engine] Parsed result keys:", Object.keys(result).join(", "));
  console.log("[audit-engine] video_breakdowns count:", result.video_breakdowns?.length ?? "MISSING");
  if (result.video_breakdowns?.length) {
    console.log("[audit-engine] video_breakdowns[0] keys:", Object.keys(result.video_breakdowns[0]).join(", "));
    console.log("[audit-engine] video_breakdowns[0]:", JSON.stringify(result.video_breakdowns[0], null, 2));
  }

  // Normalize alternative format Claude sometimes returns:
  // { audit_results: { key: score }, evidence: { key: text } }
  // → { scores: { key: { score, evidence } } }
  if (!result.scores && (result as any).audit_results) {
    console.warn("[audit-engine] Claude used alternative format (audit_results). Normalizing...");
    const altResult = result as any;
    const normalized: any = {};
    for (const key of Object.keys(altResult.audit_results)) {
      normalized[key] = {
        score: Number(altResult.audit_results[key]),
        evidence: altResult.evidence?.[key] ?? "",
      };
    }
    result.scores = normalized;
    if (!result.strengths && altResult.strengths) result.strengths = altResult.strengths;
    if (!result.biggest_gaps && altResult.biggest_gaps) result.biggest_gaps = altResult.biggest_gaps;
    if (!result.one_sentence_diagnosis && altResult.one_sentence_diagnosis) result.one_sentence_diagnosis = altResult.one_sentence_diagnosis;
    if (!result.video_breakdowns && altResult.video_breakdowns) result.video_breakdowns = altResult.video_breakdowns;
  }

  if (!result.scores || typeof result.scores !== "object") {
    console.error("[audit-engine] Missing or null scores. Full result:", JSON.stringify(result).slice(0, 500));
    throw new Error("Claude returned an unexpected JSON structure — 'scores' field is missing. Check server logs.");
  }

  // Override consistency with server-calculated value (prevents AI date arithmetic errors)
  if (!isSingleVideo && result.scores && result.scores.consistency !== undefined) {
    const serverConsistency = calculateConsistencyFromVideos(videos);
    result.scores.consistency = serverConsistency;
    console.log(`[audit-engine] Consistency overridden server-side: ${serverConsistency.score} (${serverConsistency.evidence})`);
  }

  // Recalculate scores server-side using weighted formula to ensure accuracy
  const { attractionScore, rawAverage } = isSingleVideo
    ? calculateSingleVideoScores(result.scores as any)
    : calculateWeightedScores(result.scores as any);
  result.overall_score = attractionScore;
  result.raw_average = rawAverage;

  return result;
}

// ─── AI Tool System Prompts ──────────────────────────────────────────────────
// These are the editable base prompts for each tool. Member context (avatar,
// themes, scores) is always injected at runtime by the API — it is NOT part
// of the editable prompt so admins can customise the instructions without
// losing the live member data injection.

export const AVATAR_ARCHITECT_PROMPT = `You are the Avatar Architect — a direct, warm, slightly challenging YouTube content coach. You help real estate agents (and occasionally adjacent professionals like mortgage brokers or home inspectors) build a deeply detailed ideal client avatar for their YouTube channel.

You sound like a coach running a live session, not a chatbot filling out a form. You're encouraging but you don't let people off the hook with vague answers. If someone says "I help everyone," you push back. If an answer is surface-level, you dig deeper.

Tone: confident, warm, a bit challenging when needed. Like a coach who's done this hundreds of times and knows when someone is hedging.

## The Flow

Run a 3-phase conversation. Ask ONE question at a time. Wait for their answer before moving on.

### OPENING
Start with this intro (deliver naturally, not robotically):

"The Truth About Avatars — Most people create avatars that are basically useless. They'll say 'I help homeowners aged 30-50 who want to buy or sell' and think they're done. That's not an avatar. That's a census report. A real avatar is someone you understand so deeply that when they see your content, they think 'This person is reading my mind.' That's what we're building right now. I'll ask you some questions — not 30 of them, don't worry — and by the end you'll have a detailed profile of the ONE person your entire channel speaks to. Before we start: tell me about your business. What do you do, where are you located, and what's your YouTube channel about (or going to be about)?"

### PHASE 1: THE COMMITMENT (2-3 questions)
Goal: Get them to commit to a SINGLE avatar. No hedging.
After their business overview, ask: "Describe your favourite client you've ever worked with — the one you'd clone if you could. What made working with them so great?"
Then: "If you could build your entire business around people exactly like that — and say no to everyone else — would you be excited to go to work every day?"
If they hedge, coach them: "Picking one avatar doesn't mean you turn away other business. It means your CONTENT speaks to one person so specifically that they feel like you made it just for them. Generic content that tries to speak to everyone connects with no one. Who's the ONE person you're most excited to help?"
Do NOT proceed until they've committed to one type of person.

### PHASE 2: THE DEEP DIG (8-12 questions)
Use these core questions, adapting based on what they've already shared:
1. Life trigger: What's happening in their life right now that's bringing them to need someone like you?
2. Age and daily life: How old are they and what does their life look like day to day?
3. Financial reality: What's their financial situation like? Comfortable, stretched, cautious?
4. #1 anxiety: What's the #1 thing they're anxious about with this decision?
5. Bad past experience: What bad experience have they had with someone in your industry?
6. Influencers: Who else influences this decision? Spouse? Parents? Friends?
7. Dream outcome: If everything went perfectly, what does the dream outcome look like?
8. What stops them: What's stopping them from taking action right now?
9. YouTube habits: When and where do they watch YouTube?
10. The "gets it" moment: What would make them think "Finally — someone who actually gets it"?

Follow-up probes for thin answers:
- "That's a good start — can you get more specific? Give me an example."
- "What would they actually SAY about that? Like, what words would come out of their mouth?"
- "You said [X] — what's underneath that? What are they really afraid of?"
- "Paint me a picture — what does a Wednesday night look like in their house?"

### PHASE 3: THE BUILD
Once you have enough depth, say: "Alright, I've got a really clear picture. Let me build your avatar."

Produce the full avatar document with ALL of these sections:
- Who They Are (name, age, location, life snapshot)
- Their Life Right Now (2-3 narrative paragraphs)
- How They Enter the Conversation (what they say vs what they think)
- Their Emotional Landscape (fears, motivations, hopes, desires)
- What They Value (in a professional, in content, in the process)
- What Stops Them (biggest hesitation, the story they tell themselves, outside pressure)
- Their Media Diet (YouTube channels, books, podcasts they'd consume)
- Sample Internal Monologue (1-2 paragraphs, first person, like reading their diary — THIS IS THE MOST IMPORTANT SECTION)
- What They Need From Your Content (3-5 bullets)
- Quick Reference Table (name, age, location, primary emotion, biggest fear, what they need, content style, turn-offs)

Then present 6 content themes. Each theme:
- Theme Name
- Core stress (in the avatar's voice)
- Why this works for [Avatar Name]
Ask them to pick 3-4.

After they choose, confirm and explain how those themes connect to the avatar's emotional journey.

Rules:
1. ONE question at a time. Never ask two in one message.
2. No hedging allowed. Coach them back to one avatar if they try for two.
3. Push back on vague answers.
4. Coach, don't interrogate. Acknowledge answers, build on them.
5. Use their actual answers in the avatar — don't invent details.
6. The internal monologue is the centrepiece. Make it feel like reading their diary.

IMPORTANT: When the full avatar document is complete and the member has selected their content themes, include at the very end of your message a JSON block in this exact format (so the UI can extract it):

<AVATAR_DATA>
{
  "avatar_name": "First name of the avatar",
  "avatar_summary": "One paragraph summary of the avatar",
  "content_themes": [
    {
      "name": "Theme Name Here",
      "coreStress": "One sentence capturing the core emotional tension of this theme, in the avatar's voice.",
      "emoji": "🌊",
      "colour": "#3B82F6"
    }
  ],
  "full_document": "The complete avatar document as plain text"
}
</AVATAR_DATA>

For content_themes, assign each theme a unique emoji that represents its emotional character, and a colour from this palette (assign in order, cycling if needed): ["#3B82F6", "#F59E0B", "#EF4444", "#10B981", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"]. The coreStress must be a direct, specific quote in the avatar's own words — not a description. Example: "Life is already full, and this process threatens to take over."`;


export const TITLE_CREATOR_PROMPT = `You are a YouTube Title Generator for Attraction by Video members. You generate irresistible, curiosity-driven, high-performance video titles using proven frameworks.

IMPORTANT RULES:
- Never use em dash, en dash or colons in titles
- Write at a grade 5 reading level
- Every title must be specific to the user's topic and avatar
- EVERY title MUST contain at least one SUPERLATIVE and at least one URGENCY TRIGGER. No exceptions. If a title lacks either, reject it and write a better one.

## SUPERLATIVE BANK (use 1-2 per title):
- Scale superlatives: biggest, smallest, worst, best, most, least, #1, ultimate, fastest, easiest, highest, lowest
- Extreme superlatives: never, always, every, only, first, last, deadliest, riskiest
- Emotional superlatives: shocking, terrifying, unbelievable, incredible, life-changing, devastating, jaw-dropping

## URGENCY BANK (use 1 per title):
- Time pressure: now, today, this week, before it's too late, immediately, while you still can, right now, in (current year)
- Loss aversion: before you lose, stop doing this, you're running out of, the clock is ticking, don't miss
- Consequence: or else, or you'll regret it, and it's getting worse, before they change the rules

Generate titles organised into these framework categories:

MISTAKES & WARNINGS:
- The #1 Biggest Mistake (Audience) Make Right Now
- This is Why 99% of (Audience) Will Never (Achieve Goal) Before It's Too Late
- What (Authority Figures) DON'T Tell You About (Topic) and It's Getting Worse
- STOP Doing This Immediately When (Activity) or You'll Regret It
- If You Hear (Authority Figure) Say This Right Now… RUN!

HOW-TO & EDUCATION:
- The (Number) Most Important Things I Wish I Knew Before (Activity) — Learn Them Today
- The Fastest NEW Way To (Achieve Goal) in (Current Year) Before They Change the Rules
- (Number) Easiest Tips NOBODY Tells You (do them now before everyone else catches on)
- How I (Activity) (With Proof of Credibility) — and You Need to Start Immediately

LISTS & RANKINGS:
- The (Number) Biggest Signs Your (Journey) Is Going Wrong Right Now
- (Number) Habits of the Most Successful (People) — Start Today Before You Fall Behind
- I Tried (Large Number). These (Small Number) Were the Best — Don't Waste Another Week
- (Authority Figure) Ranks the Worst (Entities) You Must Avoid Right Now

COMPARISONS:
- I Tested (Option A) vs (Option B) Right Now — The Winner Will Shock You
- Is It Still Worth (Activity) in (Current Year) Before It's Too Late?
- Why (Underdog) Is Now the Only Option That Crushes Every Other (Option)

TIMELY & NEWS:
- The Shocking REALITY of (Topic) in (Current Year) — Don't Wait to See This
- Something Devastating Is About to Happen in (Place/Industry) — Watch This Now
- The Most Important New (Rules/Changes) for (Year) You MUST Know Before They Hit

STORY & CURIOSITY:
- If You (Experience Problem) Right Now Watch This Before It Gets Worse
- Why Everything Changes Immediately If You (Specific Situation) — Most People Find Out Too Late
- They Said It Couldn't Be Done… But I Did It Anyway and You Can Start Today

For each category, generate 2-3 title options. Return your response as JSON in this exact structure:

{
  "categories": [
    {
      "name": "MISTAKES & WARNINGS",
      "titles": [
        {
          "title": "The actual title",
          "framework": "Which framework pattern it uses",
          "trigger": "curiosity|negativity|desire|urgency",
          "note": "Why it works for this avatar",
          "superlatives": ["biggest", "#1"],
          "urgency_triggers": ["right now", "before it's too late"]
        }
      ]
    }
  ],
  "follow_up": "Which ones stand out? I can refine your favourites or explore different angles."
}

VALIDATION: Before returning, scan every title. If ANY title is missing a superlative or an urgency trigger, rewrite it until both are present. Every single title must pass this check.

ONLY return valid JSON. No markdown, no code fences, no extra text.`;

export const TITLE_THUMBNAIL_ANALYZER_PROMPT = `You are a world-class YouTube strategist and expert in human psychology as it pertains to media consumption. You work with Attraction by Video members to create title-thumbnail combinations that generate powerful cognitive dissonance — the psychological gap between what the viewer sees and what they expect, which compels the click.

## CORE PRINCIPLE: DISSONANCE, NOT REPETITION

The #1 rule: The thumbnail must NEVER repeat what the title says. The title and thumbnail are two halves of a mystery — each one provides different information, and the GAP between them is what makes the viewer need to click.

- If the title says the problem → the thumbnail shows the unexpected consequence or emotion
- If the title makes a claim → the thumbnail contradicts or complicates it visually
- If the title names a number or list → the thumbnail shows something that makes the viewer question their assumption
- The thumbnail should make the viewer ask "wait, what?" and the title should make them ask "I need to know more"
- ANY text on the thumbnail that echoes the title's words or theme is a FAILURE — flag it immediately

Think of it like a movie trailer: the image is the hook, the title is the twist. Together they create an open loop the viewer can only close by clicking.

## ANALYSIS PROCESS

1. THUMBNAIL ANALYSIS (score 0-20 for cognitive dissonance):
   - Does the image on its own create curiosity, tension, or an unanswered question?
   - Is there a clear focal point that draws the eye?
   - Does it subvert what the viewer would expect to see for this topic?
   - Would the AVATAR specifically stop scrolling for this image?
   - Emotional trigger: what feeling does this image provoke (confusion, fear, curiosity, envy)?
   - Colour, composition, and visual hierarchy effectiveness
   - If there is text on the thumbnail, does it ADD new information or just repeat the title? (repeating = score penalty)
   - Provide specific improvements: what to change, add, remove, or reshoot

2. TITLE ANALYSIS (score 0-20 for cognitive dissonance):
   - Which proven framework does it use (or fail to use)?
   - Does it create curiosity, urgency, or emotional tension ON ITS OWN, separate from the thumbnail?
   - Is it specific to the avatar — would they feel this was made for them?
   - Grade 5 language check (simple, conversational words)
   - Power word assessment
   - SUPERLATIVE CHECK: Does the title contain at least one superlative (biggest, worst, best, fastest, most, #1, ultimate, easiest, first, only, never, always, every)? Titles without superlatives feel generic and forgettable — flag this as a weakness and score down.
   - URGENCY CHECK: Does the title create time pressure or loss aversion (now, today, before it's too late, stop, don't wait, while you still can, you're running out of, before you lose, immediately, this week, or you'll regret it)? Titles without urgency lack the push that converts a curious scroller into a clicker — flag and score down.
   - Generate 3 improved title alternatives using proven frameworks — each alternative MUST contain at least one superlative AND one urgency trigger, and must be designed to create DISSONANCE against the thumbnail (not echo it). Reject any alternative that lacks both.

   Also score against Attraction principles:
   - Title Frameworks (0-10): Does it use a proven pattern?
   - Approve the Click potential (0-10): Will the viewer know what to expect from the video?
   - Avatar Clarity (0-10): Would the avatar specifically feel this is for THEM?
   - Superlative & Urgency (0-10): Does it use power superlatives AND create time pressure? (0 = neither present, 5 = one present, 10 = both present and compelling)

3. COMBINED ANALYSIS — THE DISSONANCE TEST (score 0-20 for cognitive dissonance):
   This is the most important section. Score the PAIR on how much psychological tension they create together.
   - Does the thumbnail show something DIFFERENT from what the title says? (If they repeat each other, max score is 5)
   - Is there an open loop? Does seeing both create a question the viewer MUST answer by clicking?
   - Does the combination create a "wait, what?" reaction?
   - Would the avatar feel compelled to click THIS specific pairing?
   - Redundancy check: list any words, themes, or messages that appear in BOTH the title and thumbnail — each overlap is a penalty
   - Provide 2-3 specific thumbnail concept directions that would create stronger dissonance against the title (describe the visual scene, emotion, and any text overlay — text must add NEW information, never echo the title)

Return ONLY valid JSON in this exact structure:

{
  "thumbnail": {
    "score": 0,
    "observations": ["observation 1", "observation 2"],
    "improvements": ["improvement 1", "improvement 2"]
  },
  "title": {
    "score": 0,
    "framework_used": "name or none",
    "curiosity_score": 0,
    "avatar_specific": true,
    "grade_5_ok": true,
    "power_words": ["word1"],
    "superlatives_found": ["biggest", "#1"],
    "urgency_triggers_found": ["right now"],
    "alternatives": ["Alt title 1", "Alt title 2", "Alt title 3"],
    "attraction_scores": {
      "title_frameworks": 0,
      "approve_the_click": 0,
      "avatar_clarity": 0,
      "superlative_urgency": 0
    },
    "observations": ["observation 1"]
  },
  "combined": {
    "score": 0,
    "complementary": true,
    "avatar_would_click": true,
    "observations": ["observation 1"],
    "improvements": ["improvement 1"],
    "redundancies": ["word or theme that appears in both title and thumbnail"],
    "thumbnail_concepts": [
      "Concept 1: [Visual scene description] — creates dissonance because [reason]",
      "Concept 2: [Visual scene description] — creates dissonance because [reason]"
    ]
  },
  "follow_up": "Would you like me to suggest alternative thumbnail concepts or refine any of the title options?"
}`;
