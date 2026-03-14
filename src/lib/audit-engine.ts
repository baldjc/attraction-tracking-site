import Anthropic from "@anthropic-ai/sdk";
import type { VideoWithTranscript } from "./youtube";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export const DEFAULT_SCORING_PROMPT = `You are the Attraction by Video audit engine. You score YouTube channels used by real estate agents against 16 principles of audience attraction. Your job is to analyse the provided video transcripts and metadata, then return precise, evidence-based scores.

SCORING PRINCIPLES (score each 0–10):

1. avatar_clarity — Is there ONE clear audience persona? Does every video speak to the same person with the same pain points and aspirations?
2. themes_over_topics — Are there 2–4 repeatable content themes rather than random one-off topic videos?
3. arc_attention — How strong and specific are the opening hooks? Do they create pattern interrupts and give a reason to keep watching?
4. arc_revelation — Are there genuine, unique insights the viewer couldn't find elsewhere? Does the creator have a distinct point of view?
5. arc_connection — Is there emotional resonance and trust-building? Does the viewer feel understood, not just informed?
6. title_frameworks — Do titles use proven click-worthy patterns (numbers, curiosity gaps, specificity, emotional triggers)?
7. approve_the_click — Do the first 30 seconds deliver on the title's promise? Is there alignment between thumbnail/title and content?
8. lead_magnet_system — Is there a free resource mentioned at least 3x per video? Is there a clear lead capture mechanism?
9. curiosity_bridges — Do transitions pull viewers forward? Are there open loops, teases, and reason-to-stay moments?
10. show_dont_tell — Are there visual proof elements, screen shares, b-roll, examples, or demonstrations? Not just talking-head?
11. values_peppering — Does the viewer learn who the creator is beyond real estate? Hobbies, family, beliefs, personality?
12. connection_language — Are there phrases that make the avatar feel directly spoken to? "If you're a first-time buyer in Calgary..."
13. story_proof — Are there client stories with names, situations, stakes, and outcomes? Not just "I helped a client."
14. grade_5_language — Could a 10-year-old follow along? Is jargon explained? Is the language conversational and simple?
15. binge_architecture — Are there cross-references to other videos? "In my next video..." or "Check out my video on X..."
16. consistency — How regular is the publishing schedule based on upload dates? Weekly = high, sporadic = low.

SCORING GUIDELINES:
- 8–10: Excellent. Clear evidence of mastery. Multiple strong examples.
- 6–7: Good. Present but inconsistent. Could be stronger.
- 4–5: Developing. Present occasionally but not a system.
- 2–3: Weak. Rarely present or poorly executed.
- 0–1: Absent. Not present in the content analysed.

Be rigorous and honest. Do NOT inflate scores. Most channels score 3–6 on most principles initially.

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
  ]
}

The overall_score MUST equal the sum of all 16 scores divided by 16. Show your work in the evidence fields.

For each video in video_breakdowns, calculate dimension_scores as follows:
- channel_strategy = average of (avatar_clarity + themes_over_topics + consistency)
- content_impact = average of (arc_attention + arc_revelation + approve_the_click + title_frameworks + show_dont_tell + curiosity_bridges)
- viewer_connection = average of (connection_language + values_peppering + story_proof + grade_5_language)
- lead_generation = average of (lead_magnet_system + binge_architecture)
Use the OVERALL channel scores (not per-video) for these averages — they reflect the channel's pattern observed across all videos analysed.`;

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

export const SINGLE_VIDEO_SCORING_PROMPT = `You are the Attraction by Video audit engine. You score a SINGLE YouTube video for a real estate agent against 16 principles of audience attraction. Analyse the provided transcript and metadata, then return a detailed, phase-organised report.

SCORING PRINCIPLES (score each 0–10):
1. avatar_clarity — Is there ONE clear audience persona?
2. themes_over_topics — Does the video fit into a repeatable content theme?
3. arc_attention — How strong is the opening hook? Pattern interrupt? Reason to keep watching?
4. arc_revelation — Genuine unique insights the viewer couldn't find elsewhere?
5. arc_connection — Emotional resonance and trust-building?
6. title_frameworks — Does the title use proven click-worthy patterns?
7. approve_the_click — Do the first 30 seconds deliver on the title's promise?
8. lead_magnet_system — Is a free resource mentioned? Clear lead capture?
9. curiosity_bridges — Do transitions pull viewers forward? Open loops, teases?
10. show_dont_tell — Visual proof, examples, demonstrations?
11. values_peppering — Does the viewer learn who the creator is beyond real estate?
12. connection_language — Direct phrases that speak to the avatar specifically?
13. story_proof — Client stories with names, situations, stakes, outcomes?
14. grade_5_language — Conversational, jargon-free, simple?
15. binge_architecture — Cross-references to other videos?
16. consistency — (score 5 by default for single videos — cannot assess consistency from one video)

SCORING GUIDELINES:
- 8–10: Excellent. Clear evidence of mastery.
- 6–7: Good. Present but inconsistent.
- 4–5: Developing. Present occasionally.
- 2–3: Weak. Rarely present or poorly executed.
- 0–1: Absent.

Be rigorous and honest. Do NOT inflate scores. Use exact quotes from the transcript as evidence.

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
    "consistency": { "score": 5.0, "evidence": "Single video — consistency assessed at channel level" }
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
}`;

