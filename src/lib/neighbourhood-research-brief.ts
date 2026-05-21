// Wave 1.5 — Neighbourhood Knowledge Base
// The Research Brief is the crown jewel: a parameterised prompt the member
// copies into their preferred external AI research tool (ChatGPT Deep
// Research / Claude with web search / Perplexity / Manus / etc.). The tool
// produces a long markdown document the member uploads back here, where it's
// parsed into per-neighbourhood profiles. Pure module — safe to import from
// Client Components.

export const NEIGHBOURHOOD_RESEARCH_BRIEF_TEMPLATE = `# NEIGHBOURHOOD DEEP-RESEARCH BRIEF — REAL ESTATE CONTENT

You are a research analyst producing structured neighbourhood profiles for a real estate market expert.
Each profile will be referenced by an AI script-writing tool that produces YouTube videos.
The profiles must be factual, sourced, dated, and consistently structured.

**MARKET:** {{marketName}}
**MLS SOURCE FOR PRICING CONTEXT:** {{mlsSource}}
**NEIGHBOURHOODS TO RESEARCH:**

{{neighbourhoodList}}

---

## YOUR DELIVERABLE

A single markdown document with one profile per neighbourhood, in the order listed above, using the EXACT structure shown below. Total output will be roughly {{estimatedWordCount}} words.

---

## PROFILE STRUCTURE — repeat for each neighbourhood

### [Neighbourhood Name]

**Snapshot**
One paragraph (3-4 sentences maximum). The high-level character. What does living here signal to a buyer? Lead with specifics, not adjectives.

**Demographics** (cite sources + dates)
- Median household income
- Family composition (% with children, % empty nesters, % single)
- Typical professional makeup
- Population
- Age distribution if available

**Housing Stock**
- Predominant housing type (% detached / semi / condo / townhome)
- Typical home size (sqft range)
- Typical bed/bath count
- Year-built range
- Architectural styles if distinctive
- Approximate price tier relative to {{marketName}} (Entry / Mid / Upper / Luxury)

**History & Development**
- When the neighbourhood was developed (decade or specific years)
- Notable historical context
- Any recent or planned major developments

**Location & Geography**
- Position within {{marketName}} (quadrant, distance from downtown)
- Major roads and access points
- Geographic features (rivers, parks, elevation, views)
- Commute times to downtown, airport, major employers

**Schools**
- Elementary catchment schools + reputation
- Middle/high school catchments + reputation
- Private schools nearby
- Notable for catchment-driven buyers? Yes / No

**Transit & Amenities**
- Major transit options (LRT, bus, etc.)
- Major shopping districts
- Recreation facilities, parks
- Healthcare access

**Cultural & Lifestyle**
- Community character (family-oriented? young professional? active retiree?)
- Notable cultural assets, restaurants, events
- Lifestyle appeal points

**Market Positioning**
- Who is the typical buyer for this neighbourhood?
- What's the buyer story (the narrative this neighbourhood sells)?
- What sets it apart from adjacent neighbourhoods?
- Common buyer concerns or trade-offs (e.g., commute, school quality, price-per-sqft, age of homes)

**Recent Developments & Watch Items**
- Major changes in the last 24 months
- Pending changes (zoning, transit, schools, retail)
- Watch items that could affect future value

**Sources**
List 3-7 key sources used for this profile, with URLs where possible.

---

## FORMATTING RULES (strict — the parser depends on these)

1. Use EXACT markdown headings as shown (\`### \` for neighbourhood name, \`**\` for sub-section headings)
2. Lead with sourced facts; avoid marketing adjectives ("vibrant," "charming," "must-see," "hidden gem")
3. Always cite sources with dates ("As of 2024 census..." not "recently...")
4. If a section has no reliable public data, write exactly: \`Limited public data available\` — never invent or speculate
5. Use {{spellingConvention}} spelling throughout
6. Each neighbourhood profile should be 600-1000 words
7. Source only from authoritative outlets: government statistics, official municipal documents, MLS aggregations, recognized news, established real estate publications. Avoid blog posts, realtor listings as primary sources, or speculative content.
8. Distinguish between dated facts and current trends. If something has changed in 2024-2026, note the change.

## NOW PROCEED

Begin with the first neighbourhood listed and produce one complete profile before moving to the next. Do not summarize or skip sections.
`;

export interface RenderResearchBriefOpts {
  marketName: string;
  mlsSource: string;
  neighbourhoods: string[];
  spelling: "Canadian" | "American";
}

export function renderResearchBrief(opts: RenderResearchBriefOpts): string {
  const neighbourhoodList = opts.neighbourhoods.length
    ? opts.neighbourhoods.map((n, i) => `${i + 1}. ${n}`).join("\n")
    : "(No neighbourhoods configured — add them to your Market Data setup first.)";
  const estimatedWordCount = Math.max(opts.neighbourhoods.length, 1) * 800;

  return NEIGHBOURHOOD_RESEARCH_BRIEF_TEMPLATE
    .replaceAll("{{marketName}}", opts.marketName || "(your market)")
    .replaceAll("{{mlsSource}}", opts.mlsSource || "(your MLS source)")
    .replaceAll("{{neighbourhoodList}}", neighbourhoodList)
    .replaceAll("{{estimatedWordCount}}", estimatedWordCount.toLocaleString())
    .replaceAll("{{spellingConvention}}", opts.spelling);
}

export function estimatedResearchMinutes(neighbourhoodCount: number): string {
  if (neighbourhoodCount <= 0) return "—";
  const low = Math.max(5, Math.round(neighbourhoodCount * 0.5));
  const high = Math.max(15, neighbourhoodCount * 2);
  return `${low}–${high} min`;
}
