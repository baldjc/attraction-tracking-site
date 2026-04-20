/**
 * Drama Video Definition
 *
 * Source: James Dunne + Jared Chamberlain strategy call, 2026-04-20.
 *
 * This module is the single source of truth for what a Drama video is and how
 * it should be packaged (title, thumbnail, hook, structure, end-card, voice).
 * It is injected into the system prompts of the AI tools whenever a video is
 * tagged `dramaMode: true`.
 *
 * Integration points:
 * - Script writer (arc-script-builder route) → DRAMA_DEFINITION_FULL
 * - Title analyzer (title-thumbnail-analyzer route) → DRAMA_TITLE_RULES
 * - Thumbnail analyzer (same route) → DRAMA_THUMBNAIL_RULES
 * - Content planner suggestions → DRAMA_TITLE_RULES
 */

export const DRAMA_WHAT_IT_IS = `
A Drama video is the channel's monthly wide-net — one video per month engineered to pull NEW and CASUAL viewers in through browse and suggested traffic, hold them through the middle, and hand them off at the end to deeper phase/stress content that builds trust and drives leads.

It sits INSIDE one of the stress themes (Market Updates, The Decision, The Equity, The Neighbourhoods, The Purchase) — but its packaging is broader, more emotional, more contrarian, and more curiosity-driven than a Direct video on the same theme.

Strategic job in the three-stage viewer pipeline:
- NEW viewers find it through browse because the packaging reads at a glance.
- CASUAL viewers come back for it because it scratches a "something's going on" itch.
- REGULARS don't need it as much — they're already fed by Direct stress-theme content and Market Updates.

A Drama video is NOT:
- Not entertainment-only drama. Channels that are all drama with no phase/practical content train YouTube to serve them to people who want drama, not people who want a realtor. Views without leads.
- Not sarcasm or city-hating. Negative framing ("I can't believe this...") destroys trust. Drama creates curiosity, not cynicism.
- Not clickbait. The promise in the title must be delivered in the video.
- Not a how-to. If it starts with a step-by-step structure, it's a Direct video, not a Drama.
- Not a market update. Market Updates have their own cadence.
`.trim();

export const DRAMA_EMOTIONAL_TRIGGER = `
Core emotional trigger — the viewer clicks because they want to walk away saying one of these:
- "I knew it."
- "That's the reason."
- "No way."
- "I was right."
- "Man, I was wrong."

Most viewers suspect something is "off" about the market, the process, or the advice they're getting. A Drama video validates or overturns that suspicion. It rewards confirmation bias with real information.
`.trim();

export const DRAMA_TITLE_RULES = `
DRAMA TITLE RULES

Patterns that work:
- Warning / Negative command: "Do NOT Buy a Home in Calgary Until You Watch This"
- Curiosity / Something weird: "Something Strange Is Happening in Calgary's Market"
- Brutal truth: "5 Brutal Truths About Buying a Home in Calgary That Families Learn Too Late"
- What nobody tells you: "What Nobody Tells You About Buying a Home When You Already Own One"
- Contrarian statistic: "99% of Home Buyers in Calgary Are NEVER Told This About Their Budget"
- Urgency without hype: "Prices Falling Fast — Here's What It Actually Means for Buyers"
- List with warning shape: "5 Types of Houses You Should Never Buy in Calgary"

Rules:
1. Lead with the curiosity gap, warning, or contrarian angle — not with the subject matter.
2. Keep it geographically scoped ("in Calgary") so new viewers in the geography self-select in.
3. Use one emotional "trap word": NOT, Never, Strange, Brutal, Falling, Secret, Truth, Warning, Mistake.
4. Avoid how-to phrasing. No "How to," no "Step-by-Step," no "Guide to."
5. Avoid being too specific about sub-audience early. Broad first ("a home in Calgary") → tighter later in the hook/intro.
6. If a proven format is working, reuse it with a different subject. "Do not buy a new home in Calgary until you watch this" → "Do not buy a family home in Calgary until you watch this." Rinse and repeat proven promises.

Titles that FAIL the Drama bar:
- "Calgary Market Update — April 2026" (too utilitarian — that's a Direct/Market Update video)
- "How to Buy a Home in Calgary as a First-Time Buyer" (how-to)
- "Should You Buy Now? My Honest Take" (too soft, no hook)
- "Tips for Moving Up in Calgary Real Estate" (utilitarian)
`.trim();

