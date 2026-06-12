---
name: Jarvis multi-neighbourhood coverage + honest recap
description: How the multi-hood comparison coverage gate and the post-build recap-fidelity manifest work, and the invariants that keep them from regressing grounding/degrade.
---

# Multi-neighbourhood comparison coverage (Jarvis script build)

A confirmed multi-area comparison used to collapse to a single strong anchor (+ citywide), silently dropping the other selected hoods. The fix spans three layers plus an honest recap.

## Coverage gate (generation-only, must stay lenient)
- The server-side coverage check lives in the script validator (`checkNeighbourhoodCoverage`) and only fires when its option `requiredNeighbourhoods` has **≥2** entries. It is **INERT for single-hood builds** — do not let it fire on 0/1 required hoods or you hard-fail legitimate deep-dives.
- Only the build core sets `requiredNeighbourhoods` (computed from the cited facts' neighbourhoods, excluding citywide/market-name). It is **never** set on the save path → coverage drives regenerate but **must not hard-block save**; on retry exhaustion the best draft ships flagged, consistent with the existing degrade loop.
- Matching is intentionally **lenient substring** (hood name `includes()` in the body). Lenient = safe here: it can only *under-fire* (miss a mention and not regenerate), never *falsely hard-fail* and trap the member in a regenerate loop or block a real draft. Do not "tighten" it into boundary-aware matching without re-checking that false-fails can't strand a build.
- A citywide/market-wide rollup is a SCOPE, not a comparison area. The exclusion regex (citywide/market-wide/overall/metro/region + the member's own marketName) keeps the gate from demanding a "citywide section". This regex is **duplicated** in the build core and in `runBuildScript` (jarvis tools) — change both in lockstep.

## Honest post-build recap (recap-fidelity manifest)
- The recap claimed coverage the script didn't have. Fix: after the draft, derive `coveredNeighbourhoods`/`droppedNeighbourhoods` from the **spoken body**, then feed an honest manifest into the build_script tool-result so the model only credits what's actually there and discloses drops.
- **Body-scope the derivation with the SAME `stripToDialogue` the validator uses** — a hood that appears only in the `## Sources` footnote is NOT "covered". Matching over the full script overstates coverage on degraded drafts (Sources still lists every cited hood even when the body dropped it).
- The manifest only matters for a comparison (≥2 given areas); single-hood builds report both empty so the orchestrator stays quiet.

**Why:** grounding/no-fabrication and the degrade-not-hard-block contract are the load-bearing invariants. The gate must push regeneration without ever stranding a build, and the recap must never assert coverage the body lacks.
