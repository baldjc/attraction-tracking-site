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

export function buildBatchSystemPrompt(opts: {
  avatarProfile: unknown;
  contentThemes: unknown;
  niche: string | null;
  city: string | null;
  savedTitles: string[];
  shownTitles?: string[];
  theme: string;
}): string {
  const { avatarProfile, contentThemes, niche, city, savedTitles, shownTitles = [], theme } = opts;
  const currentYear = new Date().getFullYear();

  const keywordKit = niche && KEYWORD_KITS[niche]
    ? KEYWORD_KITS[niche]
        .map((k) => `  - "${k.keyword.replace("[CITY]", city ?? "your city").replace("[YEAR]", String(currentYear))}" (${k.priority})`)
        .join("\n")
    : "  No keyword kit — identify high-performing YouTube keywords for this niche based on search patterns.";

  const allAvoidTitles = [...new Set([...savedTitles, ...shownTitles])];
  const avoidList = allAvoidTitles.length > 0
    ? `⛔ ALREADY SHOWN OR SAVED — DO NOT REPEAT ANY OF THESE. Do not reuse their frameworks, angles, or core concepts either:\n${allAvoidTitles.map((t) => `  - ${t}`).join("\n")}`
    : "No previously shown titles yet — this is the first generation. Pick 5 completely different frameworks from the library above.";

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
- CRITICAL: Do NOT use any title, framework, or angle from the ⛔ ALREADY SHOWN OR SAVED list above. If you have seen it before, it is completely off limits — even rephrased or reworded versions. Violating this is a failure.
- Every idea in a batch must be completely unique — different title, different framework, different angle. Never repeat or rephrase the same idea within a single batch. Before outputting each idea, verify it covers genuinely different content ground than every other idea in this batch AND the avoid list above.
- You have 50+ frameworks available — rotate through them. Each regeneration is an opportunity to explore a completely different corner of the framework library.
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
        "Timing doubt — is this the right time or are you forcing something that should wait another year",
        "Partner misalignment — you think you're on the same page but you haven't actually had the real conversation yet",
        "Permission guilt — you already have a nice home, do you actually need this or are you just being greedy"
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
