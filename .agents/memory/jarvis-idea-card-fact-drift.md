---
name: Jarvis idea-card fact-ID drift
description: Why browsed idea cards hand build_script dead fact PKs after a re-aggregate, and the rule for keeping anchors live.
---

# Jarvis idea-card fact-ID drift

Buildable idea cards in the Jarvis "Browse all content ideas" front door
(`src/lib/jarvis/idea-tools.ts`) hand off to build_script by baking fact PKs
into a natural-language prompt (`linkedFactIds: <ids>`). Those PKs go **dead**
when the member's upload is re-aggregated — re-aggregation mints new MarketFact
rows, so any persisted PK no longer resolves. build_script's no-fabrication
guard then (correctly) refuses to build, dead-ending the member.

**Rule:** an idea card must only carry fact PKs that resolve in the member's
CURRENT live ledger, and the build hand-off must be able to re-resolve by fact
CONTENT rather than fail.

- **Story leads** read persisted `MarketStoryLead.anchorFactId/supportingFactIds`
  — most drift-prone. Resolve at present-time: load the upload's live facts once,
  keep stored PKs only if still present, else re-resolve via the textual resolver
  (`parseDataThreadStrings` + `matchThreadToFacts` over the lead's display
  `dataThreads`). This mirrors the proven wizard `use-as-video` route. Set
  `citedFactCount` from live-resolved IDs only so "Grounded in N facts" never
  over-promises.
- **Theme/validate cards** bake live IDs at generation time but persist in the
  thread (`ContentManagerMessage.ideasState`) and can be picked AFTER a later
  re-aggregate. They carry their cited facts' neighbourhoods, and
  `buildScriptHandoffPrompt` appends a self-heal clause: "if any id is no longer
  in my current ledger, call get_facts for <hoods> and anchor on live
  equivalents — never substitute a placeholder." Prompt-level mitigation, not a
  hard server pick-time re-resolution (that's the deterministic enhancement
  left for later).

**Why:** the no-fabrication guard is correct and must NOT be loosened; the fix
is always upstream (give it real, current IDs or a way to re-derive them).

**How to apply:** any new buildable card surface that emits `linkedFactIds`
must resolve/validate those IDs against the live upload ledger and supply a
neighbourhood fallback. Scope every fact lookup by `uploadId` (not just
`userId`) and apply `EXCLUDE_LEGACY_FAILURE_RATE`, or a stale/legacy PK leaks in.
