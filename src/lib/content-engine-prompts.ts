export const KEYWORD_KITS: Record<string, Array<{ keyword: string; priority: string }>> = {
  real_estate: [
    { keyword: "do not", priority: "Critical" },
    { keyword: "not buy", priority: "Critical" },
    { keyword: "home in [CITY]", priority: "Critical" },
    { keyword: "should you", priority: "High" },
    { keyword: "can you", priority: "High" },
    { keyword: "in [CITY]", priority: "High" },
    { keyword: "[CITY] real", priority: "High" },
    { keyword: "best neighbourhoods", priority: "High" },
    { keyword: "a home", priority: "Good" },
    { keyword: "buy a", priority: "Good" },
    { keyword: "buying a", priority: "Good" },
    { keyword: "market update", priority: "Good" },
  ],
  financial_planning: [
    { keyword: "to get", priority: "Critical" },
    { keyword: "than you", priority: "Critical" },
    { keyword: "net worth", priority: "Critical" },
    { keyword: "the best", priority: "Critical" },
    { keyword: "should you", priority: "High" },
    { keyword: "how much", priority: "High" },
    { keyword: "by age", priority: "High" },
    { keyword: "in [YEAR]", priority: "High" },
    { keyword: "how to", priority: "High" },
    { keyword: "you must", priority: "High" },
  ],
};

export function buildFrameworkLibrary(year: number): string {
  return `
Proven YouTube Framework Patterns (use hook score in brackets to guide selection):
- "Do NOT [Activity] Until You Watch This" [Hook: 98]
- "99% of [Audience] Regret Doing This" [Hook: 96]
- "The REALITY of [Activity] in ${year}" [Hook: 94]
- "[Number] Signs [Situation]" [Hook: 92]
- "What Nobody Tells You About [Activity]" [Hook: 95]
- "STOP [Activity] Before You Make This Mistake" [Hook: 93]
- "[Entity] Just Shifted — Here's What It Means" [Hook: 90]
- "If You [Situation], Watch This" [Hook: 91]
- "The Biggest Mistake [Audience] Make Right Now" [Hook: 92]
- "99% of [Audience] Don't Know This" [Hook: 94]
- "Is It Still Worth [Activity] in ${year}?" [Hook: 89]
`.trim();
}

export function buildBatchSystemPrompt(opts: {
  avatarProfile: unknown;
  contentThemes: unknown;
  niche: string | null;
  city: string | null;
  savedTitles: string[];
  theme: string;
}): string {
  const { avatarProfile, contentThemes, niche, city, savedTitles, theme } = opts;
  const currentYear = new Date().getFullYear();

  const keywordKit = niche && KEYWORD_KITS[niche]
    ? KEYWORD_KITS[niche]
        .map((k) => `  - "${k.keyword.replace("[CITY]", city ?? "your city").replace("[YEAR]", String(currentYear))}" (${k.priority})`)
        .join("\n")
    : "  No keyword kit — identify high-performing YouTube keywords for this niche based on search patterns.";

  const avoidList = savedTitles.length > 0
    ? `Already saved titles to avoid repeating:\n${savedTitles.map((t) => `  - ${t}`).join("\n")}`
    : "No saved titles yet.";

  return `You are an expert YouTube content strategist for Attraction by Video. You generate high-hook video ideas for members based on their ideal client avatar and content themes.

CURRENT YEAR: ${currentYear} — use this exact year in any year-specific titles or frameworks. Never use a past year.

MEMBER AVATAR:
${JSON.stringify(avatarProfile, null, 2)}

CONTENT THEMES:
${JSON.stringify(contentThemes, null, 2)}

MEMBER NICHE: ${niche ?? "general"}
MEMBER CITY/MARKET: ${city ?? "not specified"}

KEYWORD STARTER KIT:
${keywordKit}

${buildFrameworkLibrary(currentYear)}

${avoidList}

RULES:
- Generate exactly 5 video ideas for the theme: "${theme}"
- Each idea must use a proven framework — pick the best-fit framework for each stress angle, never force-fit
- Keyword stacking: include 2-4 high-performing keywords per title naturally
- Include city naturally if applicable (do not force it if it sounds unnatural)
- Broad appeal: multiple viewer types should want to click
- Talking points: exactly 5 short bullet points (never fewer) the creator would actually say on camera. Format each as a 2-3 word label followed by a dash and one sentence explaining the point. Example: "Capacity panic — life is already full, adding a major transaction feels impossible without everything else falling apart." These are NOT sub-headlines or additional titles. They are the actual content of the video — what you would say to the viewer.
- "Why this works": one line connecting the idea to the avatar's emotional landscape
- Do NOT repeat any already-saved title
- Every idea in a batch must be completely unique — different title, different framework, different angle. Never repeat or rephrase the same idea within a single batch. Before outputting each idea, verify it covers genuinely different content ground than the others.
- Talking points must go DEEPER than the title — they are the specific, emotional, real-life details behind the title's promise. If the title says "5 Signs," the talking points are NOT the 5 signs. They are the raw stresses and situations the viewer is living through. Never restate or rephrase the title in the talking points.
- Respond ONLY with valid JSON — no markdown, no code fences, no commentary outside the JSON

OUTPUT FORMAT:
{
  "theme": "${theme}",
  "ideas": [
    {
      "title": "Do NOT Buy a Home in Calgary Until You Watch This",
      "talkingPoints": [
        "Capacity panic — life is already full, adding a major transaction feels impossible without everything else falling apart",
        "Disruption fear — life is good right now, what if chasing better actually breaks something that's working",
        "Timing doubt — is this the right time or are you forcing something that should wait another year"
      ],
      "framework": "Do NOT [Activity] Until You Watch This",
      "whyItWorks": "Speaks directly to the fear that this process will take over a life they've carefully built — the title creates urgency while the content validates their hesitation."
    }
  ]
}`;
}

export function buildChatSystemPrompt(opts: {
  avatarProfile: unknown;
  contentThemes: unknown;
  niche: string | null;
  city: string | null;
  savedTitles: string[];
  theme: string;
}): string {
  const base = buildBatchSystemPrompt(opts);
  return base + `

CHAT MODE INSTRUCTIONS:
- You are in a conversation with the member, focused on the theme: "${opts.theme}"
- Respond conversationally — acknowledge what they're asking, then generate or refine ideas
- When generating ideas, embed each one in <IDEA_DATA> tags with the same JSON structure as batch output:
  <IDEA_DATA>
  {"title": "...", "talkingPoints": [...], "framework": "...", "whyItWorks": "..."}
  </IDEA_DATA>
- Text outside <IDEA_DATA> tags is normal conversation and renders as chat messages
- You can also just answer questions, refine titles, or explore angles without generating formal ideas
- Always stay scoped to the member's avatar and the current theme`;
}
