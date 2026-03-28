# Repurpose Content — Campaign Link Tracking Per Output Type

> **Date:** 2026-03-28
> **What this covers:** Each repurpose output type gets its own tracked campaign link with the correct destination (lead magnet vs landing page) and source type for separate click attribution
> **Existing code:** The Repurpose Content tool is fully built — all 5 output types work, prompts exist, campaign link picker exists. This prompt adds per-output-type link tracking and wires the correct campaign URLs into each tool.

---

## Paste this into Replit Agent:

```
The Repurpose Content tool at /member/ai-tools/repurpose-content is built and generating content. The missing piece is campaign link tracking per output type. Right now the "Links for Article" section only serves LinkedIn, and the Newsletter has no campaign URL integration at all.

Here's what we need: each output type should get its own tracked campaign link so we can see exactly how many clicks came from the newsletter vs the LinkedIn article vs the Facebook post vs the blog post. And crucially, different output types need different destination URLs:

- NEWSLETTER → Lead Magnet URL (campaign.leadMagnetUrl) — subscribers are already leads, they need the resource
- LINKEDIN → Landing Page URL (campaign.destinationUrl) — new audience, capture them through sign-up page
- FACEBOOK → Landing Page URL (campaign.destinationUrl) — new audience, same as LinkedIn
- BLOG → Landing Page URL (campaign.destinationUrl) — new audience, same as LinkedIn

Each tracked link gets its own refCode so clicks attribute separately.

=== CHANGE 1: REPLACE "LINKS FOR ARTICLE" WITH PER-OUTPUT LINK SECTIONS ===

File: src/app/member/ai-tools/repurpose-content/page.tsx

The current "Links for Article" section (with campaign link picker, saved links, one-off links) only appears when LinkedIn is checked. Replace this with a per-output-type link system.

For each checked output type (except Postcard — postcards don't have clickable links), show a compact link section. The layout for each:

SECTION LABEL: "[Output Type] Link"
e.g., "Newsletter Link", "LinkedIn Link", "Facebook Link", "Blog Link"

Each section has:
1. A campaign dropdown (same campaign list already fetched from GET /api/campaigns)
2. Once a campaign is selected, show existing tracking links in that campaign as selectable buttons (same pattern as current campaign picker) — OR a "+ Create new tracked link" option
3. When creating a new link:
   - Auto-populate the name field with: "${title} — [Output Type]" (e.g., "Do NOT Buy a Home in Calgary — Newsletter")
   - Send the correct source and destinationOverride to the API (see table below)
4. Once a link is selected or created, show it as a pill with the tracked URL and a remove button
5. Below the campaign link, keep the existing "Manage Saved Links" and one-off links functionality for LinkedIn and Blog (these long-form outputs benefit from multiple links). Newsletter and Facebook should only get one campaign link — no saved/one-off links.

Source and destination mapping for link creation (POST /api/campaigns/[id]/links):

| Output Type | source field    | destinationOverride | Why                                              |
|-------------|-----------------|---------------------|--------------------------------------------------|
| Newsletter  | "email"         | "lead_magnet"       | Subscribers need the resource, not sign-up page   |
| LinkedIn    | "linkedin"      | "landing_page"      | New audience → capture through sign-up page       |
| Facebook    | "facebook"      | "landing_page"      | New audience → capture through sign-up page       |
| Blog        | "blog"          | "landing_page"      | New audience → capture through sign-up page       |

NOTE: The source field on TrackingLink is a free String, not an enum — "facebook" and "blog" are new values but don't require a schema change.

For Newsletter specifically: if the selected campaign has NO leadMagnetUrl set, show an amber warning: "This campaign has no Lead Magnet URL. The newsletter link will point to the landing page instead. Add a Lead Magnet URL in Generate Leads → Campaigns to link subscribers directly to the resource."

IMPORTANT: The campaign dropdown can be shared — if the member picks a campaign for Newsletter, auto-select the same campaign for LinkedIn/Facebook/Blog (they'll likely use the same campaign). But they should be able to change each one independently. Store each output type's selected campaign and link separately in component state.

=== CHANGE 2: WIRE NEWSLETTER URL INTO PROMPT ===

Currently the newsletter prompt uses a generic [INSERT URL] placeholder. When a campaign link is selected, the actual tracked URL should be injected.

File: src/lib/repurpose-prompts.ts

Add a new token to DEFAULT_NEWSLETTER_PROMPT: {{NEWSLETTER_URL}}

Change rule 6 from:
"One URL placeholder: [INSERT URL]"

To:
"One URL: use {{NEWSLETTER_URL}} exactly as provided. If it says '[INSERT URL]', keep it as a placeholder for the member to replace later. Otherwise use the exact URL — do not modify, shorten, or wrap it."

Update applyNewsletterTokens():
- Add newsletterUrl to the tokens parameter type
- Add .replace(/\{\{NEWSLETTER_URL\}\}/g, tokens.newsletterUrl) to the replacement chain

File: src/app/api/ai-tools/repurpose-newsletter/route.ts

Update the route to accept an optional newsletterUrl in the request body:

const { transcript, title, newsletterUrl } = await req.json();

Pass it through to the prompt tokens:
newsletterUrl: newsletterUrl || "[INSERT URL]"

File: src/app/member/ai-tools/repurpose-content/page.tsx

Update the generate() function's newsletter fetch call to include the tracked URL:

body: JSON.stringify({
  transcript,
  title,
  newsletterUrl: newsletterTrackedLink?.trackedUrl || undefined
})

Where newsletterTrackedLink is the selected/created campaign link for the newsletter output type.

=== CHANGE 3: WIRE LINKS INTO FACEBOOK AND BLOG ROUTES ===

Currently the Facebook and Blog API routes only accept { transcript, title } — no links.

File: src/app/api/ai-tools/repurpose-facebook/route.ts

Update to accept an optional link:
const { transcript, title, link } = await req.json();

If link is provided (e.g., { label: "Free Calgary Buyer's Guide", url: "https://..." }), inject it into the Facebook system prompt as context:
"LINK TO INCLUDE: ${link.label} — ${link.url}
Include this link naturally in the post body. Frame it as a helpful resource, not a sales pitch."

If no link is provided, the prompt should NOT include any URL placeholder.

Update the frontend generate() to send the Facebook link:
body: JSON.stringify({
  transcript,
  title,
  link: facebookTrackedLink ? { label: facebookTrackedLink.linkName, url: facebookTrackedLink.trackedUrl } : undefined
})

File: src/app/api/ai-tools/repurpose-blog/route.ts

Same pattern — update to accept links:
const { transcript, title, selectedLinks, oneOffLinks } = await req.json();

Merge all links and inject into the blog system prompt the same way the LinkedIn route does:
"AVAILABLE LINKS (use maximum 5 in the article, choose strategically):
${linksText}"

Update the frontend generate() to send blog links (campaign links + saved links + one-off links, same pattern as LinkedIn currently uses).

=== CHANGE 4: UPDATE CAMPAIGN DETAIL PAGE SOURCE BADGES ===

The campaign detail page shows source badges on tracking links (YouTube=red, LinkedIn=blue, etc.). Add badge colours for the new source values:

| Source    | Colour                    |
|-----------|---------------------------|
| youtube   | red (existing)            |
| linkedin  | blue (existing)           |
| instagram | pink/magenta (existing)   |
| email     | green/teal (existing)     |
| facebook  | indigo or blue-purple     |
| blog      | amber or orange           |
| other     | grey (existing)           |

Check src/app/member/generate-leads/ components (likely the campaign detail page) for where source badges are rendered and add the new colours.

=== WHAT DOES NOT CHANGE ===

- LinkedIn API route (repurpose-linkedin/route.ts) — already accepts selectedLinks and oneOffLinks, no changes needed
- LinkedIn prompt (DEFAULT_LINKEDIN_PROMPT) — already has {{LINKS_TEXT}}, no changes needed
- Postcard route and prompt — postcards don't use links
- Campaign CRUD API — no changes
- Tracking link creation API (POST /api/campaigns/[id]/links) — already accepts source and destinationOverride, no changes needed
- The tracking snippet (t.js) — no changes
- Content library, output editing, copy buttons — no changes
- RepurposedContent model — no changes

=== STATE MANAGEMENT SUMMARY ===

New component state needed in repurpose-content/page.tsx:

// Shared campaign selection (auto-applied to all, individually overridable)
selectedCampaignId: string  // default campaign for all output types

// Per-output-type link state
newsletterCampaignId: string
newsletterLink: { linkId, linkName, trackedUrl, isNew } | null

linkedinCampaignId: string
// linkedinLinks already exists as activeCampaignLinks — rename or keep as-is

facebookCampaignId: string
facebookLink: { linkId, linkName, trackedUrl, isNew } | null

blogCampaignId: string
blogLinks: Array<{ linkId, linkName, trackedUrl, isNew }>  // blog gets multiple like LinkedIn

The existing activeCampaignLinks, savedLinks, selectedLinkIndexes, and oneOffLinks state can be refactored to serve LinkedIn and Blog specifically, while Newsletter and Facebook get simpler single-link state.

=== FILE CHANGES SUMMARY ===

1. src/app/member/ai-tools/repurpose-content/page.tsx
   - Replace "Links for Article" section with per-output link sections
   - Add per-output campaign/link state
   - Update generate() to pass links to all 4 API routes
   - Update createCampaignLink() to accept source + destinationOverride params

2. src/lib/repurpose-prompts.ts
   - Add {{NEWSLETTER_URL}} token to DEFAULT_NEWSLETTER_PROMPT
   - Update applyNewsletterTokens() signature and replacement chain

3. src/app/api/ai-tools/repurpose-newsletter/route.ts
   - Accept optional newsletterUrl in request body
   - Pass through to prompt tokens (fallback: "[INSERT URL]")

4. src/app/api/ai-tools/repurpose-facebook/route.ts
   - Accept optional link in request body
   - Inject into system prompt when provided

5. src/app/api/ai-tools/repurpose-blog/route.ts
   - Accept optional selectedLinks + oneOffLinks in request body
   - Inject into system prompt (same pattern as LinkedIn route)

6. Campaign detail page source badge component
   - Add "facebook" (indigo) and "blog" (amber) badge colours
```
