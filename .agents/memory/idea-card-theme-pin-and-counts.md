---
name: Idea-card theme pin & fact-count display
description: How the Content Engine v2 idea-card theme pin must be enforced, and why header fact counts must be derived from the cards.
---

## Theme pin is enforced on `rotationSlot`, not `framework`

Each idea card carries a structured `rotationSlot` (market_update | neighbourhood_fact | contrarian_take | do_not | should_you) — that IS the "theme". The card's `framework` field is theme-agnostic free text (50+ generic content formats like "Warning + Named Anchor"); it is NOT a reliable key for a theme allowlist.

**Rule:** when the wizard pins a theme, enforce `card.rotationSlot === pinnedSlot` server-side in `validateIdeaCard` (via the `requiredRotationSlot` param), inside the existing generate→validate→reprompt loop. Prompt-only hints ("Rotation slot: X") are insufficient — the model rotates anyway.

**Why:** production shipped a "Market Update"-pinned batch containing Contrarian Take / Do Not cards because the pin was a soft prompt line with no validation gate.

**How to apply:** off-theme cards must fail the gate so they're regenerated and, failing that, dropped (response `partial:true`) — never shipped. Don't try to allowlist `framework` strings.

## Wizard header fact counts must be derived from the shown cards

`Step3IdeaCards` has a sessionStorage resume short-circuit that rehydrates a cached batch but hardcodes derived counters (it set `factsConsidered: 0`). The cached payload never persisted the server's pool-size count, so on resume the header read "0 facts" while each card still showed its real `citedFactIds.length` (e.g. 4) — looked like fabricated citations but wasn't.

**Rule:** compute the header fact count client-side as the size of the union of `citedFactIds` across the shown cards. This is definitionally consistent with the per-card footers and survives the resume path.

**Why:** any value the resume path can't reconstruct from the cached cards will silently render as its hardcoded default and contradict the cards.

**How to apply:** for anything shown next to the cards, derive it from the cards themselves rather than a separate server counter that the cache may not carry. Server still guarantees ≥3 real headline-safe cited IDs per card via `validateIdeaCard`, so an uncited card can't ship.
