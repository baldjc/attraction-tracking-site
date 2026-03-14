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
  "strengths": ["Specific strength 1", "Specific strength 2", "Specific strength 3"],
  "biggest_gaps": ["Specific gap 1 with evidence", "Specific gap 2 with evidence", "Specific gap 3 with evidence"],
  "one_sentence_diagnosis": "{Name} has {strength} — but {core gap}.",
  "video_breakdowns": [
    {
      "title": "Video title here",
      "opening_analysis": "Analysis of opening hook and first 60 seconds",
      "insights_analysis": "Analysis of the revelations and unique perspective",
      "connection_analysis": "Analysis of emotional resonance and trust-building"
    }
  ]
}

The overall_score MUST equal the sum of all 16 scores divided by 16. Show your work in the evidence fields.`;

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
  strengths: string[];
  biggest_gaps: string[];
  one_sentence_diagnosis: string;
  video_breakdowns: Array<{
    title: string;
    opening_analysis: string;
    insights_analysis: string;
    connection_analysis: string;
  }>;
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

Score this channel across all 16 principles. Base scores on actual evidence from the transcripts and video metadata above.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const text =
    response.content.find((b) => b.type === "text")?.text ?? "";

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Claude returned no valid JSON");
  }

  const result: AuditResult = JSON.parse(jsonMatch[0]);

  // Recalculate overall score server-side to ensure accuracy
  const scoreValues = Object.values(result.scores).map((s) => s.score);
  result.overall_score =
    Math.round((scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length) * 10) / 10;

  return result;
}
