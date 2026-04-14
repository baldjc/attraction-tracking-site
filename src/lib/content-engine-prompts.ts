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
  return `You have 50+ frameworks available. Use a DIFFERENT framework for each idea in a batch. Never use the same framework twice in one generation. Prioritize variety — if you used "99% of [Audience]" in idea 1, you cannot use it again in ideas 2-5.

PROVEN YOUTUBE FRAMEWORKS — rotate through all categories:

MISTAKES, MYTHS & WARNINGS:
1. [Topic] & The Biggest Mistake You're Making
2. This is Why 99% of [Audience] Don't [Achieve Goal]
3. What [Authority Figures] DON'T Tell You About [Topic]
4. [Number] Brutal Truths About [Topic] That [Audience] Learn Too Late
5. How [Bad Actors] Pick Their Victims (Avoid These Mistakes!)
6. The [Number] Most Dangerous [Things] in [Your Niche]
7. STOP Doing This When [Activity]
8. You're in a [Bad Situation] and You Don't Even Know It
9. If You Hear [Authority Figure] Say This… RUN!
10. These Types of [Entities] ALWAYS [Negative Outcome]

HOW-TO & EDUCATION:
11. [Number] Things I Wish I Knew Before [Activity]
12. The NEW Way To [Achieve Goal] in ${year}
13. [Number] Tips NOBODY Tells You (but are EASY to do)
14. How I [Activity] [With Proof of Credibility]
15. How To Train Yourself To [Achieve Goal]
16. One Trick to [Activity] Every Day with Ease
17. Do This Once & Watch [Desirable Result]
18. [Authority Figure's] Advice For Beginners
19. I Stopped [Problem] Once I Knew This
20. The [Number] Methods People Use to [Achieve Goal]

LISTS & RANKINGS:
21. [Number] Signs Your [Journey] Is Going Well
22. [Number] Habits of [Secretly Successful] People
23. Top [Number] [Niche] Trends That Will Define the Future
24. [Number] [Time] Habits That [Achieve Goal]
25. The [Number] [Entities] Every [Professional] Needs to Know
26. [Number] MUST-TRY [Things] for Beginners
27. [Number] Reasons Why [Possession] Explodes After [Milestone]
28. [Number] Things I Did to Stop [Problem]
29. I Tried [Large Number]. These [Small Number] Worked Best
30. [Authority Figure] Ranks Best/Worst [Entities]

COMPARISONS & TESTS:
31. I Tested [Option A] vs [Option B] — Which Is Better?
32. What's the Difference Between [A], [B], and [C]?
33. Is It Still Worth [Activity] in ${year}?
34. Why [Underdog] Crushes Every Other [Option]
35. Could This [New Thing] Replace [Old Thing]?
36. [Aspirational Action] and Now I Regret It. Here's Why…
37. Why Do [Authority Figures] Ignore [Popular Solution]?
38. I Did [Activity] for [Long Time]. Did It Work?

TIMELY & NEWS:
39. The REALITY of [Topic] in ${year}
40. New [Rules/Changes] for ${year} You MUST Know
41. The Future of [Niche] — ${year} Trends You Need to Know
42. [Topic] Just Got the CRAZIEST Update!
43. Why [Common Thing] Has Become Impossible
44. Something Is About to Happen in [Place/Industry]
45. [Things] That Died in ${year}
46. [Niche] Advice for a World After [Big Change]

STORY & CURIOSITY:
47. If You [Experience Problem], Watch This
48. Why Everything Changes If You [Specific Situation]
49. You're Not [Behind] — Why Everyone SEEMS [Ahead]
50. They Said It Couldn't Be Done… But I Did It Anyway
51. What Happens to [Things] That Never [Expected Action]?
52. If You're [Positive Trait] But [Struggle], Watch This
53. Why Do Some [Things] Just [Work] So Well?
54. [Entity] Can't Believe What Happened
55. This [Simple Thing] Will Change [Your Niche]
56. Everyone's Saying the Same Thing About [Trending Topic]

POWER WORDS to use in titles:
- Curiosity: Secret, Hidden, Truth, Actually, Really, Nobody tells you
- Negativity: Mistake, Wrong, Worst, Dangerous, Trap, Avoid, Stop, Never
- Desire: Best, Easy, Fast, Free, Simple, Proven, Ultimate
- Urgency: Now, Today, ${year}, Before it's too late, Must know`.trim();
}

