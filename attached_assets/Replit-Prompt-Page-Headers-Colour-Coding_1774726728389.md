# Page Headers & Colour Coding — Replit Build Prompt

> **Date:** 2026-03-28
> **What this covers:** Add compact page headers with icon + sentence to My Scores, Academy, AI Tools, and Generate Leads. Colour-code each section and carry those colours into the dashboard nav cards.

---

## Paste this into Replit Agent:

```
We're adding simple page headers to four member pages and colour-coding each section across the platform. The "Hire a Human" page already has a great header — we want a much more compact version of that pattern on the other pages. Just the icon pill + page title + one sentence. No paragraph block, no big hero section.

=== PART 1: PAGE HEADER COMPONENT ===

Create a reusable PageHeader component (or inline it on each page — whichever is simpler). The layout:

[coloured icon pill]
Page Name — large bold heading (the biggest text element)
Sentence below — smaller, muted text (description weight, not heading weight)

This is the OPPOSITE of the current Hire a Human header where the sentence is the big bold text and the label is small. Here, the page name itself (e.g., "Academy") is the large bold heading, and the sentence sits underneath in a smaller, lighter weight. Keep it compact — roughly 80-100px of vertical space.

IMPORTANT: Also update the Hire a Human page header to match this same pattern. Currently its big bold text is the sentence ("You didn't get to where you are only to spend your weekends and evenings editing videos.") with "HIRE A HUMAN" as a small label. Flip it: make "Hire a Human" the large bold heading, and move the sentence + paragraph below it in smaller muted text. Same icon pill, same content — just swap which element is the hero text. This keeps all pages consistent.

Here are the four pages and their content:

1. MY SCORES
   - Page: /member/scores (src/app/member/scores/page.tsx)
   - Icon: StarIcon (from @heroicons/react/24/outline) — already used in sidebar
   - Colour: #F59E0B (amber/gold)
   - Sentence: "See where you stand and where to focus next."

2. ACADEMY
   - Page: /member/academy (src/app/member/academy/page.tsx)
   - Icon: AcademicCapIcon — already used in sidebar
   - Colour: #10B981 (green)
   - Sentence: "Master the system that turns viewers into clients."

3. AI TOOLS
   - Page: /member/ai-tools (src/app/member/ai-tools/page.tsx)
   - Icon: SparklesIcon — already used in sidebar
   - Colour: #6ba3c7 (the existing primary azure)
   - Sentence: "Your content team that never sleeps."

4. GENERATE LEADS
   - Page: /member/generate-leads (src/app/member/generate-leads/page.tsx or wherever the main generate leads page is)
   - Icon: RocketLaunchIcon — already used in sidebar
   - Colour: #E63946 (crimson — already used in the platform for the impersonation bar)
   - Sentence: "Turn every video into a lead machine."

Each header should:
- Use the section's colour for the icon pill background (at ~10-15% opacity), the icon itself, and the uppercase label text
- Use dark text (text-[#2f3437] dark:text-white) for the bold sentence
- Support dark mode (same pattern as existing pages)
- Sit at the very top of the page content, above whatever is currently there
- Have consistent padding/spacing across all four pages

DO NOT touch the Hire a Human page — it already has its own header and should stay as-is.

=== PART 2: DASHBOARD NAV CARDS COLOUR CODING ===

File: src/app/member/dashboard/MemberDashboard.tsx

The NAV_CARDS array currently has 6 cards. All use the same #6ba3c7 blue for the icon pill background and hover ring. Update each card to use its section's colour:

| Card Title       | Colour   | Icon Pill BG          | Hover Ring               |
|------------------|----------|-----------------------|--------------------------|
| Academy          | #10B981  | bg-[#10B981]/10       | hover:ring-[#10B981]/40  |
| My Avatar        | #6ba3c7  | bg-[#6ba3c7]/10       | hover:ring-[#6ba3c7]/40  |
| Create Content   | #6ba3c7  | bg-[#6ba3c7]/10       | hover:ring-[#6ba3c7]/40  |
| Generate Leads   | #E63946  | bg-[#E63946]/10       | hover:ring-[#E63946]/40  |
| My Scores        | #F59E0B  | bg-[#F59E0B]/10       | hover:ring-[#F59E0B]/40  |
| Hire a Human     | #8B5CF6  | bg-[#8B5CF6]/10       | hover:ring-[#8B5CF6]/40  |

Note: "My Avatar" and "Create Content" both go to AI Tools, so they share the AI Tools blue. "Hire a Human" gets purple (#8B5CF6) to differentiate from the others — update its page header icon pill colour to match if it doesn't already.

Add a `colour` field to the NAV_CARDS array so each card carries its own colour. Then in the rendering code, replace the hardcoded #6ba3c7 references with the card's colour.

Currently the card render looks like:
<div className="p-2.5 bg-[#6ba3c7]/10 rounded-xl w-fit">
  <Icon className="w-8 h-8 text-[#6ba3c7]" />
</div>

And the card wrapper has:
hover:ring-2 hover:ring-[#6ba3c7]/40

Change these to use inline styles or dynamic Tailwind classes with the card's colour. Since Tailwind can't handle dynamic colour values at build time, use inline styles for the coloured parts:

<div className="p-2.5 rounded-xl w-fit" style={{ backgroundColor: `${card.colour}15` }}>
  <Icon className="w-8 h-8" style={{ color: card.colour }} />
</div>

For the hover ring, use a CSS variable approach or inline style on hover. The simplest approach: add a subtle left border or bottom border with the card colour instead of a hover ring, since inline hover styles are tricky. Or use a thin top accent bar on each card:

<div className="h-1 rounded-t-xl" style={{ backgroundColor: card.colour }} />

Pick whichever approach looks cleanest — the goal is that each card has a visible colour identity that matches its section.

Also update the group-hover text colour for each card title. Currently it's:
group-hover:text-[#6ba3c7]

Change to use the card's colour on hover.

=== PART 3: SIDEBAR ACTIVE STATE (OPTIONAL BUT NICE) ===

Currently the sidebar active state uses a left border of #6ba3c7 for all items:
border-[#6ba3c7] bg-white/10 text-white

If it's simple to do, update the active left border colour to match each section's colour. Add a `colour` field to the memberLinks array:

{ href: "/member/scores", label: "My Scores", icon: StarIcon, featureKey: null, colour: "#F59E0B" },
{ href: "/member/academy", label: "Academy", icon: AcademicCapIcon, featureKey: null, colour: "#10B981" },
{ href: "/member/ai-tools", label: "AI Tools", icon: SparklesIcon, featureKey: "ai_tools", colour: "#6ba3c7" },
{ href: "/member/generate-leads", label: "Generate Leads", icon: RocketLaunchIcon, featureKey: "campaigns", colour: "#E63946" },
{ href: "/member/hire", label: "Hire a Human", icon: UserGroupIcon, featureKey: null, colour: "#8B5CF6" },
{ href: "/member/dashboard", label: "Dashboard", icon: HomeIcon, featureKey: null, colour: "#6ba3c7" },
{ href: "/member/settings", label: "Settings", icon: Cog6ToothIcon, featureKey: null, colour: "#6ba3c7" },

Then in the active state rendering, use inline style for the border colour:
style={{ borderLeftColor: link.colour }}

If this is too fiddly or looks weird, skip it — it's a nice-to-have, not a must.

=== WHAT DOES NOT CHANGE ===

- Page content below the headers — no changes to any page functionality
- Admin pages — no headers needed on admin pages
- Settings page — no header needed
- Dashboard page — no header (it has its own greeting/layout)
- Mobile layout — headers should work naturally on mobile with the same responsive patterns the pages already use

=== DARK MODE ===

All colours should work in both light and dark mode. The icon pill backgrounds use low opacity (10-15%) which works well in both modes. The bold sentence text should use the existing dark mode text classes (text-[#2f3437] dark:text-white or whatever the page already uses). The coloured elements (icon, label) keep their colour in both modes.
```