export const DRAMA_THUMBNAIL_RULES = `
DRAMA THUMBNAIL RULES — The Glance Test (0.5 seconds)

A Drama thumbnail must pass three checks before a viewer reads a single word:
1. Is there an interesting-looking property? Not generic. Eye-catching house, unusual architecture, striking exterior. The property must pop before the text registers.
2. Is Jared clearly identifiable? His face with a strong, matching emotional expression (caution, surprise, concern, intrigue).
3. Is the contrast high? Especially against sky or background. If it blends visually with surrounding thumbnails on a browse row, it fails.

Construction rules:
- Single clear subject (property OR Jared with a single expression — not a cluttered collage).
- Max 3-4 words of text. One short trap word is stronger than a sentence.
- Text must NOT obscure the property. The property should read even if the viewer ignores the text.
- No cleverness for cleverness's sake. If viewers have to think to understand the thumbnail, it fails.
- Emotional read must match the title. Warning title + caution expression. Curiosity title + intrigued/surprised expression.

Failure modes to flag:
- Generic family home (reads as "just another listing video")
- Heavy text that covers the house
- Jared's face small or off to the side
- Low contrast against surrounding browse thumbnails
- Multiple competing messages (property + graph + text + face all fighting for attention)
`.trim();

export const DRAMA_HOOK_RULES = `
DRAMA HOOK / INTRO RULES (first 15-30 seconds)

The hook opens the bridge. It doesn't deliver the payoff yet — it creates tension that justifies watching.

Structure:
1. Open ON the drama, stress, or anxiety. Not on a welcome. Not on a logo. Start where the viewer's suspicion lives: "There's something happening in Calgary's market right now that most agents aren't telling you about."
2. Make a bold claim the viewer wants confirmed or denied: "If you're about to buy a family home in Calgary, there are five mistakes that are costing people $50K+ — and nobody's talking about them."
3. Narrow from broad to specific. The title was broad ("a home in Calgary"). The intro tightens slightly. The body tightens further.
4. Promise the payoff without giving it away: "I'm going to show you exactly what they are, why they matter right now, and how to avoid them."
5. NEVER open with "Hey guys, welcome back to the Chamberlain Group channel." That's a Direct video opener. Drama opens in the middle of the tension.
`.trim();

export const DRAMA_STRUCTURE_RULES = `
DRAMA STRUCTURE RULES — The Bridge

Arc: drama → practicality → handoff

1. Open with big problem / drama / stress / anxiety (hook).
2. Pull into practicality, practicality, practicality, practicality. Each practical point makes the viewer feel safer, more confident, more comfortable with Jared.
3. Close by bridging to deeper content: "All of this means nothing if you don't understand [the next layer]. I've got a full video on that — link below."

The viewer experience: came in for the drama; leaves feeling informed and safer; self-selects for the next video if they're serious. Those who don't stick with the practical middle = filtered out. That's the feature, not a bug. Drama pulls wide, practicality filters for fit.

Retention inside the video (plateau-focused):
- Don't just avoid drops — reinforce the plateaus. Give viewers signals of progress.
- Checklists that get ticked off on-screen.
- "Here's what we're covering: 1, 2, 3, 4, 5" at the start, with visual progress.
- Tease information coming later ("I'll show you the biggest one at the end").
- Section breaks / chapter cards so viewers feel forward motion.
`.trim();