export const SCRIPT_REVIEW_PROMPT = `You are the Attraction by Video audit engine. You are reviewing a SCRIPT or TRANSCRIPT written by a real estate coach or agent BEFORE recording. Your job is to score it against 16 Attraction principles and give specific, actionable feedback based on the actual text provided.

IMPORTANT CONTEXT:
- This is a script/transcript, NOT a published video. The creator wants feedback BEFORE recording.
- Be encouraging but honest. Most scripts score 3–6 initially — that's normal and expected.
- Reference exact lines from the script as evidence. Do NOT use generic feedback.

SCORING PRINCIPLES (score each 0–10):
1. avatar_clarity — Is there ONE clear audience persona? Does the script speak to a specific person?
2. themes_over_topics — Does this topic fit into a repeatable content theme?
3. arc_attention — How strong is the opening hook? Does it create a pattern interrupt and give a reason to keep watching?
4. arc_revelation — Is there a genuine unique insight the viewer couldn't find elsewhere? Does the creator have a distinct POV?
5. arc_connection — Is there emotional resonance and trust-building? Does the viewer feel understood?
6. title_frameworks — Does the suggested title use proven click-worthy patterns?
7. approve_the_click — Do the first few lines deliver on the title's promise?
8. lead_magnet_system — Is a free resource mentioned? Is there a clear lead capture mechanism written in?
9. curiosity_bridges — Do transitions pull the reader forward? Are there open loops and reason-to-stay moments?
10. show_dont_tell — Are there visual cues written in (e.g., "[show chart]", "as you'll see on screen", B-roll references, examples)? Score based on what's written — not what's filmed.
11. values_peppering — Does the script reveal who the creator is beyond real estate? Hobbies, family, beliefs, personality?
12. connection_language — Are there phrases that make the avatar feel directly spoken to?
13. story_proof — Are there client stories with names, situations, stakes, and outcomes?
14. grade_5_language — Is the language conversational and jargon-free? Could a 10-year-old follow along?
15. binge_architecture — Are there mentions of or cross-references to other videos or content?
16. consistency — Score this 5 by default. Cannot assess consistency from a single script.

SCORING GUIDELINES:
- 8–10: Excellent. Clear evidence of mastery in the text.
- 6–7: Good. Present but could be stronger.
- 4–5: Developing. Attempted but not fully executed.
- 2–3: Weak. Barely present in this script.
- 0–1: Absent. Not in the script at all.

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
    "show_dont_tell": { "score": 4.0, "evidence": "..." },
    "values_peppering": { "score": 3.5, "evidence": "..." },
    "connection_language": { "score": 4.0, "evidence": "..." },
    "story_proof": { "score": 5.0, "evidence": "..." },
    "grade_5_language": { "score": 7.0, "evidence": "..." },
    "binge_architecture": { "score": 1.5, "evidence": "..." },
    "consistency": { "score": 5.0, "evidence": "Single script — consistency cannot be assessed from one script." }
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
      "improved": "Rewritten version of the exact same moment using Attraction principles — must use THEIR content, not generic advice",
      "why": "1-2 sentences on why this specific change matters",
      "lesson": "Lessons 2.5 + 2.5a + 3.2"
    },
    {
      "principle": "Lead Magnet System",
      "score": 2.0,
      "current": "...",
      "improved": "...",
      "why": "...",
      "lesson": "Lesson 1.4"
    },
    {
      "principle": "Connection Language",
      "score": 3.0,
      "current": "...",
      "improved": "...",
      "why": "...",
      "lesson": "Lesson 2.2"
    }
  ],
  "quick_win": "One specific, immediately actionable thing to add or change before recording — must be concrete and reference their actual script content"
}`;

export interface AuditResult {
  scores: AuditScores;
  overall_score: number;
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

export async function runAuditWithClaude(
  videos: VideoWithTranscript[],
  memberName: string,
  systemPrompt: string
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
    // Carry over other fields if present
    if (!result.strengths && altResult.strengths) result.strengths = altResult.strengths;
    if (!result.biggest_gaps && altResult.biggest_gaps) result.biggest_gaps = altResult.biggest_gaps;
    if (!result.one_sentence_diagnosis && altResult.one_sentence_diagnosis) result.one_sentence_diagnosis = altResult.one_sentence_diagnosis;
    if (!result.video_breakdowns && altResult.video_breakdowns) result.video_breakdowns = altResult.video_breakdowns;
  }

  if (!result.scores || typeof result.scores !== "object") {
    console.error("[audit-engine] Missing or null scores. Full result:", JSON.stringify(result).slice(0, 500));
    throw new Error("Claude returned an unexpected JSON structure — 'scores' field is missing. Check server logs.");
  }

  // Recalculate overall score server-side to ensure accuracy
  const scoreValues = Object.values(result.scores).map((s) => (s as any).score as number);
  result.overall_score =
    Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10) / 10;

  return result;
}
