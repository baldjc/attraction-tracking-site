---
name: Dashboard briefing is a deterministic Story Lead read
description: Why the member dashboard "monthly briefing" reads MarketStoryLead directly instead of regenerating ideas with the LLM.
---

The member dashboard "monthly briefing" must surface the SAME `MarketStoryLead`
pool as the wizard's Browse Story Leads page (Step 2A), not a fresh LLM idea
generation.

**Why:** the old briefing called the LLM idea loop, which under-produced (e.g. 2
cards) even when the member's lead pool was larger — the headline then lied
("2 stories"). Story Leads are minted deterministically during market-data
validation, so the briefing should be a cheap read (no Claude, no cache, no
logUsage), which also guarantees it never under-counts.

**How to apply:**
- Pool parity is load-bearing: the briefing and the wizard story-leads route must
  use the IDENTICAL scoping — `loadLatestValidatedUpload(userId)` +
  `where {userId, uploadId}` + `orderBy [isThesisLead desc, displayOrder asc,
  createdAt asc]`. If you change one, change both or the "same pool" guarantee
  breaks.
- Slot spread: when featuring N leads across distinct `suggestedRotationSlot`s,
  cap *slotless* (null-slot) leads to ONE in the first pass. Legacy-generation
  leads frequently have null slot AND null `anchorFactId`; without the cap they
  fill every spot and starve the distinct slotted leads later in the order.
  (Covered by `pick-spread.guard.test.ts`.)
- Fact chips come from the lead's `anchorFactId` → MarketFact
  (`metricValueString` ?? `metricValue`). Legacy leads have null `anchorFactId`,
  so always provide a `dataThreads[0]` fallback or the card shows no evidence.
