---
name: KB merge manual edits
description: How member-driven rename/merge/move of KB area groups stays safe, and the two non-obvious traps when editing the merge plan.
---

Members can rename a group's master, merge groups, or move/split a variant — even at "0 needs review".

**Design (why it's safe):** all edits mutate the DRY_RUN `MergeRun.report.groups` in place and re-persist; the existing `applyMergeRun` rebuilds the proposal FROM `report.groups`, so manual edits automatically inherit every safety guarantee (kill-switch/423, CAS claim, roll-up re-aggregation, fact relabel, audit). The durable-worker apply path ALSO reads the persisted report, so edits are respected there too. `report.groups` is the single source of truth for apply — edit it, don't add a parallel apply path.
**How to apply:** new edit ops live in `merge-run.ts` behind a shared `applyGroupEdit` (DRY_RUN-only guard; clones groups, runs a mutate fn, drops empty groups, rebuilds map/counts/topMerges/floorClearing, persists). Map keys must use the same trim+collapse+lower (`cleanLower`) that `estimateFloorClearing` uses, or the floor preview drifts.

**Trap 1 — alias audit restamp:** `persistCanonicalMap`'s `areaAlias.upsert` originally set `source`/`confidence` only on CREATE. When a member moves/merges a name into a different group, the alias already exists, so the UPDATE clause runs — it must ALSO write `source` + `confidence`, or the remapped alias keeps its stale audit source (deterministic|manual|fuzzy lies).

**Trap 2 — collision validation parity:** a master/new-display name must be rejected if it collides with an outside group's DISPLAY *or* with an outside group's VARIANT (a name folded elsewhere). Easy to add the display check and forget the variant check; both `renameGroupMaster` and `mergeGroups` need both, or a raw variant ends up double-assigned (last-write-wins in the rebuilt map).

**Preview parity:** `previewCombinedSamples` must mirror `estimateFloorClearing`'s "after" representative exactly — sum `sampleSize` within each `propertyType||metricKey` bucket, then MAX across buckets (not total) — against the latest validated upload's floor.sold.