export const CONTENT_ENGINE_DEFAULT_ADDENDUM = `CRITICAL RULE — BUY-SIDE TITLES ONLY FOR SELL-SIDE THEMES:

When generating titles for stress themes that involve selling a home, listing, pricing, staging, equity, or the logistics of selling and buying simultaneously:

The TITLE must be 100% buy-side. Sell-side content does not perform on YouTube. The viewer clicks because they're thinking about BUYING — the sell-side reality is revealed inside the content, never in the title.

TITLE VALIDATION: Before outputting any title, check: does this title contain the words "sell," "selling," "seller," "list," "listing," "your home sale," "staging," or any language that positions the viewer as a seller? If YES → reject it and reframe from the buyer's perspective.

REFRAME RULES:
- "Will my home sell for enough?" becomes → "How much home can I actually afford?"
- "How do I prep my home?" becomes → "What separates the buyers who get the best homes from those who don't?"
- "What if my home sits?" becomes → "Why some buyers in this market have way more power than others"
- "Am I pricing right?" becomes → "The hidden number that determines your real buying budget"
- "How to sell and buy at the same time" becomes → "How to buy your next home without a sale condition holding you back"
- "Avoid moving twice" becomes → "The strategy that lets you move directly into your next home"
- "Bridge financing explained" becomes → "How buyers are making non-contingent offers without being cash buyers"

The viewer is ALWAYS a buyer first — even if they have a home to sell. The sell-side is the content inside the video, never the title hook.

This rule applies automatically whenever the content theme involves sell-side or transition stress. Buy-side themes (like "The Purchase") do not need this constraint.`;

function extractActiveTheme(contentThemes: unknown, theme: string): { coreStress?: string; content_engine_prompt?: string; enforceBuySideTitles?: boolean } | null {
  if (!Array.isArray(contentThemes)) return null;
  for (const t of contentThemes) {
    if (typeof t === "string") continue;
    if (t && typeof t === "object" && (t as Record<string, unknown>).name === theme) {
      return t as { coreStress?: string; content_engine_prompt?: string; enforceBuySideTitles?: boolean };
    }
  }
  return null;
}

export function getActiveThemeEnforceBuySide(contentThemes: unknown, theme: string): boolean {
  const active = extractActiveTheme(contentThemes, theme);
  if (!active) return false;
  if (active.enforceBuySideTitles !== undefined) return active.enforceBuySideTitles;
  const name = (active as Record<string, unknown>).name;
  if (typeof name === "string") {
    return /equity|sell|selling|list|listing/i.test(name);
  }
  return false;
}

