---
name: Jarvis stressor forwarding & fallback
description: Why the Avatar-Stressor empathy beat silently no-op'd in Jarvis, and the two-layer fix (forward the tool arg + deterministic message fallback).
---

# Jarvis Avatar-Stressor beat: forward the tool arg, then fall back deterministically

The empathy beat (`[STRESSOR BEAT]`) is injected by `getActiveThemeStress(...)` from
`ideaCard.stressor` inside `runBuildScript` (tools.ts). For it to fire, the selected
stressor name has to actually REACH that function.

## The silent no-op
The orchestrator's `runTool` `build_script` branch hand-builds the `ideaCard` from the
LLM tool input field-by-field (title, rotationSlot, campaignId, bingeVideoId, …). It was
NOT copying `input.stressor`, so even when the model passed `stressor:"The Neighbourhood"`,
it was dropped before `runBuildScript` — the beat got generic/improvised text and
`stressorName` resolved null with zero fear lines.

**Rule:** when an orchestrator reconstructs a tool-arg object field-by-field, EVERY field
the tool schema accepts must be forwarded, or it silently vanishes with no error. A schema
field that the model fills but the orchestrator omits is invisible until you log the
resolved value at the consumer.

## The model is unreliable at optional tool params
Even with the field forwarded, on "pull the numbers and write the whole script now" turns
the model sometimes omits the optional `stressor` entirely. Surfacing the member's
available stressors in the system/user context (an "AVATAR STRESSORS" block) materially
raised the pass rate, but is not a guarantee.

**Backstop:** a deterministic server-side fallback (`matchNamedStressor`) resolves a
stressor the member named verbatim in their message — but ONLY when the model omitted it
(model value always wins), requires an EXACTLY-one full-saved-name match (so generic words
like "neighbourhood" in a market-update request never auto-select), and drops a hit
preceded by a negation cue ("don't use The Decision"). It reads the member's OWN stressor
names only.

**Why:** psychology-layer selections that depend on an optional LLM tool param need a
deterministic floor, or the feature works only when the model cooperates.

**How to apply:** if a Jarvis beat/feature is driven by an optional build_script arg,
(1) confirm the orchestrator forwards that arg into `ideaCard`, and (2) prefer model value
then a tightly-scoped message fallback. Verify by logging the RESOLVED value at the
consumer (tools.ts) AND what the model passed (orchestrator), then reading the produced
beat text — distinct stressors must yield distinct, empathy-only beats.