export const DRAMA_END_RULES = `
DRAMA END / CTA RULES — The Handoff

The drama video's final job is to route high-intent viewers to the next video and into the lead funnel.

- Point to a WATCH-TIME MAGNET, not a random related video. The next video should be one YouTube already sees as a "people stick to it" video. High AVD on the receiving video signals back to YouTube that the drama video is a valuable traffic source, which earns more suggested impressions for the drama video.
- Make the bridge SPECIFIC. Not "check out my other videos." Instead: "Now that you know what NOT to do, here's the video that shows you exactly how to do it right → [specific title]."
- Include a lead magnet CTA tied to the STRESS THEME the drama video lives inside. If the drama was on The Equity, the lead magnet should be an Equity-side guide (e.g., "6 Biggest Mistakes When Moving Up to a New Home").
`.trim();

export const DRAMA_VOICE_RULES = `
DRAMA VOICE RULES — On-brand for Chamberlain Group

Drama must stay on-brand or it undermines trust:
- Confident, not hyped. No "You won't BELIEVE what's happening!"
- Data-backed, not dramatic for its own sake. "Prices are falling fast" only works if the data supports it.
- Contrarian when TRUE, not contrarian as a stunt. If the mainstream narrative is right, don't fight it just to get clicks.
- Respectful of the viewer's intelligence. Jordan & Sarah don't want to feel tricked or talked down to.
- Canadian spelling, plain language: "neighbourhood," "colour," "centre." No industry jargon.
- Uses the avatar language layer: "selling and buying at the same time," "financial comfort zone," "lifestyle upgrade," "I want to keep you safe through the process," "avoid a costly mistake that's hard to unwind."
`.trim();

export const DRAMA_CADENCE = `
CADENCE: One Drama video per month. Not more.

Why: Drama's strategic purpose is to build constant momentum in browse. You want something always building in browse, tailing off as the next thing builds. If you do drama every week, you become a drama channel (views without leads). If you do drama once a quarter, browse momentum dies and the channel stalls in the niche-only slump.

One per month = monthly heartbeat of new-viewer inflow + three weeks of Direct stress-theme / Market Update content filling in the trust-building middle.
`.trim();

export const DRAMA_DEFINITION_FULL = [
  "# DRAMA VIDEO DEFINITION",
  "",
  "## What a Drama video IS",
  DRAMA_WHAT_IT_IS,
  "",
  "## Core emotional trigger",
  DRAMA_EMOTIONAL_TRIGGER,
  "",
  "## Title rules",
  DRAMA_TITLE_RULES,
  "",
  "## Thumbnail rules",
  DRAMA_THUMBNAIL_RULES,
  "",
  "## Hook rules",
  DRAMA_HOOK_RULES,
  "",
  "## Structure rules",
  DRAMA_STRUCTURE_RULES,
  "",
  "## End / CTA rules",
  DRAMA_END_RULES,
  "",
  "## Voice rules",
  DRAMA_VOICE_RULES,
  "",
  "## Cadence",
  DRAMA_CADENCE,
].join("\n");

export type DramaTool = "script" | "title" | "thumbnail" | "planner";

/**
 * Returns the right slice of the Drama Video Definition for a given AI tool.
 * Call this from the route handler only when ContentPlan.dramaMode === true.
 */
export function getDramaContext(tool: DramaTool): string {
  const preamble = `\n\n---\nTHIS VIDEO IS TAGGED DRAMA MODE. Apply the following Drama Video Definition as HARD RULES. Override any default guidance that conflicts with it.\n---\n\n`;

  switch (tool) {
    case "script":
      return preamble + DRAMA_DEFINITION_FULL;
    case "title":
      return preamble + [
        DRAMA_WHAT_IT_IS,
        "",
        DRAMA_EMOTIONAL_TRIGGER,
        "",
        DRAMA_TITLE_RULES,
        "",
        DRAMA_VOICE_RULES,
      ].join("\n");
    case "thumbnail":
      return preamble + [
        DRAMA_WHAT_IT_IS,
        "",
        DRAMA_EMOTIONAL_TRIGGER,
        "",
        DRAMA_THUMBNAIL_RULES,
      ].join("\n");
    case "planner":
      return preamble + [
        DRAMA_WHAT_IT_IS,
        "",
        DRAMA_TITLE_RULES,
      ].join("\n");
    default:
      return preamble + DRAMA_DEFINITION_FULL;
  }
}
