# Page Headers & Dashboard Cards — Fix Prompt

> **Date:** 2026-03-28
> **What this fixes:** Duplicate headings on pages, Hire a Human not matching others, dashboard card colour bars look off

---

## Paste this into Replit Agent:

```
The page headers we just added have some issues. Here's what needs fixing:

=== FIX 1: REMOVE DUPLICATE HEADINGS ===

Several pages now have TWO headings — the new PageHeader we added AND the old heading that was already on the page. The new PageHeader should REPLACE the old heading, not sit on top of it.

Pages affected:

1. MY SCORES (/member/scores)
   - New header: icon pill + "My Scores" + "See where you stand and where to focus next."
   - Old heading below: "My Scores" + "Your Attraction Score breakdown across all 16 principles"
   - FIX: Remove the old "My Scores" heading and its subtitle. The new PageHeader is the only heading. The subtitle "Your Attraction Score breakdown across all 16 principles" can be dropped — the new sentence covers it.

2. ACADEMY (/member/academy)
   - New header: icon pill + "Academy" + "Master the system that turns viewers into clients."
   - Old heading below: "Academy" + "Your complete Attraction by Video learning library."
   - FIX: Remove the old "Academy" heading and its subtitle. The tab bar (Foundations Library, Live Calls, etc.) should sit directly below the new PageHeader with normal spacing.

3. AI TOOLS (/member/ai-tools)
   - New header: icon pill + "AI Tools" + "Your content team that never sleeps."
   - Old heading below: "AI Tools" + "AI-powered tools built around the Attraction by Video framework." + Usage button
   - FIX: Remove the old "AI Tools" heading and its subtitle. Move the "Usage" button to sit on the right side of the new PageHeader row (same line as the page title, aligned right). The tool cards should start directly below.

4. GENERATE LEADS (/member/generate-leads)
   - This one looks clean — no duplicate heading. No changes needed.

=== FIX 2: HIRE A HUMAN — MATCH THE OTHER PAGES ===

The Hire a Human page was NOT updated and still has its original hero layout (small "HIRE A HUMAN" label + giant sentence + paragraph block in a card). It needs to match the same pattern as the other four pages.

Change it to:
- Same PageHeader component as the others: icon pill (purple #8B5CF6) + "Hire a Human" as the large bold heading + one-line sentence below in muted text
- Sentence: "Get the right people doing the things they're better at than you are."
- BELOW the header, keep the existing sales copy paragraphs but put them in the same page flow as normal content — not inside a hero card/banner. They should look like body text on the page, not a special highlighted block. This matches how the other pages flow from header straight into content.

Remove the large grey background card that wraps the current hero text. The content should just flow normally.

=== FIX 3: DASHBOARD CARDS — REMOVE COLOUR BARS ===

The coloured bars along the top of each dashboard card look heavy. Replace them with a subtler colour treatment:

Instead of a thick coloured bar on top of each card, use the colour ONLY on the icon pill background and the icon itself (which is already there). Remove the coloured top bar entirely.

For the hover state, add a subtle coloured left border (3px) that appears on hover instead of the top bar:

Unhovered: clean white card, no colour bar
Hovered: 3px left border in the card's colour + slight shadow lift

This keeps the colour identity through the icons without the heavy rainbow bar effect across the grid.

Current card rendering adds something like:
<div className="h-1 rounded-t-xl" style={{ backgroundColor: card.colour }} />

Remove that element. The card should just be:
- White card with border
- Coloured icon pill (already working)
- Title + description
- On hover: coloured left border + shadow

=== FIX 4: SIDEBAR — KEEP IT SIMPLE ===

If the sidebar active states were changed to use per-section colours, revert that. Keep the sidebar using the single #6ba3c7 blue for all active states. The colour coding should only live on the dashboard cards and page headers — the sidebar should stay uniform and clean.

=== SUMMARY ===

1. Remove old duplicate headings on My Scores, Academy, and AI Tools pages
2. Move AI Tools "Usage" button to align with the new PageHeader
3. Rebuild Hire a Human header to match the other pages (PageHeader + normal body text flow)
4. Remove coloured top bars from dashboard cards, use hover left border instead
5. Revert sidebar to uniform #6ba3c7 active state if it was changed
```
