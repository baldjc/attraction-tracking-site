---
name: Story Lead → Video fact carry-over
description: Why Story Leads can show data but carry zero fact PKs, and the rule for bridging them to MarketFacts without widening scope.
---

# Story Lead → Video fact carry-over

Story Leads (`MarketStoryLead`) persist their supporting data as **display strings**
in `dataThreads` (e.g. "Lakeview SP/LP 1.0224"), NOT as `MarketFact` primary keys.
A lead card therefore renders real numbers while carrying zero fact references.

**Rule:** Never hard-block "Use as Video" on resolved-fact count. Resolve facts
in priority order — stored PKs on the lead → textual resolver over `dataThreads`
→ legacy `seed.factIds` → unresolved — and ALWAYS create the plan. Auto-enrichment
on Build Script gets a second chance, so the member is never trapped.

**Why:** The previous hard block matched the lead's neighbourhoods against the
MarketConfig *vocab*, which fails whenever the vocab lacks the hood — a common
data-entry gap that production-blocked real leads with visibly-present data.

**How to apply:**
- The textual resolver (`src/lib/story-lead-fact-resolver.ts`) anchors hood names
  against the member's ACTUAL fact neighbourhoods (distinct `MarketFact.neighbourhood`
  for that upload), never the vocab. That is the root-cause fix.
- It must NEVER widen scope: hard filters on neighbourhood + metricFamily (no
  substitution); only numeric tolerance (two-band tight/wide) and recency relax.
  Unmatched threads are omitted, never guessed.
- Any fact-id carry-over (route Step 1, or the generator persisting
  anchorFactId/supportingFactIds) MUST scope the lookup by `uploadId`, not just
  `userId`, or a stale PK can silently link a fact from another upload.
- `MarketFact` has no `marketConfigId`; a member has one MarketConfig so member
  scope == market scope. Recency comes from `dateContext ?? createdAt`.
- `createMany` returns no ids — the generator must requery the upload's facts
  before resolving leads' threads to PKs.
- `ContentPlan.factsResolutionState` provenance values are distinct on purpose:
  `from_ids` / `from_textual_resolver` (has confidence) / `from_legacy_seed`
  (no confidence) / `unresolved` (banner). Don't collapse the legacy path into
  `from_textual_resolver` — it drives misleading confidence UI.
