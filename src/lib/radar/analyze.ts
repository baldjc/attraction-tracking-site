// ── Radar AI Analysis — Claude Transcript Analyzer ───────────────────────────

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_PROMPT = `You are a YouTube content intelligence analyst specializing in the real estate niche.

Analyze the following video transcript and return a structured JSON object with these exact fields:

{
  "hookType": "stat_shock" | "bold_claim" | "question" | "story_setup" | "fear_loss" | "curiosity_gap" | "authority",
  "hookTypeSecondary": same options or null if no compound hook,
  "openingLengthSeconds": number (seconds from start to first value delivery),
  "dataPointCount": number (total specific numbers/stats used),
  "dataPointExamples": [array of the 3 most impactful data points as strings],
  "proofMechanism": "client_story" | "data_narrative" | "metaphor" | "personal_experience" | "visual_social_proof" | "demonstration",
  "leadMagnetPresent": boolean,
  "leadMagnetPlacements": [array of timestamp strings where lead magnet is mentioned, e.g. "2:30"],
  "videoType": primary type from: "Buyer Education", "Seller Strategy", "Neighbourhood Guide", "Market Update", "Investment & Wealth", "Relocation & Lifestyle", "First-Time Buyer", "Move-Up Buyer", "Luxury", "New Construction", "Interest Rate & Economic", "Myth-Busting", "Behind the Scenes", "Q&A / FAQ", "Value-Focused", "Data-Focused",
  "videoTypeSecondary": [array of up to 2 secondary types from the same list, or empty],
  "valueVsDataRatio": number 0-100 (percentage that is data-driven vs concept/value-driven),
  "titlePattern": "question" | "list" | "data_led" | "curiosity_gap" | "local_keyword" | "how_to" | "myth_bust" | "emotional_amplifier",
  "titleEmotionalAmplifiers": [array from: "ALL_CAPS", "parenthetical", "direct_address", "fear_word", "urgency_word"],
  "thumbnailApproach": "face_text" | "data_graphic" | "before_after" | "map_highlight" | "split_screen" | "reaction_face" (best guess from transcript context),
  "arcScore": number 0-100 (how closely the video follows the ARC Method: Attention hook, Revelation of data/value, Connection/CTA),
  "outlierHypothesis": "2-3 sentence hypothesis on what made this video outperform",
  "keyPhrases": [array of 5 most memorable/quotable phrases from the script],
  "ctaType": "subscribe" | "lead_magnet" | "comment_prompt" | "next_video" | "none"
}

Return ONLY valid JSON, no markdown fences, no explanation.`;

export interface AnalysisResult {
  hookType: string | null;
  hookTypeSecondary: string | null;
  openingLengthSeconds: number | null;
  dataPointCount: number | null;
  dataPointExamples: string[];
  proofMechanism: string | null;
  leadMagnetPresent: boolean;
  leadMagnetPlacements: string[];
  videoType: string | null;
  videoTypeSecondary: string[];
  valueVsDataRatio: number | null;
  titlePattern: string | null;
  titleEmotionalAmplifiers: string[];
  thumbnailApproach: string | null;
  arcScore: number | null;
  outlierHypothesis: string | null;
  keyPhrases: string[];
  ctaType: string | null;
  modelVersion: string;
}

export async function analyzeTranscript(
  videoTitle: string,
  transcript: string
): Promise<AnalysisResult | null> {
  // Truncate very long transcripts to stay within token limits
  const maxChars = 30000;
  const trimmedTranscript =
    transcript.length > maxChars
      ? transcript.slice(0, maxChars) + "\n[... transcript truncated]"
      : transcript;

  const modelId = "claude-sonnet-4-20250514";

  try {
    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Video Title: "${videoTitle}"\n\nTranscript:\n${trimmedTranscript}`,
        },
      ],
      system: ANALYSIS_PROMPT,
    });

    const text =
      response.content[0]?.type === "text" ? response.content[0].text : "";

    // Parse JSON — handle possible markdown fences
    const cleaned = text.replace(/^```json?\s*/, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      hookType: parsed.hookType ?? null,
      hookTypeSecondary: parsed.hookTypeSecondary ?? null,
      openingLengthSeconds: parsed.openingLengthSeconds ?? null,
      dataPointCount: parsed.dataPointCount ?? null,
      dataPointExamples: parsed.dataPointExamples ?? [],
      proofMechanism: parsed.proofMechanism ?? null,
      leadMagnetPresent: parsed.leadMagnetPresent ?? false,
      leadMagnetPlacements: parsed.leadMagnetPlacements ?? [],
      videoType: parsed.videoType ?? null,
      videoTypeSecondary: parsed.videoTypeSecondary ?? [],
      valueVsDataRatio: parsed.valueVsDataRatio ?? null,
      titlePattern: parsed.titlePattern ?? null,
      titleEmotionalAmplifiers: parsed.titleEmotionalAmplifiers ?? [],
      thumbnailApproach: parsed.thumbnailApproach ?? null,
      arcScore: parsed.arcScore ?? null,
      outlierHypothesis: parsed.outlierHypothesis ?? null,
      keyPhrases: parsed.keyPhrases ?? [],
      ctaType: parsed.ctaType ?? null,
      modelVersion: modelId,
    };
  } catch (err) {
    console.error("[radar/analyze] Failed to analyze transcript:", err);
    return null;
  }
}