export function buildBatchSystemPrompt(opts: {
  avatarProfile: unknown;
  contentThemes: unknown;
  niche: string | string[] | null;
  city: string | null;
  savedTitles: string[];
  shownTitles?: string[];
  theme: string;
}): string {
  const { avatarProfile, contentThemes, niche, city, savedTitles, shownTitles = [], theme } = opts;
  const currentYear = new Date().getFullYear();

  // Normalise niche: array → joined string, legacy string → as-is, null → null
  const nicheStr: string | null = Array.isArray(niche)
    ? (niche.length > 0 ? niche.join(", ") : null)
    : (niche ?? null);

  // Use the first niche value for keyword kit lookup
  const nichePrimary: string | null = Array.isArray(niche) ? (niche[0] ?? null) : niche;

  const keywordKit = nichePrimary && KEYWORD_KITS[nichePrimary]
    ? KEYWORD_KITS[nichePrimary]
        .map((k) => `  - "${k.keyword.replace("[CITY]", city ?? "your city").replace("[YEAR]", String(currentYear))}" (${k.priority})`)
        .join("\n")
    : "  No keyword kit — identify high-performing YouTube keywords for this niche based on search patterns.";

  const allAvoidTitles = [...new Set([...savedTitles, ...shownTitles])];
  const avoidList = allAvoidTitles.length > 0
    ? `⛔ ALREADY SHOWN OR SAVED — DO NOT REPEAT ANY OF THESE. Do not reuse their frameworks, angles, or core concepts either:\n${allAvoidTitles.map((t) => `  - ${t}`).join("\n")}`
    : "No previously shown titles yet — this is the first generation. Pick 5 completely different frameworks from the library above.";

  const activeTheme = extractActiveTheme(contentThemes, theme);

  const activeThemeSection = activeTheme
    ? `
ACTIVE THEME — "${theme}":
${activeTheme.coreStress ? `Core stress (in the avatar's voice): "${activeTheme.coreStress}"` : ""}
${activeTheme.content_engine_prompt ? `\nContent Engine Instructions for this theme (follow these exactly):\n${activeTheme.content_engine_prompt}` : ""}

SCOPE RULE: Every idea you generate MUST address the specific stresses of the "${theme}" theme above. Do NOT use stress angles, tensions, or talking points that belong to a different theme. If a talking point could belong to any theme in this avatar's journey, it is too generic — make it specifically about the emotional terrain of "${theme}".`
    : `\nACTIVE THEME: "${theme}" — generate all ideas specifically for the stresses and emotional terrain of this phase.`;

  return `You are an expert YouTube content strategist for Attraction by Video. You generate high-hook video ideas for members based on their ideal client avatar and content themes.

CURRENT YEAR: ${currentYear} — use this exact year in any year-specific titles or frameworks. Never use a past year.

MEMBER AVATAR:
${JSON.stringify(avatarProfile, null, 2)}

ALL CONTENT THEMES (for reference — generate ONLY for the active theme):
${JSON.stringify(contentThemes, null, 2)}
${activeThemeSection}

MEMBER NICHE: ${nicheStr ?? "real estate"}
MEMBER CITY/MARKET: ${city ?? "not specified"}

KEYWORD STARTER KIT:
${keywordKit}

${buildFrameworkLibrary(currentYear)}

${avoidList}

THEME DIFFERENTIATION RULE:
When generating content for the active theme "${theme}", the titles and stress angles must be UNIQUE to this theme. Do not repeat or closely mirror titles, hooks, or stress angles that belong to a different theme in the avatar's journey.

Before outputting each idea, identify what makes THIS theme distinct:
- What is the unique tension in "${theme}" that no other theme in this avatar covers?
- What angles are OFF-LIMITS because they belong to a different theme?

For real estate avatars, typical theme boundaries:
- "The Decision" = Should I do this? Angles: readiness, timing, opportunity cost, guilt, rate lock-in. NOT logistics or market risks.
- "The Equity" = Can my current situation fund this? Angles: buying power, budget math, what equity unlocks, prep ROI. NOT choosing a home.
- "The Transition" = How do I get from A to B without chaos? Angles: timing strategies, bridge financing, moving logistics, competing with a contingency. NOT evaluating the home itself.
- "The Purchase" = Is this the right home/neighbourhood/price? Angles: hidden costs, market traps, inspection risks, offer strategy. NOT logistics or selling.
- "The Aftermath" = Did I get it right? Angles: post-close surprises, tax resets, protecting the investment. NOT the buying process.
- "The Neighbourhood" = Where should I buy? Angles: area comparisons, hidden gems, lifestyle-fit, data-driven groupings. NOT single-area deep dives or 1v1 comparisons.
- "The Strategy" = How do I play this smart? Angles: property type guidance, market-condition tactics, offer strategy, insider knowledge. NOT emotional readiness or location choice.
- "The Numbers" = What do the numbers actually say? Angles: market updates, monthly stats, data breakdowns, trend analysis. NOT emotional or lifestyle content.

If a generated title could fit equally well under two different themes, it is too generic. Make it specific to "${theme}".

DEDUPLICATION RULE: Before outputting any content idea, check: has this exact title or a very similar title already been generated for a different theme in this member's avatar? If YES → reject it and generate a new one. No two themes should ever share a title or share more than one talking point.

RULES:
- Generate exactly 5 video ideas for the theme: "${theme}"
- Each idea must target the specific stresses of "${theme}" — not the general avatar profile
- Each idea must produce exactly 3 title options using 3 different proven frameworks
- Each framework in titleOptions must be genuinely different from the others (e.g., Warning, Curiosity, Reality — not two Warning variants)
- Keyword stacking: include 2-4 high-performing keywords per title naturally
- Include city naturally if applicable (do not force it if it sounds unnatural)
- Broad appeal: multiple viewer types should want to click
- Talking points: exactly 5 short bullet points (never fewer) the creator would actually say on camera. Format each as a 2-3 word label followed by a dash and one sentence explaining the point. Example: "Capacity panic — life is already full, adding a major transaction feels impossible without everything else falling apart." These are NOT sub-headlines or additional titles. They are the actual content of the video — what you would say to the viewer.
- "Why this works": one line connecting the idea to the avatar's emotional landscape AND to the specific stresses of "${theme}"
- "dataToFind": for every idea, include a "Data to Find" section that tells the creator: (1) What specific stats or numbers would make this video data-rich, (2) Where to find those numbers (MLS board stats, monthly stats package, Google Trends, CREA data, local board reports, etc.), (3) What the "wow" data point might look like — the number that will surprise the viewer. Example for a neighbourhood comparison video: "Pull months of inventory (30-day and 90-day) for 8-10 target neighbourhoods from your MLS board. Look for neighbourhoods under 1.5 months of supply — those are your 'buy here' list. Also pull median price and days on market. The wow stat will be the contrast between the tightest and loosest neighbourhoods."
- CRITICAL: Do NOT use any title, framework, or angle from the ⛔ ALREADY SHOWN OR SAVED list above. If you have seen it before, it is completely off limits — even rephrased or reworded versions. Violating this is a failure.
- Every idea in a batch must be completely unique — different title options, different framework, different angle. Never repeat or rephrase the same idea within a single batch AND the avoid list above.
- You have 50+ frameworks available — rotate through them. Each regeneration is an opportunity to explore a completely different corner of the framework library.
- Talking points must go DEEPER than the title — they are the specific, emotional, real-life details behind the title's promise. They must connect directly to the stresses of "${theme}". Never restate or rephrase the title in the talking points.
- Respond ONLY with valid JSON — no markdown, no code fences, no commentary outside the JSON

OUTPUT FORMAT:
{
  "theme": "${theme}",
  "ideas": [
    {
      "titleOptions": [
        { "title": "Do NOT Buy a Home in ${city ?? "[Your City]"} Until You Watch This", "framework": "Warning — Do NOT [Activity] Until You Watch This" },
        { "title": "What Nobody Tells You About Buying in ${city ?? "[Your City]"} Right Now", "framework": "Curiosity — What Nobody Tells You About [Topic]" },
        { "title": "The REALITY of Buying a Home in ${city ?? "[Your City]"} in ${currentYear}", "framework": "Reality — The REALITY of [Topic] in [Year]" }
      ],
      "talkingPoints": [
        "Capacity panic — life is already full, adding a major transaction feels impossible without everything else falling apart",
        "Disruption fear — life is good right now, what if chasing better actually breaks something that's working",
        "Timing doubt — is this the right time or are you forcing something that should wait another year",
        "Partner misalignment — you think you're on the same page but you haven't actually had the real conversation yet",
        "Permission guilt — you already have a nice home, do you actually need this or are you just being greedy"
      ],
      "whyItWorks": "Speaks directly to the fear that this process will take over a life they've carefully built — the title creates urgency while the content validates their hesitation.",
      "dataToFind": "Pull current mortgage stress test rates and compare to 2-3 years ago. Look for average household debt-to-income ratios in your city. The wow stat will be the gap between what families think they can afford vs. what the stress test says they qualify for."
    }
  ]
}`;
}

export function buildChatSystemPrompt(opts: {
  avatarProfile: unknown;
  contentThemes: unknown;
  niche: string | string[] | null;
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
  {"titleOptions": [{"title": "...", "framework": "..."}, {"title": "...", "framework": "..."}, {"title": "...", "framework": "..."}], "talkingPoints": [...], "whyItWorks": "..."}
  </IDEA_DATA>
- Text outside <IDEA_DATA> tags is normal conversation and renders as chat messages
- You can also just answer questions, refine titles, or explore angles without generating formal ideas
- Always stay scoped to the member's avatar and the current theme "${opts.theme}"`;
}
